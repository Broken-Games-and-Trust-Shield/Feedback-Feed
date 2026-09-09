create or replace function private.create_server(_name text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.servers (name, owner_id) values (_name, auth.uid()) returning id into _id;
  insert into public.server_members (server_id, user_id, role) values (_id, auth.uid(), 'owner');
  insert into public.channels (server_id, name) values (_id, 'general');
  return _id;
end;
$$;

create or replace function private.join_server_by_code(_code text)
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

create or replace function private.server_name_by_code(_code text)
returns text language sql stable security definer set search_path to 'public' as $$
  select name from public.servers where invite_code = _code;
$$;

create or replace function private.user_id_by_username(_username text)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from public.profiles where username = _username limit 1;
$$;

revoke all on function private.create_server(text), private.join_server_by_code(text),
  private.server_name_by_code(text), private.user_id_by_username(text) from public;
grant execute on function private.create_server(text), private.join_server_by_code(text),
  private.server_name_by_code(text), private.user_id_by_username(text) to authenticated, service_role;

create or replace function public.create_server(_name text)
returns uuid language sql security invoker set search_path to 'public' as $$
  select private.create_server(_name);
$$;

create or replace function public.join_server_by_code(_code text)
returns uuid language sql security invoker set search_path to 'public' as $$
  select private.join_server_by_code(_code);
$$;

create or replace function public.server_name_by_code(_code text)
returns text language sql stable security invoker set search_path to 'public' as $$
  select private.server_name_by_code(_code);
$$;

create or replace function public.user_id_by_username(_username text)
returns uuid language sql stable security invoker set search_path to 'public' as $$
  select private.user_id_by_username(_username);
$$;

revoke all on function public.create_server(text), public.join_server_by_code(text),
  public.server_name_by_code(text), public.user_id_by_username(text) from public;
grant execute on function public.create_server(text), public.join_server_by_code(text),
  public.server_name_by_code(text), public.user_id_by_username(text) to authenticated, service_role;
