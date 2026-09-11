DROP POLICY IF EXISTS "members see bans" ON public.server_bans;
CREATE POLICY "banned self or admins see bans"
ON public.server_bans FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR private.is_admin(server_id, auth.uid()));