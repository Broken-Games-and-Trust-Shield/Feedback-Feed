ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS slowmode_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_slowmode_range;
ALTER TABLE public.channels
  ADD CONSTRAINT channels_slowmode_range CHECK (slowmode_seconds >= 0 AND slowmode_seconds <= 21600);

CREATE OR REPLACE FUNCTION private.slowmode_ok(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _secs integer;
  _server uuid;
BEGIN
  SELECT slowmode_seconds, server_id INTO _secs, _server FROM public.channels WHERE id = _channel_id;
  IF _secs IS NULL OR _secs = 0 THEN
    RETURN true;
  END IF;
  IF private.is_owner(_server, _user_id) THEN
    RETURN true;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.channel_id = _channel_id
      AND m.user_id = _user_id
      AND m.created_at > now() - make_interval(secs => _secs)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.slowmode_ok(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.slowmode_ok(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.slowmode_ok(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "allowed users post" ON public.messages;
CREATE POLICY "allowed users post" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND private.can_chat(channel_id, auth.uid())
    AND (attachment_url IS NULL OR private.channel_allows_uploads(channel_id))
    AND private.slowmode_ok(channel_id, auth.uid())
  );

ALTER TABLE public.member_reports
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;