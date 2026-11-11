import { expect, test } from "bun:test"
import { tuningPathIsSelfClear } from "../lib/length-tuning"

const required = 0.2

test("a 0.05 mm step past a via is a kink, not a returning arm", () => {
  // Routed AM3352 SBC lane (DDR_A11 on inner2), mm: it steps 0.05 mm sideways
  // around a RAM fanout via and continues in the same direction.
  const lane = [
    { x: -6.75, y: -21.65 },
    { x: -7.15, y: -22.05 },
    { x: -7.15, y: -22.15 },
    { x: -7.2, y: -22.2 },
    { x: -7.2, y: -22.25 },
    { x: -7.15, y: -22.3 },
    { x: -7.15, y: -23.95 },
  ]
  expect(tuningPathIsSelfClear(lane, required)).toBe(false)
  expect(tuningPathIsSelfClear(lane, required, { allowKinks: true })).toBe(true)
})

test("allowing kinks keeps hairpins and crossings rejected", () => {
  // Two 2 mm arms 0.1 mm apart, joined by a 0.1 mm turn.
  const hairpin = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 0.1 },
    { x: 0, y: 0.1 },
  ]
  expect(tuningPathIsSelfClear(hairpin, required, { allowKinks: true })).toBe(
    false,
  )
  // A short loop that crosses itself.
  const crossing = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 0.1 },
    { x: 0.95, y: 0.1 },
    { x: 0.95, y: -0.1 },
  ]
  expect(tuningPathIsSelfClear(crossing, required, { allowKinks: true })).toBe(
    false,
  )
  // A sub-micron backstep at a carrier tail is debris, not a kink.
  const debris = [
    { x: 1.5, y: 0 },
    { x: 0.05, y: 0 },
    { x: 0, y: 0.05 },
    { x: -0.0000385, y: 0.05 },
    { x: -0.0002155, y: 0.049823 },
    { x: -0.000254, y: 0.049823 },
    { x: -0.05, y: 0.1 },
    { x: -0.05, y: 1 },
  ]
  expect(tuningPathIsSelfClear(debris, required, { allowKinks: true })).toBe(
    tuningPathIsSelfClear(debris, required),
  )
  // Arms at the full spacing are clear either way.
  const wide = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 0.2 },
    { x: 0, y: 0.2 },
  ]
  expect(tuningPathIsSelfClear(wide, required)).toBe(true)
  expect(tuningPathIsSelfClear(wide, required, { allowKinks: true })).toBe(true)
})
