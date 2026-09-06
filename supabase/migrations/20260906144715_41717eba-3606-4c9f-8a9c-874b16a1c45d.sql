ALTER FUNCTION public.validate_collection_entry_write() SECURITY INVOKER;
ALTER FUNCTION public.validate_other_revenue_write() SECURITY INVOKER;
ALTER FUNCTION public.sync_entry_other_revenue() SECURITY INVOKER;
ALTER FUNCTION public.close_collection_cycle(uuid) SECURITY INVOKER;
ALTER FUNCTION public.reopen_collection_cycle(uuid) SECURITY INVOKER;