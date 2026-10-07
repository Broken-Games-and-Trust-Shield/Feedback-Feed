import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchProfile, type Profile } from "@/lib/data";
import { useIsOnline } from "@/lib/presence";
import { UserAvatar } from "./UserAvatar";
import { StatusDot } from "./StatusDot";

const LABEL: Record<string, string> = { online: "Online", idle: "Idle", dnd: "Do not disturb" };

function CardBody({ profile }: { profile: Profile }) {
  const fresh = useQuery({
    queryKey: ["profile", profile.id],
    queryFn: () => fetchProfile(profile.id),
    staleTime: 0,
  });
  const p = (fresh.data ?? profile) as Profile & { status?: string };
  const isOnline = useIsOnline(p.id);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative">
        <UserAvatar name={p.username} url={p.avatar_url} className="h-20 w-20 text-lg" />
        <StatusDot userId={p.id} status={p.status} className="h-5 w-5" />
      </div>
      <div>
        <p className="font-semibold">{p.username}</p>
        <p className="text-xs text-muted-foreground">
          {isOnline ? (LABEL[p.status ?? "online"] ?? "Online") : "Offline"}
        </p>
        <p className="text-xs text-muted-foreground">
          Joined {new Date(p.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

export function ProfileCard({ profile, children }: { profile: Profile; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64">
        <CardBody profile={profile} />
      </PopoverContent>
    </Popover>
  );
}
