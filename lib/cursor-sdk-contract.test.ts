import { afterEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";

// Exercise the installed SDK against an in-memory HTTP boundary. No cloud
// worker, credential, GitHub mutation, or paid model request is involved.
afterEach(() => vi.unstubAllGlobals());
describe("installed Cursor SDK cloud contract", () => {
  it("creates on first send, forwards branch isolation, resumes on the runs endpoint and detaches on dispose", async () => {
    const agentId = "bc-00000000-0000-4000-a000-000000000001";
    const runId = "run-00000000-0000-4000-a000-000000000001";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      const run = { id: runId, agentId, status: "FINISHED", result: "Synthetic result", createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), git: { branches: [{ repoUrl: "github.com/acme/app", branch: "cursor/task", prUrl: "https://github.com/acme/app/pull/7" }] } };
      if (url.endsWith("/v1/models")) return Response.json({ items: [{ id: "composer-2.5", name: "Composer" }] });
      if (url.endsWith("/v1/agents") && init?.method === "POST") return Response.json({ agent: { id: agentId }, run });
      if (url.endsWith(`/v1/agents/${agentId}/runs`) && init?.method === "POST") return Response.json({ run });
      // Analytics is swallowed locally as well. Unexpected SDK requests fail.
      if (!url.startsWith("https://api.cursor.com/")) return Response.json({});
      throw new Error(`Unexpected mocked SDK request: ${url}`);
    }));
    const agent = await Agent.create({ apiKey: "synthetic-cursor-key", agentId, model: { id: "composer-2.5" }, mode: "agent",
      cloud: { repos: [{ url: "https://github.com/acme/app", startingRef: "main" }],
        workOnCurrentBranch: false, autoCreatePR: true, skipReviewerRequest: true } });
    expect(requests.filter((item) => item.init?.method === "POST" && item.url.endsWith("/v1/agents"))).toHaveLength(0);
    const run = await agent.send("Synthetic task", { idempotencyKey: "turn:send", mode: "agent" });
    expect(await run.wait()).toMatchObject({ status: "finished", git: { branches: [{ branch: "cursor/task" }] } });
    const create = requests.find((item) => item.url.endsWith("/v1/agents") && item.init?.method === "POST")!;
    expect(JSON.parse(String(create.init?.body))).toMatchObject({ agentId, prompt: { text: "Synthetic task" },
      repos: [{ url: "https://github.com/acme/app", startingRef: "main" }], workOnCurrentBranch: false, autoCreatePR: true });
    expect(new Headers(create.init?.headers).get("idempotency-key")).toBe("turn:send");
    await agent[Symbol.asyncDispose]();
    const resumed = await Agent.resume(agentId, { apiKey: "synthetic-cursor-key", model: { id: "composer-2.5" }, mode: "agent" });
    await (await resumed.send("Synthetic revision", { idempotencyKey: "followup:send" })).wait();
    await resumed[Symbol.asyncDispose]();
    expect(requests.filter((item) => item.url.endsWith(`/v1/agents/${agentId}/runs`))).toHaveLength(1);
    expect(requests.filter((item) => item.url.endsWith("/cancel"))).toHaveLength(0);
  });
});
