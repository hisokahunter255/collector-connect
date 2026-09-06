-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'collector');

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  username text NOT NULL UNIQUE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE SEQUENCE public.deposit_ref_seq START 1001;

CREATE TABLE public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref bigint NOT NULL DEFAULT nextval('public.deposit_ref_seq') UNIQUE,
  collector_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  invoices_count integer NOT NULL CHECK (invoices_count > 0),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  receipt_image_url text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX deposits_collector_idx ON public.deposits(collector_id);
CREATE INDEX deposits_created_idx ON public.deposits(created_at DESC);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GRANTS
GRANT SELECT ON public.branches TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.deposit_ref_seq TO authenticated, service_role;

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

-- RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches readable by authenticated" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches managed by admin" ON public.branches FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "areas readable by authenticated" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "areas managed by admin" ON public.areas FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "profiles select own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles managed by admin" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "roles select own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "deposits select own or admin" ON public.deposits FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_admin());
CREATE POLICY "deposits insert own" ON public.deposits FOR INSERT TO authenticated WITH CHECK (collector_id = auth.uid());
CREATE POLICY "deposits update admin only" ON public.deposits FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "deposits delete admin only" ON public.deposits FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "audit select admin" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "audit insert authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- ANTI-TAMPER: force system-controlled deposit fields
CREATE OR REPLACE FUNCTION public.deposits_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
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

CREATE TRIGGER deposits_before_insert_trg BEFORE INSERT ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.deposits_before_insert();

CREATE OR REPLACE FUNCTION public.deposits_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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

CREATE TRIGGER deposits_before_update_trg BEFORE UPDATE ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.deposits_before_update();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DEMO BRANCHES / AREAS
INSERT INTO public.branches (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'فرع جمصة'),
  ('22222222-2222-2222-2222-222222222222', 'فرع المنصورة');

INSERT INTO public.areas (branch_id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'منطقة 1'),
  ('11111111-1111-1111-1111-111111111111', 'منطقة 2'),
  ('11111111-1111-1111-1111-111111111111', 'منطقة 3'),
  ('22222222-2222-2222-2222-222222222222', 'شرق'),
  ('22222222-2222-2222-2222-222222222222', 'غرب'),
  ('22222222-2222-2222-2222-222222222222', 'وسط');