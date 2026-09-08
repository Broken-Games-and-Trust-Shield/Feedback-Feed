DROP POLICY IF EXISTS "delete own or admin" ON public.messages;
CREATE POLICY "delete own within 30s" ON public.messages
FOR DELETE TO authenticated
USING (user_id = auth.uid() AND created_at > now() - interval '30 seconds');