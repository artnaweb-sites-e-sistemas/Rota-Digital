#!/usr/bin/env node
/**
 * Backfill de faturas Stripe → Firestore.
 *
 * Percorre todas as faturas da conta Stripe (ou dentro de um intervalo `--since/--until`),
 * e, para as pagas, invoca a MESMA função idempotente usada pelo webhook
 * (`recordStripeInvoicePaid`). Para faturas com falhas de pagamento chama
 * `recordStripeInvoicePaymentFailed`.
 *
 * Execução:
 *   npm run backfill:stripe-invoices -- [--dry-run] [--limit=200] [--since=2026-01-01]
 *
 * Requisitos (em `.env.local`):
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 *   STRIPE_SECRET_KEY
 *
 * Notas:
 * - Idempotente: faturas já escritas (mesmo `invoiceId`, mesmo `amountPaidCents`) são puladas.
 * - Atualiza `subscriptionPaidByMonthCents`, `lifetimePaidCents` e `subscriptionStatus` como o webhook.
 * - Não dispara suspensão/reativação automática (isso fica por conta dos eventos "ao vivo").
 */
import Stripe from "stripe";

import {
  recordStripeInvoicePaid,
  recordStripeInvoicePaymentFailed,
} from "@/lib/stripe-record-invoice";

type CliOptions = {
  dryRun: boolean;
  limit: number | null;
  sinceUnix: number | null;
  untilUnix: number | null;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, limit: null, sinceUnix: null, untilUnix: null };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
    } else if (arg.startsWith("--since=")) {
      const raw = arg.slice("--since=".length);
      const t = Date.parse(raw);
      if (Number.isFinite(t)) opts.sinceUnix = Math.floor(t / 1000);
    } else if (arg.startsWith("--until=")) {
      const raw = arg.slice("--until=".length);
      const t = Date.parse(raw);
      if (Number.isFinite(t)) opts.untilUnix = Math.floor(t / 1000);
    }
  }
  return opts;
}

function summarize(label: string, counter: Record<string, number>): void {
  const parts = Object.entries(counter).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`[backfill] ${label}: ${parts}`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("[backfill] STRIPE_SECRET_KEY em falta. Verifica o .env.local.");
    process.exit(1);
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    console.error("[backfill] FIREBASE_SERVICE_ACCOUNT_JSON em falta. Verifica o .env.local.");
    process.exit(1);
  }

  const stripe = new Stripe(key);

  const created: Stripe.InvoiceListParams["created"] =
    opts.sinceUnix != null || opts.untilUnix != null
      ? {
          ...(opts.sinceUnix != null ? { gte: opts.sinceUnix } : {}),
          ...(opts.untilUnix != null ? { lte: opts.untilUnix } : {}),
        }
      : undefined;

  console.log(
    `[backfill] A iniciar — dryRun=${opts.dryRun} limit=${opts.limit ?? "∞"} since=${
      opts.sinceUnix ?? "—"
    } until=${opts.untilUnix ?? "—"}`,
  );

  const counters = {
    seen: 0,
    paid: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
  };

  const pageSize = 100;
  const params: Stripe.InvoiceListParams = { limit: pageSize };
  if (created) params.created = created;

  for await (const invoice of stripe.invoices.list(params)) {
    counters.seen += 1;
    if (opts.limit != null && counters.seen > opts.limit) break;

    try {
      if (invoice.status === "paid") {
        if (opts.dryRun) {
          console.log(
            `[backfill] (dry) paid ${invoice.id} ${invoice.number ?? ""} amount=${
              invoice.amount_paid
            } customer=${typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "—"}`,
          );
          counters.paid += 1;
          continue;
        }
        const r = await recordStripeInvoicePaid(invoice, null);
        if (r.alreadyProcessed) counters.skipped += 1;
        else counters.paid += 1;
        if (!r.uid) {
          console.warn(`[backfill] uid não resolvido para ${invoice.id} (customer=${
            typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "—"
          })`);
        }
      } else if (invoice.status === "open" || invoice.status === "uncollectible") {
        /** Só grava a última falha conhecida; a fatura fica no Firestore para auditoria. */
        if (opts.dryRun) {
          console.log(`[backfill] (dry) ${invoice.status} ${invoice.id} amount_due=${invoice.amount_due}`);
          counters.failed += 1;
          continue;
        }
        await recordStripeInvoicePaymentFailed(invoice, null);
        counters.failed += 1;
      } else {
        counters.skipped += 1;
      }
    } catch (e) {
      counters.errors += 1;
      console.error(`[backfill] erro em ${invoice.id}:`, e);
    }

    if (counters.seen % pageSize === 0) {
      summarize(`progresso (${counters.seen} faturas)`, counters);
    }
  }

  summarize("FINAL", counters);
  console.log("[backfill] Concluído.");
}

main().catch((e) => {
  console.error("[backfill] Fatal:", e);
  process.exit(1);
});
