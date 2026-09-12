ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS allow_uploads boolean NOT NULL DEFAULT false;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_len;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_len CHECK (
  char_length(content) <= 4000
  AND (char_length(content) >= 1 OR attachment_url IS NOT NULL)
);
ALTER TABLE public.messages ADD CONSTRAINT messages_attachment_len CHECK (
  (attachment_url IS NULL OR char_length(attachment_url) <= 2000)
  AND (attachment_type IS NULL OR char_length(attachment_type) <= 100)
  AND (attachment_name IS NULL OR char_length(attachment_name) <= 300)
  AND (attachment_size IS NULL OR attachment_size <= 314572800)
);

CREATE OR REPLACE FUNCTION private.channel_allows_uploads(_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT coalesce((SELECT allow_uploads FROM public.channels WHERE id = _channel_id), false)
$$;
GRANT EXECUTE ON FUNCTION private.channel_allows_uploads(uuid) TO authenticated;

DROP POLICY IF EXISTS "allowed users post" ON public.messages;
CREATE POLICY "allowed users post" ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND private.can_chat(channel_id, auth.uid())
  AND (attachment_url IS NULL OR private.channel_allows_uploads(channel_id))
);
