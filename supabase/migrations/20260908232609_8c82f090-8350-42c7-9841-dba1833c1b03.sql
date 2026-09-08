-- 1) Prevent self-promotion when joining a server
DROP POLICY IF EXISTS "join self" ON public.server_members;
CREATE POLICY "join self" ON public.server_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
    AND NOT public.is_banned(server_id, auth.uid())
  );

-- 2) Helper: do two users share a server?
CREATE OR REPLACE FUNCTION public.shares_server(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.server_members m1
    JOIN public.server_members m2 ON m1.server_id = m2.server_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  );
$$;

-- 3) Restrict profile visibility
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles visible to self and co-members" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.shares_server(auth.uid(), id)
    OR EXISTS (
      SELECT 1 FROM public.server_bans b
      WHERE b.user_id = profiles.id AND public.is_admin(b.server_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.server_invites i
      WHERE (i.invitee_id = profiles.id OR i.inviter_id = profiles.id)
        AND (i.invitee_id = auth.uid() OR public.is_member(i.server_id, auth.uid()))
    )
  );

-- 4) Safe username lookup for invites (returns only the user id)
CREATE OR REPLACE FUNCTION public.user_id_by_username(_username text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE username = _username LIMIT 1;
$$;

-- 5) Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.can_chat(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.channel_server(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_invite(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_banned(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_server(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_server(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_server_by_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.server_name_by_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_id_by_username(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_chat(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_server(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_invite(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_server(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_server(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_server_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.server_name_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_id_by_username(text) TO authenticated;

-- trigger-only routines: not callable directly by API roles
REVOKE ALL ON FUNCTION public.clear_invites_on_member_removed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reinvite_on_unban() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_member_on_ban() FROM PUBLIC, anon, authenticated;

-- 6) Speaker rows may only be added or removed, never edited in place
REVOKE UPDATE ON public.channel_speakers FROM anon, authenticated;