import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubApiError, listGitHubBranches } from "@/lib/github";

const fetchMock = vi.fn();

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function stub() {
  vi.stubGlobal("fetch", fetchMock);
}

describe("listGitHubBranches", () => {
  it("lists branches with the default first", async () => {
    stub();
    fetchMock
      .mockResolvedValueOnce(json({ default_branch: "main" }))
      .mockResolvedValueOnce(json([{ name: "zeta" }, { name: "main" }, { name: "alpha" }]));

    await expect(
      listGitHubBranches("https://github.com/acme/app", "tok")
    ).resolves.toEqual({ branches: ["main", "alpha", "zeta"], defaultBranch: "main" });
  });

  it("passes a timeout signal on every request", async () => {
    stub();
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json([]));

    await listGitHubBranches("https://github.com/acme/app", "tok");

    for (const [, init] of fetchMock.mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("never follows a next link off this repository's API", async () => {
    stub();
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(
        json([{ name: "a" }], {
          headers: { link: '<https://evil.example/steal>; rel="next"' }
        })
      );

    const result = await listGitHubBranches("https://github.com/acme/app", "tok");

    expect(result.branches).toEqual(["a"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("follows legitimate pagination but stops at a page cap", async () => {
    stub();
    fetchMock.mockResolvedValueOnce(json({}));
    fetchMock.mockImplementation(async () =>
      json([{ name: `b${fetchMock.mock.calls.length}` }], {
        headers: {
          link: '<https://api.github.com/repos/acme/app/branches?per_page=100&page=2>; rel="next"'
        }
      })
    );

    const result = await listGitHubBranches("https://github.com/acme/app", "tok");

    expect(result.branches.length).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it.each([
    [401, 401, /invalid or expired/],
    [404, 404, /not found/],
    [403, 403, /cannot access/],
    [500, 502, /Failed to load repository details/]
  ])("maps GitHub %i to %i", async (upstream, status, message) => {
    stub();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: upstream }));

    const error = await listGitHubBranches("https://github.com/acme/app", "tok").catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error.status).toBe(status);
    expect(error.message).toMatch(message);
  });

  it("reports rate limiting as 429", async () => {
    stub();
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })
    );

    await expect(
      listGitHubBranches("https://github.com/acme/app", "tok")
    ).rejects.toMatchObject({ status: 429 });
  });

  it("turns a timeout into a 504", async () => {
    stub();
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));

    await expect(
      listGitHubBranches("https://github.com/acme/app", "tok")
    ).rejects.toMatchObject({ status: 504 });
  });

  it("rejects a non-array branch page", async () => {
    stub();
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ message: "weird" }));

    await expect(
      listGitHubBranches("https://github.com/acme/app", "tok")
    ).rejects.toMatchObject({ status: 502 });
  });
});
