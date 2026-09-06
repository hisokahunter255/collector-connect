CREATE TABLE public.collection_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  collector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  billing_target_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (billing_target_amount >= 0),
  billing_invoices_count integer CHECK (billing_invoices_count IS NULL OR billing_invoices_count >= 0),
  target_received_date date NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  final_billing_target_amount numeric(14,2),
  final_invoice_collection numeric(14,2),
  final_other_revenue numeric(14,2),
  final_grand_total numeric(14,2),
  final_collection_percentage numeric(10,4),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (year, month, branch_id, area_id, collector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_cycles TO authenticated;
GRANT ALL ON public.collection_cycles TO service_role;
ALTER TABLE public.collection_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collection cycles admin manage" ON public.collection_cycles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "collection cycles collector read own" ON public.collection_cycles
  FOR SELECT TO authenticated USING (collector_id = auth.uid());

CREATE TABLE public.collection_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.collection_cycles(id) ON DELETE CASCADE,
  collector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  invoices_collection_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (invoices_collection_amount >= 0),
  other_revenue_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (other_revenue_amount >= 0),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_entries TO authenticated;
GRANT ALL ON public.collection_entries TO service_role;
ALTER TABLE public.collection_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collection entries admin manage" ON public.collection_entries
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "collection entries collector read own" ON public.collection_entries
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.collection_cycles c
      WHERE c.id = collection_entries.cycle_id AND c.collector_id = auth.uid()
    )
  );

CREATE TABLE public.other_revenue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_entry_id uuid NOT NULL REFERENCES public.collection_entries(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (length(trim(category)) > 0),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_revenue_items TO authenticated;
GRANT ALL ON public.other_revenue_items TO service_role;
ALTER TABLE public.other_revenue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "other revenue items admin manage" ON public.other_revenue_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "other revenue items collector read own" ON public.other_revenue_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.collection_entries e
      JOIN public.collection_cycles c ON c.id = e.cycle_id
      WHERE e.id = other_revenue_items.collection_entry_id AND c.collector_id = auth.uid()
    )
  );

CREATE INDEX collection_cycles_period_idx ON public.collection_cycles(year DESC, month DESC);
CREATE INDEX collection_cycles_scope_idx ON public.collection_cycles(branch_id, area_id, collector_id);
CREATE INDEX collection_entries_cycle_date_idx ON public.collection_entries(cycle_id, entry_date DESC, created_at DESC);
CREATE INDEX other_revenue_items_entry_idx ON public.other_revenue_items(collection_entry_id);

CREATE TRIGGER collection_cycles_touch BEFORE UPDATE ON public.collection_cycles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER collection_entries_touch BEFORE UPDATE ON public.collection_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER other_revenue_items_touch BEFORE UPDATE ON public.other_revenue_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_collection_entry_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cycle_row public.collection_cycles%ROWTYPE;
BEGIN
  SELECT * INTO cycle_row FROM public.collection_cycles WHERE id = NEW.cycle_id;
  IF cycle_row.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF cycle_row.status <> 'open' THEN RAISE EXCEPTION 'لا يمكن تعديل دورة منتهية'; END IF;
  NEW.collector_id := cycle_row.collector_id;
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER collection_entries_validate BEFORE INSERT OR UPDATE ON public.collection_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_collection_entry_write();

CREATE OR REPLACE FUNCTION public.validate_other_revenue_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cycle_status text;
BEGIN
  SELECT c.status INTO cycle_status
  FROM public.collection_entries e
  JOIN public.collection_cycles c ON c.id = e.cycle_id
  WHERE e.id = NEW.collection_entry_id;
  IF cycle_status IS NULL THEN RAISE EXCEPTION 'عملية التحصيل غير موجودة'; END IF;
  IF cycle_status <> 'open' THEN RAISE EXCEPTION 'لا يمكن تعديل دورة منتهية'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER other_revenue_items_validate BEFORE INSERT OR UPDATE ON public.other_revenue_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_other_revenue_write();

