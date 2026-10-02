import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callback } from "@/app/api/auth/github/callback/route";
import { GET as start } from "@/app/api/auth/github/start/route";
import { GITHUB_OAUTH_STATE_COOKIE } from "@/lib/github-oauth";

const ORIGIN = "https://app.example.test";

function configure() {
  vi.stubEnv("ASKCURSOR_GITHUB_CLIENT_ID", "client-id");
  vi.stubEnv("ASKCURSOR_GITHUB_CLIENT_SECRET", "client-secret");
}

function callbackRequest(query: string, cookieState?: string) {
  return new Request(`${ORIGIN}/api/auth/github/callback?${query}`, {
    headers: cookieState
      ? { cookie: `${GITHUB_OAUTH_STATE_COOKIE}=${cookieState}` }
      : {}
  });
}

function fragment(response: Response) {
  const location = new URL(response.headers.get("location")!);
  return { location, params: new URLSearchParams(location.hash.slice(1)) };
}

describe("GitHub OAuth start", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "development"));
  afterEach(() => vi.unstubAllEnvs());

  it("returns 503 when OAuth is not configured", async () => {
    const response = await start(new Request(`${ORIGIN}/api/auth/github/start`));

    expect(response.status).toBe(503);
  });

  it("redirects to GitHub with a state that is also set as an httpOnly cookie", async () => {
    configure();

    const response = await start(new Request(`${ORIGIN}/api/auth/github/start`));
    const location = new URL(response.headers.get("location")!);
    const state = location.searchParams.get("state");

    expect(location.origin + location.pathname).toBe(
      "https://github.com/login/oauth/authorize"
    );
    expect(location.searchParams.get("client_id")).toBe("client-id");
    expect(location.searchParams.get("scope")).toBe("repo");
    expect(location.searchParams.has("client_secret")).toBe(false);
    expect(state).toBeTruthy();

    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`${GITHUB_OAUTH_STATE_COOKIE}=${state}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });
});

describe("GitHub OAuth callback", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("exchanges the code and returns the token in the URL fragment", async () => {
    configure();
    fetchMock.mockResolvedValue(
      Response.json({ access_token: "gho_exampletoken1234567890" })
    );

    const response = await callback(callbackRequest("code=abc&state=s1", "s1"));
    const { location, params } = fragment(response);

    expect(location.origin).toBe(ORIGIN);
    expect(location.search).toBe("");
    expect(params.get("github_token")).toBe("gho_exampletoken1234567890");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(JSON.parse(init.body)).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      code: "abc"
    });
  });

  it("rejects a mismatched state without calling GitHub", async () => {
    configure();

    const response = await callback(callbackRequest("code=abc&state=forged", "s1"));

    expect(fragment(response).params.get("github_error")).toMatch(/verified/);
    expect(fragment(response).params.has("github_token")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a callback with no state cookie", async () => {
    configure();

    const response = await callback(callbackRequest("code=abc&state=s1"));

    expect(fragment(response).params.has("github_error")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a cancelled sign-in", async () => {
    configure();

    const response = await callback(
      callbackRequest("error=access_denied&state=s1", "s1")
    );

    expect(fragment(response).params.get("github_error")).toMatch(/cancelled/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a GitHub exchange failure without leaking the secret", async () => {
    configure();
    fetchMock.mockResolvedValue(Response.json({ error: "bad_verification_code" }));

    const response = await callback(callbackRequest("code=abc&state=s1", "s1"));
    const location = response.headers.get("location")!;

    expect(fragment(response).params.get("github_error")).toMatch(/expired/);
    expect(location).not.toContain("client-secret");
  });
});
