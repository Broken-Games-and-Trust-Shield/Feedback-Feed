REVOKE ALL ON FUNCTION public.scrub_messages_on_member_removed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scrub_messages_on_ban() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scrub_user_messages(uuid, uuid) FROM PUBLIC, anon, authenticated;