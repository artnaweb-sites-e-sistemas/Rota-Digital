"use client";

export default function PublicProposalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <p className="text-lg font-semibold">Não foi possível carregar esta página pública.</p>
      <p className="max-w-md text-sm text-zinc-400">
        Se você é o administrador, confira se a variável{" "}
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">FIREBASE_SERVICE_ACCOUNT_JSON</code>{" "}
        está definida na Vercel (JSON da conta de serviço do Firebase com acesso ao Firestore).
      </p>
      {process.env.NODE_ENV === "development" ? (
        <p className="max-w-lg break-all text-xs text-red-300/90">{error.message}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
      >
        Tentar de novo
      </button>
    </div>
  );
}
