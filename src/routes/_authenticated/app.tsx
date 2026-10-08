import { startPresence } from "@/lib/presence";
import { Pencil as PencilIcon } from "lucide-react";
import type { Message, Profile } from "@/lib/data";
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
import { RulesGate } from "@/components/feed/RulesGate";
import {
  fetchCategories,
  fetchChannels,
  fetchMembers,
  fetchMyServers,
  fetchProfile,
  fetchProfiles,
  mentionsUser,
  initials,
  type Channel,
  type ChannelCategory,
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

  const categoriesQuery = useQuery({
    queryKey: ["categories", server?.id],
    queryFn: () => fetchCategories(server!.id),
    enabled: !!server,
  });
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const [collapsedTabs, setCollapsedTabs] = useState<string[]>([]);
  const [pings, setPings] = useState<
    { id: string; author: string; kind: string; channelName: string; channelId: string; preview: string }[]
  >([]);
  const bypassQuery = useQuery({
    queryKey: ["slowmode-bypass", activeChannelId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("channel_slowmode_bypass")
        .select("user_id")
        .eq("channel_id", activeChannelId);
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    },
    enabled: !!activeChannelId,
  });
  const bypassIds = bypassQuery.data ?? [];

  useEffect(() => {
    if (channels.length === 0) setActiveChannelId(null);
    else if (!channels.some((c) => c.id === activeChannelId)) setActiveChannelId(channels[0]!.id);
  }, [channels, activeChannelId]);

  const channel = channels.find((c) => c.id === activeChannelId) ?? null;

  useEffect(() => {
    if (!meId) return;
    return startPresence(meId);
  }, [meId]);

  // Auto-idle after 2 minutes of no activity
  useEffect(() => {
    if (!meId) return;
    const flagKey = `ff-auto-idle-${meId}`;
    let timer: ReturnType<typeof setTimeout>;
    const setStatus = async (status: string) => {
      await supabase.from("profiles").update({ status } as never).eq("id", meId);
      qc.invalidateQueries({ queryKey: ["profile", meId] });
    };
    const goIdle = async () => {
      const p = await fetchProfile(meId).catch(() => null);
      if ((p?.status ?? "online") === "online") {
        localStorage.setItem(flagKey, "1");
        await setStatus("idle");
      }
    };
    const onActivity = () => {
      clearTimeout(timer);
      timer = setTimeout(goIdle, 120_000);
      if (localStorage.getItem(flagKey)) {
        localStorage.removeItem(flagKey);
        void setStatus("online");
      }
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    onActivity();
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, [meId, qc]);

  const unreadQuery = useQuery({
    queryKey: ["unread", server?.id, meId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("unread_counts", {
        _server_id: server!.id,
      });
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { channel_id: string; unread: number }[])
        map[r.channel_id] = Number(r.unread);
      return map;
    },
    enabled: !!server && !!meId,
  });
  const unread = unreadQuery.data ?? {};

  useEffect(() => {
    if (!server) return;
    const ch = supabase
      .channel(`unread-${server.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          qc.invalidateQueries({ queryKey: ["unread", server.id] });
           const msg = payload.new as { user_id?: string; content?: string; channel_id?: string; reply_to_id?: string | null };
           if (!msg || !msg.user_id || msg.user_id === meId || !msg.channel_id) return;
           const chans = qc.getQueryData<Channel[]>(["channels", server.id]) ?? [];
           const chName = chans.find((c) => c.id === msg.channel_id)?.name;
           if (!chName) return;
          const me = await qc.fetchQuery({
            queryKey: ["profile", meId],
            queryFn: () => fetchProfile(meId),
          });
           const mentioned = !!me && mentionsUser(msg.content ?? "", me.username);
           let repliedToMe = false;
           if (msg.reply_to_id) {
             const { data: original } = await supabase
               .from("messages")
               .select("user_id, channel_id")
               .eq("id", msg.reply_to_id)
               .maybeSingle();
             repliedToMe = original?.user_id === meId && original?.channel_id === msg.channel_id;
           }
           if (!mentioned && !repliedToMe) return;
           if (me?.status === "dnd") return;
          let author = "Someone";
          try {
             const ps = await fetchProfiles([msg.user_id]);
             author = ps[msg.user_id]?.username ?? author;
          } catch {
            /* ignore */
          }
           const ping = {
             id: (payload.new as { id: string }).id,
             author,
             kind: repliedToMe ? "replied to you" : "mentioned you",
             channelName: chName,
             channelId: msg.channel_id,
             preview: (msg.content ?? "").slice(0, 140),
           };
           setPings((x) => [...x.filter((y) => y.id !== ping.id), ping].slice(-4));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [server, qc, meId]);

  // Missed mentions/replies while offline
  useEffect(() => {
    if (!server || !meId) return;
    let cancelled = false;
    (async () => {
      const chans = await qc.ensureQueryData({
        queryKey: ["channels", server.id],
        queryFn: () => fetchChannels(server.id),
      });
      if (!chans.length) return;
      const me = await qc.fetchQuery({ queryKey: ["profile", meId], queryFn: () => fetchProfile(meId) });
      if (!me) return;
      const { data: reads } = await (supabase as any)
        .from("channel_reads").select("channel_id, last_read_at").eq("user_id", meId);
      const readMap: Record<string, string> = {};
      for (const r of (reads ?? []) as { channel_id: string; last_read_at: string }[]) readMap[r.channel_id] = r.last_read_at;
      const { data: mem } = await supabase.from("server_members").select("joined_at")
        .eq("server_id", server.id).eq("user_id", meId).maybeSingle();
      const joined = mem?.joined_at ?? new Date().toISOString();
      const seenKey = `ff-seen-pings-${meId}`;
      const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) ?? "[]"));
      const found: Message[] = [];
      for (const c of chans) {
        const since = readMap[c.id] ?? joined;
        const { data } = await supabase.from("messages").select("*")
          .eq("channel_id", c.id).neq("user_id", meId).eq("is_removed", false)
          .gt("created_at", since).order("created_at").limit(200);
        found.push(...((data ?? []) as Message[]));
      }
      const replyIds = [...new Set(found.map((m) => m.reply_to_id).filter(Boolean) as string[])];
      const mine = new Set<string>();
      if (replyIds.length) {
        const { data } = await supabase.from("messages").select("id").in("id", replyIds).eq("user_id", meId);
        for (const r of data ?? []) mine.add(r.id);
      }
      const hits = found.filter((m) => !seen.has(m.id) && ((m.reply_to_id && mine.has(m.reply_to_id)) || mentionsUser(m.content ?? "", me.username)));
      if (!hits.length || cancelled) return;
      if (me.status === "dnd") {
        for (const h of hits) seen.add(h.id);
        localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-500)));
        return;
      }
      let names: Record<string, Profile> = {};
      try { names = await fetchProfiles([...new Set(hits.map((h) => h.user_id))]); } catch { /* ignore */ }
      const pingsNew = hits.slice(-4).map((m) => ({
        id: m.id,
        author: names[m.user_id]?.username ?? "Someone",
        kind: m.reply_to_id && mine.has(m.reply_to_id) ? "replied to you" : "mentioned you",
        channelName: chans.find((c) => c.id === m.channel_id)?.name ?? "",
        channelId: m.channel_id,
        preview: (m.content ?? "").slice(0, 140),
      }));
      for (const h of hits) seen.add(h.id);
      localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-500)));
      setPings((x) => [...x.filter((y) => !pingsNew.some((n) => n.id === y.id)), ...pingsNew].slice(-4));
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [server?.id, meId, qc]);

  const activeUnread = activeChannelId ? (unread[activeChannelId] ?? 0) : 0;
  useEffect(() => {
    if (!activeChannelId || !meId) return;
    void (supabase as any)
      .from("channel_reads")
      .upsert(
        { user_id: meId, channel_id: activeChannelId, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,channel_id" },
      )
      .then(() => qc.invalidateQueries({ queryKey: ["unread"] }));
  }, [activeChannelId, activeUnread, meId, qc]);

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
          {server ? (
            <div className="flex items-center gap-1">
              {isOwner ? (
                <RenameDialog
                  title="Rename server"
                  current={server.name}
                  onSave={async (name) => {
                    const { error } = await supabase.from("servers").update({ name }).eq("id", server.id);
                    if (error) throw error;
                    qc.invalidateQueries({ queryKey: ["servers"] });
                    qc.invalidateQueries();
                  }}
                />
              ) : null}
              {isAdmin ? <ReportsInbox serverId={server.id} /> : null}
              <ServerMenu serverId={server.id} isOwner={isOwner} meId={meId} />
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {categories.map((cat) => {
            const inCat = channels.filter((c) => c.category_id === cat.id);
            const collapsed = collapsedTabs.includes(cat.id);
            return (
              <div key={cat.id} className="pt-1">
                <div className="group flex items-center gap-1 px-1">
                  <button
                    onClick={() =>
                      setCollapsedTabs((prev) =>
                        prev.includes(cat.id)
                          ? prev.filter((i) => i !== cat.id)
                          : [...prev, cat.id],
                      )
                    }
                    className="flex flex-1 items-center gap-1 py-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase hover:text-foreground"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    <span className="truncate">{cat.name}</span>
                  </button>
                  {isOwner ? <TabMenu category={cat} /> : null}
                </div>
                {!collapsed
                  ? inCat.map((c) => (
                      <ChannelButton
                        key={c.id}
                        channel={c}
                        active={c.id === activeChannelId}
                        unread={unread[c.id] ?? 0}
                        onSelect={() => setActiveChannelId(c.id)}
                        indent
                      />
                    ))
                  : null}
              </div>
            );
          })}

          {channels.filter((c) => !c.category_id || !categories.some((k) => k.id === c.category_id))
            .length > 0 ? (
            <div className="pt-1">
              {categories.length > 0 ? (
                <p className="px-2 py-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Other chats
                </p>
              ) : null}
              {channels
                .filter((c) => !c.category_id || !categories.some((k) => k.id === c.category_id))
                .map((c) => (
                  <ChannelButton
                    key={c.id}
                    channel={c}
                    active={c.id === activeChannelId}
                    unread={unread[c.id] ?? 0}
                    onSelect={() => setActiveChannelId(c.id)}
                  />
                ))}
            </div>
          ) : null}

          {isOwner && server ? (
            <div className="pt-2">
              <NewChannel serverId={server.id} />
              <NewTab serverId={server.id} />
            </div>
          ) : null}
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
                  categories={categories}
                  members={members.map((m) => m.user_id)}
                  speakers={speakers.map((s) => s.user_id)}
                  moderators={members.filter((m) => m.role === "admin").map((m) => m.user_id)}
                  bypass={bypassIds}
                  isRules={server.rules_channel_id === channel.id}
                />
              ) : null}
              <div className="ml-auto flex items-center gap-2">
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
              slowmodeExempt={isOwner || (isAdmin && bypassIds.includes(meId))}
              memberIds={members.map((m) => m.user_id)}
              isOperator={isOwner}
            />
            {server.rules_channel_id && !isOwner ? (
              <RulesGate
                key={server.id}
                serverId={server.id}
                serverName={server.name}
                channelId={server.rules_channel_id}
                meId={meId}
              />
            ) : null}
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
      {pings.length > 0 ? (
        <div className="fixed right-4 top-4 z-50 w-72 space-y-2">
          {pings.map((p) => (
            <div key={p.id} className="rounded-xl bg-surface p-4 glow-ring">
              <p className="text-sm">
                <span className="font-semibold">{p.author}</span> {p.kind} in{" "}
                <span className="font-semibold">#{p.channelName}</span>
              </p>
              {p.preview ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.preview}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveChannelId(p.channelId);
                    setPings((x) => x.filter((y) => y.id !== p.id));
                  }}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPings((x) => x.filter((y) => y.id !== p.id))}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
  categories,
  members,
  speakers,
  moderators,
  bypass,
  isRules,
}: {
  channel: Channel;
  categories: ChannelCategory[];
  members: string[];
  speakers: string[];
  moderators: string[];
  bypass: string[];
  isRules?: boolean;
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

  const setTab = useMutation({
    mutationFn: async (categoryId: string | null) => {
      const { error } = await supabase
        .from("channels")
        .update({ category_id: categoryId })
        .eq("id", channel.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", channel.server_id] }),
    onError: (e: Error) => toast.error(e.message),
  });

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

  const setSlowmode = useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase
        .from("channels")
        .update({ slowmode_seconds: value })
        .eq("id", channel.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", channel.server_id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleReplies = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("channels")
        .update({ allow_replies: value } as never)
        .eq("id", channel.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", channel.server_id] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleUploads = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("channels")
        .update({ allow_uploads: value })
        .eq("id", channel.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", channel.server_id] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleBypass = useMutation({
    mutationFn: async ({ userId, allow }: { userId: string; allow: boolean }) => {
      const t = (supabase as any).from("channel_slowmode_bypass");
      const { error } = allow
        ? await t.insert({ channel_id: channel.id, user_id: userId })
        : await t.delete().eq("channel_id", channel.id).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["slowmode-bypass", channel.id] }),
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
          <DialogTitle className="flex items-center gap-1">
            #{channel.name} settings
            <RenameDialog
              title="Rename channel"
              current={channel.name}
              onSave={async (raw) => {
                const name = raw.toLowerCase().replace(/\s+/g, "-");
                const { error } = await supabase.from("channels").update({ name }).eq("id", channel.id);
                if (error) throw error;
                qc.invalidateQueries({ queryKey: ["channels", channel.server_id] });
              }}
            />
          </DialogTitle>
          <DialogDescription>Choose who is allowed to post here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="ctab">Tab</Label>
          <select
            id="ctab"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={channel.category_id ?? ""}
            onChange={(e) => setTab.mutate(e.target.value || null)}
          >
            <option value="">No tab</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Tabs work like folders in the channel list.
          </p>
        </div>
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
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
          <div className="pr-3">
            <p className="text-sm font-medium">Rules channel</p>
            <p className="text-xs text-muted-foreground">
              New members must scroll through this chat before entering the server. Only one per server.
            </p>
          </div>
          <Switch
            checked={!!isRules}
            onCheckedChange={async (v) => {
              const { error } = await supabase
                .from("servers")
                .update({ rules_channel_id: v ? channel.id : null } as never)
                .eq("id", channel.server_id);
              if (error) toast.error(error.message);
              else qc.invalidateQueries({ queryKey: ["servers"] });
            }}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">

          <div className="pr-3">
            <p className="text-sm font-medium">Replies</p>
            <p className="text-xs text-muted-foreground">
              Let people reply to specific messages (right-click a message → Reply).
            </p>
          </div>
          <Switch
            checked={!!channel.allow_replies}
            onCheckedChange={(v) => toggleReplies.mutate(v)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
          <div className="pr-3">
            <p className="text-sm font-medium">File uploads</p>
            <p className="text-xs text-muted-foreground">
              Let people attach photos and videos up to 300 MB.
            </p>
          </div>
          <Switch
            checked={channel.allow_uploads}
            onCheckedChange={(v) => toggleUploads.mutate(v)}
          />
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <div className="pr-3">
              <p className="text-sm font-medium">Slow mode</p>
              <p className="text-xs text-muted-foreground">
                Make people wait between messages. You are exempt.
              </p>
            </div>
            <Switch
              checked={channel.slowmode_seconds > 0}
              onCheckedChange={(v) => setSlowmode.mutate(v ? 30 : 0)}
            />
          </div>
          {channel.slowmode_seconds > 0 ? (
            <select
              className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={channel.slowmode_seconds}
              onChange={(e) => setSlowmode.mutate(Number(e.target.value))}
            >
              {[5, 10, 15, 30, 50, 60, 120, 300, 600, 900, 3600, 21600].map((s) => (
                <option key={s} value={s}>
                  {s < 60
                    ? `${s} seconds`
                    : s < 3600
                      ? `${s / 60} minute${s === 60 ? "" : "s"}`
                      : `${s / 3600} hour${s === 3600 ? "" : "s"}`}
                </option>
              ))}
            </select>
          ) : null}
          {channel.slowmode_seconds > 0 ? (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium">Moderators who skip slow mode</p>
              {moderators.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No moderators in this server yet. Regular members can never skip slow mode.
                </p>
              ) : (
                moderators.map((uid) => (
                  <label key={uid} className="flex items-center justify-between text-sm">
                    <span>{profiles[uid]?.username ?? "Moderator"}</span>
                    <Switch
                      checked={bypass.includes(uid)}
                      onCheckedChange={(v) => toggleBypass.mutate({ userId: uid, allow: v })}
                    />
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>

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

function ChannelButton({
  channel,
  active,
  onSelect,
  indent,
  unread = 0,
}: {
  channel: Channel;
  active: boolean;
  onSelect: () => void;
  indent?: boolean;
  unread?: number;
}) {
  const show = !active && unread > 0;
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-sm ${
        indent ? "pl-6" : "pl-3"
      } ${active ? "bg-primary/15 text-foreground" : show ? "text-foreground hover:bg-muted/40" : "text-muted-foreground hover:bg-muted/40"}`}
    >
      {channel.is_restricted ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
      <span className={`truncate ${show ? "font-semibold" : ""}`}>{channel.name}</span>
      {show ? (
        <span className="ml-auto min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs font-bold leading-5 text-destructive-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}

function WeeklyEmailToggle({ channelId, meId }: { channelId: string; meId: string }) {
  const qc = useQueryClient();
  const subQuery = useQuery({
    queryKey: ["email-sub", channelId, meId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("channel_email_subscriptions")
        .select("channel_id")
        .eq("channel_id", channelId)
        .eq("user_id", meId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      const t = (supabase as any).from("channel_email_subscriptions");
      const { error } = on
        ? await t.insert({ channel_id: channelId, user_id: meId })
        : await t.delete().eq("channel_id", channelId).eq("user_id", meId);
      if (error) throw error;
    },
    onSuccess: (_d, on) => {
      qc.invalidateQueries({ queryKey: ["email-sub", channelId, meId] });
      toast.success(on ? "You'll get this chat's weekly email." : "Weekly emails turned off.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Weekly emails
      <Switch
        checked={!!subQuery.data}
        disabled={subQuery.isLoading || toggle.isPending}
        onCheckedChange={(v) => toggle.mutate(v)}
      />
    </label>
  );
}

function NewTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("channel_categories")
        .insert({ server_id: serverId, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["categories", serverId] });
      toast.success("Tab created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
          <FolderPlus className="h-4 w-4" /> New tab
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New tab</DialogTitle>
          <DialogDescription>
            A tab groups chats together, like "Games" holding "minecraft".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="tname">Tab name</Label>
          <Input
            id="tname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Games"
          />
        </div>
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
          Create tab
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function TabMenu({ category }: { category: ChannelCategory }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["categories", category.server_id] });
    qc.invalidateQueries({ queryKey: ["channels", category.server_id] });
  }

  const rename = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("channel_categories")
        .update({ name: name.trim() })
        .eq("id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase
        .from("channels")
        .update({ category_id: null })
        .eq("category_id", category.id);
      if (e1) throw e1;
      const { error } = await supabase
        .from("channel_categories")
        .delete()
        .eq("id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      refresh();
      toast.success("Tab removed, chats kept");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="text-muted-foreground opacity-0 transition group-hover:opacity-100"
          title="Tab settings"
          aria-label={`Settings for ${category.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category.name}</DialogTitle>
          <DialogDescription>Rename this tab or remove it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`tab-${category.id}`}>Tab name</Label>
          <div className="flex gap-2">
            <Input
              id={`tab-${category.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button onClick={() => rename.mutate()} disabled={!name.trim() || rename.isPending}>
              Save
            </Button>
          </div>
        </div>
        <Button variant="destructive" className="gap-2" onClick={() => remove.mutate()}>
          <Trash2 className="h-4 w-4" /> Delete tab
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  title,
  current,
  onSave,
}: {
  title: string;
  current: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = name.trim();
    if (!n || n.length > 100) { toast.error("Name must be 1–100 characters"); return; }
    setBusy(true);
    try {
      await onSave(n);
      toast.success("Renamed");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(current); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title={title} className="h-7 w-7">
          <PencilIcon className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Pick a new name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
          <Button type="submit" disabled={busy} className="w-full">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
