-- Cascade deposits when branch/area deleted
ALTER TABLE public.deposits DROP CONSTRAINT IF EXISTS deposits_branch_id_fkey;
ALTER TABLE public.deposits ADD CONSTRAINT deposits_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.deposits DROP CONSTRAINT IF EXISTS deposits_area_id_fkey;
ALTER TABLE public.deposits ADD CONSTRAINT deposits_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE CASCADE;

-- Areas removed with their branch
ALTER TABLE public.areas DROP CONSTRAINT IF EXISTS areas_branch_id_fkey;
ALTER TABLE public.areas ADD CONSTRAINT areas_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;

-- Keep collector accounts, clear their branch/area
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_branch_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_area_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL;

-- Monthly collection target per branch
CREATE TABLE public.branch_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month date NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_targets TO authenticated;
GRANT ALL ON public.branch_targets TO service_role;

ALTER TABLE public.branch_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch targets readable by authenticated" ON public.branch_targets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "branch targets managed by admin" ON public.branch_targets
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER branch_targets_touch BEFORE UPDATE ON public.branch_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();