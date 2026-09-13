import { describe, expect, test } from "bun:test"
import { openableFilePath } from "./tool-file-path-policy"

describe("openableFilePath", () => {
  test("returns the path for read", () => {
    expect(openableFilePath("read", { filePath: "/a/b.ts" })).toBe("/a/b.ts")
  })

  test("returns the path for edit", () => {
    expect(openableFilePath("edit", { filePath: "/a/b.ts" })).toBe("/a/b.ts")
  })

  test("returns the path for write", () => {
    expect(openableFilePath("write", { filePath: "/a/b.ts" })).toBe("/a/b.ts")
  })

  test("returns undefined for tools with no single file target", () => {
    expect(openableFilePath("list", { path: "/a" })).toBeUndefined()
    expect(openableFilePath("grep", { pattern: "foo" })).toBeUndefined()
    expect(openableFilePath("bash", { command: "ls" })).toBeUndefined()
    expect(openableFilePath("patch", { files: ["/a", "/b"] })).toBeUndefined()
  })

  test("returns undefined when filePath is missing", () => {
    expect(openableFilePath("read", {})).toBeUndefined()
  })

  test("returns undefined when filePath is the wrong type", () => {
    expect(openableFilePath("read", { filePath: 42 })).toBeUndefined()
    expect(openableFilePath("read", { filePath: null })).toBeUndefined()
  })

  test("returns undefined when filePath is empty", () => {
    expect(openableFilePath("read", { filePath: "" })).toBeUndefined()
  })
})
