CREATE TABLE public.channel_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_categories TO authenticated;
GRANT ALL ON public.channel_categories TO service_role;

ALTER TABLE public.channel_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members see categories" ON public.channel_categories
  FOR SELECT TO authenticated USING (public.is_member(server_id, auth.uid()));
CREATE POLICY "admins create categories" ON public.channel_categories
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(server_id, auth.uid()));
CREATE POLICY "admins update categories" ON public.channel_categories
  FOR UPDATE TO authenticated USING (public.is_admin(server_id, auth.uid())) WITH CHECK (public.is_admin(server_id, auth.uid()));
CREATE POLICY "admins delete categories" ON public.channel_categories
  FOR DELETE TO authenticated USING (public.is_admin(server_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER update_channel_categories_updated_at
  BEFORE UPDATE ON public.channel_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.channels
  ADD COLUMN category_id uuid REFERENCES public.channel_categories(id) ON DELETE SET NULL;