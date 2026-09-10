ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.scrub_user_messages(_server_id uuid, _user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.messages m
  SET content = '[message removed]', is_removed = true
  FROM public.channels c
  WHERE m.channel_id = c.id
    AND c.server_id = _server_id
    AND m.user_id = _user_id
    AND m.is_removed = false;
$$;

REVOKE ALL ON FUNCTION public.scrub_user_messages(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.scrub_messages_on_member_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.scrub_user_messages(OLD.server_id, OLD.user_id);
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.scrub_messages_on_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.scrub_user_messages(NEW.server_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scrub_messages_on_member_removed ON public.server_members;
CREATE TRIGGER trg_scrub_messages_on_member_removed
AFTER DELETE ON public.server_members
FOR EACH ROW EXECUTE FUNCTION public.scrub_messages_on_member_removed();

DROP TRIGGER IF EXISTS trg_scrub_messages_on_ban ON public.server_bans;
CREATE TRIGGER trg_scrub_messages_on_ban
AFTER INSERT ON public.server_bans
FOR EACH ROW EXECUTE FUNCTION public.scrub_messages_on_ban();