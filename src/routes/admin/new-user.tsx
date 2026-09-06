import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createCollector } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/new-user")({
  head: () => ({
    meta: [
      { title: "إنشاء مستخدم جديد | توريدات المحصلين" },
      { name: "description", content: "إنشاء حساب محصل جديد وربطه بفرع ومنطقة محددين." },
      { property: "og:title", content: "إنشاء مستخدم جديد | توريدات المحصلين" },
      { property: "og:description", content: "إنشاء حساب محصل جديد وربطه بفرع ومنطقة." },
    ],
  }),
  component: NewUserPage,
});

function NewUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createCollector);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [branchId, setBranchId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [role, setRole] = useState<"collector" | "supervisor">("collector");
  const [canCollectors, setCanCollectors] = useState(false);
  const [canDeposits, setCanDeposits] = useState(false);
  const [canCollections, setCanCollections] = useState(false);
  const isSupervisor = role === "supervisor";

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: areas } = useQuery({
    queryKey: ["areas", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, name, active")
        .eq("branch_id", branchId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () =>
      create({
        data: {
          full_name: fullName,
          username,
          password,
          branch_id: branchId,
          area_id: areaId,
          phone: phone || null,
          active,
        },
      }),
    onSuccess: () => {
      toast.success("تم إنشاء حساب المحصل بنجاح");
      queryClient.invalidateQueries();
      navigate({ to: "/admin/collectors" });
    },
    onError: (e: Error) => toast.error(e.message || "تعذر إنشاء الحساب"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName || !username || !password || !branchId || !areaId) {
      toast.error("أكمل جميع الحقول المطلوبة");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">إنشاء مستخدم جديد</h1>
        <p className="text-sm text-muted-foreground">
          كل محصل يرتبط بفرع ومنطقة، ولن يرى غير بياناته الخاصة.
        </p>
      </div>

      <form onSubmit={submit} className="card-elevated space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="full_name">اسم المحصل بالكامل</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="محمد أحمد"
            className="h-11"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input
              id="username"
              dir="ltr"
              className="h-11 text-start"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mohamed01"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              dir="ltr"
              className="h-11 text-start"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>الفرع</Label>
            <Select
              value={branchId}
              onValueChange={(v) => {
                setBranchId(v);
                setAreaId("");
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                {(branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                    {b.active ? "" : " (موقوف)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>المنطقة</Label>
            <Select value={areaId} onValueChange={setAreaId} disabled={!branchId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={branchId ? "اختر المنطقة" : "اختر الفرع أولًا"} />
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

        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف (اختياري)</Label>
          <Input
            id="phone"
            dir="ltr"
            className="h-11 text-start"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01000000000"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
          <div>
            <p className="text-sm font-semibold">حالة الحساب</p>
            <p className="text-xs text-muted-foreground">
              {active ? "نشط - يمكنه تسجيل الدخول والتوريد" : "موقوف - لا يمكنه تسجيل الدخول"}
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <UserPlus className="size-5" /> إنشاء الحساب
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