CREATE OR REPLACE FUNCTION public.sync_entry_other_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_entry uuid;
BEGIN
  target_entry := COALESCE(NEW.collection_entry_id, OLD.collection_entry_id);
  UPDATE public.collection_entries
  SET other_revenue_amount = COALESCE((
    SELECT SUM(amount) FROM public.other_revenue_items WHERE collection_entry_id = target_entry
  ), 0), updated_at = now()
  WHERE id = target_entry;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER other_revenue_items_sync AFTER INSERT OR UPDATE OR DELETE ON public.other_revenue_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_entry_other_revenue();

CREATE VIEW public.collection_cycle_summaries
WITH (security_invoker = true)
AS
SELECT
  c.*,
  b.name AS branch_name,
  a.name AS area_name,
  p.full_name AS collector_name,
  COALESCE(SUM(e.invoices_collection_amount), 0)::numeric(14,2) AS total_invoice_collection,
  COALESCE(SUM(e.other_revenue_amount), 0)::numeric(14,2) AS total_other_revenue,
  (COALESCE(SUM(e.invoices_collection_amount), 0) + COALESCE(SUM(e.other_revenue_amount), 0))::numeric(14,2) AS grand_total,
  CASE
    WHEN c.billing_target_amount > 0
    THEN ROUND((COALESCE(SUM(e.invoices_collection_amount), 0) / c.billing_target_amount) * 100, 4)
    ELSE NULL
  END AS collection_percentage
FROM public.collection_cycles c
JOIN public.branches b ON b.id = c.branch_id
LEFT JOIN public.areas a ON a.id = c.area_id
LEFT JOIN public.profiles p ON p.id = c.collector_id
LEFT JOIN public.collection_entries e ON e.cycle_id = c.id
GROUP BY c.id, b.name, a.name, p.full_name;
GRANT SELECT ON public.collection_cycle_summaries TO authenticated;
GRANT ALL ON public.collection_cycle_summaries TO service_role;

CREATE OR REPLACE FUNCTION public.close_collection_cycle(_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s RECORD;
DECLARE actor text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO s FROM public.collection_cycle_summaries WHERE id = _cycle_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF s.status = 'closed' THEN RAISE EXCEPTION 'الدورة منتهية بالفعل'; END IF;
  UPDATE public.collection_cycles SET
    status = 'closed', closed_at = now(), closed_by = auth.uid(),
    final_billing_target_amount = s.billing_target_amount,
    final_invoice_collection = s.total_invoice_collection,
    final_other_revenue = s.total_other_revenue,
    final_grand_total = s.grand_total,
    final_collection_percentage = s.collection_percentage
  WHERE id = _cycle_id;
  SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(actor_id, actor_name, action, details)
  VALUES (auth.uid(), COALESCE(actor, 'مدير النظام'), 'إنهاء دورة تحصيل', 'تم إنهاء دورة ' || s.month || '/' || s.year);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_collection_cycle(_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cycle_row public.collection_cycles%ROWTYPE;
DECLARE actor text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO cycle_row FROM public.collection_cycles WHERE id = _cycle_id FOR UPDATE;
  IF cycle_row.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF cycle_row.status = 'open' THEN RAISE EXCEPTION 'الدورة مفتوحة بالفعل'; END IF;
  UPDATE public.collection_cycles SET
    status = 'open', closed_at = NULL, closed_by = NULL,
    final_billing_target_amount = NULL, final_invoice_collection = NULL,
    final_other_revenue = NULL, final_grand_total = NULL,
    final_collection_percentage = NULL
  WHERE id = _cycle_id;
  SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(actor_id, actor_name, action, details)
  VALUES (auth.uid(), COALESCE(actor, 'مدير النظام'), 'إعادة فتح دورة تحصيل', 'تمت إعادة فتح دورة ' || cycle_row.month || '/' || cycle_row.year);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_collection_cycle(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_collection_cycle(uuid) TO authenticated;