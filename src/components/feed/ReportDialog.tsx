import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ReportDialog({
  open,
  onOpenChange,
  serverId,
  reportedUserId,
  reportedName,
  reporterId,
  messageId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serverId: string;
  reportedUserId: string;
  reportedName: string;
  reporterId: string;
  messageId?: string | null;
}) {
  const [reason, setReason] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      const text = reason.trim();
      if (text.length < 5) throw new Error("Please say a little more about what happened.");
      const { error } = await supabase.from("member_reports").insert({
        server_id: serverId,
        reported_user_id: reportedUserId,
        reporter_id: reporterId,
        reason: text,
        message_id: messageId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReason("");
      onOpenChange(false);
      toast.success("Report sent to the owner and moderators.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report {reportedName}</DialogTitle>
          <DialogDescription>
            Only the server owner and moderators will see this.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Why are you reporting them?</Label>
          <Textarea
            id="reason"
            value={reason}
            maxLength={600}
            rows={4}
            placeholder="Tell them what happened…"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button onClick={() => send.mutate()} disabled={send.isPending || !reason.trim()}>
          {send.isPending ? "Sending…" : "Send report"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
