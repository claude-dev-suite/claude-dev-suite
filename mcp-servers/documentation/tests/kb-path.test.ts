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

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08 audit, Tier 3 #25 — path traversal through the fallback branch.
//
// `isSafeSegment` was applied only to the `local` path from the docs index.
// When the index missed, the raw `technology`/`topic` tool arguments — both
// unconstrained `z.string()` — were returned verbatim and reached `path.join`
// downstream.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveKbCoords — traversal through the fallback", () => {
  it.each(["../../etc", "..", ".", "a/b", "a\b"])(
    "rejects an unsafe technology %j",
    (technology) => {
      expect(() => resolveKbCoords(undefined, technology, "overview")).toThrow(
        /Invalid technology/i
      );
    }
  );

  it.each(["../../../../etc/passwd", "..", ".", "x/y"])(
    "rejects an unsafe topic %j",
    (topic) => {
      expect(() => resolveKbCoords(undefined, "react", topic)).toThrow(/Invalid topic/i);
    }
  );

  it("still accepts ordinary keys", () => {
    expect(resolveKbCoords(undefined, "react", "hooks")).toEqual({
      dir: "react",
      topicStem: "hooks",
    });
  });

  it("allows an empty topic, which resolveKbDir relies on", () => {
    expect(resolveKbDir(undefined, "react")).toBe("react");
  });

  it("rejects an unsafe technology through resolveKbDir too", () => {
    expect(() => resolveKbDir(undefined, "../../etc")).toThrow(/Invalid technology/i);
  });
});
