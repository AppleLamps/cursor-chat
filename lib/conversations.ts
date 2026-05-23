export type ConversationLike = {
  id: string;
  title: string;
  updatedAt: string;
  repoUrl?: string;
};

export type RepoConversationGroup = {
  repoKey: string;
  repoUrl: string | null;
  label: string;
  shortLabel: string;
  conversations: ConversationLike[];
  latestUpdatedAt: string;
};

const RECENT_CHATS_VISIBLE = 4;

export function repoSidebarShortLabel(repoUrl: string) {
  try {
    const path = new URL(repoUrl).pathname.replace(/^\/+|\/+$/g, "");
    const parts = path.split("/").filter(Boolean);
    const repo = parts[parts.length - 1]?.replace(/\.git$/i, "");
    return repo || path || repoUrl;
  } catch {
    return repoUrl;
  }
}

export function repoSidebarLabel(repoUrl: string) {
  try {
    const path = new URL(repoUrl).pathname.replace(/^\/+|\/+$/g, "");
    return path || repoUrl;
  } catch {
    return repoUrl;
  }
}

export function groupConversationsByRepo(
  conversations: ConversationLike[]
): RepoConversationGroup[] {
  const groups = new Map<string, ConversationLike[]>();

  for (const conversation of conversations) {
    const repoKey = conversation.repoUrl?.trim() || "__none__";
    const existing = groups.get(repoKey);

    if (existing) {
      existing.push(conversation);
      continue;
    }

    groups.set(repoKey, [conversation]);
  }

  return [...groups.entries()]
    .map(([repoKey, items]) => {
      const sorted = [...items].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      const repoUrl = repoKey === "__none__" ? null : repoKey;

      return {
        repoKey,
        repoUrl,
        label: repoUrl ? repoSidebarLabel(repoUrl) : "No repository",
        shortLabel: repoUrl ? repoSidebarShortLabel(repoUrl) : "No repository",
        conversations: sorted,
        latestUpdatedAt: sorted[0]?.updatedAt ?? new Date(0).toISOString()
      };
    })
    .sort(
      (a, b) =>
        new Date(b.latestUpdatedAt).getTime() -
        new Date(a.latestUpdatedAt).getTime()
    );
}

export function relativeTimeLabel(value: string) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = Date.now() - timestamp;

  if (diffMs < 45_000) {
    return "now";
  }

  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.floor(days / 7);

  if (weeks < 5) {
    return `${weeks}w`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export { RECENT_CHATS_VISIBLE };
