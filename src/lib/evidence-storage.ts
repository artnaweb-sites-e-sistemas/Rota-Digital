import { getDownloadURL, listAll, ref, uploadBytes, deleteObject } from "firebase/storage";
import { FirebaseError } from "firebase/app";

import { storage } from "@/lib/firebase";
import { RotaDigitalReport } from "@/types/report";

let storageWritesBlocked = false;

function isStoragePermissionError(error: unknown): boolean {
  if (error instanceof FirebaseError) {
    if (error.code === "storage/unauthorized" || error.code === "storage/unauthenticated") {
      return true;
    }
    return /403|forbidden/i.test(error.message || "");
  }
  if (error instanceof Error) {
    return /403|forbidden|unauthorized|unauthenticated/i.test(error.message);
  }
  return false;
}

function isFirebaseStorageUrl(url: string): boolean {
  return (
    url.includes("firebasestorage.googleapis.com") ||
    url.includes("storage.googleapis.com")
  );
}

function isSafeToFetchFromClient(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("/api/image-proxy") || url.startsWith("/api/instagram-profile-snapshot")) {
    return true;
  }
  if (isFirebaseStorageUrl(url)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    const blocked = [
      "instagram.com",
      "www.instagram.com",
      "cdninstagram.com",
      "scontent.cdninstagram.com",
      "api.microlink.io",
      "imginn.com",
    ];
    return !blocked.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function shouldUseProxy(url: string): boolean {
  if (!url || isFirebaseStorageUrl(url)) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host.includes("instagram") ||
      host.endsWith(".fbcdn.net") ||
      host.includes("microlink.io")
    );
  } catch {
    return false;
  }
}

function buildProxyUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

