import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, MapPin, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/branches")({
  head: () => ({
    meta: [
      { title: "الفروع والمناطق | توريدات المحصلين" },
      { name: "description", content: "إضافة وتعديل الفروع والمناطق التابعة لكل فرع." },
      { property: "og:title", content: "الفروع والمناطق | توريدات المحصلين" },
      { property: "og:description", content: "إضافة وتعديل الفروع والمناطق التابعة لكل فرع." },
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["branches-areas"] });

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

  if (isLoading || !data) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">الفروع والمناطق</h1>
        <p className="text-sm text-muted-foreground">كل فرع يحتوي على عدة مناطق</p>
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
