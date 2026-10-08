import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchMessages } from "@/lib/data";

export function RulesGate({
  serverId,
  serverName,
  channelId,
  meId,
}: {
  serverId: string;
  serverName: string;
  channelId: string;
  meId: string;
}) {
  const qc = useQueryClient();
  const accepted = useQuery({
    queryKey: ["rules-accepted", serverId, meId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rules_acceptances" as never)
        .select("user_id")
        .eq("server_id", serverId)
        .eq("user_id", meId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  const rules = useQuery({
    queryKey: ["rules-messages", channelId],
    queryFn: () => fetchMessages(channelId),
    enabled: accepted.data === false,
  });
  const [atBottom, setAtBottom] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const check = () => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtBottom(true);
  };
  useEffect(() => {
    setAtBottom(false);
    const t = setTimeout(check, 50);
    return () => clearTimeout(t);
  }, [rules.data]);

  if (accepted.data !== false) return null;
  const msgs = (rules.data ?? []).filter((m) => !m.is_removed);

  const accept = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("rules_acceptances" as never)
      .insert({ server_id: serverId, user_id: meId } as never);
    setSaving(false);
    if (error && !error.message.includes("duplicate")) return;
    qc.setQueryData(["rules-accepted", serverId, meId], true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <ScrollText className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">Rules for {serverName}</p>
            <p className="text-xs text-muted-foreground">Read to the bottom to continue.</p>
          </div>
        </div>
        <div ref={ref} onScroll={check} className="min-h-40 flex-1 space-y-3 overflow-y-auto p-4">
          {rules.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : msgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules have been posted yet.</p>
          ) : (
            msgs.map((m) => (
              <div key={m.id} className="text-sm">
                {m.content ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : null}
                {m.attachment_type?.startsWith("image/") && m.attachment_url ? (
                  <p className="text-xs text-muted-foreground">(image attached)</p>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border p-4">
          <Button className="w-full" disabled={!atBottom || saving} onClick={accept}>
            {atBottom ? "I've read the rules — continue" : "Scroll to the bottom to continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
