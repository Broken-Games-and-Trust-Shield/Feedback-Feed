import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "./UserAvatar";
import { fileToAvatarDataUrl } from "./avatar-utils";
import type { Profile } from "@/lib/data";

export function ProfileSetup({
  userId,
  profile,
  open,
  onOpenChange,
}: {
  userId: string;
  profile: Profile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url ?? null);
  const qc = useQueryClient();
  const first = !profile;

  const save = useMutation({
    mutationFn: async () => {
      const name = username.trim();
      if (name.length < 2) throw new Error("Pick a username with at least 2 characters.");
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, username: name, avatar_url: avatar });
      if (error) {
        if (error.code === "23505") throw new Error("That username is already taken.");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Profile saved");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function pickFile(file?: File) {
    if (!file) return;
    try {
      setAvatar(await fileToAvatarDataUrl(file));
    } catch {
      toast.error("Could not read that image.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (first ? null : onOpenChange(v))}>
      <DialogContent className="sm:max-w-md" showCloseButton={!first}>
        <DialogHeader>
          <DialogTitle>{first ? "Set up your account" : "Edit your profile"}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-4">
          <UserAvatar name={username || "?"} url={avatar} className="h-16 w-16" />
          <div>
            <Label htmlFor="avatar" className="text-sm">
              Profile picture
            </Label>
            <Input
              id="avatar"
              type="file"
              accept="image/*"
              className="mt-1"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            maxLength={24}
            placeholder="e.g. riverstone"
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
