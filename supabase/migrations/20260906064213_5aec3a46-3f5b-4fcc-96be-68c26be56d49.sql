CREATE OR REPLACE FUNCTION public.deposits_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- trusted server-side insert (seed / admin tooling)
  END IF;
  NEW.collector_id := auth.uid();
  SELECT branch_id, area_id, active INTO p FROM public.profiles WHERE id = auth.uid();
  IF p IS NULL THEN RAISE EXCEPTION 'المستخدم غير مسجل في النظام'; END IF;
  IF p.active IS NOT TRUE THEN RAISE EXCEPTION 'الحساب موقوف'; END IF;
  NEW.branch_id := p.branch_id;
  NEW.area_id := p.area_id;
  NEW.created_at := now();
  NEW.status := 'pending';
  NEW.admin_notes := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.deposits_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.collector_id := OLD.collector_id;
  NEW.branch_id := OLD.branch_id;
  NEW.area_id := OLD.area_id;
  NEW.created_at := OLD.created_at;
  NEW.ref := OLD.ref;
  NEW.invoices_count := OLD.invoices_count;
  NEW.amount := OLD.amount;
  NEW.receipt_image_url := OLD.receipt_image_url;
  IF NEW.status <> OLD.status THEN
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.deposits_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deposits_before_update() FROM PUBLIC, anon, authenticated;