CREATE OR REPLACE FUNCTION public.validate_collection_entry_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE cycle_row public.collection_cycles%ROWTYPE;
BEGIN
  SELECT * INTO cycle_row FROM public.collection_cycles WHERE id = NEW.cycle_id;
  IF cycle_row.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF cycle_row.status <> 'open' THEN RAISE EXCEPTION 'لا يمكن تعديل دورة منتهية'; END IF;
  NEW.collector_id := cycle_row.collector_id;
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;