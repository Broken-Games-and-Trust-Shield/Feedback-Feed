import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CornerUpLeft, Flag, Lock, Loader2, Paperclip, Reply, SendHorizonal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "./UserAvatar";
import { ProfileCard } from "./ProfileCard";
import { ReportDialog } from "./ReportDialog";
import {
  fetchMessages,
  fetchProfiles,
  type Channel,
  type Message,
  type Profile,
  splitMentions,
} from "@/lib/data";
import { checkMessageTone } from "@/lib/moderation.functions";

export function ChatPanel({
  channel,
  meId,
  canChat,
  canModerate,
  slowmodeExempt = false,
  memberIds = [],
}: {
  channel: Channel;
  meId: string;
  canChat: boolean;
  canModerate: boolean;
  slowmodeExempt?: boolean;
  memberIds?: string[];
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [reportTarget, setReportTarget] = useState<{
    id: string;
    name: string;
    messageId?: string | null;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [hoveredReplyId, setHoveredReplyId] = useState<string | null>(null);
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);
  const [connector, setConnector] = useState<{ path: string; top: number; left: number; width: number; height: number } | null>(null);
  const activeReplyId = hoveredReplyId ?? selectedReplyId;

  const messagesQuery = useQuery({
    queryKey: ["messages", channel.id],
    queryFn: () => fetchMessages(channel.id),
  });
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  const authorIds = useMemo(
    () => Array.from(new Set(messages.map((m) => m.user_id))),
    [messages],
  );
  const profilesQuery = useQuery({
    queryKey: ["profiles", authorIds],
    queryFn: () => fetchProfiles(authorIds),
    enabled: authorIds.length > 0,
  });
  const profiles: Record<string, Profile> = profilesQuery.data ?? {};
  const memberProfilesQuery = useQuery({
    queryKey: ["profiles", "members", memberIds],
    queryFn: () => fetchProfiles(memberIds),
    enabled: memberIds.length > 0,
  });
  const allProfiles: Record<string, Profile> = useMemo(
    () => ({ ...(memberProfilesQuery.data ?? {}), ...profiles }),
    [memberProfilesQuery.data, profiles],
  );
  const byName = useMemo(() => {
    const map: Record<string, Profile> = {};
    for (const p of Object.values(allProfiles)) map[p.username.toLowerCase()] = p;
    return map;
  }, [allProfiles]);
  const byId = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);
  const repliedToIds = useMemo(
    () => new Set(messages.map((m) => m.reply_to_id).filter((id): id is string => !!id)),
    [messages],
  );
  const activeTargetId = activeReplyId ? byId[activeReplyId]?.reply_to_id : null;
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !activeReplyId) {
      setConnector(null);
      return;
    }
    const update = () => {
      const reply = list.querySelector<HTMLElement>(`[data-message-id="${activeReplyId}"]`);
      const targetId = byId[activeReplyId]?.reply_to_id;
      const target = targetId
        ? list.querySelector<HTMLElement>(`[data-message-id="${targetId}"]`)
        : null;
      if (!reply || !target) {
        setConnector(null);
        return;
      }
      const box = list.getBoundingClientRect();
      const from = reply.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const y1 = from.top - box.top + 14;
      const y2 = to.top - box.top + 14;
      if (y1 < 0 || y1 > box.height || y2 < 0 || y2 > box.height) {
        setConnector(null);
        return;
      }
      const x = Math.max(12, from.left - box.left + 56);
      setConnector({
        path: `M ${x + 16} ${y1} H ${x} V ${y2} H ${x + 14} M ${x + 14} ${y2} l -5 -4 M ${x + 14} ${y2} l -5 4`,
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      });
    };
    update();
    list.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      list.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [activeReplyId, byId, messages]);

  const showReplyTarget = (message: Message) => {
    const target = message.reply_to_id
      ? messageListRef.current?.querySelector<HTMLElement>(`[data-message-id="${message.reply_to_id}"]`)
      : null;
    if (!target) return;
    setSelectedReplyId(message.id);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const mentionQuery = /(?:^|\s)@([^@\n]{0,40})$/.exec(text)?.[1];
  const mentionMatches =
    mentionQuery === undefined
      ? []
      : Object.values(memberProfilesQuery.data ?? {})
          .filter(
            (p) => p.id !== meId && p.username.toLowerCase().startsWith(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);
  const insertMention = (username: string) => {
    setText((t) => t.replace(/@([^@\n]{0,40})$/, `@${username} `));
  };

  useEffect(() => {
    const ch = supabase
      .channel(`messages-${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["messages", channel.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channel.id, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const slowmode = channel.slowmode_seconds ?? 0;
  const lastMine = [...messages].reverse().find((m) => m.user_id === meId);
  const cooldownLeft =
    slowmode > 0 && !slowmodeExempt && lastMine
      ? Math.ceil((new Date(lastMine.created_at).getTime() + slowmode * 1000 - now) / 1000)
      : 0;
  const waiting = cooldownLeft > 0;

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const send = useMutation({
    mutationFn: async ({ content, upload }: { content: string; upload: File | null }) => {
      let attachment: {
        attachment_url: string;
        attachment_type: string;
        attachment_name: string;
        attachment_size: number;
      } | null = null;

      if (upload) {
        if (upload.size > 300 * 1024 * 1024) throw new Error("That file is bigger than 300 MB.");
        setUploading(true);
        try {
          const ext = upload.name.includes(".") ? upload.name.split(".").pop() : "bin";
          const path = `${channel.id}/${meId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("chat-uploads")
            .upload(path, upload, { contentType: upload.type || "application/octet-stream" });
          if (upErr) throw upErr;
          attachment = {
            attachment_url: path,
            attachment_type: upload.type || "application/octet-stream",
            attachment_name: upload.name.slice(0, 300),
            attachment_size: upload.size,
          };
        } finally {
          setUploading(false);
        }
      }

      const { error } = await supabase.from("messages").insert({
        channel_id: channel.id,
        user_id: meId,
        content,
        ...(attachment ?? {}),
        ...(replyTo && channel.allow_replies ? { reply_to_id: replyTo.id } : {}),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      setFile(null);
      setReplyTo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["messages", channel.id] });
    },
    onError: (e: Error) => toast.error(e.message || "Message could not be sent."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", channel.id] }),
    onError: () => toast.error("Could not delete that message."),
  });

  const checkTone = useServerFn(checkMessageTone);
  const [checking, setChecking] = useState(false);
  const [warning, setWarning] = useState<{ content: string; reason: string } | null>(null);

  const submit = async () => {
    const v = text.trim();
    if ((!v && !file) || checking || send.isPending) return;
    if (waiting) {
      toast.error(`Slow mode is on. Wait ${cooldownLeft}s before sending again.`);
      return;
    }
    if (v) {
      setChecking(true);
      try {
        const verdict = await checkTone({ data: { content: v } });
        if (verdict.flagged) {
          setWarning({ content: v, reason: verdict.reason });
          return;
        }
      } catch {
        // If the check is unavailable, don't block the message.
      } finally {
        setChecking(false);
      }
    }
    send.mutate({ content: v, upload: file });
  };



  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={messageListRef} className="relative flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {connector ? (
          <svg aria-hidden="true" className="pointer-events-none fixed z-10 text-primary" style={{ top: connector.top, left: connector.left, width: connector.width, height: connector.height }}>
            <path d={connector.path} fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        ) : null}
        {messages.length === 0 ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Nothing here yet. Say the first thing.
          </p>
        ) : null}
        {messages.map((m) => {
          const p = profiles[m.user_id];
          const secondsLeft = Math.ceil(
            (new Date(m.created_at).getTime() + 30000 - now) / 1000,
          );
          const canDelete = m.user_id === meId && secondsLeft > 0 && !m.is_removed;
          return (
            <ContextMenu key={m.id}>
              <ContextMenuTrigger asChild>
                 <div
                   data-message-id={m.id}
                   onMouseEnter={() => m.reply_to_id && setHoveredReplyId(m.id)}
                   onMouseLeave={() => setHoveredReplyId(null)}
                   className={`group flex gap-3 rounded-md transition-colors ${activeTargetId === m.id ? "bg-primary/20 ring-1 ring-primary/50" : repliedToIds.has(m.id) ? "bg-primary/5" : ""}`}
                 >
                  {p ? (
                    <ProfileCard profile={p}>
                      <button type="button" className="h-9 shrink-0 rounded-full">
                        <UserAvatar name={p.username} url={p.avatar_url} />
                      </button>
                    </ProfileCard>
                  ) : (
                    <UserAvatar name="?" url={null} />
                  )}
                  <div className="min-w-0 flex-1">
                    {m.reply_to_id ? (
                       <ReplyQuote
                        target={byId[m.reply_to_id]}
                        name={
                          byId[m.reply_to_id]
                            ? (allProfiles[byId[m.reply_to_id]!.user_id]?.username ?? "Unknown")
                            : ""
                        }
                        onClick={() => showReplyTarget(m)}
                      />
                    ) : null}
                    <div className="flex items-baseline gap-2">
                      {p ? (
                        <ProfileCard profile={p}>
                          <button type="button" className="text-sm font-semibold hover:underline">
                            {p.username}
                          </button>
                        </ProfileCard>
                      ) : (
                        <span className="text-sm font-semibold">Unknown</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {canDelete ? (
                        <button
                          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100"
                          onClick={() => remove.mutate(m.id)}
                          aria-label="Delete message"
                        >
                          <Trash2 className="h-3.5 w-3.5 hover:text-destructive" />
                          {secondsLeft}s
                        </button>
                      ) : null}
                    </div>
                    {m.is_removed || m.content ? (
                      <p
                        className={
                          m.is_removed
                            ? "text-sm break-words whitespace-pre-wrap text-muted-foreground italic"
                            : "text-sm break-words whitespace-pre-wrap text-foreground/90"
                        }
                      >
                        {m.is_removed ? (
                          "[message removed]"
                        ) : (
                          <MessageText content={m.content} byName={byName} />
                        )}
                      </p>
                    ) : null}
                    {!m.is_removed && m.attachment_url ? (
                      <Attachment
                        path={m.attachment_url}
                        type={m.attachment_type ?? ""}
                        name={m.attachment_name ?? "file"}
                      />
                    ) : null}
                  </div>
                </div>

              </ContextMenuTrigger>
              <ContextMenuContent>
                {canChat && !m.is_removed ? (
                  <ContextMenuItem
                    disabled={!channel.allow_replies}
                    onSelect={() => setReplyTo(m)}
                  >
                    <Reply className="mr-2 h-4 w-4" />
                    {channel.allow_replies ? "Reply" : "Reply (turned off in this chat)"}
                  </ContextMenuItem>
                ) : null}
                {m.user_id === meId ? (
                  <ContextMenuItem disabled>That's you</ContextMenuItem>
                ) : (
                  <ContextMenuItem
                    onClick={() =>
                      setReportTarget({
                        id: m.user_id,
                        name: p?.username ?? "this member",
                        messageId: m.id,
                      })
                    }
                  >
                    <Flag className="mr-2 h-4 w-4" /> Report {p?.username ?? "member"}
                  </ContextMenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        <div ref={bottomRef} />
        {reportTarget ? (
          <ReportDialog
            open
            onOpenChange={(v) => (v ? null : setReportTarget(null))}
            serverId={channel.server_id}
            reportedUserId={reportTarget.id}
            reportedName={reportTarget.name}
            reporterId={meId}
            messageId={reportTarget.messageId ?? null}
          />
        ) : null}
      </div>

      <div className="border-t border-border p-4">
        {canChat ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {replyTo ? (
              <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
                <Reply className="h-3.5 w-3.5" />
                <span className="truncate">
                  Replying to{" "}
                  <span className="font-semibold text-foreground">
                    {allProfiles[replyTo.user_id]?.username ?? "message"}
                  </span>
                  : {replyTo.content || "(attachment)"}
                </span>
                <button
                  type="button"
                  className="ml-auto hover:text-destructive"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            {file ? (
              <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="truncate">{file.name}</span>
                <span>({(file.size / (1024 * 1024)).toFixed(1)} MB)</span>
                <button
                  type="button"
                  className="ml-auto hover:text-destructive"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  aria-label="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <div className="flex gap-2">
              {channel.allow_uploads ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 300 * 1024 * 1024) {
                        toast.error("Photos and videos must be 300 MB or smaller.");
                        e.target.value = "";
                        return;
                      }
                      setFile(f);
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Attach a photo or video"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              <div className="relative flex-1">
                {mentionMatches.length > 0 ? (
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                    {mentionMatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertMention(p.username);
                        }}
                      >
                        <UserAvatar name={p.username} url={p.avatar_url} className="h-6 w-6" />
                        {p.username}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    waiting ? `Slow mode: wait ${cooldownLeft}s` : `Message #${channel.name}`
                  }
                  className="bg-surface"
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={
                  checking || uploading || send.isPending || waiting || (!text.trim() && !file)
                }
              >
                {checking || uploading || send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizonal className="h-4 w-4" />
                )}
              </Button>
            </div>
            {slowmode > 0 && !slowmodeExempt ? (
              <p className="text-xs text-muted-foreground">
                {waiting
                  ? `Slow mode is on — you can send again in ${cooldownLeft}s.`
                  : `Slow mode is on — one message every ${slowmode} seconds.`}
              </p>
            ) : null}
          </form>

        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-surface px-4 py-3 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            You can read this channel, but only chosen members can post here.
          </div>
        )}
      </div>

      <AlertDialog open={!!warning} onOpenChange={(v) => (v ? null : setWarning(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This might come across badly</AlertDialogTitle>
            <AlertDialogDescription>
              {warning?.reason || "Your message may be offensive or unkind."} You can go back and
              change it, or send it as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Let me edit it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (warning) send.mutate({ content: warning.content, upload: file });
                setWarning(null);
              }}
            >
              Send anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Attachment({ path, type, name }: { path: string; type: string; name: string }) {
  const { data: url } = useQuery({
    queryKey: ["attachment", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("chat-uploads")
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 50 * 60 * 1000,
  });

  if (!url) {
    return <p className="mt-2 text-xs text-muted-foreground">Loading attachment…</p>;
  }
  if (type.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
        <img
          src={url}
          alt={name}
          loading="lazy"
          className="max-h-80 max-w-full rounded-lg border border-border object-contain"
        />
      </a>
    );
  }
  if (type.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        className="mt-2 max-h-80 max-w-full rounded-lg border border-border"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs underline"
    >
      <Paperclip className="h-3.5 w-3.5" /> {name}
    </a>
  );
}

function ReplyQuote({ target, name, onClick }: { target: Message | undefined; name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!target} className="mb-1 flex max-w-full items-center gap-1.5 border-l-2 border-primary/60 pl-2 text-left text-xs text-muted-foreground hover:text-foreground disabled:cursor-default" title="Jump to replied message">
      <CornerUpLeft className="h-3 w-3 shrink-0 text-primary" />
      {target ? (
        <span className="truncate">
          <span className="font-semibold text-foreground/80">{name}</span>{" "}
          {target.is_removed ? "[message removed]" : target.content || "(attachment)"}
        </span>
      ) : (
        <span className="italic">Original message unavailable</span>
      )}
    </button>
  );
}

function MessageText({ content, byName }: { content: string; byName: Record<string, Profile> }) {
  const parts = splitMentions(
    content,
    Object.values(byName).map((p) => p.username),
  );
  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === "string") return <span key={i}>{part}</span>;
        const p = byName[part.name.toLowerCase()];
        const trail = "";
        if (!p) return <span key={i}>@{part.name}</span>;
        return (
          <span key={i}>
            <ProfileCard profile={p}>
              <button
                type="button"
                className="rounded bg-primary/15 px-1 font-medium text-primary hover:bg-primary/25"
              >
                @{p.username}
              </button>
            </ProfileCard>
            {trail}
          </span>
        );
      })}
    </>
  );
}
