import { supabase } from "@/integrations/supabase/client";

export type BranchTarget = {
  id: string;
  branch_id: string;
  month: string; // YYYY-MM-DD (first day of month)
  target_amount: number;
  notes: string | null;
};

/** "2026-09" -> "2026-09-01" */
export function monthToDate(month: string) {
  return `${month}-01`;
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Number(y), Number(m) - 1, 1);
  const to = new Date(Number(y), Number(m), 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function fetchBranchTargets(month: string): Promise<BranchTarget[]> {
  const { data, error } = await supabase
    .from("branch_targets")
    .select("id, branch_id, month, target_amount, notes")
    .eq("month", monthToDate(month));
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    branch_id: r.branch_id as string,
    month: r.month as string,
    target_amount: Number(r.target_amount),
    notes: (r.notes as string | null) ?? null,
  }));
}

export async function upsertBranchTarget(p: {
  branchId: string;
  month: string;
  amount: number;
  notes?: string | null;
}) {
  const { error } = await supabase
    .from("branch_targets")
    .upsert(
      {
        branch_id: p.branchId,
        month: monthToDate(p.month),
        target_amount: p.amount,
        notes: p.notes ?? null,
      },
      { onConflict: "branch_id,month" },
    );
  if (error) throw error;
}

export function percent(collected: number, target: number) {
  if (!target) return 0;
  return Math.round((collected / target) * 100);
}
