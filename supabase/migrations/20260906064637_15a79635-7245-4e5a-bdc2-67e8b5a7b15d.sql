ALTER TABLE public.deposits
  ADD CONSTRAINT deposits_collector_profile_fkey
  FOREIGN KEY (collector_id) REFERENCES public.profiles(id) ON DELETE CASCADE;