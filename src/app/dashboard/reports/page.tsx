import { redirect } from "next/navigation";

/** Mantido para links antigos e favoritos; a listagem única fica em Rotas Digitais. */
export default function ReportsPage() {
  redirect("/dashboard/rotas");
}
