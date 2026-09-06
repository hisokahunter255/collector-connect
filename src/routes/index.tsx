import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LockKeyhole, ShieldCheck, User2, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fetchAuthState, usernameToEmail } from "@/hooks/use-auth";
import { bootstrapDemo } from "@/lib/demo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | نظام إدارة توريدات المحصلين" },
      {
        name: "description",
        content: "سجل الدخول لإدارة أو تسجيل توريدات المحصلين ومتابعة مراجعتها.",
      },
      { property: "og:title", content: "تسجيل الدخول | نظام إدارة توريدات المحصلين" },
      {
        property: "og:description",
        content: "سجل الدخول لإدارة أو تسجيل توريدات المحصلين ومتابعة مراجعتها.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await fetchAuthState();
      if (cancelled) return;
      if (state) {
        navigate({ to: state.role === "collector" ? "/collector/dashboard" : "/admin/dashboard" });
      } else {
        // Prepare demo accounts on first ever visit (no-op afterwards).
        bootstrapDemo().catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("أدخل اسم المستخدم وكلمة المرور");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      setLoading(false);
      toast.error("اسم المستخدم أو كلمة المرور غير صحيحة");
      return;
    }
    const state = await fetchAuthState();
    if (!state) {
      setLoading(false);
      toast.error("تعذر تحميل بيانات الحساب");
      return;
    }
    if (state.profile && state.profile.active === false) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("هذا الحساب موقوف. تواصل مع الإدارة.");
      return;
    }
    await queryClient.invalidateQueries();
    toast.success(`مرحبًا، ${state.profile?.full_name ?? "مستخدم"}`);
    navigate({ to: state.role === "collector" ? "/collector/dashboard" : "/admin/dashboard" });
  }

  return (
    <main className="flex min-h-screen flex-col bg-background lg:flex-row">
      <section className="brand-gradient relative flex flex-col justify-center gap-6 px-6 py-12 text-primary-foreground lg:w-1/2 lg:px-16 lg:py-0">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-foreground/15">
          <Wallet className="size-7" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold leading-snug lg:text-4xl">
            نظام إدارة توريدات المحصلين
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/85 lg:text-base">
            تسجيل التوريدات من الهاتف بصورة الإيصال، مراجعة دقيقة من الإدارة، وتقارير فورية لكل فرع
            ومنطقة ومحصل.
          </p>
        </div>
        <ul className="space-y-2 text-sm text-primary-foreground/85">
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> صلاحيات مؤمّنة: كل محصل يرى بياناته فقط
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> الفرع والمنطقة والوقت تُسجل تلقائيًا
          </li>
        </ul>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-10 lg:px-10">
        <form onSubmit={onSubmit} className="card-elevated w-full max-w-md p-6 sm:p-8">
          <h2 className="text-xl font-bold text-foreground">تسجيل الدخول</h2>
          <p className="mt-1 text-sm text-muted-foreground">أدخل بيانات حسابك للمتابعة</p>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <div className="relative">
                <User2 className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  autoComplete="username"
                  dir="ltr"
                  className="h-12 pe-10 text-start"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="mohamed01"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                  className="h-12 pe-10 text-start"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="mt-6 h-12 w-full text-base">
            {loading ? <Loader2 className="size-5 animate-spin" /> : "تسجيل الدخول"}
          </Button>

        </form>
      </section>
    </main>
  );
}
