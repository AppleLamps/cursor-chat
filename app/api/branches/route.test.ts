import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/branches/route";
import { listGitHubBranches } from "@/lib/github";

vi.mock("@/lib/github", () => ({
  listGitHubBranches: vi.fn()
}));

function branchesRequest(body: unknown) {
  return new Request("https://example.test/api/branches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("branches route validation", () => {
  const mockedListGitHubBranches = vi.mocked(listGitHubBranches);

  beforeEach(() => {
    mockedListGitHubBranches.mockReset();
  });

  it("returns 400 for invalid repository URLs before calling GitHub", async () => {
    const response = await POST(
      branchesRequest({
        repoUrl: "not a repository url",
        githubToken: "token"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Repository URL must be a valid URL."
    });
    expect(mockedListGitHubBranches).not.toHaveBeenCalled();
  });
});
