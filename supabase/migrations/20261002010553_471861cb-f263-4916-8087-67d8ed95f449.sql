ALTER TABLE public.channels ADD COLUMN send_emails boolean NOT NULL DEFAULT false;

CREATE TABLE public.channel_reads (
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_reads TO authenticated;
GRANT ALL ON public.channel_reads TO service_role;
ALTER TABLE public.channel_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reads" ON public.channel_reads FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND private.is_member(private.channel_server(channel_id), auth.uid()));

CREATE TABLE public.channel_email_subscriptions (
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
GRANT SELECT, INSERT, DELETE ON public.channel_email_subscriptions TO authenticated;
GRANT ALL ON public.channel_email_subscriptions TO service_role;
ALTER TABLE public.channel_email_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own subs" ON public.channel_email_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "remove own subs" ON public.channel_email_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "add own subs" ON public.channel_email_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND private.is_member(private.channel_server(channel_id), auth.uid())
    AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND c.send_emails));

CREATE OR REPLACE FUNCTION public.unread_counts(_server_id uuid)
RETURNS TABLE(channel_id uuid, unread bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.id, count(m.id)
  FROM public.channels c
  JOIN public.server_members sm ON sm.server_id = c.server_id AND sm.user_id = auth.uid()
  LEFT JOIN public.channel_reads r ON r.channel_id = c.id AND r.user_id = auth.uid()
  JOIN public.messages m ON m.channel_id = c.id
    AND m.user_id <> auth.uid()
    AND m.created_at > COALESCE(r.last_read_at, sm.joined_at)
  WHERE c.server_id = _server_id
  GROUP BY c.id
$$;
REVOKE ALL ON FUNCTION public.unread_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unread_counts(uuid) TO authenticated;