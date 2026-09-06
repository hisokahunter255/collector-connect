import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Banknote, CalendarDays, FileStack, Gauge, LockKeyhole, Plus, RotateCcw, Trash2, WalletCards } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cycleName, displayCycleTotals, fetchCycle, fetchCycleEntries } from "@/lib/collections";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { CycleStatusBadge } from "@/components/app/cycle-status-badge";
import { StatCard } from "@/components/app/stat-card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/collections/$cycleId")({
  head: () => ({ meta: [
    { title: "تفاصيل دورة التحصيل | نظام توريدات المحصلين" },
    { name: "description", content: "تفاصيل دورة التحصيل وعمليات تحصيل الفواتير والإيرادات الأخرى." },
    { property: "og:title", content: "تفاصيل دورة التحصيل | نظام توريدات المحصلين" },
    { property: "og:description", content: "متابعة تفاصيل ونتائج دورة التحصيل." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CycleDetailsPage,
});

type RevenueDraft = { category: string; amount: string; notes: string };
const blankItem = (): RevenueDraft => ({ category: "", amount: "", notes: "" });

function CycleDetailsPage() {
  const { cycleId } = Route.useParams();
  const qc = useQueryClient();
  const { data: auth } = useAuth();
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RevenueDraft[]>([blankItem()]);

  const { data: cycle, isLoading } = useQuery({ queryKey: ["collection-cycle", cycleId], queryFn: () => fetchCycle(cycleId) });
  const { data: entries } = useQuery({ queryKey: ["collection-entries", cycleId], queryFn: () => fetchCycleEntries(cycleId) });
  const totals = cycle ? displayCycleTotals(cycle) : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["collection-cycle", cycleId] });
    qc.invalidateQueries({ queryKey: ["collection-entries", cycleId] });
    qc.invalidateQueries({ queryKey: ["collection-cycles"] });
  };

  const addEntry = useMutation({
    mutationFn: async () => {
      const invoices = Number(invoiceAmount || 0);
      const validItems = items.filter((item) => item.category.trim() && Number(item.amount) > 0);
      if (invoices <= 0 && validItems.length === 0) throw new Error("أدخل مبلغ تحصيل الفواتير أو بند إيراد آخر");
      if (!auth?.userId) throw new Error("تعذر تحديد المستخدم");
      const { data: entry, error } = await supabase.from("collection_entries").insert({
        cycle_id: cycleId, entry_date: entryDate, invoices_collection_amount: invoices,
        notes: notes.trim() || null, created_by: auth.userId,
      }).select("id").single();
      if (error) throw error;
      if (validItems.length) {
        const { error: itemsError } = await supabase.from("other_revenue_items").insert(validItems.map((item) => ({
          collection_entry_id: entry.id, category: item.category.trim(), amount: Number(item.amount), notes: item.notes.trim() || null,
        })));
        if (itemsError) { await supabase.from("collection_entries").delete().eq("id", entry.id); throw itemsError; }
      }
    },
    onSuccess: () => { toast.success("تمت إضافة عملية التحصيل"); setInvoiceAmount(""); setNotes(""); setItems([blankItem()]); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: async (action: "close" | "reopen") => {
      const result = action === "close"
        ? await supabase.rpc("close_collection_cycle", { _cycle_id: cycleId })
        : await supabase.rpc("reopen_collection_cycle", { _cycle_id: cycleId });
      if (result.error) throw result.error;
      return action;
    },
    onSuccess: (action) => { toast.success(action === "close" ? "تم إنهاء الدورة وتثبيت النتائج" : "تمت إعادة فتح الدورة"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!cycle || !totals) return <div className="card-elevated p-10 text-center text-muted-foreground">لم يتم العثور على دورة التحصيل</div>;
  const name = cycleName(Number(cycle.month), Number(cycle.year));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Button asChild variant="ghost" className="mb-2 px-0"><Link to="/admin/collections"><ArrowRight className="size-4"/> العودة إلى الدورات</Link></Button><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{name}</h1><CycleStatusBadge status={cycle.status}/></div><p className="text-sm text-muted-foreground">{cycle.branch_name} • {cycle.area_name??"كل المناطق"} • {cycle.collector_name??"دورة عامة"}</p></div>
      {!auth?.permissions.collections ? null : cycle.status === "open" ? <ConfirmAction title={`هل تريد إنهاء ${name}؟`} description="بعد إنهاء الدورة سيتم تثبيت النتائج النهائية للدورة، ولن يمكن إضافة عمليات جديدة حتى إعادة فتحها." action="تأكيد إنهاء الدورة" onConfirm={()=>changeStatus.mutate("close")}><Button variant="destructive"><LockKeyhole className="size-4"/> إنهاء الدورة</Button></ConfirmAction> : <ConfirmAction title={`إعادة فتح ${name}؟`} description="ستعود الدورة لاستقبال عمليات تحصيل جديدة، وسيتم تسجيل العملية في سجل العمليات." action="تأكيد إعادة الفتح" onConfirm={()=>changeStatus.mutate("reopen")}><Button variant="outline"><RotateCcw className="size-4"/> إعادة فتح الدورة</Button></ConfirmAction>}
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="مبلغ الربط" value={formatMoney(totals.target)} icon={CalendarDays}/>
      <StatCard label="عدد فواتير الربط" value={cycle.billing_invoices_count==null?"غير مسجل":formatNumber(cycle.billing_invoices_count)} icon={FileStack}/>
      <StatCard label="متحصلات الفواتير" value={formatMoney(totals.invoices)} icon={Banknote} tone="success"/>
      <StatCard label="نسبة تحصيل الفواتير" value={totals.percentage==null?"لم يتم إدخال الربط بعد":`${totals.percentage.toFixed(2)}%`} icon={Gauge} tone="accent"/>
      <StatCard label="إجمالي الإيرادات الأخرى" value={formatMoney(totals.other)} icon={WalletCards}/>
      <StatCard label="إجمالي المتحصلات العام" value={formatMoney(totals.grand)} icon={Banknote} tone="success"/>
      <StatCard label="تاريخ وصول الربط" value={formatDate(cycle.target_received_date)} icon={CalendarDays}/>
      <StatCard label="تاريخ إنهاء الدورة" value={cycle.closed_at?formatDateTime(cycle.closed_at):"الدورة ما زالت مفتوحة"} icon={LockKeyhole}/>
    </div>

    {cycle.notes ? <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm"><span className="font-semibold">ملاحظات الدورة: </span>{cycle.notes}</div> : null}

    {cycle.status === "open" && auth?.permissions.collections ? <section className="card-elevated p-4"><div className="mb-4"><h2 className="font-bold">إضافة عملية تحصيل</h2><p className="text-xs text-muted-foreground">يمكن تسجيل التحصيل على دفعات طوال فترة الدورة</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="تاريخ التحصيل"><Input type="date" value={entryDate} onChange={(e)=>setEntryDate(e.target.value)}/></Field><Field label="مبلغ التحصيل من الفواتير"><Input dir="ltr" inputMode="decimal" value={invoiceAmount} onChange={(e)=>setInvoiceAmount(e.target.value)} placeholder="0"/></Field></div>
      <div className="mt-5 border-t border-border pt-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold">بنود الإيرادات الأخرى</h3><p className="text-xs text-muted-foreground">الملفات، المخالفات، الأعمال الأخرى</p></div><Button variant="outline" size="sm" onClick={()=>setItems(s=>[...s,blankItem()])}><Plus className="size-4"/> إضافة بند</Button></div>
        <div className="space-y-3">{items.map((item,index)=><div key={index} className="grid gap-2 rounded-lg bg-secondary/50 p-3 sm:grid-cols-[1fr_160px_1fr_auto]"><Input placeholder="نوع الإيراد" value={item.category} onChange={(e)=>setItems(s=>s.map((x,i)=>i===index?{...x,category:e.target.value}:x))}/><Input dir="ltr" inputMode="decimal" placeholder="المبلغ" value={item.amount} onChange={(e)=>setItems(s=>s.map((x,i)=>i===index?{...x,amount:e.target.value}:x))}/><Input placeholder="ملاحظات البند" value={item.notes} onChange={(e)=>setItems(s=>s.map((x,i)=>i===index?{...x,notes:e.target.value}:x))}/><Button variant="ghost" size="icon" aria-label="حذف البند" disabled={items.length===1} onClick={()=>setItems(s=>s.filter((_,i)=>i!==index))}><Trash2 className="size-4 text-destructive"/></Button></div>)}</div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]"><Field label="ملاحظات العملية"><Textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="ملاحظات اختيارية"/></Field><Button className="self-end" disabled={addEntry.isPending} onClick={()=>addEntry.mutate()}><Plus className="size-4"/> حفظ عملية التحصيل</Button></div>
    </section> : <div className="rounded-lg border border-border bg-secondary/50 p-4 text-center text-sm text-muted-foreground"><LockKeyhole className="mx-auto mb-2 size-5"/>تم تثبيت النتائج. أعد فتح الدورة لإضافة عمليات جديدة.</div>}

    <section className="card-elevated overflow-hidden"><div className="border-b border-border p-4"><h2 className="font-bold">سجل عمليات التحصيل</h2><p className="text-xs text-muted-foreground">{formatNumber(entries?.length??0)} عملية مسجلة</p></div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-right text-sm"><thead className="bg-secondary/60 text-xs text-muted-foreground"><tr><th className="p-3">التاريخ</th><th className="p-3">الوقت</th><th className="p-3">متحصل فواتير</th><th className="p-3">إيرادات أخرى</th><th className="p-3">بنود الإيرادات الأخرى</th><th className="p-3">ملاحظات</th><th className="p-3">أدخلها</th></tr></thead><tbody>
      {(entries??[]).map(entry=><tr key={entry.id} className="border-t border-border align-top"><td className="p-3">{formatDate(entry.entry_date)}</td><td className="p-3">{formatTime(entry.created_at)}</td><td className="p-3 font-semibold">{formatMoney(entry.invoices_collection_amount)}</td><td className="p-3 font-semibold">{formatMoney(entry.other_revenue_amount)}</td><td className="p-3">{entry.items.length?<ul className="space-y-1">{entry.items.map(item=><li key={item.id}>{item.category}: <span className="font-semibold">{formatMoney(item.amount)}</span>{item.notes?<span className="text-xs text-muted-foreground"> — {item.notes}</span>:null}</li>)}</ul>:"-"}</td><td className="p-3 text-muted-foreground">{entry.notes??"-"}</td><td className="p-3">{entry.creator_name}</td></tr>)}
      {!entries?.length?<tr><td colSpan={7} className="p-10 text-center text-muted-foreground">لا توجد عمليات تحصيل في هذه الدورة بعد</td></tr>:null}
    </tbody></table></div></section>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>}
function ConfirmAction({title,description,action,onConfirm,children}:{title:string;description:string;action:string;onConfirm:()=>void;children:React.ReactNode}){return <AlertDialog><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
