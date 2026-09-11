import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Lock, Loader2, SendHorizonal, Trash2 } from "lucide-react";
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
}: {
  channel: Channel;
  meId: string;
  canChat: boolean;
  canModerate: boolean;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
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

  const send = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from("messages")
        .insert({ channel_id: channel.id, user_id: meId, content });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", channel.id] });
    },
    onError: () => toast.error("Message could not be sent."),
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
    if (!v || checking || send.isPending) return;
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
    send.mutate(v);
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
                    <p
                      className={
                        m.is_removed
                          ? "text-sm break-words whitespace-pre-wrap text-muted-foreground italic"
                          : "text-sm break-words whitespace-pre-wrap text-foreground/90"
                      }
                    >
                      {m.is_removed ? "[message removed]" : m.content}
                    </p>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {m.user_id === meId ? (
                  <ContextMenuItem disabled>That's you</ContextMenuItem>
                ) : (
                  <ContextMenuItem
                    onClick={() =>
                      setReportTarget({ id: m.user_id, name: p?.username ?? "this member" })
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
          />
        ) : null}
      </div>

      <div className="border-t border-border p-4">
        {canChat ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = text.trim();
              if (v) send.mutate(v);
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Message #${channel.name}`}
              className="bg-surface"
            />
            <Button type="submit" size="icon" disabled={send.isPending || !text.trim()}>
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-surface px-4 py-3 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            You can read this channel, but only chosen members can post here.
          </div>
        )}
      </div>
    </div>
  );
}
