import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, MapPin, Plus, Target, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/admin.functions";
import { formatMoney } from "@/lib/format";
import {
  currentMonth,
  fetchBranchTargets,
  monthBounds,
  percent,
  upsertBranchTarget,
} from "@/lib/targets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/branches")({
  head: () => ({
    meta: [
      { title: "الفروع والمناطق | توريدات المحصلين" },
      { name: "description", content: "إضافة وتعديل وحذف الفروع والمناطق وتحديد الربط الشهري لكل فرع." },
      { property: "og:title", content: "الفروع والمناطق | توريدات المحصلين" },
      { property: "og:description", content: "إدارة الفروع والمناطق والربط الشهري ونسبة التحصيل." },
    ],
  }),
  component: BranchesPage,
});

type Branch = { id: string; name: string; active: boolean };
type Area = { id: string; name: string; active: boolean; branch_id: string };

function BranchesPage() {
  const queryClient = useQueryClient();
  const audit = useServerFn(logAudit);
  const [newBranch, setNewBranch] = useState("");
  const [newArea, setNewArea] = useState<Record<string, string>>({});
  const [month, setMonth] = useState(currentMonth());
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["branches-areas"],
    queryFn: async () => {
      const [b, a] = await Promise.all([
        supabase.from("branches").select("id, name, active").order("name"),
        supabase.from("areas").select("id, name, active, branch_id").order("name"),
      ]);
      if (b.error) throw b.error;
      if (a.error) throw a.error;
      return { branches: (b.data ?? []) as Branch[], areas: (a.data ?? []) as Area[] };
    },
  });

  const { data: targets } = useQuery({
    queryKey: ["branch-targets", month],
    queryFn: () => fetchBranchTargets(month),
  });

  const { data: collected } = useQuery({
    queryKey: ["branch-collected", month],
    queryFn: async () => {
      const { from, to } = monthBounds(month);
      const { data: rows, error } = await supabase
        .from("deposits")
        .select("branch_id, amount")
        .gte("created_at", from)
        .lt("created_at", to)
        .limit(5000);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of rows ?? []) {
        const key = (r.branch_id as string | null) ?? "none";
        map[key] = (map[key] ?? 0) + Number(r.amount);
      }
      return map;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["branches-areas"] });
    queryClient.invalidateQueries({ queryKey: ["branch-targets"] });
    queryClient.invalidateQueries({ queryKey: ["branch-collected"] });
  };

  const addBranch = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("branches").insert({ name: newBranch.trim() });
      if (error) throw error;
      await audit({ data: { action: "إضافة فرع", details: `تم إضافة فرع: ${newBranch.trim()}` } });
    },
    onSuccess: () => {
      setNewBranch("");
      toast.success("تم إضافة الفرع");
      refresh();
    },
    onError: () => toast.error("تعذر إضافة الفرع (قد يكون الاسم مستخدمًا)"),
  });

  const addArea = useMutation({
    mutationFn: async (branchId: string) => {
      const name = (newArea[branchId] ?? "").trim();
      if (!name) throw new Error("اسم المنطقة مطلوب");
      const { error } = await supabase.from("areas").insert({ branch_id: branchId, name });
      if (error) throw error;
      await audit({ data: { action: "إضافة منطقة", details: `تم إضافة منطقة: ${name}` } });
    },
    onSuccess: (_d, branchId) => {
      setNewArea((s) => ({ ...s, [branchId]: "" }));
      toast.success("تم إضافة المنطقة");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "تعذر إضافة المنطقة"),
  });

  const remove = useMutation({
    mutationFn: async (p: { table: "branches" | "areas"; id: string; name: string }) => {
      const { error } = await supabase.from(p.table).delete().eq("id", p.id);
      if (error) throw error;
      await audit({
        data: {
          action: p.table === "branches" ? "حذف فرع" : "حذف منطقة",
          details: `تم حذف ${p.table === "branches" ? "فرع" : "منطقة"}: ${p.name} مع كل التوريدات المرتبطة`,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم الحذف نهائيًا");
      refresh();
    },
    onError: () => toast.error("تعذر الحذف"),
  });

  const toggle = useMutation({
    mutationFn: async (p: { table: "branches" | "areas"; id: string; active: boolean; name: string }) => {
      const { error } = await supabase.from(p.table).update({ active: p.active }).eq("id", p.id);
      if (error) throw error;
      await audit({
        data: {
          action: p.table === "branches" ? "تعديل فرع" : "تعديل منطقة",
          details: `${p.name}: ${p.active ? "تنشيط" : "إيقاف"}`,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      refresh();
    },
    onError: () => toast.error("تعذر تحديث الحالة"),
  });

  const rename = useMutation({
    mutationFn: async (p: { table: "branches" | "areas"; id: string; name: string }) => {
      const { error } = await supabase.from(p.table).update({ name: p.name }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الاسم");
      refresh();
    },
    onError: () => toast.error("تعذر تحديث الاسم"),
  });

  const saveTarget = useMutation({
    mutationFn: async (p: { branchId: string; name: string }) => {
      const raw = (targetDraft[p.branchId] ?? "").trim();
      const amount = Number(raw);
      if (!raw || Number.isNaN(amount) || amount < 0) throw new Error("أدخل مبلغ ربط صحيح");
      await upsertBranchTarget({ branchId: p.branchId, month, amount });
      await audit({
        data: { action: "تحديد الربط", details: `${p.name} - شهر ${month}: ${amount}` },
      });
    },
    onSuccess: () => {
      toast.success("تم حفظ الربط الإجمالي");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "تعذر حفظ الربط"),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  const totalTarget = (targets ?? []).reduce((s, t) => s + t.target_amount, 0);
  const totalCollected = data.branches.reduce((s, b) => s + (collected?.[b.id] ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">الفروع والمناطق</h1>
          <p className="text-sm text-muted-foreground">كل فرع يحتوي على عدة مناطق وله ربط شهري</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">شهر الربط</Label>
          <Input
            type="month"
            className="h-10"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
          />
        </div>
      </div>

      <div className="card-elevated space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-primary" />
          <p className="font-semibold">الربط الإجمالي لكل الفروع (شهر {month})</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            الربط: <span className="font-bold text-foreground">{formatMoney(totalTarget)}</span>
          </span>
          <span className="text-muted-foreground">
            المحصّل: <span className="font-bold text-success">{formatMoney(totalCollected)}</span>
          </span>
          <span className="text-muted-foreground">
            المتبقي:{" "}
            <span className="font-bold text-foreground">
              {formatMoney(Math.max(totalTarget - totalCollected, 0))}
            </span>
          </span>
          <span className="font-bold">نسبة التحصيل: {percent(totalCollected, totalTarget)}%</span>
        </div>
        <Progress value={Math.min(percent(totalCollected, totalTarget), 100)} className="h-2" />
      </div>

      <div className="card-elevated space-y-3 p-4">
        <Label htmlFor="new-branch">إضافة فرع جديد</Label>
        <div className="flex gap-2">
          <Input
            id="new-branch"
            className="h-11"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            placeholder="مثال: فرع دمياط"
          />
          <Button
            className="h-11"
            disabled={!newBranch.trim() || addBranch.isPending}
            onClick={() => addBranch.mutate()}
          >
            <Plus className="size-4" /> إضافة
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.branches.map((branch) => {
          const areas = data.areas.filter((a) => a.branch_id === branch.id);
          const target = (targets ?? []).find((t) => t.branch_id === branch.id)?.target_amount ?? 0;
          const got = collected?.[branch.id] ?? 0;
          const pct = percent(got, target);
          return (
            <section key={branch.id} className="card-elevated p-4">
              <div className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                <Input
                  defaultValue={branch.name}
                  className="h-10 flex-1 font-semibold"
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== branch.name)
                      rename.mutate({ table: "branches", id: branch.id, name: value });
                  }}
                />
                <Switch
                  checked={branch.active}
                  onCheckedChange={(v) =>
                    toggle.mutate({ table: "branches", id: branch.id, active: v, name: branch.name })
                  }
                />
                <DeleteButton
                  title={`حذف فرع ${branch.name} نهائيًا؟`}
                  description="سيتم حذف الفرع وكل مناطقه وكل التوريدات المرتبطة به نهائيًا، وسيتم فصل المحصلين عن الفرع بدون حذف حساباتهم. لا يمكن الرجوع بعد الحذف."
                  onConfirm={() => remove.mutate({ table: "branches", id: branch.id, name: branch.name })}
                />
              </div>

              <div className="mt-3 space-y-2 rounded-xl bg-secondary/50 p-3">
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-primary" />
                  <Label className="text-xs">الربط الإجمالي لشهر {month}</Label>
                </div>
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    className="h-10 bg-card text-start"
                    placeholder={target ? String(target) : "0"}
                    value={targetDraft[branch.id] ?? (target ? String(target) : "")}
                    onChange={(e) => setTargetDraft((s) => ({ ...s, [branch.id]: e.target.value }))}
                  />
                  <Button
                    variant="secondary"
                    className="h-10"
                    disabled={saveTarget.isPending}
                    onClick={() => saveTarget.mutate({ branchId: branch.id, name: branch.name })}
                  >
                    حفظ الربط
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                  <span>
                    المحصّل: <span className="font-bold text-success">{formatMoney(got)}</span>
                  </span>
                  <span>
                    المتبقي: <span className="font-bold">{formatMoney(Math.max(target - got, 0))}</span>
                  </span>
                  <span className="font-bold text-foreground">النسبة: {pct}%</span>
                </div>
                <Progress value={Math.min(pct, 100)} className="h-2" />
              </div>

              <ul className="mt-4 space-y-2">
                {areas.length === 0 ? (
                  <li className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
                    لا توجد مناطق لهذا الفرع بعد
                  </li>
                ) : (
                  areas.map((area) => (
                    <li key={area.id} className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2">
                      <MapPin className="size-4 shrink-0 text-accent-foreground" />
                      <Input
                        defaultValue={area.name}
                        className="h-9 flex-1 bg-card text-sm"
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value && value !== area.name)
                            rename.mutate({ table: "areas", id: area.id, name: value });
                        }}
                      />
                      <Switch
                        checked={area.active}
                        onCheckedChange={(v) =>
                          toggle.mutate({ table: "areas", id: area.id, active: v, name: area.name })
                        }
                      />
                      <DeleteButton
                        title={`حذف منطقة ${area.name} نهائيًا؟`}
                        description="سيتم حذف المنطقة وكل التوريدات المرتبطة بها نهائيًا، وسيتم فصل المحصلين عن المنطقة بدون حذف حساباتهم."
                        onConfirm={() => remove.mutate({ table: "areas", id: area.id, name: area.name })}
                      />
                    </li>
                  ))
                )}
              </ul>

              <div className="mt-3 flex gap-2">
                <Input
                  className="h-10"
                  placeholder="اسم منطقة جديدة"
                  value={newArea[branch.id] ?? ""}
                  onChange={(e) => setNewArea((s) => ({ ...s, [branch.id]: e.target.value }))}
                />
                <Button
                  variant="secondary"
                  className="h-10"
                  disabled={!(newArea[branch.id] ?? "").trim()}
                  onClick={() => addArea.mutate(branch.id)}
                >
                  <Plus className="size-4" /> منطقة
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DeleteButton({
  title,
  description,
  onConfirm,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 shrink-0 text-destructive">
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            حذف نهائي
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
