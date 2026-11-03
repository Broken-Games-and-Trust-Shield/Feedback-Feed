/**
 * Finds the first message someone else sent after `since` (when you last read
 * the channel). Returns null when there is nothing new or no read time.
 */
export function firstUnreadMessageId(
  messages: { id: string; user_id: string; created_at: string; is_removed?: boolean }[],
  since: string | null,
  meId: string,
): string | null {
  if (!since) return null;
  const sinceMs = new Date(since).getTime();
  if (Number.isNaN(sinceMs)) return null;
  for (const m of messages) {
    if (m.user_id === meId) continue;
    if (new Date(m.created_at).getTime() > sinceMs) return m.id;
  }
  return null;
}
