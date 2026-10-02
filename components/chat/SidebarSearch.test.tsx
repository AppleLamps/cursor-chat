// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SidebarSearch from "@/components/chat/SidebarSearch";
import type { Conversation } from "@/lib/chat-types";

afterEach(cleanup);

function chat(id: string, title: string, body: string): Conversation {
  const at = "2026-01-02T00:00:00.000Z";
  return {
    id,
    title,
    createdAt: at,
    updatedAt: at,
    repoUrl: "https://github.com/acme/app",
    messages: [{ id: `${id}-m`, role: "assistant", content: body, createdAt: at }]
  };
}

const chats = [
  chat("a", "Auth flow", "Sessions are stored in signed cookies."),
  chat("b", "Billing", "Invoices are generated nightly.")
];

function setup(onOpen = vi.fn()) {
  const view = render(
    <SidebarSearch conversations={chats} activeConversationId="a" onOpenConversation={onOpen}>
      <p>project list</p>
    </SidebarSearch>
  );
  return { view, onOpen, box: view.getByLabelText("Search chats") as HTMLInputElement };
}

describe("SidebarSearch", () => {
  it("shows the normal list until something is typed", () => {
    const { view } = setup();

    expect(view.getByText("project list")).toBeTruthy();
  });

  it("finds chats by message text, shows context, and opens one", async () => {
    const { view, onOpen, box } = setup();

    fireEvent.change(box, { target: { value: "invoices" } });

    const result = await view.findByRole("button", { name: /Billing/ });
    expect(view.queryByText("project list")).toBeNull();
    expect(view.getByText("1 chat")).toBeTruthy();
    expect(result.textContent).toContain("Invoices are generated nightly.");

    fireEvent.click(result);
    expect(onOpen).toHaveBeenCalledWith(chats[1]);
  });

  it("says when nothing matches", async () => {
    const { view, box } = setup();

    fireEvent.change(box, { target: { value: "zzz" } });

    expect(await view.findByText("No chats match")).toBeTruthy();
  });

  it("clears the search on Escape and brings the list back", async () => {
    const { view, box } = setup();

    fireEvent.change(box, { target: { value: "auth" } });
    await view.findByRole("button", { name: /Auth flow/ });
    fireEvent.keyDown(box, { key: "Escape" });

    expect(box.value).toBe("");
    expect(view.getByText("project list")).toBeTruthy();
  });
});
