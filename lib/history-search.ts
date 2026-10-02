import type { Conversation } from "@/lib/chat-types";

export type SearchHit = {
  conversation: Conversation;
  /** Text around the first match, when it was found in a message body. */
  snippet?: string;
};

const SNIPPET_RADIUS = 48;
const MAX_RESULTS = 50;

function tokensOf(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function snippetAround(text: string, token: string) {
  const index = text.toLowerCase().indexOf(token);
  if (index < 0) return undefined;

  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + token.length + SNIPPET_RADIUS);
  const clean = text.slice(start, end).replace(/\s+/g, " ").trim();

  return `${start > 0 ? "…" : ""}${clean}${end < text.length ? "…" : ""}`;
}

/**
 * Case-insensitive search over titles and message text. Every word must appear
 * somewhere in the chat (title, any message, or the repository name). Chats
 * whose title matches come first, then the rest by most recent activity.
 */
export function searchConversations(
  conversations: Conversation[],
  query: string,
  limit = MAX_RESULTS
): SearchHit[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [];

  const hits: Array<SearchHit & { titleMatch: boolean }> = [];

  for (const conversation of conversations) {
    const title = conversation.title.toLowerCase();
    const repo = (conversation.repoUrl ?? "").toLowerCase();
    const bodies = conversation.messages.map((message) => message.content);
    const bodyText = bodies.join("\n").toLowerCase();

    const everyWordFound = tokens.every(
      (token) => title.includes(token) || repo.includes(token) || bodyText.includes(token)
    );
    if (!everyWordFound) continue;

    const titleMatch = tokens.every((token) => title.includes(token));
    let snippet: string | undefined;

    if (!titleMatch) {
      const token = tokens.find((word) => bodyText.includes(word)) ?? tokens[0];
      const body = bodies.find((text) => text.toLowerCase().includes(token));
      snippet = body ? snippetAround(body, token) : undefined;
    }

    hits.push({ conversation, snippet, titleMatch });
  }

  return hits
    .sort(
      (a, b) =>
        Number(b.titleMatch) - Number(a.titleMatch) ||
        Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt)
    )
    .slice(0, limit)
    .map(({ conversation, snippet }) => ({ conversation, snippet }));
}
