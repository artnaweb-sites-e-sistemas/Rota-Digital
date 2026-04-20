/**
 * Contador persistente de cota por ciclo, guardado em `userSettings.cycleUsage`.
 *
 * Motivo: a contagem via `countReportsSinceAdmin`/`countProposalsSinceAdmin` depende
 * dos documentos existentes. Se o utilizador apagar uma rota/proposta, a contagem
 * baixa e ele ganha crédito "fantasma". Este contador só sobe durante o ciclo
 * e é reiniciado quando o `cycleStartMs` muda.
 *
 * Sempre usar `max(contador, contagemDeDocumentos)` na verificação, para não
 * regredir em utilizadores legados sem `cycleUsage` salvo.
 */

import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

export type CycleUsageResource = "rotas" | "propostas";

const USER_SETTINGS_COLLECTION = "userSettings";

type CycleUsageShape = {
  cycleStartMs?: number;
  rotas?: number;
  propostas?: number;
};

/**
 * Lê o contador persistido para o ciclo corrente.
 * Devolve 0 se o registo está stale (ciclo anterior) ou ausente.
 */
export function readCycleUsage(
  userSettings: Record<string, unknown> | null | undefined,
  cycleStartMs: number,
  resource: CycleUsageResource,
): number {
  const raw = (userSettings?.cycleUsage ?? null) as CycleUsageShape | null;
  if (!raw || typeof raw !== "object") return 0;
  const storedCycle = typeof raw.cycleStartMs === "number" ? raw.cycleStartMs : -1;
  if (storedCycle !== cycleStartMs) return 0;
  const value = raw[resource];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * Incrementa o contador atomicamente (Admin SDK). Reinicia quando o ciclo muda.
 *
 * @param seed valor base adicional (ex.: contagem de documentos existentes) para
 *   acomodar utilizadores legados cujo contador ainda está em 0. Aplicado só
 *   quando o contador atual é menor que o seed.
 */
export async function incrementCycleUsageAdmin(params: {
  uid: string;
  resource: CycleUsageResource;
  cycleStartMs: number;
  by?: number;
  seed?: number;
}): Promise<number> {
  const { uid, resource, cycleStartMs } = params;
  const by = params.by ?? 1;
  const seed = Math.max(0, Math.floor(params.seed ?? 0));
  if (!uid.trim()) throw new Error("uid inválido.");

  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  const db: Firestore = getFirestore(app);
  const ref = db.collection(USER_SETTINGS_COLLECTION).doc(uid.trim());

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const raw = (data.cycleUsage ?? {}) as CycleUsageShape;
    const storedCycle = typeof raw.cycleStartMs === "number" ? raw.cycleStartMs : -1;
    const isSameCycle = storedCycle === cycleStartMs;

    const storedValue =
      isSameCycle && typeof raw[resource] === "number" && (raw[resource] as number) > 0
        ? Math.floor(raw[resource] as number)
        : 0;

    const base = Math.max(storedValue, seed);
    const next = base + by;

    const nextCycleUsage: CycleUsageShape = isSameCycle
      ? { ...raw, cycleStartMs, [resource]: next }
      : { cycleStartMs, [resource]: next };

    if (snap.exists) {
      tx.update(ref, { cycleUsage: nextCycleUsage });
    } else {
      tx.set(ref, { cycleUsage: nextCycleUsage }, { merge: true });
    }
    return next;
  });
}
