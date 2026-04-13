import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { createLeadCaptureAdmin, listLeadsForUserAdmin } from "@/lib/leads-admin";
import { normalizePlaceResourceName, placesGetDetails, placesSearchText } from "@/lib/google-places";
import { onlyDigitsPhone } from "@/lib/report-cta";

export const runtime = "nodejs";

const MAX_CAPTURE = 50;
const MIN_CAPTURE = 1;
const DEFAULT_CAPTURE = 25;
const MAX_PAGES_PER_QUERY = 3;
const DETAIL_DELAY_MS = 90;

function parseList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function normalizeWebsiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function websiteHost(raw: string): string | null {
  try {
    const u = new URL(normalizeWebsiteUrl(raw));
    const h = u.hostname.replace(/^www\./i, "").toLowerCase();
    return h || null;
  } catch {
    return null;
  }
}

function phoneKey(digits: string): string {
  let d = onlyDigitsPhone(digits);
  if (d.length >= 10 && d.length <= 11 && !d.startsWith("55")) d = `55${d}`;
  return d;
}

function pickPhone(details: { nationalPhoneNumber?: string; internationalPhoneNumber?: string }): string {
  const nat = details.nationalPhoneNumber?.trim();
  const intl = details.internationalPhoneNumber?.trim();
  return nat || intl || "";
}

/** Telefone com dígitos suficientes para contacto (ex.: WhatsApp no Brasil). */
function hasWaClassPhone(phone: string): boolean {
  return phoneKey(phone).length >= 10;
}

/** Pelo menos um contacto público: telefone com 8+ dígitos, site ou e-mail. */
function hasAnyPublicContact(phone: string, websiteUrl: string, email: string): boolean {
  if (websiteUrl.trim()) return true;
  if (email.trim()) return true;
  return onlyDigitsPhone(phone).length >= 8;
}

