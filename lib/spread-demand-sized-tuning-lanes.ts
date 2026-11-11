import { bipolarPairedLobes } from "./bipolar-tuning"
import { length } from "./geometry"
import { pairedArcNeedsTangents } from "./paired-arc-sampling"
import { fixedRouteLength, minimumLengthTargets } from "./route-lengths"
import { roundedTuningLobes } from "./smooth-tuning"
import { spreadCoupledTuningLanes } from "./spread-coupled-tuning-lanes"
import type { SimpleRouteJson, Trace, Wire } from "./types"

/** Lateral swing in mm of the densest rounded bank adding `deficit` to one
 * lane over a straight run, measured from the lane centerline. */
function singleBankSwing(
  run: number,
  deficit: number,
  width: number,
  clearance: number,
): number | null {
  const minRadius = Math.max(width * 1.2, clearance),
    span = run * 0.9
  for (let teeth = Math.floor(span / (4 * minRadius)); teeth >= 1; teeth--) {
    const lobes = roundedTuningLobes(
      { x: 0, y: 0 },
      { x: span, y: 0 },
      deficit,
      teeth,
      1,
      minRadius,
    )
    if (lobes) return Math.max(...lobes.map((p) => Math.abs(p.y)))
  }
  return null
}

/** Lateral swing in mm of the densest balanced pair bank, measured from the
 * outer rail's centerline. */
function pairedBankSwing(
  run: number,
  deficit: number,
  width: number,
  gap: number,
  clearance: number,
): number | null {
  const minRadius = Math.max(width * 1.2, clearance),
    spacing = width + gap,
    span = (run - 4 * width) * 0.9,
    radius = minRadius + spacing / 2
  for (
    let lobes = Math.min(64, Math.floor((span / radius - 2) / 4));
    lobes >= 1;
    lobes--
  ) {
    const rails = bipolarPairedLobes(
      { x: 0, y: 0 },
      { x: span, y: 0 },
      spacing,
      deficit,
      lobes,
      1,
      minRadius,
      pairedArcNeedsTangents({ width, gap, clearance }),
    )
    if (rails)
      return (
        Math.max(...rails.flatMap((rail) => rail.map((p) => Math.abs(p.y)))) -
        spacing / 2
      )
  }
  return null
}

/** Open tuning banks whose widths follow each lane's remaining length deficit.
 * A uniform pitch gives a lane that needs 15 mm the same room as one that
 * needs none; here the lateral space goes where the copper has to be added.
 * Moving a bank changes lane lengths and therefore the deficits, so the
 * allocation is repeated until every lane's bank fits its own correction. */
export function spreadDemandSizedTuningLanes(
  input: SimpleRouteJson,
  traces: Trace[],
  options: {
    maxRounds?: number
    headroom?: number
    /** Fit the banks into a populated board; see spreadCoupledTuningLanes. */
    boardAware?: boolean
  } = {},
): Trace[] | null {
  const clearance =
    input.minTraceToPadEdgeClearance ?? input.defaultObstacleMargin ?? 0.075
  const busNames = new Set(input.buses?.flatMap((bus) => bus.connectionNames))
  const strips = new Map<string, number>()
  const headroom = options.headroom ?? 1.1
  let best: Trace[] | null = null
  for (let round = 0; round < (options.maxRounds ?? 8); round++) {
    const bankRuns = new Map<string, number>()
    const spread = spreadCoupledTuningLanes(
      input,
      traces,
      input.minTraceWidth * 5,
      "dogleg",
      false,
      strips,
      bankRuns,
      options.boardAware,
    )
    if (!spread) return best
    best = spread
    const targets = minimumLengthTargets(input, spread)
    let grew = false
    for (const trace of spread) {
      const name = trace.connection_name!
      if (!busNames.has(name)) continue
      const deficit =
        (targets.get(name) ?? 0) -
        length(trace.route) -
        fixedRouteLength(input, name)
      if (deficit < 1e-6) continue
      const width = (trace.route[0] as Wire).width
      const pair = trace.coupledSection
        ? input.differentialPairs?.find((p) => p.connectionNames.includes(name))
        : undefined
      // The bank is the only run with a reserved strip beside it.
      const run = bankRuns.get(name)
      if (run === undefined) continue
      const swing = pair
        ? pairedBankSwing(
            run,
            deficit,
            width,
            pair.traceGap ?? clearance,
            clearance,
          )
        : singleBankSwing(run, deficit, width, clearance)
      if (swing === null) continue
      const needed = swing * headroom
      if (needed > (strips.get(name) ?? 0) + 1e-6) {
        strips.set(name, needed)
        grew = true
      }
    }
    if (!grew) return spread
  }
  return best
}
