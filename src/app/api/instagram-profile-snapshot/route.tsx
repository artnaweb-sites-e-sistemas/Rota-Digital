import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import {
  buildInstagramPublicHeaders,
  buildInstagramRequestHeaders,
  fetchInstagramPublicPage,
  isInstagramLoginWallBio,
  isInstagramLoginWallHtml,
  sanitizeInstagramAssetUrl,
} from "@/lib/instagram-public-profile";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Buffer → corpo de `Response` (compatível com o tipo `BodyInit` do worker TS). */
function bufferToBody(buf: Buffer): Blob {
  return new Blob([Uint8Array.from(buf)]);
}

type SnapshotCacheEntry = {
  contentType: string;
  payload: Buffer;
  expiresAt: number;
};

const SNAPSHOT_CACHE_TTL_MS = 15 * 60 * 1000;
const snapshotResponseCache = new Map<string, SnapshotCacheEntry>();

function getSnapshotCacheKey(handle: string, variant: string, start: number): string {
  return `${handle}|${variant}|${start}`;
}

function getCachedSnapshotResponse(cacheKey: string): Response | null {
  const hit = snapshotResponseCache.get(cacheKey);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    snapshotResponseCache.delete(cacheKey);
    return null;
  }
  return new Response(bufferToBody(hit.payload), {
    status: 200,
    headers: {
      "Content-Type": hit.contentType,
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}

function setCachedSnapshotResponse(cacheKey: string, contentType: string, payload: Buffer): void {
  snapshotResponseCache.set(cacheKey, {
    contentType,
    payload,
    expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
  });
}

type InstagramProfileResponse = {
  data?: {
    user?: {
      full_name?: string;
      biography?: string;
      profile_pic_url_hd?: string;
      edge_followed_by?: { count?: number };
      edge_follow?: { count?: number };
      edge_owner_to_timeline_media?: {
        count?: number;
        edges?: Array<{ node?: { thumbnail_src?: string; display_url?: string } }>;
      };
      bio_links?: Array<{ title?: string; url?: string }>;
    };
  };
};

type InstagramFallback = {
  fullName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  posts?: number;
  profileImageUrl?: string;
  postImageUrls?: string[];
};

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: buildInstagramRequestHeaders(headers),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractMetaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ];
  for (const regex of patterns) {
    const hit = html.match(regex)?.[1]?.trim();
    if (hit) return hit;
  }
  return undefined;
}

function parseCompactNumber(raw: string): number | undefined {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "");
  const withDot = normalized.replace(",", ".");
  const suffix = withDot.slice(-1);
  const baseRaw = suffix === "k" || suffix === "m" || suffix === "b"
    ? withDot.slice(0, -1)
    : withDot;
  const base = Number(baseRaw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(base)) return undefined;
  const multiplier =
    suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function parseOgDescriptionCounts(description?: string): {
  posts?: number;
  followers?: number;
  following?: number;
} {
  if (!description) return {};
  const compact = description.replace(/\s+/g, " ").trim();
  const posts = parseCompactNumber(compact.match(/([\d.,kmb]+)\s*(?:posts?|publica(?:ç|c)[õo]es)/i)?.[1] || "");
  const followers = parseCompactNumber(compact.match(/([\d.,kmb]+)\s*seguidores?/i)?.[1] || "");
  const following = parseCompactNumber(compact.match(/([\d.,kmb]+)\s*seguindo/i)?.[1] || "");
  return { posts, followers, following };
}

function parseTitleName(title?: string): string | undefined {
  if (!title) return undefined;
  return title
    .replace(/\(@[^)]+\)/i, "")
    .replace(/\s*•\s*Instagram.*$/i, "")
    .trim() || undefined;
}

function sanitizeBioExcerpt(raw?: string): string {
  if (!raw) return "";
  const cleaned = raw
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .trim();
  if (!cleaned || isInstagramLoginWallBio(cleaned)) return "";
  if (
    /\bseguidores?\b/i.test(cleaned) &&
    /\bposts?\b/i.test(cleaned) &&
    /\bno instagram\b/i.test(cleaned)
  ) {
    const idx = cleaned.indexOf(":");
    if (idx >= 0) {
      return cleaned.slice(idx + 1).replace(/^"+|"+$/g, "").trim();
    }
    return "";
  }
  return cleaned.replace(/^"+|"+$/g, "").trim();
}

