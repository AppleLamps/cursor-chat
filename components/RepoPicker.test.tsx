// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RepoPicker from "@/components/RepoPicker";

afterEach(cleanup);

const repos = [
  { url: "https://github.com/acme/widgets" },
  { url: "https://github.com/acme/billing-service" },
  { url: "https://github.com/other/docs" }
];

function setup(props: Partial<React.ComponentProps<typeof RepoPicker>> = {}) {
  const onSelect = vi.fn();
  const onRetry = vi.fn();
  const view = render(
    <RepoPicker
      repos={repos}
      loading={false}
      error={null}
      onSelect={onSelect}
      onRetry={onRetry}
      {...props}
    />
  );
  return { view, onSelect, onRetry };
}

function submit(view: ReturnType<typeof render>) {
  fireEvent.click(view.getByRole("button", { name: "Continue" }));
}

describe("RepoPicker", () => {
  it("shows the failure and lets the user retry", () => {
    const { view, onRetry } = setup({ error: "Cursor rejected the key." });

    expect(view.getByText("Cursor rejected the key.")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: /retry|try again/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not offer a form while loading or when there are no repositories", () => {
    const loading = setup({ loading: true });
    expect(loading.view.queryByRole("listbox")).toBeNull();
    cleanup();

    const empty = setup({ repos: [] });
    expect(empty.view.queryByRole("listbox")).toBeNull();
  });

  it("cannot continue until one of several repositories is chosen", () => {
    const { view, onSelect } = setup();
    const next = view.getByRole("button", { name: "Continue" }) as HTMLButtonElement;

    expect(next.disabled).toBe(true);
    fireEvent.click(next);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("option", { name: /acme\/widgets/ }));
    expect(next.disabled).toBe(false);
  });

  it("selects a repository and passes the choices on", () => {
    const { view, onSelect } = setup();

    fireEvent.click(view.getByRole("option", { name: /acme\/billing-service/ }));
    submit(view);

    expect(onSelect).toHaveBeenCalledOnce();
    const [repoUrl, branch, remember, mode] = onSelect.mock.calls[0];
    expect(repoUrl).toBe("https://github.com/acme/billing-service");
    expect(branch).toBe("main");
    expect(remember).toBe(true);
    expect(mode).toBe("qa");
  });

  it("selects the only repository automatically", () => {
    const { view, onSelect } = setup({ repos: [repos[0]] });

    submit(view);

    expect(onSelect.mock.calls[0][0]).toBe("https://github.com/acme/widgets");
  });

  it("filters by owner, name, or URL and says when nothing matches", () => {
    const { view } = setup();
    const search = view.getByLabelText("Repository", { selector: "input" });
    const list = () => within(view.getByRole("listbox", { name: "Repositories" }));

    fireEvent.change(search, { target: { value: "billing" } });
    expect(list().getAllByRole("option")).toHaveLength(1);
    expect(view.getByText("1 of 3")).toBeTruthy();

    fireEvent.change(search, { target: { value: "nothing-like-this" } });
    expect(view.getByText("No matches")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Clear search" }));
    expect(list().getAllByRole("option")).toHaveLength(3);
  });

  it("respects the remember-as-default choice and a typed branch", () => {
    const { view, onSelect } = setup({ initialRepoUrl: repos[2].url, initialBranch: "develop" });

    fireEvent.click(view.getByLabelText(/Use as default for new chats/));
    submit(view);

    const [repoUrl, branch, remember] = onSelect.mock.calls[0];
    expect(repoUrl).toBe(repos[2].url);
    expect(branch).toBe("develop");
    expect(remember).toBe(false);
  });

  it("offers Cancel only when it can be cancelled", () => {
    const onCancel = vi.fn();
    const { view } = setup({ mode: "modal", onCancel });

    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    cleanup();

    const page = setup();
    expect(page.view.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
