// SPDX-License-Identifier: MIT
import { describe, it, expect } from "vitest";
import { resolveKbCoords, resolveKbDir } from "../src/kb-path.js";

describe("resolveKbCoords", () => {
  it("derives dir + topic stem from a nested local path", () => {
    expect(
      resolveKbCoords("bitcoin/protocol/consensus/overview.md", "bitcoin-consensus", "overview")
    ).toEqual({ dir: "bitcoin", topicStem: "protocol/consensus/overview" });
  });

  it("handles the common flat {tech}/{topic}.md shape unchanged", () => {
    expect(resolveKbCoords("react/hooks.md", "react", "hooks")).toEqual({
      dir: "react",
      topicStem: "hooks",
    });
  });

  it("normalises backslashes to forward slashes", () => {
    expect(resolveKbCoords("bitcoin\\protocol\\consensus\\overview.md", "x", "y")).toEqual({
      dir: "bitcoin",
      topicStem: "protocol/consensus/overview",
    });
  });

  it("strips a leading slash and empty segments", () => {
    expect(resolveKbCoords("/vite//config.md", "vite", "config")).toEqual({
      dir: "vite",
      topicStem: "config",
    });
  });

  it("falls back to keys when local is undefined", () => {
    expect(resolveKbCoords(undefined, "zod", "basics")).toEqual({
      dir: "zod",
      topicStem: "basics",
    });
  });

  it("falls back to keys when local has no directory segment", () => {
    expect(resolveKbCoords("overview.md", "tech", "topic")).toEqual({
      dir: "tech",
      topicStem: "topic",
    });
  });

  it("rejects path traversal and falls back to keys", () => {
    expect(resolveKbCoords("../../etc/passwd.md", "tech", "topic")).toEqual({
      dir: "tech",
      topicStem: "topic",
    });
    expect(resolveKbCoords("bitcoin/../../secret.md", "tech", "topic")).toEqual({
      dir: "tech",
      topicStem: "topic",
    });
  });

  it("preserves @-versioned package segments (Unity-style paths)", () => {
    expect(
      resolveKbCoords("unity-2d/com.unity.2d.animation@latest/skinning.md", "unity-2d", "skinning")
    ).toEqual({ dir: "unity-2d", topicStem: "com.unity.2d.animation@latest/skinning" });
  });
});

describe("resolveKbDir", () => {
  it("returns the first segment of a valid local path", () => {
    expect(resolveKbDir("bitcoin/protocol/consensus/overview.md", "bitcoin-consensus")).toBe(
      "bitcoin"
    );
  });

  it("falls back to the technology key when local is missing", () => {
    expect(resolveKbDir(undefined, "react")).toBe("react");
  });
});
