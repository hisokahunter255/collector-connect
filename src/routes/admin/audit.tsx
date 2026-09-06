import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "سجل العمليات | توريدات المحصلين" },
      { name: "description", content: "سجل كامل لأنشطة النظام: إنشاء الحسابات والتوريدات والمراجعات." },
      { property: "og:title", content: "سجل العمليات | توريدات المحصلين" },
      { property: "og:description", content: "سجل أنشطة النظام والمراجعات." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_name, action, details, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">سجل العمليات</h1>
        <p className="text-sm text-muted-foreground">لا يمكن تعديل هذا السجل</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (data ?? []).length === 0 ? (
        <div className="card-elevated flex flex-col items-center gap-2 p-10 text-center">
          <History className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا توجد عمليات مسجلة بعد</p>
        </div>
      ) : (
        <div className="card-elevated overflow-x-auto">
          <table className="w-full min-w-[620px] text-right text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">المستخدم</th>
                <th className="p-3 font-semibold">نوع العملية</th>
                <th className="p-3 font-semibold">التفاصيل</th>
                <th className="p-3 font-semibold">التاريخ</th>
                <th className="p-3 font-semibold">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-3">{row.actor_name ?? "-"}</td>
                  <td className="p-3 font-semibold">{row.action}</td>
                  <td className="p-3 text-muted-foreground">{row.details ?? "-"}</td>
                  <td className="p-3 text-xs">{formatDate(row.created_at)}</td>
                  <td className="p-3 text-xs">{formatTime(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
