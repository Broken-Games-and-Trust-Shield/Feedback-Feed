-- 1. Bans: audit field must be the caller, and only the owner may ban a moderator
DROP POLICY IF EXISTS "admins ban" ON public.server_bans;

CREATE POLICY "admins ban" ON public.server_bans
FOR INSERT TO authenticated
WITH CHECK (
  banned_by = auth.uid()
  AND private.is_admin(server_id, auth.uid())
  AND NOT private.is_owner(server_id, user_id)
  AND (
    private.is_owner(server_id, auth.uid())
    OR NOT private.is_admin(server_id, user_id)
  )
);

-- Only the owner may lift a ban on a moderator-issued... keep unban to admins, unchanged.

-- 2. Invites: lock every column except status on invitee updates
CREATE OR REPLACE FUNCTION public.enforce_invite_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.server_id IS DISTINCT FROM OLD.server_id
     OR NEW.invitee_id IS DISTINCT FROM OLD.invitee_id
     OR NEW.inviter_id IS DISTINCT FROM OLD.inviter_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only the invite status can be changed';
  END IF;

  IF NEW.status NOT IN ('pending', 'accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid invite status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invite_immutable_columns ON public.server_invites;
CREATE TRIGGER trg_invite_immutable_columns
BEFORE UPDATE ON public.server_invites
FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_immutable_columns();

REVOKE ALL ON FUNCTION public.enforce_invite_immutable_columns() FROM anon, authenticated;