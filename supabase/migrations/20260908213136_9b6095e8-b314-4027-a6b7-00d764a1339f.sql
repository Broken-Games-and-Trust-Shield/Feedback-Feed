ALTER TABLE public.channels ADD COLUMN operator_only boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_chat(_channel uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = _channel
      AND public.is_member(c.server_id, _user)
      AND NOT public.is_banned(c.server_id, _user)
      AND (
        c.is_restricted = false
        OR public.is_admin(c.server_id, _user)
        OR (
          c.operator_only = false
          AND EXISTS (SELECT 1 FROM public.channel_speakers s WHERE s.channel_id = c.id AND s.user_id = _user)
        )
      )
  );
$function$;