/** Ordenação dentro do mesmo nível de prioridade de WhatsApp. */
function secondaryScore(p: { phone: string; websiteUrl: string; email: string }): number {
  let s = 0;
  if (hasWaClassPhone(p.phone)) s += 4;
  else if (onlyDigitsPhone(p.phone).length >= 8) s += 1;
  if (p.websiteUrl.trim()) s += 2;
  if (p.email.trim()) s += 1;
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  try {
    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      return NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave Google Places não configurada (`GOOGLE_PLACES_API_KEY`)." },
        { status: 503 },
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const niches = parseList(body.niches);
    const cities = parseList(body.cities);
    if (!niches.length || !cities.length) {
      return NextResponse.json(
        { error: "Informe ao menos um nicho e uma cidade." },
        { status: 400 },
      );
    }

    const maxResults = clampInt(body.maxResults, MIN_CAPTURE, MAX_CAPTURE, DEFAULT_CAPTURE);

    const existing = await listLeadsForUserAdmin(uid);
    const seenPlaceIds = new Set<string>();
    const seenPhones = new Set<string>();
    const seenHosts = new Set<string>();

    for (const lead of existing) {
      if (lead.googlePlaceId?.trim()) {
        seenPlaceIds.add(normalizePlaceResourceName({ id: lead.googlePlaceId, name: lead.googlePlaceId }));
      }
      const pk = phoneKey(lead.phone || "");
      if (pk.length >= 10) seenPhones.add(pk);
      const pkLoose = onlyDigitsPhone(lead.phone || "");
      if (pkLoose.length >= 8 && pkLoose.length < 10) seenPhones.add(`loose:${pkLoose}`);
      const h = lead.websiteUrl ? websiteHost(lead.websiteUrl) : null;
      if (h) seenHosts.add(h);
      const em = typeof lead.email === "string" ? lead.email.trim().toLowerCase() : "";
      if (em.includes("@")) seenHosts.add(`email:${em}`);
    }

    type Candidate = {
      placeId: string;
      name: string;
      company: string;
      phone: string;
      email: string;
      websiteUrl: string;
    };

    const pool: Candidate[] = [];
    const sessionPlaces = new Set<string>();

    const diagnostics = {
      textSearches: 0,
      placesFromSearch: 0,
      detailCalls: 0,
      skippedNoDetails: 0,
      skippedNoContact: 0,
      skippedDuplicate: 0,
    };

    for (const niche of niches) {
      for (const city of cities) {
        const textQuery = `${niche} ${city} Brasil`;
        let pageToken: string | undefined;
        for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
          diagnostics.textSearches += 1;
          const { places, nextPageToken } = await placesSearchText(apiKey, {
            textQuery,
            languageCode: "pt-BR",
            regionCode: "BR",
            maxResultCount: 20,
            pageToken,
          });

          for (const hit of places) {
            diagnostics.placesFromSearch += 1;
            if (sessionPlaces.has(hit.id)) continue;
            sessionPlaces.add(hit.id);

            await sleep(DETAIL_DELAY_MS);
            diagnostics.detailCalls += 1;
            const details = await placesGetDetails(apiKey, hit.id);
            if (!details) {
              diagnostics.skippedNoDetails += 1;
              continue;
            }

            const label =
              details.displayName?.trim() ||
              hit.displayName?.trim() ||
              hit.formattedAddress?.trim() ||
              "Empresa";
            const phone = pickPhone(details);
            const websiteUrl = details.websiteUri ? normalizeWebsiteUrl(details.websiteUri) : "";
            const email = typeof details.email === "string" ? details.email.trim() : "";

            if (!hasAnyPublicContact(phone, websiteUrl, email)) {
              diagnostics.skippedNoContact += 1;
              continue;
            }

            const placeKey = normalizePlaceResourceName({ id: details.id, name: details.name });
            if (seenPlaceIds.has(placeKey) || seenPlaceIds.has(hit.id)) {
              diagnostics.skippedDuplicate += 1;
              continue;
            }

            const pk = phoneKey(phone);
            if (pk.length >= 10 && seenPhones.has(pk)) {
              diagnostics.skippedDuplicate += 1;
              continue;
            }
            const loose = onlyDigitsPhone(phone);
            if (loose.length >= 8 && loose.length < 10 && seenPhones.has(`loose:${loose}`)) {
              diagnostics.skippedDuplicate += 1;
              continue;
            }

            const host = websiteUrl ? websiteHost(websiteUrl) : null;
            if (host && seenHosts.has(host)) {
              diagnostics.skippedDuplicate += 1;
              continue;
            }
            const eml = email.toLowerCase();
            if (eml.includes("@") && seenHosts.has(`email:${eml}`)) {
              diagnostics.skippedDuplicate += 1;
              continue;
            }

            const cand: Candidate = {
              placeId: placeKey,
              name: label,
              company: label,
              phone,
              email,
              websiteUrl,
            };
            pool.push(cand);
          }

          pageToken = nextPageToken;
          if (!pageToken) break;
        }
      }
    }

    pool.sort((a, b) => {
      const pa = hasWaClassPhone(a.phone) ? 1 : 0;
      const pb = hasWaClassPhone(b.phone) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const sa = secondaryScore(a);
      const sb = secondaryScore(b);
      if (sa !== sb) return sb - sa;
      return a.company.localeCompare(b.company, "pt-BR");
    });

    const chosen = pool.slice(0, maxResults);

    let created = 0;
    for (const c of chosen) {
      await createLeadCaptureAdmin({
        userId: uid,
        name: c.name,
        company: c.company,
        phone: c.phone,
        email: c.email,
        websiteUrl: c.websiteUrl,
        instagramUrl: "",
        googlePlaceId: c.placeId,
        leadSource: "google_places",
      });
      created += 1;
      seenPlaceIds.add(c.placeId);
      const pk = phoneKey(c.phone);
      if (pk.length >= 10) seenPhones.add(pk);
      const loose = onlyDigitsPhone(c.phone);
      if (loose.length >= 8 && loose.length < 10) seenPhones.add(`loose:${loose}`);
      const h = c.websiteUrl ? websiteHost(c.websiteUrl) : null;
      if (h) seenHosts.add(h);
      const eml = c.email.trim().toLowerCase();
      if (eml.includes("@")) seenHosts.add(`email:${eml}`);
    }

    return NextResponse.json({
      ok: true,
      created,
      requested: maxResults,
      eligibleUnique: pool.length,
      scannedUnique: pool.length,
      shortfall: created < maxResults,
      diagnostics,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao capturar leads.";
    console.error("[leads-capture]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
