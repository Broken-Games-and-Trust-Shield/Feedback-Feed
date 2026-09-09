DROP POLICY IF EXISTS "members invite" ON public.server_invites;
CREATE POLICY "owner invites" ON public.server_invites FOR INSERT TO authenticated
WITH CHECK ((inviter_id = auth.uid()) AND private.is_owner(server_id, auth.uid()));