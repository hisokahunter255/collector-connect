CREATE TABLE public.supervisor_permissions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_manage_collectors boolean NOT NULL DEFAULT false,
  can_review_deposits boolean NOT NULL DEFAULT false,
  can_manage_collections boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supervisor_permissions TO authenticated;
GRANT ALL ON public.supervisor_permissions TO service_role;
ALTER TABLE public.supervisor_permissions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER supervisor_permissions_touch BEFORE UPDATE ON public.supervisor_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'supervisor');
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR public.is_supervisor();
$$;

CREATE OR REPLACE FUNCTION public.supervisor_can(_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.supervisor_permissions sp
    WHERE sp.user_id = auth.uid()
      AND public.has_role(auth.uid(), 'supervisor')
      AND CASE _perm
        WHEN 'collectors' THEN sp.can_manage_collectors
        WHEN 'deposits' THEN sp.can_review_deposits
        WHEN 'collections' THEN sp.can_manage_collections
        ELSE false END
  );
$$;

CREATE POLICY "supervisor permissions read self or staff" ON public.supervisor_permissions
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());

CREATE POLICY "supervisor permissions managed by admin" ON public.supervisor_permissions
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- profiles / branches / areas visibility for supervisors
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
CREATE POLICY "profiles select own or staff" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff());

-- deposits: supervisors read all, and review when permitted
DROP POLICY IF EXISTS "deposits select own or admin" ON public.deposits;
CREATE POLICY "deposits select own or staff" ON public.deposits
FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "deposits update admin only" ON public.deposits;
CREATE POLICY "deposits update by permitted staff" ON public.deposits
FOR UPDATE TO authenticated USING (public.supervisor_can('deposits')) WITH CHECK (public.supervisor_can('deposits'));

-- collection cycles / entries / other revenue
DROP POLICY IF EXISTS "collection cycles collector read own" ON public.collection_cycles;
CREATE POLICY "collection cycles read own or staff" ON public.collection_cycles
FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());

CREATE POLICY "collection cycles managed by permitted staff" ON public.collection_cycles
FOR ALL TO authenticated USING (public.supervisor_can('collections')) WITH CHECK (public.supervisor_can('collections'));

DROP POLICY IF EXISTS "collection entries collector read own" ON public.collection_entries;
CREATE POLICY "collection entries read own or staff" ON public.collection_entries
FOR SELECT TO authenticated USING (
  public.is_staff() OR EXISTS (
    SELECT 1 FROM public.collection_cycles c
    WHERE c.id = collection_entries.cycle_id AND c.collector_id = auth.uid()
  )
);

CREATE POLICY "collection entries managed by permitted staff" ON public.collection_entries
FOR ALL TO authenticated USING (public.supervisor_can('collections')) WITH CHECK (public.supervisor_can('collections'));

DROP POLICY IF EXISTS "other revenue items collector read own" ON public.other_revenue_items;
CREATE POLICY "other revenue items read own or staff" ON public.other_revenue_items
FOR SELECT TO authenticated USING (
  public.is_staff() OR EXISTS (
    SELECT 1 FROM public.collection_entries e
    JOIN public.collection_cycles c ON c.id = e.cycle_id
    WHERE e.id = other_revenue_items.collection_entry_id AND c.collector_id = auth.uid()
  )
);

CREATE POLICY "other revenue items managed by permitted staff" ON public.other_revenue_items
FOR ALL TO authenticated USING (public.supervisor_can('collections')) WITH CHECK (public.supervisor_can('collections'));

-- audit log + branch targets readable by staff
DROP POLICY IF EXISTS "audit select admin" ON public.audit_logs;
CREATE POLICY "audit select staff" ON public.audit_logs
FOR SELECT TO authenticated USING (public.is_staff());