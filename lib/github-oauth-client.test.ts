import { describe, expect, it } from "vitest";
import { parseGitHubOAuthHash } from "@/lib/github-oauth-client";

describe("parseGitHubOAuthHash", () => {
  it("returns null for unrelated hashes", () => {
    expect(parseGitHubOAuthHash("")).toBeNull();
    expect(parseGitHubOAuthHash("#section")).toBeNull();
  });

  it("reads a token", () => {
    expect(parseGitHubOAuthHash("#github_token=gho_abc")).toEqual({
      token: "gho_abc",
      error: null
    });
  });

  it("reads and decodes an error", () => {
    expect(
      parseGitHubOAuthHash("#github_error=GitHub+sign-in+was+cancelled.")
    ).toEqual({ token: null, error: "GitHub sign-in was cancelled." });
  });
});
