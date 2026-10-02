import { describe, expect, it } from "vitest";
import type { Conversation } from "@/lib/chat-types";
import { searchConversations } from "@/lib/history-search";

function chat(
  id: string,
  title: string,
  updatedAt: string,
  bodies: string[],
  repoUrl = "https://github.com/acme/widgets"
): Conversation {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    repoUrl,
    messages: bodies.map((content, i) => ({
      id: `${id}-${i}`,
      role: i % 2 ? "assistant" : "user",
      content,
      createdAt: updatedAt
    }))
  };
}

const chats = [
  chat("a", "Billing webhook retries", "2026-01-03T00:00:00Z", ["Explain retries", "They back off exponentially."]),
  chat("b", "How does auth work?", "2026-01-05T00:00:00Z", ["Where are sessions stored?", "Sessions live in signed cookies set by lib/auth.ts."]),
  chat("c", "Deploy pipeline", "2026-01-04T00:00:00Z", ["What runs on merge?", "The billing job runs nightly."], "https://github.com/acme/infra")
];

describe("searchConversations", () => {
  it("returns nothing for a blank query", () => {
    expect(searchConversations(chats, "   ")).toEqual([]);
  });

  it("matches titles case-insensitively and ranks them above body matches", () => {
    const hits = searchConversations(chats, "BILLING");

    expect(hits.map((hit) => hit.conversation.id)).toEqual(["a", "c"]);
    expect(hits[0].snippet).toBeUndefined();
    expect(hits[1].snippet).toContain("billing job runs nightly");
  });

  it("finds text inside messages and shows context around it", () => {
    const [hit] = searchConversations(chats, "signed cookies");

    expect(hit.conversation.id).toBe("b");
    expect(hit.snippet).toContain("signed cookies");
  });

  it("requires every word, wherever each one appears", () => {
    expect(searchConversations(chats, "sessions nightly")).toEqual([]);
    expect(searchConversations(chats, "retries exponentially").map((h) => h.conversation.id)).toEqual(["a"]);
  });

  it("also matches the repository", () => {
    expect(searchConversations(chats, "infra").map((h) => h.conversation.id)).toEqual(["c"]);
  });

  it("orders equal matches by recency and honors the limit", () => {
    const hits = searchConversations(chats, "e", 2);

    expect(hits).toHaveLength(2);
  });

  it("trims long snippets with ellipses", () => {
    const long = chat("d", "Long", "2026-01-06T00:00:00Z", ["x".repeat(200) + " needle " + "y".repeat(200)]);
    const [hit] = searchConversations([long], "needle");

    expect(hit.snippet?.startsWith("…")).toBe(true);
    expect(hit.snippet?.endsWith("…")).toBe(true);
    expect(hit.snippet!.length).toBeLessThan(130);
  });
});
