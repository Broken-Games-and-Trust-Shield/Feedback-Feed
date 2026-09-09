DROP POLICY IF EXISTS "admins create channels" ON public.channels;
DROP POLICY IF EXISTS "admins update channels" ON public.channels;
DROP POLICY IF EXISTS "admins delete channels" ON public.channels;
CREATE POLICY "owner creates channels" ON public.channels FOR INSERT TO authenticated WITH CHECK (public.is_owner(server_id, auth.uid()));
CREATE POLICY "owner updates channels" ON public.channels FOR UPDATE TO authenticated USING (public.is_owner(server_id, auth.uid())) WITH CHECK (public.is_owner(server_id, auth.uid()));
CREATE POLICY "owner deletes channels" ON public.channels FOR DELETE TO authenticated USING (public.is_owner(server_id, auth.uid()));

DROP POLICY IF EXISTS "admins add speakers" ON public.channel_speakers;
DROP POLICY IF EXISTS "admins remove speakers" ON public.channel_speakers;
CREATE POLICY "owner adds speakers" ON public.channel_speakers FOR INSERT TO authenticated WITH CHECK (public.is_owner(public.channel_server(channel_id), auth.uid()));
CREATE POLICY "owner removes speakers" ON public.channel_speakers FOR DELETE TO authenticated USING (public.is_owner(public.channel_server(channel_id), auth.uid()));

DROP POLICY IF EXISTS "admins create categories" ON public.channel_categories;
DROP POLICY IF EXISTS "admins update categories" ON public.channel_categories;
DROP POLICY IF EXISTS "admins delete categories" ON public.channel_categories;
CREATE POLICY "owner creates categories" ON public.channel_categories FOR INSERT TO authenticated WITH CHECK (public.is_owner(server_id, auth.uid()));
CREATE POLICY "owner updates categories" ON public.channel_categories FOR UPDATE TO authenticated USING (public.is_owner(server_id, auth.uid())) WITH CHECK (public.is_owner(server_id, auth.uid()));
CREATE POLICY "owner deletes categories" ON public.channel_categories FOR DELETE TO authenticated USING (public.is_owner(server_id, auth.uid()));