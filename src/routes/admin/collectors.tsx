import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ListChecks, Pencil, Search, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { logAudit, setCollectorPassword } from "@/lib/admin.functions";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/collectors")({
  head: () => ({
    meta: [
      { title: "إدارة المحصلين | توريدات المحصلين" },
      { name: "description", content: "قائمة المحصلين مع الفرع والمنطقة وعدد التوريدات وحالة الحساب." },
      { property: "og:title", content: "إدارة المحصلين | توريدات المحصلين" },
      { property: "og:description", content: "قائمة المحصلين وبياناتهم وإجراءات الإدارة." },
    ],
  }),
  component: CollectorsPage,
});

type CollectorRow = {
  id: string;
  full_name: string;
  username: string;
  phone: string | null;
  active: boolean;
  branch_id: string | null;
  area_id: string | null;
  branch_name: string | null;
  area_name: string | null;
  deposits: number;
  lastDeposit: string | null;
};

function CollectorsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const audit = useServerFn(logAudit);
  const changePassword = useServerFn(setCollectorPassword);

  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<CollectorRow | null>(null);
  const [pwdFor, setPwdFor] = useState<CollectorRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["collectors"],
    queryFn: async (): Promise<CollectorRow[]> => {
      const [profiles, roles, deposits] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, username, phone, active, branch_id, area_id, branches(name), areas(name)")
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("deposits").select("collector_id, created_at").limit(5000),
      ]);
      if (profiles.error) throw profiles.error;
      const adminIds = new Set(
        (roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
      );
      const stats = new Map<string, { count: number; last: string | null }>();
      for (const d of deposits.data ?? []) {
        const cur = stats.get(d.collector_id) ?? { count: 0, last: null };
        cur.count += 1;
        if (!cur.last || d.created_at > cur.last) cur.last = d.created_at;
        stats.set(d.collector_id, cur);
      }
      return (profiles.data ?? [])
        .filter((p) => !adminIds.has(p.id))
        .map((p) => {
          const row = p as typeof p & { branches?: { name: string } | null; areas?: { name: string } | null };
          const s = stats.get(p.id);
          return {
            id: p.id,
            full_name: p.full_name,
            username: p.username,
            phone: p.phone,
            active: p.active,
            branch_id: p.branch_id,
            area_id: p.area_id,
            branch_name: row.branches?.name ?? null,
            area_name: row.areas?.name ?? null,
            deposits: s?.count ?? 0,
            lastDeposit: s?.last ?? null,
          };
        });
    },
  });

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").order("name");
      return data ?? [];
    },
  });
  const { data: areas } = useQuery({
    queryKey: ["areas", editing?.branch_id],
    enabled: !!editing?.branch_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("areas")
        .select("id, name")
        .eq("branch_id", editing!.branch_id!)
        .order("name");
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return data ?? [];
    return (data ?? []).filter((r) =>
      [r.full_name, r.username, r.branch_name, r.area_name, r.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [data, term]);

  const saveProfile = useMutation({
    mutationFn: async (row: CollectorRow) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: row.full_name,
          phone: row.phone,
          branch_id: row.branch_id,
          area_id: row.area_id,
          active: row.active,
        })
        .eq("id", row.id);
      if (error) throw error;
      await audit({
        data: { action: "تعديل بيانات محصل", details: `تم تعديل بيانات ${row.full_name}` },
      });
    },
    onSuccess: () => {
      toast.success("تم حفظ التعديلات");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["collectors"] });
    },
    onError: () => toast.error("تعذر حفظ التعديلات"),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: CollectorRow) => {
      const { error } = await supabase
        .from("profiles")
        .update({ active: !row.active })
        .eq("id", row.id);
      if (error) throw error;
      await audit({
        data: {
          action: row.active ? "إيقاف حساب" : "إعادة تفعيل حساب",
          details: `${row.full_name} (${row.username})`,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث حالة الحساب");
      queryClient.invalidateQueries({ queryKey: ["collectors"] });
    },
    onError: () => toast.error("تعذر تحديث الحالة"),
  });

  const savePassword = useMutation({
    mutationFn: async () => {
      if (!pwdFor) return;
      await changePassword({ data: { user_id: pwdFor.id, password: newPassword } });
    },
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور");
      setPwdFor(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message || "تعذر تغيير كلمة المرور"),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">المحصلون</h1>
          <p className="text-sm text-muted-foreground">
            {formatNumber(rows.length)} محصل
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="بحث عن محصل"
            className="h-10 pe-10"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <div className="card-elevated flex flex-col items-center gap-2 p-10 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا يوجد محصلون مطابقون</p>
        </div>
      ) : (
        <div className="card-elevated overflow-x-auto">
          <table className="w-full min-w-[900px] text-right text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">اسم المحصل</th>
                <th className="p-3 font-semibold">اسم المستخدم</th>
                <th className="p-3 font-semibold">الفرع</th>
                <th className="p-3 font-semibold">المنطقة</th>
                <th className="p-3 font-semibold">الهاتف</th>
                <th className="p-3 font-semibold">الحالة</th>
                <th className="p-3 font-semibold">التوريدات</th>
                <th className="p-3 font-semibold">آخر توريد</th>
                <th className="p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-3 font-semibold">{row.full_name}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {row.username}
                  </td>
                  <td className="p-3">{row.branch_name ?? "-"}</td>
                  <td className="p-3">{row.area_name ?? "-"}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {row.phone ?? "-"}
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        row.active
                          ? "rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success"
                          : "rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive"
                      }
                    >
                      {row.active ? "نشط" : "موقوف"}
                    </span>
                  </td>
                  <td className="p-3">{formatNumber(row.deposits)}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {row.lastDeposit ? formatDateTime(row.lastDeposit) : "-"}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                        <Pencil className="size-3.5" /> تعديل
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPwdFor(row)}>
                        <KeyRound className="size-3.5" /> كلمة المرور
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate({
                            to: "/admin/deposits",
                            search: { q: row.username, status: undefined },
                          })
                        }
                      >
                        <ListChecks className="size-3.5" /> توريداته
                      </Button>
                      <Button
                        size="sm"
                        variant={row.active ? "destructive" : "default"}
                        onClick={() => toggleActive.mutate(row)}
                      >
                        {row.active ? "إيقاف" : "تفعيل"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المحصل</DialogTitle>
            <DialogDescription>يمكن تغيير الاسم والهاتف والفرع والمنطقة والحالة.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>اسم المحصل</Label>
                <Input
                  className="h-11"
                  value={editing.full_name}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>رقم الهاتف</Label>
                <Input
                  dir="ltr"
                  className="h-11 text-start"
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>الفرع</Label>
                  <Select
                    value={editing.branch_id ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, branch_id: v, area_id: null })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent>
                      {(branches ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>المنطقة</Label>
                  <Select
                    value={editing.area_id ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, area_id: v })}
                    disabled={!editing.branch_id}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="اختر المنطقة" />
                    </SelectTrigger>
                    <SelectContent>
                      {(areas ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
                <span className="text-sm font-semibold">
                  {editing.active ? "الحساب نشط" : "الحساب موقوف"}
                </span>
                <Switch
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button
              disabled={saveProfile.isPending}
              onClick={() => editing && saveProfile.mutate(editing)}
            >
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pwdFor}
        onOpenChange={(o) => {
          if (!o) {
            setPwdFor(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
            <DialogDescription>{pwdFor?.full_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>كلمة المرور الجديدة</Label>
            <Input
              dir="ltr"
              className="h-11 text-start"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdFor(null)}>
              إلغاء
            </Button>
            <Button
              disabled={newPassword.length < 6 || savePassword.isPending}
              onClick={() => savePassword.mutate()}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
