import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

export const LEADS_TABLE_COLUMN_COUNT = 8;

const STORAGE_KEY = "rota-digital.leads-table-column-widths-pct.v2";

/** Percentuais iniciais: coluna 0 = seleção (somatório 100). */
const DEFAULT_WIDTHS_PCT: readonly number[] = [3, 10, 16, 17, 21, 15, 11, 7];

const MIN_COL_PCT = 3;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Garante 8 valores, mínimos e soma 100. */
export function normalizeLeadTableWidths(input: unknown): number[] {
  if (!Array.isArray(input) || input.length !== LEADS_TABLE_COLUMN_COUNT) {
    return [...DEFAULT_WIDTHS_PCT];
  }
  const nums = input.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : NaN));
  if (nums.some((n) => Number.isNaN(n))) return [...DEFAULT_WIDTHS_PCT];
  const clamped = nums.map((x) => Math.max(MIN_COL_PCT, Math.min(88, x)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum < 0.01) return [...DEFAULT_WIDTHS_PCT];
  const factor = 100 / sum;
  return clamped.map((w) => round1(w * factor));
}

export function loadLeadTableWidths(): number[] {
  if (typeof window === "undefined") return [...DEFAULT_WIDTHS_PCT];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_WIDTHS_PCT];
    const parsed = JSON.parse(raw) as unknown;
    return normalizeLeadTableWidths(parsed);
  } catch {
    return [...DEFAULT_WIDTHS_PCT];
  }
}

export function saveLeadTableWidths(widths: readonly number[]): void {
  try {
    const normalized = normalizeLeadTableWidths([...widths]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
}

/**
 * Ajusta o par de colunas adjacentes `leftIndex` e `leftIndex + 1` mantendo a soma do par.
 * `dPct` é a variação em pontos percentuais da largura da tabela (positivo = coluna da esquerda cresce).
 */
export function applyAdjacentColumnResize(
  startWidths: readonly number[],
  leftIndex: number,
  dPct: number,
): number[] {
  const next = [...startWidths];
  if (leftIndex < 0 || leftIndex >= next.length - 1) return next;
  const sumPair = startWidths[leftIndex] + startWidths[leftIndex + 1];
  let left = round1(startWidths[leftIndex] + dPct);
  if (left < MIN_COL_PCT) left = MIN_COL_PCT;
  if (left > sumPair - MIN_COL_PCT) left = round1(sumPair - MIN_COL_PCT);
  next[leftIndex] = left;
  next[leftIndex + 1] = round1(sumPair - left);
  return next;
}

export type LeadTableColumnResizeApi = {
  onResizerMouseDown: (leftColumnIndex: number, e: ReactMouseEvent) => void;
};

export function useLeadTableColumnWidths(
  tableRef: RefObject<HTMLTableElement | null>,
): [number[], LeadTableColumnResizeApi] {
  const [widths, setWidths] = useState<number[]>(() => loadLeadTableWidths());
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const dragRef = useRef<{ leftIndex: number; startX: number; startWidths: number[] } | null>(null);

  const onResizerMouseDown = useCallback((leftColumnIndex: number, e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      leftIndex: leftColumnIndex,
      startX: e.clientX,
      startWidths: [...widthsRef.current],
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !tableRef.current) return;
      const tw = tableRef.current.getBoundingClientRect().width;
      if (tw < 80) return;
      const dPct = ((e.clientX - d.startX) / tw) * 100;
      const next = applyAdjacentColumnResize(d.startWidths, d.leftIndex, dPct);
      widthsRef.current = next;
      setWidths(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      saveLeadTableWidths(widthsRef.current);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [tableRef]);

  return [widths, { onResizerMouseDown }];
}
