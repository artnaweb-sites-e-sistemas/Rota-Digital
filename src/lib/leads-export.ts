import type { Lead } from "@/types/lead";

function escapeCsvCell(value: string): string {
  const t = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",;\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** CSV com separador `;` e BOM UTF-8 — abre bem no Excel (PT-BR) e no Google Sheets (Importar). */
export function downloadLeadsCsv(leads: Lead[], filenameBase = "leads-rota-digital"): void {
  if (leads.length === 0) return;

  const headers = [
    "Nome",
    "Empresa",
    "E-mail",
    "Telefone",
    "Status",
    "Site",
    "Instagram",
    "Origem",
    "Criado em",
  ];

  const rows: string[][] = leads.map((l) => {
    const created = new Date(l.createdAt).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    return [
      l.name ?? "",
      l.company ?? "",
      l.email ?? "",
      l.phone ?? "",
      l.status ?? "",
      l.websiteUrl?.trim() ?? "",
      l.instagramUrl?.trim() ?? "",
      l.leadSource === "google_places" ? "Google Places" : "Manual",
      created,
    ];
  });

  const line = (cells: string[]) => cells.map(escapeCsvCell).join(";");
  const bom = "\uFEFF";
  const csv = bom + [line(headers), ...rows.map(line)].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenameBase}-${day}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
