export const EVERYONE = "everyone";

/** True when the message @mentions this username or uses @everyone. */
export function mentionsUser(content: string, username: string) {
  return splitMentions(content, username ? [username] : []).some(
    (p) => typeof p !== "string" && (p.kind === "user" || p.kind === "everyone"),
  );
}

export type MentionToken =
  | { kind: "user"; name: string }
  | { kind: "everyone"; name: string }
  | { kind: "channel"; name: string };

const BOUNDARY = /[\s.,!?:;)]/;

/**
 * Splits text into plain strings and mention tokens: @username (spaces allowed),
 * @everyone, and #channel-name. Only known names are matched; longest name wins.
 */
export function splitMentions(content: string, usernames: string[], channelNames: string[] = []) {
  const names = [...usernames.filter((n) => n.toLowerCase() !== EVERYONE), EVERYONE].sort(
    (a, b) => b.length - a.length,
  );
  const chans = [...channelNames].sort((a, b) => b.length - a.length);
  const out: Array<string | MentionToken> = [];
  let buf = "";
  let i = 0;
  const lower = content.toLowerCase();
  const find = (list: string[], rest: string) =>
    list.find((n) => {
      if (!n || !rest.startsWith(n.toLowerCase())) return false;
      const next = rest[n.length];
      return next === undefined || BOUNDARY.test(next);
    });
  while (i < content.length) {
    const ch = content[i];
    if ((ch === "@" || ch === "#") && (i === 0 || /[\s(]/.test(content[i - 1]!))) {
      const rest = lower.slice(i + 1);
      const hit = find(ch === "@" ? names : chans, rest);
      if (hit) {
        if (buf) out.push(buf);
        buf = "";
        if (ch === "#") out.push({ kind: "channel", name: hit });
        else if (hit === EVERYONE) out.push({ kind: "everyone", name: hit });
        else out.push({ kind: "user", name: hit });
        i += hit.length + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf) out.push(buf);
  return out;
}
