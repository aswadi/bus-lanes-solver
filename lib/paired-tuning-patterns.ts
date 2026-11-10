import { bipolarPairedLobes } from "./bipolar-tuning"
import { foldedPairedLobes } from "./folded-tuning"
import { roundedPairedLobes, smoothPairedLobes } from "./smooth-tuning"
import {
  tangentPairedLobes,
  type PairedLobeOptions,
} from "./tangent-paired-lobes"
import type { Point } from "./types"

export type PairedTuningShape =
  | "bipolar"
  | "rounded"
  | "smooth"
  | "tangent"
  | "folded"

interface PairedTuningPattern {
  fraction: number
  lobes: number
  side: number
  shape: PairedTuningShape
}

export function createPairedTuningLobes({
  shape,
  tangentSampling,
  ...options
}: PairedLobeOptions & {
  shape: PairedTuningShape
  /** Balanced lobes sampled as tangent segments; see bipolarPairedLobes. */
  tangentSampling?: boolean
}): [Point[], Point[]] | null {
  const { a, b, spacing, deficit, lobes, side, minRadius } = options
  // Existing curve builders retain their legacy signatures and geometry.
  switch (shape) {
    case "bipolar":
      return bipolarPairedLobes(
        a,
        b,
        spacing,
        deficit,
        lobes,
        side,
        minRadius,
        tangentSampling,
      )
    case "rounded":
      return roundedPairedLobes(a, b, spacing, deficit, lobes, side, minRadius)
    case "smooth":
      return smoothPairedLobes(a, b, spacing, deficit, lobes, side, minRadius)
    case "folded":
      return foldedPairedLobes(a, b, spacing, deficit, lobes, side, minRadius)
    case "tangent":
      return tangentPairedLobes(options)
  }
}

export function* pairedTuningPatterns({
  folded,
  packMeanders,
  span,
  width,
  clearance,
  spacing,
  curveShapes,
}: {
  folded: boolean
  packMeanders?: boolean
  span: number
  width: number
  clearance: number
  spacing: number
  curveShapes: PairedTuningShape[]
}): Generator<PairedTuningPattern, void> {
  if (folded) {
    for (const lobes of [1, 2, 3])
      for (const fraction of [0.9, 0.65, 0.4])
        for (const side of [1, -1])
          yield { fraction, lobes, shape: "folded", side }
    return
  }
  for (const fraction of [0.9, 0.65, 0.4]) {
    let lobeCount = 16
    if (packMeanders) {
      const radius = Math.max(width * 1.2, clearance) + spacing / 2
      lobeCount = Math.max(1, Math.floor((span * fraction) / (4 * radius)))
    }
    const lobeCounts = Array.from(
      { length: lobeCount },
      (_, index) => index + 1,
    )
    if (packMeanders) lobeCounts.reverse()
    for (const lobes of lobeCounts)
      for (const side of [1, -1])
        for (const shape of curveShapes) yield { fraction, lobes, shape, side }
  }
}
