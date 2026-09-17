import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Lock, Loader2, Paperclip, SendHorizonal, Trash2, X } from "lucide-react";
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
import { UserAvatar } from "./UserAvatar";
import { ReportDialog } from "./ReportDialog";
import { fetchMessages, fetchProfiles, type Channel, type Profile } from "@/lib/data";
import { checkMessageTone } from "@/lib/moderation.functions";

export function ChatPanel({
  channel,
  meId,
  canChat,
  canModerate,
  slowmodeExempt = false,
}: {
  channel: Channel;
  meId: string;
  canChat: boolean;
  canModerate: boolean;
  slowmodeExempt?: boolean;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [reportTarget, setReportTarget] = useState<{
    id: string;
    name: string;
    messageId?: string | null;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      setFile(null);
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
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
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
                <div className="group flex gap-3">
                  <UserAvatar name={p?.username ?? "?"} url={p?.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{p?.username ?? "Unknown"}</span>
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
                        {m.is_removed ? "[message removed]" : m.content}
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
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  waiting ? `Slow mode: wait ${cooldownLeft}s` : `Message #${channel.name}`
                }
                className="bg-surface"
              />
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
