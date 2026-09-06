import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";

import { updateMyCredentials } from "@/lib/account.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | توريدات المحصلين" },
      { name: "description", content: "تعديل اسم المستخدم وكلمة المرور لحسابك في نظام توريدات المحصلين." },
      { property: "og:title", content: "الإعدادات | توريدات المحصلين" },
      { property: "og:description", content: "تعديل بيانات الدخول لحسابك." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: auth } = useAuth();
  const update = useServerFn(updateMyCredentials);
  const [username, setUsername] = useState(auth?.profile?.username ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextUser = username.trim().toLowerCase();
    const changedUser = nextUser && nextUser !== (auth?.profile?.username ?? "");
    if (!changedUser && !password) {
      toast.error("لا يوجد تغيير للحفظ");
      return;
    }
    if (password && password !== confirm) {
      toast.error("كلمة المرور وتأكيدها غير متطابقين");
      return;
    }
    setSaving(true);
    try {
      await update({
        data: {
          ...(changedUser ? { username: nextUser } : {}),
          ...(password ? { password } : {}),
        },
      });
      setPassword("");
      setConfirm("");
      toast.success("تم حفظ بيانات الدخول. سجّل الدخول من جديد بالبيانات الجديدة.");
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Settings2 className="size-5" /> الإعدادات
        </h1>
        <p className="text-sm text-muted-foreground">
          تعديل اسم المستخدم وكلمة المرور الخاصة بحسابك
        </p>
      </div>

      <form onSubmit={onSubmit} className="card-elevated max-w-lg space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="username">اسم المستخدم</Label>
          <Input
            id="username"
            dir="ltr"
            className="text-start"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">كلمة المرور الجديدة</Label>
          <Input
            id="password"
            type="password"
            dir="ltr"
            className="text-start"
            placeholder="اتركها فارغة لعدم التغيير"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">6 أحرف على الأقل</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
          <Input
            id="confirm"
            type="password"
            dir="ltr"
            className="text-start"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={saving} className="h-11 w-full">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "حفظ التعديلات"}
        </Button>
      </form>
    </div>
  );
}
