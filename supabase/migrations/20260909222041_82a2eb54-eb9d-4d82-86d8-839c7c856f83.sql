create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_member(_server uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.server_members where server_id = _server and user_id = _user);
$$;

create or replace function private.is_owner(_server uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.servers where id = _server and owner_id = _user);
$$;

create or replace function private.is_admin(_server uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.server_members where server_id = _server and user_id = _user and role in ('owner','admin'));
$$;

create or replace function private.is_banned(_server uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.server_bans where server_id = _server and user_id = _user);
$$;

create or replace function private.has_invite(_server uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.server_invites where server_id = _server and invitee_id = _user and status = 'pending');
$$;

create or replace function private.channel_server(_channel uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select server_id from public.channels where id = _channel;
$$;

create or replace function private.shares_server(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.server_members m1
    join public.server_members m2 on m1.server_id = m2.server_id
    where m1.user_id = _a and m2.user_id = _b
  );
$$;

create or replace function private.can_chat(_channel uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.channels c
    where c.id = _channel
      and private.is_member(c.server_id, _user)
      and not private.is_banned(c.server_id, _user)
      and (
        c.is_restricted = false
        or (
          case
            when c.operator_only then private.is_owner(c.server_id, _user)
            else private.is_admin(c.server_id, _user)
                 or exists (select 1 from public.channel_speakers s where s.channel_id = c.id and s.user_id = _user)
          end
        )
      )
  );
$$;

revoke all on function private.is_member(uuid,uuid), private.is_owner(uuid,uuid), private.is_admin(uuid,uuid),
  private.is_banned(uuid,uuid), private.has_invite(uuid,uuid), private.channel_server(uuid),
  private.shares_server(uuid,uuid), private.can_chat(uuid,uuid) from public;
grant execute on function private.is_member(uuid,uuid), private.is_owner(uuid,uuid), private.is_admin(uuid,uuid),
  private.is_banned(uuid,uuid), private.has_invite(uuid,uuid), private.channel_server(uuid),
  private.shares_server(uuid,uuid), private.can_chat(uuid,uuid) to authenticated, service_role;

-- channel_categories
drop policy "members see categories" on public.channel_categories;
create policy "members see categories" on public.channel_categories for select to authenticated using (private.is_member(server_id, auth.uid()));
drop policy "owner creates categories" on public.channel_categories;
create policy "owner creates categories" on public.channel_categories for insert to authenticated with check (private.is_owner(server_id, auth.uid()));
drop policy "owner updates categories" on public.channel_categories;
create policy "owner updates categories" on public.channel_categories for update to authenticated using (private.is_owner(server_id, auth.uid())) with check (private.is_owner(server_id, auth.uid()));
drop policy "owner deletes categories" on public.channel_categories;
create policy "owner deletes categories" on public.channel_categories for delete to authenticated using (private.is_owner(server_id, auth.uid()));

-- channel_speakers
drop policy "members see speakers" on public.channel_speakers;
create policy "members see speakers" on public.channel_speakers for select to authenticated using (private.is_member(private.channel_server(channel_id), auth.uid()));
drop policy "owner adds speakers" on public.channel_speakers;
create policy "owner adds speakers" on public.channel_speakers for insert to authenticated with check (private.is_owner(private.channel_server(channel_id), auth.uid()));
drop policy "owner removes speakers" on public.channel_speakers;
create policy "owner removes speakers" on public.channel_speakers for delete to authenticated using (private.is_owner(private.channel_server(channel_id), auth.uid()));

-- channels
drop policy "members see channels" on public.channels;
create policy "members see channels" on public.channels for select to authenticated using (private.is_member(server_id, auth.uid()));
drop policy "owner creates channels" on public.channels;
create policy "owner creates channels" on public.channels for insert to authenticated with check (private.is_owner(server_id, auth.uid()));
drop policy "owner updates channels" on public.channels;
create policy "owner updates channels" on public.channels for update to authenticated using (private.is_owner(server_id, auth.uid())) with check (private.is_owner(server_id, auth.uid()));
drop policy "owner deletes channels" on public.channels;
create policy "owner deletes channels" on public.channels for delete to authenticated using (private.is_owner(server_id, auth.uid()));

-- member_reports
drop policy "admins or reporter read reports" on public.member_reports;
create policy "admins or reporter read reports" on public.member_reports for select to authenticated using ((reporter_id = auth.uid()) or private.is_admin(server_id, auth.uid()));
drop policy "members report" on public.member_reports;
create policy "members report" on public.member_reports for insert to authenticated with check ((reporter_id = auth.uid()) and private.is_member(server_id, auth.uid()));
drop policy "admins update reports" on public.member_reports;
create policy "admins update reports" on public.member_reports for update to authenticated using (private.is_admin(server_id, auth.uid())) with check (private.is_admin(server_id, auth.uid()));
drop policy "admins delete reports" on public.member_reports;
create policy "admins delete reports" on public.member_reports for delete to authenticated using (private.is_admin(server_id, auth.uid()));

-- messages
drop policy "members read messages" on public.messages;
create policy "members read messages" on public.messages for select to authenticated using (private.is_member(private.channel_server(channel_id), auth.uid()));
drop policy "allowed users post" on public.messages;
create policy "allowed users post" on public.messages for insert to authenticated with check ((user_id = auth.uid()) and private.can_chat(channel_id, auth.uid()));

-- profiles
drop policy "profiles visible to self and co-members" on public.profiles;
create policy "profiles visible to self and co-members" on public.profiles for select to authenticated using (
  (id = auth.uid())
  or private.shares_server(auth.uid(), id)
  or exists (select 1 from public.server_bans b where b.user_id = profiles.id and private.is_admin(b.server_id, auth.uid()))
  or exists (
    select 1 from public.server_invites i
    where ((i.invitee_id = profiles.id) or (i.inviter_id = profiles.id))
      and ((i.invitee_id = auth.uid()) or private.is_member(i.server_id, auth.uid()))
  )
);

-- server_bans
drop policy "members see bans" on public.server_bans;
create policy "members see bans" on public.server_bans for select to authenticated using ((user_id = auth.uid()) or private.is_member(server_id, auth.uid()));
drop policy "admins ban" on public.server_bans;
create policy "admins ban" on public.server_bans for insert to authenticated with check (private.is_admin(server_id, auth.uid()) and not private.is_owner(server_id, user_id));
drop policy "admins unban" on public.server_bans;
create policy "admins unban" on public.server_bans for delete to authenticated using (private.is_admin(server_id, auth.uid()));

-- server_invites
drop policy "see own invites" on public.server_invites;
create policy "see own invites" on public.server_invites for select to authenticated using ((invitee_id = auth.uid()) or private.is_member(server_id, auth.uid()));
drop policy "members invite" on public.server_invites;
create policy "members invite" on public.server_invites for insert to authenticated with check ((inviter_id = auth.uid()) and private.is_member(server_id, auth.uid()));
drop policy "invitee or admin deletes invite" on public.server_invites;
create policy "invitee or admin deletes invite" on public.server_invites for delete to authenticated using ((invitee_id = auth.uid()) or private.is_admin(server_id, auth.uid()));

-- server_members
drop policy "members see members" on public.server_members;
create policy "members see members" on public.server_members for select to authenticated using ((user_id = auth.uid()) or private.is_member(server_id, auth.uid()));
drop policy "join self" on public.server_members;
create policy "join self" on public.server_members for insert to authenticated with check ((user_id = auth.uid()) and (role = 'member') and not private.is_banned(server_id, auth.uid()));
drop policy "owner changes roles" on public.server_members;
create policy "owner changes roles" on public.server_members for update to authenticated using (private.is_owner(server_id, auth.uid())) with check (private.is_owner(server_id, auth.uid()));
drop policy "leave or kick" on public.server_members;
create policy "leave or kick" on public.server_members for delete to authenticated using ((user_id = auth.uid()) or (private.is_admin(server_id, auth.uid()) and not private.is_owner(server_id, user_id)));

-- servers
drop policy "members see server" on public.servers;
create policy "members see server" on public.servers for select to authenticated using (private.is_member(id, auth.uid()) or private.has_invite(id, auth.uid()));

-- public RPCs now use the private helpers
create or replace function public.join_server_by_code(_code text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare _server uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into _server from public.servers where invite_code = _code;
  if _server is null then raise exception 'Invalid invite code'; end if;
  if private.is_banned(_server, auth.uid()) then raise exception 'You are banned from this server'; end if;
  insert into public.server_members (server_id, user_id, role)
  values (_server, auth.uid(), 'member')
  on conflict (server_id, user_id) do nothing;
  update public.server_invites set status = 'accepted' where server_id = _server and invitee_id = auth.uid();
  return _server;
end;
$$;

drop function if exists public.can_chat(uuid, uuid);
drop function if exists public.shares_server(uuid, uuid);
drop function if exists public.has_invite(uuid, uuid);
drop function if exists public.channel_server(uuid);
drop function if exists public.is_admin(uuid, uuid);
drop function if exists public.is_banned(uuid, uuid);
drop function if exists public.is_member(uuid, uuid);
drop function if exists public.is_owner(uuid, uuid);
