import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fetchDeposits, summarize } from "@/lib/deposits";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  rangeToDates,
  STATUS_LABELS,
  type RangeKey,
} from "@/lib/format";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "التقارير | توريدات المحصلين" },
      { name: "description", content: "تقارير التوريدات حسب الفترة والفرع والمنطقة والمحصل مع التصدير." },
      { property: "og:title", content: "التقارير | توريدات المحصلين" },
      { property: "og:description", content: "تقارير تفصيلية قابلة للتصدير." },
    ],
  }),
  component: ReportsPage,
});

const ALL = "all";

function ReportsPage() {
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [branchId, setBranchId] = useState(ALL);
  const [areaId, setAreaId] = useState(ALL);
  const [collectorId, setCollectorId] = useState(ALL);

  const dates = rangeToDates(range, customFrom, customTo);

  const { data: options } = useQuery({
    queryKey: ["report-options"],
    queryFn: async () => {
      const [b, a, p] = await Promise.all([
        supabase.from("branches").select("id, name").order("name"),
        supabase.from("areas").select("id, name, branch_id").order("name"),
        supabase.from("profiles").select("id, full_name").order("full_name"),
      ]);
      return { branches: b.data ?? [], areas: a.data ?? [], collectors: p.data ?? [] };
    },
  });

  const filters = {
    branchId: branchId === ALL ? undefined : branchId,
    areaId: areaId === ALL ? undefined : areaId,
    collectorId: collectorId === ALL ? undefined : collectorId,
    from: dates.from,
    to: dates.to,
    limit: 2000,
  };

  const { data: rows, isLoading } = useQuery({
    queryKey: ["report-deposits", filters],
    queryFn: () => fetchDeposits(filters),
  });

  const stats = summarize(rows ?? []);

  function exportCsv() {
    const header = [
      "رقم العملية",
      "اسم المحصل",
      "الفرع",
      "المنطقة",
      "عدد الفواتير",
      "المبلغ",
      "التاريخ",
      "الوقت",
      "حالة المراجعة",
      "ملاحظات الإدارة",
    ];
    const lines = (rows ?? []).map((r) =>
      [
        r.ref,
        r.collector_name,
        r.branch_name ?? "",
        r.area_name ?? "",
        r.invoices_count,
        r.amount,
        formatDate(r.created_at),
        formatTime(r.created_at),
        STATUS_LABELS[r.status] ?? r.status,
        (r.admin_notes ?? "").replace(/[\n";]/g, " "),
      ].join(";"),
    );
    const csv = "\uFEFF" + [header.join(";"), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقرير-التوريدات-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">التقارير</h1>
          <p className="text-sm text-muted-foreground">اختر الفترة والفرع والمنطقة والمحصل</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" onClick={exportCsv} disabled={!(rows ?? []).length}>
            <FileSpreadsheet className="size-4" /> Excel / CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> PDF / طباعة
          </Button>
        </div>
      </div>

      <div className="card-elevated grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4 print:hidden">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="الفترة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">اليوم</SelectItem>
            <SelectItem value="yesterday">أمس</SelectItem>
            <SelectItem value="week">هذا الأسبوع</SelectItem>
            <SelectItem value="month">هذا الشهر</SelectItem>
            <SelectItem value="all">كل الفترات</SelectItem>
            <SelectItem value="custom">من تاريخ إلى تاريخ</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={branchId}
          onValueChange={(v) => {
            setBranchId(v);
            setAreaId(ALL);
          }}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="الفرع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الفروع</SelectItem>
            {(options?.branches ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={areaId} onValueChange={setAreaId}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="المنطقة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل المناطق</SelectItem>
            {(options?.areas ?? [])
              .filter((a) => branchId === ALL || a.branch_id === branchId)
              .map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={collectorId} onValueChange={setCollectorId}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="المحصل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل المحصلين</SelectItem>
            {(options?.collectors ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {range === "custom" ? (
          <>
            <div className="space-y-1">
              <Label className="text-xs">من</Label>
              <Input
                type="date"
                className="h-10"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى</Label>
              <Input
                type="date"
                className="h-10"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="إجمالي التوريدات" value={formatNumber(stats.total)} icon={BarChart3} />
        <StatCard label="إجمالي الفواتير" value={formatNumber(stats.invoices)} icon={BarChart3} />
        <StatCard
          label="إجمالي المبالغ"
          value={formatMoney(stats.amount)}
          icon={Download}
          tone="success"
        />
        <StatCard label="متوسط قيمة التوريد" value={formatMoney(stats.average)} icon={BarChart3} />
        <StatCard
          label="تمت المراجعة"
          value={formatNumber(stats.approved)}
          icon={BarChart3}
          tone="success"
        />
        <StatCard
          label="بدون مراجعة"
          value={formatNumber(stats.pending + stats.rejected)}
          icon={BarChart3}
          tone="warning"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="card-elevated overflow-x-auto">
          <table className="w-full min-w-[860px] text-right text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">رقم العملية</th>
                <th className="p-3 font-semibold">المحصل</th>
                <th className="p-3 font-semibold">الفرع</th>
                <th className="p-3 font-semibold">المنطقة</th>
                <th className="p-3 font-semibold">الفواتير</th>
                <th className="p-3 font-semibold">المبلغ</th>
                <th className="p-3 font-semibold">التاريخ</th>
                <th className="p-3 font-semibold">الوقت</th>
                <th className="p-3 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">#{r.ref}</td>
                  <td className="p-3">{r.collector_name}</td>
                  <td className="p-3">{r.branch_name ?? "-"}</td>
                  <td className="p-3">{r.area_name ?? "-"}</td>
                  <td className="p-3">{formatNumber(r.invoices_count)}</td>
                  <td className="p-3 font-semibold">{formatMoney(r.amount)}</td>
                  <td className="p-3 text-xs">{formatDate(r.created_at)}</td>
                  <td className="p-3 text-xs">{formatTime(r.created_at)}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {(rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                    لا توجد بيانات في هذه الفترة
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