async function fetchInstagramFallback(handle: string): Promise<InstagramFallback | null> {
  const profileUrl = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  let html: string;
  try {
    const { text } = await fetchInstagramPublicPage(profileUrl);
    html = text;
  } catch {
    return null;
  }
  if (!html || isInstagramLoginWallHtml(html)) return null;

  const ogImage = extractMetaContent(html, "og:image");
  const ogTitle = extractMetaContent(html, "og:title");
  const ogDescription = extractMetaContent(html, "og:description");
  const description = extractMetaContent(html, "description");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();

  const metaLine = ogDescription || description;
  const { posts, followers, following } = parseOgDescriptionCounts(
    metaLine && !isInstagramLoginWallBio(metaLine) ? metaLine : undefined
  );
  const fullName = parseTitleName(ogTitle || title);
  const postImageUrls = [ogImage].filter((value): value is string => Boolean(value));

  const bioRaw = description || ogDescription;
  const bio =
    bioRaw && !isInstagramLoginWallBio(bioRaw) ? bioRaw : undefined;

  return {
    fullName,
    bio,
    followers,
    following,
    posts,
    profileImageUrl: sanitizeInstagramAssetUrl(ogImage || undefined),
    postImageUrls: postImageUrls
      .map((value) => sanitizeInstagramAssetUrl(value))
      .filter((value): value is string => Boolean(value)),
  };
}

async function fetchAsDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        ...buildInstagramRequestHeaders({
          Referer: "https://www.instagram.com/",
        }),
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function formatCount(value?: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0";
  return value.toLocaleString("pt-BR");
}

