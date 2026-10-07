import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

let online = new Set<string>();
const listeners = new Set<() => void>();
let channel: ReturnType<typeof supabase.channel> | null = null;
let trackedId: string | null = null;

function emit() {
  for (const l of listeners) l();
}

/** Joins the global presence room so others can see this user is online. */
export function startPresence(userId: string) {
  if (trackedId === userId && channel) return () => {};
  stopPresence();
  trackedId = userId;
  const ch = supabase.channel("online-users", { config: { presence: { key: userId } } });
  ch.on("presence", { event: "sync" }, () => {
    online = new Set(Object.keys(ch.presenceState()));
    emit();
  }).subscribe((status) => {
    if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
  });
  channel = ch;
  return stopPresence;
}

function stopPresence() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  trackedId = null;
  online = new Set();
  emit();
}

export function useIsOnline(userId: string | undefined) {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (userId ? online.has(userId) : false),
    () => false,
  );
}
