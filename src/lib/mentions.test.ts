import { describe, expect, it } from "vitest";
import { mentionsUser, splitMentions } from "./mentions";

describe("mentions", () => {
  it("@everyone notifies every member", () => {
    expect(mentionsUser("hey @everyone come play", "Sam Lee")).toBe(true);
  });

  it("does not treat a plain message as a mention", () => {
    expect(mentionsUser("hey everyone come play", "Sam Lee")).toBe(false);
  });

  it("matches usernames with spaces", () => {
    expect(mentionsUser("thanks @Sam Lee!", "Sam Lee")).toBe(true);
  });

  it("matches #channel names that exist in the server", () => {
    const parts = splitMentions("see #general and #nope", [], ["general"]);
    expect(parts).toEqual(["see ", { kind: "channel", name: "general" }, " and #nope"]);
  });
});
