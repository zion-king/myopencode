import { describe, expect, test } from "bun:test"
import { exceedsPreviewLimit, isMarkdownPath, MAX_BYTES } from "./markdown-file-view-policy"

describe("isMarkdownPath", () => {
  test("matches supported markdown extensions", () => {
    expect(isMarkdownPath("AGENTS.md")).toBe(true)
    expect(isMarkdownPath("docs/readme.markdown")).toBe(true)
    expect(isMarkdownPath("a/b/notes.mdx")).toBe(true)
    expect(isMarkdownPath("rules.mdc")).toBe(true)
  })

  test("is case insensitive", () => {
    expect(isMarkdownPath("README.MD")).toBe(true)
    expect(isMarkdownPath("README.MarkDown")).toBe(true)
  })

  test("rejects non-markdown files", () => {
    expect(isMarkdownPath("index.ts")).toBe(false)
    expect(isMarkdownPath("style.css")).toBe(false)
    expect(isMarkdownPath("image.png")).toBe(false)
  })

  test("rejects paths without an extension", () => {
    expect(isMarkdownPath("Makefile")).toBe(false)
    expect(isMarkdownPath("md")).toBe(false)
  })

  test("rejects undefined", () => {
    expect(isMarkdownPath(undefined)).toBe(false)
  })

  test("does not match an extension appearing mid-path", () => {
    expect(isMarkdownPath("docs.md/index.ts")).toBe(false)
  })
})

describe("exceedsPreviewLimit", () => {
  test("allows content at or below the limit", () => {
    expect(exceedsPreviewLimit("")).toBe(false)
    expect(exceedsPreviewLimit("# small")).toBe(false)
    expect(exceedsPreviewLimit("a".repeat(MAX_BYTES))).toBe(false)
  })

  test("rejects content above the limit", () => {
    expect(exceedsPreviewLimit("a".repeat(MAX_BYTES + 1))).toBe(true)
  })

  test("measures utf-8 bytes rather than code units", () => {
    // Each emoji is 4 utf-8 bytes but 2 utf-16 code units.
    const emoji = "\u{1F600}".repeat(MAX_BYTES / 4)
    expect(emoji.length).toBeLessThan(MAX_BYTES)
    expect(exceedsPreviewLimit(emoji)).toBe(false)
    expect(exceedsPreviewLimit(emoji + "\u{1F600}")).toBe(true)
  })
})
