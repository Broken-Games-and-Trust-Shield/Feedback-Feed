import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
};

export type Server = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
};

export type Member = {
  id: string;
  server_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

export type Channel = {
  id: string;
  server_id: string;
  name: string;
  is_restricted: boolean;
  operator_only: boolean;
  allow_uploads: boolean;
  slowmode_seconds: number;
  allow_replies?: boolean;
  category_id: string | null;
  created_at: string;
};

export type ChannelCategory = {
  id: string;
  server_id: string;
  name: string;
  position: number;
  created_at: string;
};

export type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_removed?: boolean;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  reply_to_id?: string | null;
};

export function mentionsUser(content: string, username: string) {
  if (!username) return false;
  const u = username.toLowerCase();
  return (content.match(/@([^\s@]+)/g) ?? []).some(
    (m) => m.slice(1).toLowerCase().replace(/[.,!?:;]+$/, "") === u,
  );
}


export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function fetchProfiles(ids: string[]) {
  if (ids.length === 0) return {} as Record<string, Profile>;
  const { data, error } = await supabase.from("profiles").select("*").in("id", ids);
  if (error) throw error;
  const map: Record<string, Profile> = {};
  for (const p of (data ?? []) as Profile[]) map[p.id] = p;
  return map;
}

export async function fetchMyServers(userId: string) {
  const { data: memberships, error } = await supabase
    .from("server_members")
    .select("server_id, role")
    .eq("user_id", userId);
  if (error) throw error;
  const ids = (memberships ?? []).map((m) => m.server_id as string);
  if (ids.length === 0) return [] as Server[];
  const { data: servers, error: e2 } = await supabase
    .from("servers")
    .select("*")
    .in("id", ids)
    .order("created_at");
  if (e2) throw e2;
  return (servers ?? []) as Server[];
}

export async function fetchChannels(serverId: string) {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("server_id", serverId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Channel[];
}

export async function fetchCategories(serverId: string) {
  const { data, error } = await supabase
    .from("channel_categories")
    .select("*")
    .eq("server_id", serverId)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ChannelCategory[];
}

export async function fetchMembers(serverId: string) {
  const { data, error } = await supabase
    .from("server_members")
    .select("*")
    .eq("server_id", serverId);
  if (error) throw error;
  return (data ?? []) as Member[];
}

export async function fetchMessages(channelId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at")
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}
