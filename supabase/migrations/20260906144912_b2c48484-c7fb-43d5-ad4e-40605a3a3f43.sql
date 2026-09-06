CREATE OR REPLACE FUNCTION public.close_collection_cycle(_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE cycle_row public.collection_cycles%ROWTYPE;
DECLARE total_invoices numeric(14,2);
DECLARE total_other numeric(14,2);
DECLARE total_all numeric(14,2);
DECLARE final_percentage numeric(10,4);
DECLARE actor text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO cycle_row FROM public.collection_cycles WHERE id = _cycle_id FOR UPDATE;
  IF cycle_row.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF cycle_row.status = 'closed' THEN RAISE EXCEPTION 'الدورة منتهية بالفعل'; END IF;
  SELECT COALESCE(SUM(invoices_collection_amount), 0), COALESCE(SUM(other_revenue_amount), 0)
  INTO total_invoices, total_other FROM public.collection_entries WHERE cycle_id = _cycle_id;
  total_all := total_invoices + total_other;
  final_percentage := CASE WHEN cycle_row.billing_target_amount > 0
    THEN ROUND((total_invoices / cycle_row.billing_target_amount) * 100, 4) ELSE NULL END;
  UPDATE public.collection_cycles SET
    status = 'closed', closed_at = now(), closed_by = auth.uid(),
    final_billing_target_amount = cycle_row.billing_target_amount,
    final_invoice_collection = total_invoices,
    final_other_revenue = total_other,
    final_grand_total = total_all,
    final_collection_percentage = final_percentage
  WHERE id = _cycle_id;
  SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(actor_id, actor_name, action, details)
  VALUES (auth.uid(), COALESCE(actor, 'مدير النظام'), 'إنهاء دورة تحصيل', 'تم إنهاء دورة ' || cycle_row.month || '/' || cycle_row.year);
END;
$$;