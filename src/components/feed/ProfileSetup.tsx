import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UserAvatar } from "./UserAvatar";
import { fileToAvatarDataUrl } from "./avatar-utils";
import { deleteMyAccount } from "@/lib/account.functions";
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
  const deleteAccount = useServerFn(deleteMyAccount);

  const signOut = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      qc.clear();
      window.location.href = "/";
    },
    onError: () => toast.error("Could not sign out. Please try again."),
  });

  const removeAccount = useMutation({
    mutationFn: async () => {
      await deleteAccount({} as never);
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      qc.clear();
      window.location.href = "/";
    },
    onError: () => toast.error("Could not delete your account. Please try again."),
  });

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
      <DialogContent className="sm:max-w-md">
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

        {!first && (
          <div className="mt-2 border-t border-border pt-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" disabled={removeAccount.isPending}>
                  {removeAccount.isPending ? "Deleting…" : "Delete account"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes your profile, your messages, and any servers you own. It cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep my account</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeAccount.mutate()}>
                    Delete for good
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
