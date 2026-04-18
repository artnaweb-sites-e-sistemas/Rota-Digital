import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

export const ADMIN_USERS_TABLE_COLUMN_COUNT = 9;

const STORAGE_KEY = "rota-digital.admin-users-table-column-widths-pct.v1";

/** E-mail, nome, plano, leads, rotas, propostas, criado, último acesso, status */
const DEFAULT_WIDTHS_PCT: readonly number[] = [18, 14, 9, 8, 8, 8, 13, 13, 9];

const MIN_COL_PCT = 3;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function normalizeAdminUsersTableWidths(input: unknown): number[] {
  if (!Array.isArray(input) || input.length !== ADMIN_USERS_TABLE_COLUMN_COUNT) {
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

export function loadAdminUsersTableWidths(): number[] {
  if (typeof window === "undefined") return [...DEFAULT_WIDTHS_PCT];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_WIDTHS_PCT];
    const parsed = JSON.parse(raw) as unknown;
    return normalizeAdminUsersTableWidths(parsed);
  } catch {
    return [...DEFAULT_WIDTHS_PCT];
  }
}

export function saveAdminUsersTableWidths(widths: readonly number[]): void {
  try {
    const normalized = normalizeAdminUsersTableWidths([...widths]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
}

export function applyAdjacentAdminUsersColumnResize(
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

export type AdminUsersTableColumnResizeApi = {
  onResizerMouseDown: (leftColumnIndex: number, e: ReactMouseEvent) => void;
};

export function useAdminUsersTableColumnWidths(
  tableRef: RefObject<HTMLTableElement | null>,
): [number[], AdminUsersTableColumnResizeApi] {
  const [widths, setWidths] = useState<number[]>(() => loadAdminUsersTableWidths());
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
      const next = applyAdjacentAdminUsersColumnResize(d.startWidths, d.leftIndex, dPct);
      widthsRef.current = next;
      setWidths(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      saveAdminUsersTableWidths(widthsRef.current);
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
