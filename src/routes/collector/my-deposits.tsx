import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Inbox } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { fetchDeposits, summarize } from "@/lib/deposits";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  rangeToDates,
  type RangeKey,
} from "@/lib/format";
import { ReceiptThumb } from "@/components/app/receipt-image";
import { StatusBadge } from "@/components/app/status-badge";
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

export const Route = createFileRoute("/collector/my-deposits")({
  head: () => ({
    meta: [
      { title: "توريداتي | توريدات المحصلين" },
      { name: "description", content: "سجل توريداتك مع صور الإيصالات وحالة المراجعة والفلترة بالتاريخ." },
      { property: "og:title", content: "توريداتي | توريدات المحصلين" },
      { property: "og:description", content: "سجل توريداتك وحالة المراجعة." },
    ],
  }),
  component: MyDepositsPage,
});

function MyDepositsPage() {
  const { data: auth } = useAuth();
  const profile = auth?.profile;
  const [range, setRange] = useState<RangeKey>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const dates = rangeToDates(range, from, to);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["my-deposits", profile?.id, range, from, to],
    enabled: !!profile?.id,
    queryFn: () => fetchDeposits({ collectorId: profile!.id, from: dates.from, to: dates.to }),
  });

  const stats = summarize(rows ?? []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">توريداتي</h1>
        <p className="text-sm text-muted-foreground">
          {formatNumber(stats.total)} عملية • {formatNumber(stats.invoices)} فاتورة •{" "}
          {formatMoney(stats.amount)}
        </p>
      </div>

      <div className="card-elevated space-y-3 p-4">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="h-11">
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

        {range === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">من</Label>
              <Input type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى</Label>
              <Input type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : (rows ?? []).length === 0 ? (
        <div className="card-elevated flex flex-col items-center gap-2 p-10 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا توجد توريدات في هذه الفترة</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {(rows ?? []).map((row) => (
            <li key={row.id} className="card-elevated flex gap-3 p-3">
              <ReceiptThumb path={row.receipt_image_url} className="size-20" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{row.ref}</span>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-base font-bold">{formatMoney(row.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(row.invoices_count)} فاتورة • {formatDate(row.created_at)} •{" "}
                  {formatTime(row.created_at)}
                </p>
                {row.admin_notes ? (
                  <p className="rounded-lg bg-secondary/70 px-2 py-1 text-xs">
                    ملاحظة الإدارة: {row.admin_notes}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
