import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";

import { fetchAuthState, useAuth, useSignOut } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/collector")({
  ssr: false,
  beforeLoad: async () => {
    const state = await fetchAuthState();
    if (!state) throw redirect({ to: "/" });
    if (state.role === "admin") throw redirect({ to: "/admin/dashboard" });
    return { auth: state };
  },
  component: CollectorLayout,
});

function CollectorLayout() {
  const { data: auth } = useAuth();
  const signOut = useSignOut();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-xs text-muted-foreground">أهلاً بك</p>
              <p className="text-sm font-semibold">{auth?.profile?.full_name ?? "..."}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            تسجيل خروج
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}
