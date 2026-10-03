// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatApp from "@/components/ChatApp";

const encoder = new TextEncoder();

function sse(events: Array<[string, Record<string, unknown>]>) {
  const body = events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      }
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function route(url: string, init?: RequestInit) {
  if (url.endsWith("/api/repos")) {
    return json({ repos: [{ url: "https://github.com/acme/widgets" }] });
  }
  if (url.endsWith("/api/models")) return json({ error: "unavailable" }, 500);
  if (url.endsWith("/api/chat")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return sse([
      ["run", { agentId: "agent-1", agentSessionToken: "tok", runId: "run-1" }],
      ["text", { delta: `You asked: ${body.prompt}` }],
      [
        "done",
        {
          agentId: "agent-1",
          agentSessionToken: "tok",
          runId: "run-1",
          status: "finished",
          result: `You asked: ${body.prompt}`
        }
      ]
    ]);
  }
  return json({ error: "not mocked" }, 404);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  fetchMock.mockReset().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
    route(String(input), init)
  );
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no layout engine.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatApp", () => {
  it("walks from onboarding to a streamed answer", async () => {
    const view = render(<ChatApp githubOAuthEnabled={false} />);

    // 1. Onboarding asks for a key first.
    await view.findByText("Connect your Cursor account");
    fireEvent.change(view.getByLabelText("Cursor API key"), {
      target: { value: "cursor_test_key_1234567890" }
    });
    fireEvent.click(view.getByRole("button", { name: "Continue" }));

    // 2. The key is used to list repositories, then a repository is chosen.
    const repoOption = await view.findByRole("option", { name: /acme\/widgets/ });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/api/repos") &&
          JSON.parse(String(init?.body)).apiKey === "cursor_test_key_1234567890"
      )
    ).toBe(true);
    fireEvent.click(repoOption);
    fireEvent.click(view.getByRole("button", { name: "Continue" }));

    // 3. Ask a question and read the streamed answer.
    const composer = await view.findByRole("textbox");
    fireEvent.change(composer, { target: { value: "How does auth work?" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    await waitFor(() => expect(view.getAllByText("You asked: How does auth work?").length).toBeGreaterThan(0));

    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/chat"));
    const sent = JSON.parse(String(chatCall?.[1]?.body));
    expect(sent).toMatchObject({
      apiKey: "cursor_test_key_1234567890",
      repoUrl: "https://github.com/acme/widgets",
      prompt: "How does auth work?",
      agentMode: "qa"
    });
    expect(sent.turnId).toMatch(/^[A-Za-z0-9_-]+$/);

    // The transcript and dock are flex siblings: no overlay or guessed reservation.
    const viewport = view.container.querySelector('[data-slot="message-scroller-viewport"]');
    expect(viewport?.className).toContain("pb-2");
    expect(viewport?.className).not.toContain("--composer-h");
    const scroller = view.container.querySelector('[data-slot="message-scroller"]');
    expect(scroller?.className).toContain("basis-0");
    expect(scroller?.className).toContain("min-h-0");
    const dock = view.getByRole("textbox").closest("form")?.parentElement;
    expect(dock?.previousElementSibling).toBe(scroller);
    expect(dock?.className).toContain("shrink-0");
    expect(dock?.className).not.toContain("absolute");
    expect(dock?.className).toContain("safe-area-inset-bottom");

    // 4. The conversation is saved for the next visit, without the API key.
    await waitFor(() => {
      const saved = window.localStorage.getItem("codebase-chat-conversations-v1") ?? "";
      expect(saved).toContain("How does auth work?");
      expect(saved).not.toContain("cursor_test_key_1234567890");
    });
  });

  it("keeps the key out of persistent storage unless asked to remember it", async () => {
    const view = render(<ChatApp githubOAuthEnabled={false} />);

    await view.findByText("Connect your Cursor account");
    fireEvent.change(view.getByLabelText("Cursor API key"), {
      target: { value: "cursor_test_key_1234567890" }
    });
    fireEvent.click(view.getByRole("button", { name: "Continue" }));
    await view.findByRole("option", { name: /acme\/widgets/ });

    expect(JSON.stringify({ ...window.localStorage })).not.toContain("cursor_test_key_1234567890");
    expect(JSON.stringify({ ...window.sessionStorage })).toContain("cursor_test_key_1234567890");
  });
});
