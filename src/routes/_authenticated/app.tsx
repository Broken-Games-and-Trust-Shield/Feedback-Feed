import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Hash,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Share2,
  Trash2,
  UserPlus,
  Copy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/feed/UserAvatar";
import { ProfileSetup } from "@/components/feed/ProfileSetup";
import { ChatPanel } from "@/components/feed/ChatPanel";
import { MembersPanel } from "@/components/feed/MembersPanel";
import { ReportsInbox } from "@/components/feed/ReportsInbox";
import {
  fetchChannels,
  fetchMembers,
  fetchMyServers,
  fetchProfile,
  initials,
  type Channel,
} from "@/lib/data";
import { useSessionUser } from "@/lib/useSession";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Your servers — Feedback Feed" },
      {
        name: "description",
        content:
          "Chat in your Feedback Feed servers, manage channels and permissions, invite members and moderate your community.",
      },
      { property: "og:title", content: "Your servers — Feedback Feed" },
      {
        property: "og:description",
        content: "Chat, manage channels and permissions, invite members and moderate.",
      },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const { user, loading } = useSessionUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const meId = user?.id ?? "";

  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const profileQuery = useQuery({
    queryKey: ["profile", meId],
    queryFn: () => fetchProfile(meId),
    enabled: !!meId,
  });
  const profile = profileQuery.data ?? null;
  const needsProfile = profileQuery.isSuccess && !profile;

  const serversQuery = useQuery({
    queryKey: ["servers", meId],
    queryFn: () => fetchMyServers(meId),
    enabled: !!meId && !!profile,
  });
  const servers = useMemo(() => serversQuery.data ?? [], [serversQuery.data]);

  useEffect(() => {
    if (servers.length === 0) {
      setActiveServerId(null);
    } else if (!servers.some((s) => s.id === activeServerId)) {
      setActiveServerId(servers[0]!.id);
    }
  }, [servers, activeServerId]);

  const server = servers.find((s) => s.id === activeServerId) ?? null;

  const channelsQuery = useQuery({
    queryKey: ["channels", server?.id],
    queryFn: () => fetchChannels(server!.id),
    enabled: !!server,
  });
  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data]);

  useEffect(() => {
    if (channels.length === 0) setActiveChannelId(null);
    else if (!channels.some((c) => c.id === activeChannelId)) setActiveChannelId(channels[0]!.id);
  }, [channels, activeChannelId]);

  const channel = channels.find((c) => c.id === activeChannelId) ?? null;

  const membersQuery = useQuery({
    queryKey: ["members", server?.id],
    queryFn: () => fetchMembers(server!.id),
    enabled: !!server,
  });
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const myRole = members.find((m) => m.user_id === meId)?.role ?? "member";
  const isOwner = !!server && server.owner_id === meId;
  const isAdmin = isOwner || myRole === "admin";

  const speakersQuery = useQuery({
    queryKey: ["speakers", channel?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_speakers")
        .select("*")
        .eq("channel_id", channel!.id);
      if (error) throw error;
      return (data ?? []) as { id: string; channel_id: string; user_id: string }[];
    },
    enabled: !!channel?.is_restricted,
  });
  const speakers = speakersQuery.data ?? [];
  const canChat =
    !!channel &&
    (!channel.is_restricted
      ? true
      : channel.operator_only
        ? isOwner
        : isAdmin || speakers.some((s) => s.user_id === meId));

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ServerRail
        servers={servers}
        activeId={activeServerId}
        onSelect={setActiveServerId}
        meId={meId}
      />

      <aside className="flex w-60 shrink-0 flex-col bg-surface">
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="truncate font-display font-semibold">
            {server ? server.name : "No server"}
          </span>
          {server ? <ServerMenu serverId={server.id} isOwner={isOwner} meId={meId} /> : null}
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChannelId(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                c.id === activeChannelId
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {c.is_restricted ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          {isOwner && server ? <NewChannel serverId={server.id} /> : null}
        </div>

        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-3 border-t border-border p-3 text-left hover:bg-muted/40"
        >
          <UserAvatar name={profile?.username ?? "?"} url={profile?.avatar_url ?? null} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile?.username ?? "Set up profile"}</p>
            <p className="text-xs text-muted-foreground">Edit profile</p>
          </div>
          <Settings className="ml-auto h-4 w-4 text-muted-foreground" />
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {server && channel ? (
          <>
            <div className="flex h-14 items-center gap-2 border-b border-border px-5">
              {channel.is_restricted ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Hash className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium">{channel.name}</span>
              {isOwner ? (
                <ChannelSettings
                  channel={channel}
                  members={members.map((m) => m.user_id)}
                  speakers={speakers.map((s) => s.user_id)}
                />
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                {isAdmin ? <ReportsInbox serverId={server.id} /> : null}
                {isOwner ? (
                  <InviteDialog serverId={server.id} inviteCode={server.invite_code} />
                ) : null}
              </div>
            </div>
            <ChatPanel
              key={channel.id}
              channel={channel}
              meId={meId}
              canChat={canChat}
              canModerate={isAdmin}
            />
          </>
        ) : (
          <EmptyState hasServer={!!server} meId={meId} />
        )}
      </main>

      {server ? (
        <aside className="hidden w-64 shrink-0 flex-col border-l border-border bg-surface lg:flex">
          <div className="flex h-14 items-center gap-2 border-b border-border px-4">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Members</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <MembersPanel
              server={server}
              members={members}
              meId={meId}
              isOwner={isOwner}
              isAdmin={isAdmin}
            />
          </div>
        </aside>
      ) : null}

      <ProfileSetup
        userId={meId}
        profile={profile}
        open={profileOpen || needsProfile}
        onOpenChange={setProfileOpen}
      />
      <PendingInvites meId={meId} onJoined={() => qc.invalidateQueries()} />
    </div>
  );
}

function ServerRail({
  servers,
  activeId,
  onSelect,
  meId,
}: {
  servers: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  meId: string;
}) {
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-background py-3">
      {servers.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          title={s.name}
          className={`grid h-12 w-12 place-items-center rounded-2xl font-display text-sm font-bold transition ${
            s.id === activeId
              ? "bg-primary text-primary-foreground"
              : "bg-surface text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {initials(s.name)}
        </button>
      ))}
      <CreateOrJoin meId={meId} />
    </nav>
  );
}

function CreateOrJoin({ meId }: { meId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_server", { _name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["servers", meId] });
      toast.success("Server created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("join_server_by_code", { _code: code.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setCode("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["servers", meId] });
      toast.success("Joined server");
    },
    onError: () => toast.error("That invite code did not work."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-primary hover:bg-muted/50"
          title="Create or join a server"
        >
          <Plus className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a server</DialogTitle>
          <DialogDescription>Start your own space or join one with a code.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="sname">New server name</Label>
          <div className="flex gap-2">
            <Input
              id="sname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Design crew"
            />
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              Create
            </Button>
          </div>
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <Label htmlFor="scode">Invite code</Label>
          <div className="flex gap-2">
            <Input
              id="scode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="paste code"
            />
            <Button
              variant="secondary"
              onClick={() => join.mutate()}
              disabled={!code.trim() || join.isPending}
            >
              Join
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServerMenu({
  serverId,
  isOwner,
  meId,
}: {
  serverId: string;
  isOwner: boolean;
  meId: string;
}) {
  const qc = useQueryClient();
  const leave = useMutation({
    mutationFn: async () => {
      if (isOwner) {
        const { error } = await supabase.from("servers").delete().eq("id", serverId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("server_id", serverId)
        .eq("user_id", meId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(isOwner ? "Server deleted" : "You left the server");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button
      size="icon"
      variant="ghost"
      title={isOwner ? "Delete server" : "Leave server"}
      onClick={() => leave.mutate()}
      disabled={leave.isPending}
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}

function NewChannel({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [restricted, setRestricted] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("channels").insert({
        server_id: serverId,
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        is_restricted: restricted,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setRestricted(false);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["channels", serverId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
          <Plus className="h-4 w-4" /> New channel
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cname">Name</Label>
          <Input
            id="cname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="announcements"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Restricted posting</p>
            <p className="text-xs text-muted-foreground">
              Only admins and chosen people can send messages.
            </p>
          </div>
          <Switch checked={restricted} onCheckedChange={setRestricted} />
        </div>
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
          Create channel
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ChannelSettings({
  channel,
  members,
  speakers,
}: {
  channel: Channel;
  members: string[];
  speakers: string[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const profilesQuery = useQuery({
    queryKey: ["profiles", members],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").in("id", members);
      const map: Record<string, { username: string; avatar_url: string | null }> = {};
      for (const p of data ?? []) map[p.id] = { username: p.username, avatar_url: p.avatar_url };
      return map;
    },
    enabled: open && members.length > 0,
  });
  const profiles = profilesQuery.data ?? {};

  const toggleRestricted = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("channels")
        .update({ is_restricted: value })
        .eq("id", channel.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", channel.server_id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleOperatorOnly = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("channels")
        .update({ operator_only: value })
        .eq("id", channel.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", channel.server_id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSpeaker = useMutation({
    mutationFn: async ({ userId, allow }: { userId: string; allow: boolean }) => {
      if (allow) {
        const { error } = await supabase
          .from("channel_speakers")
          .insert({ channel_id: channel.id, user_id: userId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("channel_speakers")
          .delete()
          .eq("channel_id", channel.id)
          .eq("user_id", userId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["speakers", channel.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteChannel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("channels").delete().eq("id", channel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["channels", channel.server_id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Channel settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>#{channel.name} settings</DialogTitle>
          <DialogDescription>Choose who is allowed to post here.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
          <p className="text-sm font-medium">Restricted posting</p>
          <Switch
            checked={channel.is_restricted}
            onCheckedChange={(v) => toggleRestricted.mutate(v)}
          />
        </div>
        {channel.is_restricted ? (
          <>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
              <div className="pr-3">
                <p className="text-sm font-medium">Operator mode</p>
                <p className="text-xs text-muted-foreground">
                  Only the owner and admins can send messages here.
                </p>
              </div>
              <Switch
                checked={channel.operator_only}
                onCheckedChange={(v) => toggleOperatorOnly.mutate(v)}
              />
            </div>
            {channel.operator_only ? (
              <p className="px-1 text-xs text-muted-foreground">
                Operator mode is on, so the list below is paused. Turn it off to let specific people
                post again.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {members.map((id) => (
                  <label
                    key={id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/30"
                  >
                    <UserAvatar
                      name={profiles[id]?.username ?? "?"}
                      url={profiles[id]?.avatar_url ?? null}
                    />
                    <span className="flex-1 truncate text-sm">
                      {profiles[id]?.username ?? "…"}
                    </span>
                    <Switch
                      checked={speakers.includes(id)}
                      onCheckedChange={(v) => toggleSpeaker.mutate({ userId: id, allow: v })}
                    />
                  </label>
                ))}
              </div>
            )}
          </>
        ) : null}
        <Button variant="destructive" onClick={() => deleteChannel.mutate()}>
          Delete channel
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ serverId, inviteCode }: { serverId: string; inviteCode: string }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const link =
    typeof window !== "undefined" ? `${window.location.origin}/invite/${inviteCode}` : "";

  const invite = useMutation({
    mutationFn: async () => {
      const { data: foundId, error } = await supabase.rpc("user_id_by_username", {
        _username: username.trim(),
      });
      if (error) throw error;
      if (!foundId) throw new Error("No account with that username.");
      const data = { id: foundId as string };
      const { data: me } = await supabase.auth.getUser();
      const { error: e2 } = await supabase.from("server_invites").insert({
        server_id: serverId,
        invitee_id: data.id,
        inviter_id: me.user!.id,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      setUsername("");
      toast.success("Invite sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-2">
          <UserPlus className="h-4 w-4" /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>Share a link or invite an account directly.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Invite link</Label>
          <div className="flex gap-2">
            <Input readOnly value={link} />
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Share2 className="h-3 w-3" /> Anyone with this link can join.
          </p>
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <Label htmlFor="inv">Invite by username</Label>
          <div className="flex gap-2">
            <Input
              id="inv"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="riverstone"
            />
            <Button onClick={() => invite.mutate()} disabled={!username.trim() || invite.isPending}>
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvites({ meId, onJoined }: { meId: string; onJoined: () => void }) {
  const qc = useQueryClient();
  const invitesQuery = useQuery({
    queryKey: ["invites", meId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_invites")
        .select("id, server_id, status, servers(name, invite_code)")
        .eq("invitee_id", meId)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        server_id: string;
        servers: { name: string; invite_code: string } | null;
      }[];
    },
    enabled: !!meId,
  });
  const invites = invitesQuery.data ?? [];

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const inv = invites.find((i) => i.id === id);
      if (accept && inv?.servers?.invite_code) {
        const { error } = await supabase.rpc("join_server_by_code", {
          _code: inv.servers.invite_code,
        });
        if (error) throw error;
      }
      const { error } = await supabase
        .from("server_invites")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites", meId] });
      onJoined();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (invites.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 space-y-2">
      {invites.map((i) => (
        <div key={i.id} className="rounded-xl bg-surface p-4 glow-ring">
          <p className="text-sm">
            You were invited to <span className="font-semibold">{i.servers?.name ?? "a server"}</span>
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => respond.mutate({ id: i.id, accept: true })}>
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => respond.mutate({ id: i.id, accept: false })}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasServer, meId }: { hasServer: boolean; meId: string }) {
  return (
    <div className="grid flex-1 place-items-center p-10 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-2xl font-semibold">
          {hasServer ? "No channels yet" : "You're not in any server yet"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasServer
            ? "Create a channel to start the conversation."
            : "Create your own server or join one with an invite code."}
        </p>
        {!hasServer ? (
          <div className="mt-6 flex justify-center">
            <CreateOrJoin meId={meId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
