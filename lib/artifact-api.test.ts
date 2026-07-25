import { describe, expect, it } from "vitest";
import { artifactFilename, normalizeArtifactPath } from "@/lib/artifact-api";

describe("artifact API safety helpers", () => {
  it("accepts canonical nested relative paths", () => {
    expect(normalizeArtifactPath("reports/result.json")).toBe("reports/result.json");
    expect(normalizeArtifactPath("reports\\result.json")).toBe("reports/result.json");
  });

  it.each(["../secret", "a/../secret", "/etc/passwd", "C:\\secret", "a//b", "a/./b"])(
    "rejects unsafe path %s",
    (path) => {
      expect(normalizeArtifactPath(path)).toBeNull();
    }
  );

  it("builds a disposition without injectable header characters", () => {
    const disposition = artifactFilename('report"\r\nX-Evil: yes.txt');
    expect(disposition).toContain("attachment;");
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
  });
});
