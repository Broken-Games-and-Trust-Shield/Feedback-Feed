import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/data";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | null | undefined;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-9 w-9", className)}>
      {url ? <AvatarImage src={url} alt={name} /> : null}
      <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
        {initials(name || "?")}
      </AvatarFallback>
    </Avatar>
  );
}
