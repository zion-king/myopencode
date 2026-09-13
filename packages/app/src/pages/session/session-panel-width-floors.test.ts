// Rewrite 002 (rewrites/specs/002-side-panel-min-width.md): pins the lowered review-pane
// floors as literals, not relative to the constants, so a silent revert to 480/800 (or an
// upstream rework of the reserve-based model) fails loudly instead of the feature quietly
// disappearing. See rewrites/docs/PRINCIPLES.md P8.
import { describe, expect, test } from "bun:test"
import {
  clampSessionPanelWidth,
  REVIEW_PANE_WIDTH_MIN,
  REVIEW_PANE_WIDTH_MIN_SPLIT,
  sessionPanelWidthMax,
} from "./session-panel-width"

describe("lowered review pane floors", () => {
  test("unified floor is 280, not the old 480", () => {
    expect(REVIEW_PANE_WIDTH_MIN).toBe(280)
  })

  test("split floor is 560, not the old 800", () => {
    expect(REVIEW_PANE_WIDTH_MIN_SPLIT).toBe(560)
  })

  test("split floor stays strictly larger than unified (R3)", () => {
    expect(REVIEW_PANE_WIDTH_MIN_SPLIT).toBeGreaterThan(REVIEW_PANE_WIDTH_MIN)
  })

  test("chat column can grow ~200px further in unified mode at a typical window width", () => {
    expect(sessionPanelWidthMax({ available: 1700, split: false })).toBe(1420)
  })

  test("chat column can grow ~240px further in split mode at a typical window width", () => {
    expect(sessionPanelWidthMax({ available: 1700, split: true })).toBe(1140)
  })

  test("side panel can now be dragged down to 280px", () => {
    expect(clampSessionPanelWidth({ width: 1420, available: 1700, split: false })).toBe(1420)
    expect(sessionPanelWidthMax({ available: 1700, split: false })).toBe(1700 - 280)
  })
})
