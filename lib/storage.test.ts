// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  STORAGE_KEYS,
  clearStoredApiKey,
  getStoredApiKey,
  getStoredGitHubToken,
  persistApiKey,
  persistGitHubToken
} from "@/lib/storage";

describe("credential storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("uses session storage when remember is disabled", () => {
    persistApiKey("cursor_session_key", false);
    persistGitHubToken("ghp_12345678901234567890", false);

    expect(getStoredApiKey()).toBe("cursor_session_key");
    expect(getStoredGitHubToken()).toBe("ghp_12345678901234567890");
    expect(window.localStorage.getItem(STORAGE_KEYS.API_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEYS.API_KEY)).toBe(
      "cursor_session_key"
    );
  });

  it("moves remembered credentials to local storage", () => {
    persistApiKey("cursor_session_key", false);
    persistApiKey("cursor_persistent_key", true);
    persistGitHubToken("ghp_12345678901234567890", true);

    expect(getStoredApiKey()).toBe("cursor_persistent_key");
    expect(window.sessionStorage.getItem(STORAGE_KEYS.API_KEY)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.API_KEY)).toBe(
      "cursor_persistent_key"
    );
  });

  it("clears credentials from both storage scopes", () => {
    persistApiKey("cursor_session_key", false);
    persistGitHubToken("ghp_12345678901234567890", false);
    clearStoredApiKey();

    expect(getStoredApiKey()).toBeNull();
    expect(getStoredGitHubToken()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });
});