function getDisplayLink(url?: string): string {
  if (!url) return "Sem link";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle")?.trim().replace(/^@+/, "").toLowerCase();
  const variant = req.nextUrl.searchParams.get("variant")?.trim().toLowerCase() || "profile";
  const start = Math.max(1, Number(req.nextUrl.searchParams.get("start") || "1"));

  if (!handle) {
    return new Response("Missing handle", { status: 400 });
  }
  const cacheKey = getSnapshotCacheKey(handle, variant, start);
  const cachedSnapshot = getCachedSnapshotResponse(cacheKey);
  if (cachedSnapshot) {
    console.info("[IG_DEBUG][instagram-profile-snapshot] Cache HIT.", { handle, variant, start });
    return cachedSnapshot;
  }
  console.info("[IG_DEBUG][instagram-profile-snapshot] Iniciando render.", {
    handle,
    variant,
    start,
  });

  const { captureInstagramProfileViaPlaywright } = await import("@/lib/instagram-playwright");
  const capture = await captureInstagramProfileViaPlaywright(handle);
  if (capture?.screenshot) {
    console.info("[IG_DEBUG][instagram-profile-snapshot] Retornando captura real do perfil.");
    const payload = Buffer.from(capture.screenshot);
    const captureContentType = capture.mimeType || "image/png";
    setCachedSnapshotResponse(cacheKey, captureContentType, payload);
    return new Response(bufferToBody(payload), {
      status: 200,
      headers: {
        "Content-Type": captureContentType,
        "Cache-Control": "public, max-age=900, s-maxage=900",
      },
    });
  }

  const profile = await fetchJson<InstagramProfileResponse>(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
        buildInstagramPublicHeaders()
      );

  const user = profile?.data?.user;
  const fallbackFromCapture = capture?.profile;
  const fallback = user ? null : (await fetchInstagramFallback(handle));
  if (user) {
    console.info("[IG_DEBUG][instagram-profile-snapshot] Dados vindos da API interna.");
  } else if (fallbackFromCapture) {
    console.info("[IG_DEBUG][instagram-profile-snapshot] Dados vindos do Playwright.");
  } else if (fallback) {
    console.warn("[IG_DEBUG][instagram-profile-snapshot] API interna falhou, usando fallback HTML.");
  } else {
    console.error("[IG_DEBUG][instagram-profile-snapshot] Sem dados da API interna e sem fallback.");
  }

  const fullName = user?.full_name || fallbackFromCapture?.fullName || fallback?.fullName;
  const rawBio = (user?.biography || fallbackFromCapture?.bio || fallback?.bio || "").trim();
  const bio = sanitizeBioExcerpt(rawBio);
  const followers = user?.edge_followed_by?.count ?? fallbackFromCapture?.followers ?? fallback?.followers;
  const following = user?.edge_follow?.count ?? fallbackFromCapture?.following ?? fallback?.following;
  const posts = user?.edge_owner_to_timeline_media?.count ?? fallbackFromCapture?.posts ?? fallback?.posts;
  const profilePicUrl = sanitizeInstagramAssetUrl(
    user?.profile_pic_url_hd || fallbackFromCapture?.profileImageUrl || fallback?.profileImageUrl
  );

  const bioLines = bio.split("\n").filter(Boolean).slice(0, 4);
  const bioLink = user?.bio_links?.find((item) => item?.url);
  const allPostUrls =
    user?.edge_owner_to_timeline_media?.edges
      ?.map((edge) => edge?.node?.display_url || edge?.node?.thumbnail_src)
      .map((value) => sanitizeInstagramAssetUrl(value))
      .filter((value): value is string => Boolean(value))
      || fallback?.postImageUrls
      || [];
  const startIndex = Math.max(0, start - 1);
  const postUrls = allPostUrls.slice(startIndex, startIndex + 3);

  const [profilePic, post1, post2, post3] = await Promise.all([
    fetchAsDataUrl(profilePicUrl),
    fetchAsDataUrl(postUrls[0]),
    fetchAsDataUrl(postUrls[1]),
    fetchAsDataUrl(postUrls[2]),
  ]);
  console.info("[IG_DEBUG][instagram-profile-snapshot] Assets resolvidos.", {
    hasProfilePic: Boolean(profilePic),
    postUrlsCount: postUrls.length,
    renderedPostsCount: [post1, post2, post3].filter(Boolean).length,
  });

  const hasAnyVisualData =
    Boolean(profilePic) ||
    [post1, post2, post3].some(Boolean) ||
    Boolean(bio) ||
    typeof followers === "number" ||
    typeof posts === "number" ||
    typeof following === "number";
  if (!hasAnyVisualData) {
    return new Response("Instagram snapshot unavailable", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const postImages = [post1, post2, post3];

  if (variant === "feed") {
    const image = new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "1200px",
            height: "900px",
            background: "#0f1115",
            color: "#ffffff",
            padding: "36px",
            fontFamily: "sans-serif",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "66px",
                height: "66px",
                borderRadius: "999px",
                overflow: "hidden",
                display: "flex",
                background: "#1a1d24",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {profilePic ? (
                <img
                  src={profilePic}
                  alt="Foto do perfil"
                  style={{ objectFit: "cover", width: "100%", height: "100%" }}
                />
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>{handle}</div>
              <div style={{ fontSize: "18px", color: "#a7acb8" }}>
                {`Feed a partir do ${start}º post`}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", width: "100%", gap: "18px", flex: 1 }}>
            {postImages.map((image, index) => (
              <div
                key={`feed-post-${index}`}
                style={{
                  display: "flex",
                  flex: 1,
                  background: "#171a20",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "18px",
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {image ? (
                  <img
                    src={image}
                    alt={`Post ${start + index}`}
                    style={{ objectFit: "cover", width: "100%", height: "100%" }}
                  />
                ) : (
                  <div style={{ color: "#7f8694", fontSize: "24px" }}>Post indisponível</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 900,
      }
    );
    const payload = Buffer.from(await image.arrayBuffer());
    setCachedSnapshotResponse(cacheKey, "image/png", payload);
    return new Response(bufferToBody(payload), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=900, s-maxage=900",
      },
    });
  }

  const image = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "1200px",
          height: "900px",
          background: "#0f1115",
          color: "#ffffff",
          padding: "42px",
          fontFamily: "sans-serif",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            gap: "36px",
            alignItems: "flex-start",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: "28px",
          }}
        >
          <div
            style={{
              width: "170px",
              height: "170px",
              borderRadius: "999px",
              overflow: "hidden",
              display: "flex",
              background: "#1a1d24",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {profilePic ? (
              <img
                src={profilePic}
                alt="Foto do perfil"
                style={{ objectFit: "cover", width: "100%", height: "100%" }}
              />
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "40px", fontWeight: 700 }}>{handle}</div>
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "999px",
                  background: "#0095f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "30px", fontSize: "24px", color: "#f2f2f2" }}>
              <div style={{ display: "flex" }}>{`${formatCount(posts)} posts`}</div>
              <div style={{ display: "flex" }}>{`${formatCount(followers)} seguidores`}</div>
              <div style={{ display: "flex" }}>{`${formatCount(following)} seguindo`}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {fullName ? (
                <div style={{ fontSize: "24px", fontWeight: 600 }}>{fullName}</div>
              ) : null}
              {bioLines.map((line, index) => (
                <div key={`${line}-${index}`} style={{ fontSize: "22px", color: "#f5f5f5" }}>
                  {line}
                </div>
              ))}
              {bioLink?.url ? (
                <div style={{ fontSize: "20px", color: "#9bc7ff" }}>
                  {`${bioLink.title ? `${bioLink.title} · ` : ""}${getDisplayLink(bioLink.url)}`}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            gap: "18px",
            marginTop: "30px",
          }}
        >
          {postImages.map((image, index) => (
            <div
              key={`post-${index}`}
              style={{
                display: "flex",
                flex: 1,
                height: "520px",
                background: "#171a20",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {image ? (
                <img
                  src={image}
                  alt={`Post ${index + 1}`}
                  style={{ objectFit: "cover", width: "100%", height: "100%" }}
                />
              ) : (
                <div style={{ color: "#7f8694", fontSize: "24px" }}>Post indisponível</div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 900,
    }
  );
  const payload = Buffer.from(await image.arrayBuffer());
  setCachedSnapshotResponse(cacheKey, "image/png", payload);
  return new Response(bufferToBody(payload), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}
