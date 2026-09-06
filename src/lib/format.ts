export const CURRENCY = "جنيه";

export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${CURRENCY}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-US");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const suffix = h >= 12 ? "م" : "ص";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${suffix}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return `${formatDate(iso)} - ${formatTime(iso)}`;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "في انتظار المراجعة",
  approved: "تمت المراجعة",
  rejected: "يحتاج تصحيح",
};

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isoDayStart(d = new Date()): string {
  return startOfDay(d).toISOString();
}

export function isoMonthStart(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString();
}

export type RangeKey = "today" | "yesterday" | "week" | "month" | "custom" | "all";

export function rangeToDates(
  key: RangeKey,
  from?: string,
  to?: string,
): { from?: string | undefined; to?: string | undefined } {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: isoDayStart(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: isoDayStart(y), to: isoDayStart(now) };
    }
    case "week": {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      return { from: isoDayStart(w) };
    }
    case "month":
      return { from: isoMonthStart(now) };
    case "custom": {
      const f = from ? new Date(`${from}T00:00:00`) : undefined;
      const t = to ? new Date(`${to}T00:00:00`) : undefined;
      if (t) t.setDate(t.getDate() + 1);
      return { from: f?.toISOString(), to: t?.toISOString() };
    }
    default:
      return {};
  }
}