async function uploadImageFromUrl(
  imageUrl: string,
  destinationPath: string
): Promise<string | null> {
  if (!imageUrl) return null;
  if (storageWritesBlocked) {
    console.warn("[IG_DEBUG][evidence-storage] Upload bloqueado por erro prévio de permissão.", {
      destinationPath,
    });
    return null;
  }
  const fetchUrl = shouldUseProxy(imageUrl)
    ? buildProxyUrl(imageUrl)
    : imageUrl;
  if (!isSafeToFetchFromClient(imageUrl) && fetchUrl === imageUrl) {
    console.warn("[IG_DEBUG][evidence-storage] URL não segura para fetch no cliente.", {
      imageUrl,
      destinationPath,
    });
    return null;
  }
  const ctrl = new AbortController();
  const timeoutMs = imageUrl.includes("/api/instagram-profile-snapshot") ? 45000 : 8000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    console.info("[IG_DEBUG][evidence-storage] Iniciando upload de evidência.", {
      imageUrl,
      fetchUrl,
      destinationPath,
    });
    const res = await fetch(fetchUrl, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn("[IG_DEBUG][evidence-storage] Falha ao baixar imagem para upload.", {
        fetchUrl,
        destinationPath,
        status: res.status,
      });
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/webp";
    if (!contentType.startsWith("image/")) {
      console.warn("[IG_DEBUG][evidence-storage] Conteúdo não é imagem.", {
        fetchUrl,
        destinationPath,
        contentType,
      });
      return null;
    }
    const blob = await res.blob();
    if (!blob.size || blob.size < 200) {
      console.warn("[IG_DEBUG][evidence-storage] Imagem inválida/tamanho muito pequeno.", {
        fetchUrl,
        destinationPath,
        blobSize: blob.size,
      });
      return null;
    }

    const storageRef = ref(storage, destinationPath);
    try {
      await uploadBytes(storageRef, blob, {
        contentType,
        cacheControl: "public,max-age=3600",
      });
    } catch (error) {
      if (isStoragePermissionError(error)) {
        storageWritesBlocked = true;
        console.error("[IG_DEBUG][evidence-storage] Erro de permissão no Storage.", {
          destinationPath,
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        console.error("[IG_DEBUG][evidence-storage] Falha ao gravar no Storage.", {
          destinationPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
    console.info("[IG_DEBUG][evidence-storage] Upload concluído.", { destinationPath });
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error("[IG_DEBUG][evidence-storage] Erro inesperado no upload.", {
      imageUrl,
      destinationPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function persistEvidenceImagesToStorage(params: {
  report: Omit<RotaDigitalReport, "id">;
  userId: string;
  leadId: string;
}): Promise<Omit<RotaDigitalReport, "id">> {
  const { report, userId, leadId } = params;
  if (!report.evidences) return report;

  const timestamp = Date.now();
  const base = `users/${userId}/reports/${leadId}/${timestamp}`;
  const next = { ...report, evidences: { ...report.evidences } };
  const uploadedBySource = new Map<string, string>();

  const uploadWithReuse = async (sourceUrl: string | undefined, destinationPath: string): Promise<string | null> => {
    if (!sourceUrl) return null;
    const reused = uploadedBySource.get(sourceUrl);
    if (reused) return reused;
    const uploaded = await uploadImageFromUrl(sourceUrl, destinationPath);
    if (uploaded) uploadedBySource.set(sourceUrl, uploaded);
    return uploaded;
  };

  try {
    const logo = report.evidences.logoImageUrl
      ? await uploadWithReuse(report.evidences.logoImageUrl, `${base}/logo.webp`)
      : null;
    if (logo) next.evidences.logoImageUrl = logo;
  } catch { /* não bloqueia */ }

  try {
    const instagram = report.evidences.instagramSnapshotUrl
      ? await uploadWithReuse(
          report.evidences.instagramSnapshotUrl,
          `${base}/instagram.webp`
        )
      : null;
    if (instagram) next.evidences.instagramSnapshotUrl = instagram;
  } catch { /* não bloqueia */ }

  try {
    const bioLinkSnapshot = report.evidences.instagramBioLinkSnapshotUrl
      ? await uploadWithReuse(
          report.evidences.instagramBioLinkSnapshotUrl,
          `${base}/instagram-bio-link.webp`
        )
      : null;
    if (bioLinkSnapshot) next.evidences.instagramBioLinkSnapshotUrl = bioLinkSnapshot;
  } catch { /* não bloqueia */ }

  try {
    const site = report.evidences.siteHeroSnapshotUrl
      ? await uploadWithReuse(report.evidences.siteHeroSnapshotUrl, `${base}/site.webp`)
      : null;
    if (site) next.evidences.siteHeroSnapshotUrl = site;
  } catch { /* não bloqueia */ }

  if (next.diagnosticScores?.length) {
    const scores = [...next.diagnosticScores];
    for (let i = 0; i < scores.length; i += 1) {
      const item = scores[i];
      if (!item.evidenceImageUrl) continue;
      try {
        const uploaded = await uploadWithReuse(
          item.evidenceImageUrl,
          `${base}/diagnostic-${i + 1}.webp`
        );
        if (uploaded) {
          scores[i] = { ...item, evidenceImageUrl: uploaded };
        }
      } catch { /* não bloqueia */ }
    }
    next.diagnosticScores = scores;
  }

  return next;
}

async function deleteStorageFolderRecursive(folderRef: ReturnType<typeof ref>): Promise<void> {
  const list = await listAll(folderRef);
  await Promise.all(list.items.map((item) => deleteObject(item)));
  await Promise.all(list.prefixes.map((prefix) => deleteStorageFolderRecursive(prefix)));
}

/** Remove imagens de evidência do Storage para o lead (pastas por timestamp). */
export async function deleteReportEvidenceForLead(
  userId: string,
  leadId: string
): Promise<void> {
  const root = ref(storage, `users/${userId}/reports/${leadId}`);
  try {
    await deleteStorageFolderRecursive(root);
  } catch {
    // Pasta inexistente ou sem permissão — não bloqueia exclusão do Firestore
  }
}
