CREATE POLICY "members read chat uploads" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-uploads'
  AND private.is_member(private.channel_server(((storage.foldername(name))[1])::uuid), auth.uid())
);

CREATE POLICY "allowed users upload chat files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-uploads'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND private.can_chat(((storage.foldername(name))[1])::uuid, auth.uid())
  AND private.channel_allows_uploads(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "owners delete own chat files" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-uploads'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
