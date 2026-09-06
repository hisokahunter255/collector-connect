ALTER TABLE public.collection_cycles ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.collection_cycles DROP CONSTRAINT collection_cycles_created_by_fkey;
ALTER TABLE public.collection_cycles ADD CONSTRAINT collection_cycles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.collection_entries ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.collection_entries DROP CONSTRAINT collection_entries_created_by_fkey;
ALTER TABLE public.collection_entries ADD CONSTRAINT collection_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;