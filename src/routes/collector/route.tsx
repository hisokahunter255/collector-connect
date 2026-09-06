import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { fetchAuthState } from "@/hooks/use-auth";

export const Route = createFileRoute("/collector")({
  ssr: false,
  beforeLoad: async () => {
    const state = await fetchAuthState();
    if (!state) throw redirect({ to: "/" });
    if (state.role === "admin") throw redirect({ to: "/admin/dashboard" });
    return { auth: state };
  },
  component: () => <Outlet />,
});
