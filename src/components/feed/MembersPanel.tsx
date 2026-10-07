import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Crown, Flag, MoreVertical, ShieldMinus, ShieldPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "./UserAvatar";
import { ProfileCard } from "./ProfileCard";
import { StatusDot } from "./StatusDot";
import { ReportDialog } from "./ReportDialog";
import { fetchProfiles, type Member, type Profile, type Server } from "@/lib/data";

type Ban = { id: string; server_id: string; user_id: string; reason: string | null };

export function MembersPanel({
  server,
  members,
  meId,
  isOwner,
  isAdmin,
}: {
  server: Server;
  members: Member[];
  meId: string;
  isOwner: boolean;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const ids = members.map((m) => m.user_id);
  const profilesQuery = useQuery({
    queryKey: ["profiles", ids],
    queryFn: () => fetchProfiles(ids),
    enabled: ids.length > 0,
  });
  const profiles: Record<string, Profile> = profilesQuery.data ?? {};

  const bansQuery = useQuery({
    queryKey: ["bans", server.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_bans")
        .select("*")
        .eq("server_id", server.id);
      if (error) throw error;
      return (data ?? []) as Ban[];
    },
  });
  const bans = bansQuery.data ?? [];
  const bannedIds = bans.map((b) => b.user_id);
  const bannedProfiles = useQuery({
    queryKey: ["profiles", bannedIds],
    queryFn: () => fetchProfiles(bannedIds),
    enabled: bannedIds.length > 0,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["members", server.id] });
    qc.invalidateQueries({ queryKey: ["bans", server.id] });
  }

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from("server_members")
        .update({ role })
        .eq("server_id", server.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Role updated");
    },
    onError: () => toast.error("Could not change that role."),
  });

  const kick = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("server_id", server.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Member removed");
    },
    onError: () => toast.error("Could not remove that member."),
  });

  const ban = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("server_bans")
        .insert({ server_id: server.id, user_id: userId, banned_by: meId });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Member banned");
    },
    onError: () => toast.error("Could not ban that member."),
  });

  const unban = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("server_bans")
        .delete()
        .eq("server_id", server.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Ban lifted");
    },
    onError: () => toast.error("Could not lift that ban."),
  });

  const sorted = [...members].sort((a, b) => {
    const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-border bg-sidebar p-4 lg:flex">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Members — {members.length}
      </h3>
      <ul className="mt-3 space-y-1">
        {sorted.map((m) => {
          const p = profiles[m.user_id];
          const canAct = isAdmin && m.user_id !== meId && m.role !== "owner";
          return (
            <ContextMenu key={m.id}>
              <ContextMenuTrigger asChild>
                <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                  {p ? (
                    <ProfileCard profile={p}>
                      <button type="button" className="relative shrink-0 rounded-full">
                        <UserAvatar name={p.username} url={p.avatar_url} className="h-7 w-7" />
                        <StatusDot userId={p.id} status={(p as { status?: string }).status} className="h-3 w-3 [&>svg]:h-3 [&>svg]:w-3" />
                      </button>
                    </ProfileCard>
                  ) : (
                    <UserAvatar name="?" url={null} className="h-7 w-7" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p?.username ?? "Unknown"}
                  </span>
                  {m.role === "owner" ? <Crown className="h-3.5 w-3.5 text-primary" /> : null}
                  {m.role === "admin" ? (
                    <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      mod
                    </span>
                  ) : null}
                  {canAct ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="opacity-0 group-hover:opacity-100"
                          aria-label="Manage member"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isOwner ? (
                          m.role === "admin" ? (
                            <DropdownMenuItem
                              onClick={() => setRole.mutate({ userId: m.user_id, role: "member" })}
                            >
                              <ShieldMinus className="mr-2 h-4 w-4" /> Remove moderator
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => setRole.mutate({ userId: m.user_id, role: "admin" })}
                            >
                              <ShieldPlus className="mr-2 h-4 w-4" /> Make moderator
                            </DropdownMenuItem>
                          )
                        ) : null}
                        <DropdownMenuItem onClick={() => kick.mutate(m.user_id)}>
                          <UserMinus className="mr-2 h-4 w-4" /> Remove from server
                        </DropdownMenuItem>
                        {isOwner || m.role !== "admin" ? (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => ban.mutate(m.user_id)}
                          >
                            <Ban className="mr-2 h-4 w-4" /> Ban
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
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
      </ul>

      {reportTarget ? (
        <ReportDialog
          open
          onOpenChange={(v) => (v ? null : setReportTarget(null))}
          serverId={server.id}
          reportedUserId={reportTarget.id}
          reportedName={reportTarget.name}
          reporterId={meId}
        />
      ) : null}

      {isAdmin && bans.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Banned — {bans.length}
          </h3>
          <ul className="mt-3 space-y-1">
            {bans.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {bannedProfiles.data?.[b.user_id]?.username ?? "Unknown"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => unban.mutate(b.user_id)}>
                  Unban
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
