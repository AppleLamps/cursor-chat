import { describe, expect, it } from "vitest";
import type { Conversation } from "@/lib/chat-types";
import {
  buildHistoryExport,
  describeImport,
  historyExportFilename,
  parseHistoryImport,
  planHistoryImport
} from "@/lib/history-transfer";

function conversation(id: string, extra: Partial<Conversation> = {}): Conversation {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    repoUrl: "https://github.com/acme/app",
    branch: "main",
    agentMode: "qa",
    messages: [
      { id: `${id}-u`, role: "user", content: "How does auth work?", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: `${id}-a`, role: "assistant", content: "Sessions.", createdAt: "2026-01-01T00:00:01.000Z", runId: "run-1" }
    ],
    ...extra
  };
}

describe("buildHistoryExport", () => {
  it("never exports the cloud agent link or token, or live-run state", () => {
    const secret = conversation("c1", {
      agentId: "agent-1",
      agentSessionToken: "signed.token",
      agentArchived: true,
      messages: [
        {
          id: "m",
          role: "assistant",
          content: "partial",
          createdAt: "2026-01-01T00:00:00.000Z",
          streaming: true,
          recoverable: true,
          heartbeatAt: 5,
          activity: "Working",
          imageAttachments: [
            { id: "i1", name: "a.png", mimeType: "image/png", url: "data:image/png;base64,AAA", storageKey: "image:i1" },
            { id: "i2", name: "b.png", mimeType: "image/png", url: "blob:https://x/1" },
            { id: "i3", name: "c.png", mimeType: "image/png", url: "" , storageKey: "image:i3" }
          ]
        }
      ]
    });

    const exported = buildHistoryExport([secret], new Date("2026-02-03T04:05:06Z"));
    const text = JSON.stringify(exported);

    expect(exported.format).toBe("askcursor-history");
    expect(exported.exportedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(text).not.toContain("agent-1");
    expect(text).not.toContain("signed.token");
    expect(text).not.toContain("heartbeatAt");
    expect(text).not.toContain("storageKey");
    expect(text).not.toContain("blob:");
    expect(exported.conversations[0].messages[0].imageAttachments).toHaveLength(1);
  });

  it("names the file by date", () => {
    expect(historyExportFilename(new Date("2026-02-03T04:05:06Z"))).toBe(
      "askcursor-chats-2026-02-03.json"
    );
  });
});

describe("parseHistoryImport", () => {
  const exported = (conversations: unknown[]) =>
    JSON.stringify({ format: "askcursor-history", version: 1, conversations });

  it("round-trips an export", () => {
    const result = parseHistoryImport(
      JSON.stringify(buildHistoryExport([conversation("c1"), conversation("c2")]))
    );

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (result.ok) expect(result.conversations.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("does not trust an agent link or token carried in the file", () => {
    const result = parseHistoryImport(
      exported([conversation("c1", { agentId: "stolen", agentSessionToken: "forged" })])
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conversations[0].agentId).toBeUndefined();
      expect(result.conversations[0].agentSessionToken).toBeUndefined();
    }
  });

  it("settles a reply that was mid-stream when exported", () => {
    const stuck = conversation("c1");
    stuck.messages[1] = { ...stuck.messages[1], streaming: true, content: "half" };

    const result = parseHistoryImport(exported([stuck]));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conversations[0].messages[1].streaming).toBeFalsy();
    }
  });

  it("skips malformed entries but keeps the good ones", () => {
    const result = parseHistoryImport(
      exported([conversation("ok"), { id: 5 }, "nope", conversation("bad-date", { updatedAt: "yesterday" })])
    );

    expect(result).toMatchObject({ ok: true, skipped: 3 });
    if (result.ok) expect(result.conversations.map((c) => c.id)).toEqual(["ok"]);
  });

  it("accepts a bare array", () => {
    expect(parseHistoryImport(JSON.stringify([conversation("c1")])).ok).toBe(true);
  });

  it.each([
    ["not json", "That file is not valid JSON."],
    ['{"hello":1}', "That file does not look like an AskCursor chat export."],
    ['{"format":"something-else","conversations":[]}', "That file does not look like an AskCursor chat export."],
    ['{"format":"askcursor-history","conversations":[]}', "That file has no chats."],
    ['{"format":"askcursor-history","conversations":[{"id":1}]}', "No valid chats were found in that file."]
  ])("rejects %s", (text, error) => {
    expect(parseHistoryImport(text)).toEqual({ ok: false, error });
  });

  it("rejects absurdly many chats", () => {
    const many = Array.from({ length: 1_001 }, (_, i) => conversation(`c${i}`));

    expect(parseHistoryImport(exported(many)).ok).toBe(false);
  });
});

describe("planHistoryImport", () => {
  it("adds new chats, takes newer copies, and leaves the rest", () => {
    const existing = [
      conversation("same", { updatedAt: "2026-01-05T00:00:00.000Z" }),
      conversation("older", { updatedAt: "2026-01-02T00:00:00.000Z", agentId: "a1", agentSessionToken: "t1" })
    ];
    const incoming = [
      conversation("same", { updatedAt: "2026-01-05T00:00:00.000Z" }),
      conversation("older", { updatedAt: "2026-01-09T00:00:00.000Z" }),
      conversation("new")
    ];

    const plan = planHistoryImport(existing, incoming);

    expect(plan).toMatchObject({ added: 1, updated: 1, unchanged: 1 });
    expect(plan.accepted.map((c) => c.id).sort()).toEqual(["new", "older"]);
    const updated = plan.accepted.find((c) => c.id === "older");
    expect(updated?.agentId).toBe("a1");
    expect(updated?.agentSessionToken).toBe("t1");
  });

  it("describes the outcome", () => {
    expect(
      describeImport({ accepted: [], added: 2, updated: 1, unchanged: 3 }, 1)
    ).toBe("Imported chats: 2 added, 1 updated, 3 already up to date, 1 skipped.");
    expect(describeImport({ accepted: [], added: 0, updated: 0, unchanged: 0 }, 0)).toBe(
      "Nothing to import."
    );
  });
});
