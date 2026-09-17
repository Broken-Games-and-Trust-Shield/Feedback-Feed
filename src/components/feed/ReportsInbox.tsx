import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchProfiles } from "@/lib/data";

type Report = {
  id: string;
  server_id: string;
  reported_user_id: string;
  reporter_id: string;
  reason: string;
  resolved: boolean;
  created_at: string;
  message_id: string | null;
};

type ReportedMessage = {
  id: string;
  content: string;
  is_removed: boolean;
  created_at: string;
  channel_id: string;
  channels: { name: string } | null;
};

export function ReportsInbox({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string[]>([]);

  const reportsQuery = useQuery({
    queryKey: ["reports", serverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_reports")
        .select("*")
        .eq("server_id", serverId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Report[];
    },
  });
  const reports = reportsQuery.data ?? [];
  const openCount = reports.filter((r) => !r.resolved).length;

  const ids = Array.from(
    new Set(reports.flatMap((r) => [r.reported_user_id, r.reporter_id])),
  );
  const profilesQuery = useQuery({
    queryKey: ["profiles", ids],
    queryFn: () => fetchProfiles(ids),
    enabled: ids.length > 0,
  });
  const profiles = profilesQuery.data ?? {};
  const nameOf = (id: string) => profiles[id]?.username ?? "Unknown";

  const messageIds = reports.map((r) => r.message_id).filter((v): v is string => !!v);
  const messagesQuery = useQuery({
    queryKey: ["reported-messages", serverId, messageIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, is_removed, created_at, channel_id, channels(name)")
        .in("id", messageIds);
      if (error) throw error;
      const map: Record<string, ReportedMessage> = {};
      for (const m of (data ?? []) as unknown as ReportedMessage[]) map[m.id] = m;
      return map;
    },
    enabled: open && messageIds.length > 0,
  });
  const reportedMessages = messagesQuery.data ?? {};

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("member_reports")
        .update({ resolved: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", serverId] }),
    onError: () => toast.error("Could not update that report."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-2" title="Reports">
          <Flag className="h-4 w-4" />
          {openCount > 0 ? (
            <span className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
              {openCount}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reports</DialogTitle>
          <DialogDescription>What members have flagged in this server.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {reports.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing reported yet.</p>
          ) : null}
          {reports.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl bg-muted/30 p-3 ${r.resolved ? "opacity-60" : ""}`}
            >
              <p className="text-sm font-medium">
                {nameOf(r.reported_user_id)}{" "}
                <span className="font-normal text-muted-foreground">
                  reported by {nameOf(r.reporter_id)}
                </span>
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/90">{r.reason}</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
                {!r.resolved ? (
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate(r.id)}>
                    Mark handled
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Handled</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
