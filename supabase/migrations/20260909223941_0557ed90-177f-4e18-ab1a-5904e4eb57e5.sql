-- 1. Length limits
ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_len CHECK (char_length(content) BETWEEN 1 AND 4000);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_name_len CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.channel_categories
  ADD CONSTRAINT channel_categories_name_len CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_len CHECK (char_length(username) BETWEEN 1 AND 32);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_len CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 200000);

ALTER TABLE public.member_reports
  ADD CONSTRAINT member_reports_reason_len CHECK (char_length(reason) BETWEEN 5 AND 1000);

ALTER TABLE public.server_bans
  ADD CONSTRAINT server_bans_reason_len CHECK (reason IS NULL OR char_length(reason) <= 1000);

ALTER TABLE public.servers
  ADD CONSTRAINT servers_name_len CHECK (char_length(name) BETWEEN 1 AND 100);

-- 2. Inviter can revoke their own invite
DROP POLICY IF EXISTS "invitee or admin deletes invite" ON public.server_invites;
CREATE POLICY "invitee inviter or admin deletes invite"
ON public.server_invites
FOR DELETE
TO authenticated
USING (
  invitee_id = auth.uid()
  OR inviter_id = auth.uid()
  OR private.is_admin(server_id, auth.uid())
);

-- 3. Messages are immutable: explicitly remove UPDATE privilege
REVOKE UPDATE ON public.messages FROM authenticated;
REVOKE UPDATE ON public.messages FROM anon;
