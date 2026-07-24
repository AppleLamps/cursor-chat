// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAgentRequestController } from "@/hooks/useAgentRequestController";

afterEach(cleanup);

describe("useAgentRequestController", () => {
  it("aborts the active request on demand", () => {
    const { result } = renderHook(() => useAgentRequestController());
    let controller: AbortController;

    act(() => {
      controller = result.current.beginRequest();
    });
    expect(controller!.signal.aborted).toBe(false);

    act(() => {
      expect(result.current.stopRequest()).toBe(true);
    });
    expect(controller!.signal.aborted).toBe(true);
  });

  it("aborts an active request when the component unmounts", () => {
    const { result, unmount } = renderHook(() => useAgentRequestController());
    let controller: AbortController;

    act(() => {
      controller = result.current.beginRequest();
    });
    unmount();

    expect(controller!.signal.aborted).toBe(true);
  });

  it("does not clear a newer request with an older controller", () => {
    const { result } = renderHook(() => useAgentRequestController());
    let first: AbortController;
    let second: AbortController;

    act(() => {
      first = result.current.beginRequest();
      second = result.current.beginRequest();
      result.current.clearRequest(first);
    });

    expect(first!.signal.aborted).toBe(true);
    expect(second!.signal.aborted).toBe(false);
    act(() => {
      expect(result.current.stopRequest()).toBe(true);
    });
    expect(second!.signal.aborted).toBe(true);
  });
});
