import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

export type CycleSummary = Tables<"collection_cycle_summaries">;
export type CollectionEntry = Tables<"collection_entries"> & {
  creator_name: string;
  items: OtherRevenueItem[];
};
export type OtherRevenueItem = Tables<"other_revenue_items">;
export type CollectionFilters = {
  year?: number | undefined;
  month?: number | undefined;
  branchId?: string | undefined;
  areaId?: string | undefined;
  collectorId?: string | undefined;
  cycleId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

export function cycleName(month: number | null, year: number | null) {
  if (!month || !year) return "دورة تحصيل";
  return `دورة ${ARABIC_MONTHS[month - 1]} ${year}`;
}

export function collectionPercent(invoiceTotal: number | null, target: number | null) {
  const amount = Number(invoiceTotal ?? 0);
  const targetAmount = Number(target ?? 0);
  return targetAmount > 0 ? (amount / targetAmount) * 100 : null;
}

export async function fetchCycleSummaries(filters: CollectionFilters = {}) {
  let query = supabase
    .from("collection_cycle_summaries")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.year) query = query.eq("year", filters.year);
  if (filters.month) query = query.eq("month", filters.month);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.areaId) query = query.eq("area_id", filters.areaId);
  if (filters.collectorId) query = query.eq("collector_id", filters.collectorId);
  if (filters.cycleId) query = query.eq("id", filters.cycleId);
  if (filters.from) query = query.gte("target_received_date", filters.from);
  if (filters.to) query = query.lte("target_received_date", filters.to);
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return (data ?? []) as CycleSummary[];
}

export async function fetchCycle(id: string) {
  const { data, error } = await supabase
    .from("collection_cycle_summaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as CycleSummary | null;
}

export async function fetchCycleEntries(cycleId: string) {
  const { data: entries, error } = await supabase
    .from("collection_entries")
    .select("*, profiles!collection_entries_created_by_fkey(full_name)")
    .eq("cycle_id", cycleId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (entries ?? []).map((entry) => entry.id);
  const { data: items, error: itemsError } = ids.length
    ? await supabase.from("other_revenue_items").select("*").in("collection_entry_id", ids).order("created_at")
    : { data: [], error: null };
  if (itemsError) throw itemsError;
  return (entries ?? []).map((entry) => ({
    ...entry,
    creator_name: (entry.profiles as { full_name?: string } | null)?.full_name ?? "مدير النظام",
    items: (items ?? []).filter((item) => item.collection_entry_id === entry.id),
  })) as CollectionEntry[];
}

export function displayCycleTotals(cycle: CycleSummary) {
  const closed = cycle.status === "closed";
  const target = Number(closed ? cycle.final_billing_target_amount ?? cycle.billing_target_amount : cycle.billing_target_amount ?? 0);
  const invoices = Number(closed ? cycle.final_invoice_collection ?? 0 : cycle.total_invoice_collection ?? 0);
  const other = Number(closed ? cycle.final_other_revenue ?? 0 : cycle.total_other_revenue ?? 0);
  const grand = Number(closed ? cycle.final_grand_total ?? invoices + other : cycle.grand_total ?? invoices + other);
  const percentage = closed
    ? cycle.final_collection_percentage == null ? null : Number(cycle.final_collection_percentage)
    : collectionPercent(invoices, target);
  return { target, invoices, other, grand, percentage };
}
