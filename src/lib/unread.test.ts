import { describe, expect, it } from "vitest";
import { firstUnreadMessageId } from "./unread";

const msgs = [
  { id: "a", user_id: "other", created_at: "2026-11-01T10:00:00Z" },
  { id: "b", user_id: "me", created_at: "2026-11-01T11:00:00Z" },
  { id: "c", user_id: "other", created_at: "2026-11-01T12:00:00Z" },
  { id: "d", user_id: "other", created_at: "2026-11-01T13:00:00Z" },
];

describe("firstUnreadMessageId", () => {
  it("marks the first message from someone else after the last read time", () => {
    expect(firstUnreadMessageId(msgs, "2026-11-01T10:30:00Z", "me")).toBe("c");
  });

  it("skips your own messages", () => {
    expect(firstUnreadMessageId(msgs, "2026-11-01T10:30:00Z", "other")).toBe("b");
    expect(firstUnreadMessageId(msgs.slice(0, 2), "2026-11-01T10:30:00Z", "other")).toBe("b");
    expect(firstUnreadMessageId(msgs.slice(0, 2), "2026-11-01T10:30:00Z", "me")).toBeNull();
  });

  it("shows no line when everything was already seen", () => {
    expect(firstUnreadMessageId(msgs, "2026-11-01T14:00:00Z", "me")).toBeNull();
  });

  it("shows no line without a read time", () => {
    expect(firstUnreadMessageId(msgs, null, "me")).toBeNull();
  });
});
