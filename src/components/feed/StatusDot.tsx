import { Moon } from "lucide-react";
import { useIsOnline } from "@/lib/presence";
import { cn } from "@/lib/utils";

export type UserStatus = "online" | "idle" | "dnd";

export function StatusDot({
  userId,
  status,
  className,
}: {
  userId: string;
  status?: string | null;
  className?: string;
}) {
  const isOnline = useIsOnline(userId);
  const base = "absolute bottom-0 right-0 grid place-items-center rounded-full ring-2 ring-popover";
  if (!isOnline)
    return <span title="Offline" className={cn(base, "h-4 w-4 bg-muted-foreground", className)} />;
  if (status === "dnd")
    return (
      <span title="Do not disturb" className={cn(base, "h-4 w-4 bg-destructive", className)}>
        <span className="h-[3px] w-2 rounded-full bg-status-line" />
      </span>
    );
  if (status === "idle")
    return (
      <span title="Idle" className={cn(base, "h-4 w-4 bg-popover", className)}>
        <Moon className="h-4 w-4 fill-status-idle text-status-idle" />
      </span>
    );
  return <span title="Online" className={cn(base, "h-4 w-4 bg-status-online", className)} />;
}
