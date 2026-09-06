REVOKE EXECUTE ON FUNCTION public.is_supervisor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisor_can(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisor_can(text) TO authenticated, service_role;