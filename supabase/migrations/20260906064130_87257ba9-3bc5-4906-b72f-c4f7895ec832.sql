CREATE POLICY "receipts insert own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "receipts select own or admin" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

CREATE POLICY "receipts admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'receipts' AND public.is_admin());