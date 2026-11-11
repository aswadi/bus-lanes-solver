import {
  getCopperLayerNames,
  validateRoutedCopperDrc,
} from "@tscircuit/fanout-solver"
import { routeAlternateSignalDogbones } from "./alternate-signal-dogbones"
import { routeMatchedNativeSingleCarrier } from "./route-matched-native-single-carrier"
import { type NativeCarrierProgress } from "./match-native-carrier-signals"
import { NativeCarrierRouter } from "./native-carrier-router"
import { cleanNativeCarrierSignal } from "./native-carrier-tuning"
import { nativeGroupCenterlines } from "./native-group-centerlines"
import { busLengthReports, pairLengthReports } from "./route-lengths"
import { exteriorPairSpacingReports } from "./exterior-pair-spacing"
import { packageApproachRegions, pointInBox } from "./package-approach-regions"
import type { NativeSingleCarrierOptions } from "./route-matched-native-single-carrier"
import type { SimpleRouteJson, Trace } from "./types"

function groupsFor(input: SimpleRouteJson) {
  const layers = getCopperLayerNames(input.layerCount).filter(
    (l) =>
      /^inner\d+$/.test(l) &&
      (!input.allowedLayers || input.allowedLayers.includes(l)),
  )
  const groups = (input.buses ?? [])
    .filter((b) => b.connectionNames.length > 1)
    .map((bus) => ({
      bus,
      pairs: (input.differentialPairs ?? []).filter((p) =>
        p.connectionNames.every((n) => bus.connectionNames.includes(n)),
      ),
      layers: layers.filter(
        (l) => !bus.allowedLayers || bus.allowedLayers.includes(l),
      ),
    }))
  return { layers, groups }
}
/** Select only fresh, axis-aligned native multi-bus requests. Supplied fanouts,
 * overlapping timing groups and other geometries retain their existing solver.
 */
export function nativeGroupsEligible(input: SimpleRouteJson) {
  if (
    input.outline?.length ||
    input.traces?.length ||
    input.connections.some(
      (c) =>
        c.pointsToConnect.length !== 2 ||
        c.pointsToConnect.some((p) => p.layer !== "top") ||
        (c.width ?? c.nominalTraceWidth ?? input.minTraceWidth) !==
          input.minTraceWidth,
    )
  )
    return false
  const { layers, groups } = groupsFor(input)
  if (
    layers.length < 2 ||
    groups.length < 2 ||
    groups.some(
      (g) =>
        g.pairs.length !== 1 ||
        !g.layers.length ||
        !Number.isFinite(g.bus.maxLength) ||
        g.bus.maxLengthSkew === undefined ||
        (g.bus.traceWidth !== undefined &&
          g.bus.traceWidth !== input.minTraceWidth),
    )
  )
    return false
  const names = groups.flatMap((g) => g.bus.connectionNames)
  if (
    new Set(names).size !== names.length ||
    names.some((n) => !input.connections.some((c) => c.name === n))
  )
    return false
  if (
    (input.differentialPairs ?? []).some(
      (p) => !groups.some((g) => g.pairs.includes(p)),
    )
  )
    return false
  if (
    (input.buses ?? []).some(
      (b) =>
        b.connectionNames.length <= 1 &&
        (b.minLength !== undefined ||
          b.maxLength !== undefined ||
          b.maxLengthSkew !== undefined),
    )
  )
    return false
  const regions = packageApproachRegions(input, 0)
  const c = input.connections[0]
  const a = regions.find((r) => pointInBox(c.pointsToConnect[0], r.pads)),
    b = regions.find((r) => pointInBox(c.pointsToConnect[1], r.pads))
  if (!a || !b || a === b) return false
  const ax = (a.pads.minX + a.pads.maxX) / 2,
    ay = (a.pads.minY + a.pads.maxY) / 2,
    bx = (b.pads.minX + b.pads.maxX) / 2,
    by = (b.pads.minY + b.pads.maxY) / 2
  return (
    (Math.abs(ax - bx) < 1e-8 || Math.abs(ay - by) < 1e-8) &&
    input.connections.every(
      (c) =>
        pointInBox(c.pointsToConnect[0], a.pads) &&
        pointInBox(c.pointsToConnect[1], b.pads),
    )
  )
}
function* bounded<T>(
  work: Generator<void, T>,
  steps: number,
): Generator<void, T | null> {
  try {
    for (let i = 0; i < steps; i++) {
      const next = work.next()
      if (next.done) return next.value
      yield
    }
  } finally {
    work.return(null as T)
  }
  return null
}
/** Reserve all escape sites before routing, then try bounded group, layer and
 * paired-corridor alternatives. Reservations are generated search geometry,
 * never accepted output. The returned routes must cover every native request.
 */
export function* routeNativeGroups(
  input: SimpleRouteJson,
  options: NativeSingleCarrierOptions = {},
  progress?: (state: NativeCarrierProgress) => void,
): Generator<void, Trace[] | null> {
  const { groups } = groupsFor(input)
  const layerByGroup = new Map(
    groups.map((group, i) => [group, group.layers[i % group.layers.length]]),
  )
  const targets = new Map(
    input.connections.map((c) => [
      c.name,
      layerByGroup.get(
        groups.find((g) => g.bus.connectionNames.includes(c.name))!,
      ) ?? groups[0].layers[0],
    ]),
  )
  let reservations: ReturnType<typeof routeAlternateSignalDogbones> | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      reservations = routeAlternateSignalDogbones(
        input,
        {
          targetLayers: targets,
          viaDiameter: input.minViaPadDiameter ?? 0.3,
          viaHoleDiameter: input.minViaHoleDiameter ?? 0.15,
          traceWidth: input.minTraceWidth,
          clearance:
            input.minTraceToPadEdgeClearance ??
            input.defaultObstacleMargin ??
            0.075,
          holeToHoleClearance:
            input.minViaHoleEdgeToViaHoleEdgeClearance ?? 0.1,
          boardEdgeClearance: input.minBoardEdgeClearance,
        },
        attempt,
      )
      break
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/No collision-free local dogbone assignment|Local dogbones collide/.test(
          error.message,
        )
      )
        throw error
    }
    yield
  }
  if (!reservations) return null
  let completed: Trace[] = []
  const local = (
    group: (typeof groups)[number],
    fixed: Trace[],
  ): SimpleRouteJson => ({
    ...input,
    allowedLayers: [layerByGroup.get(group)!],
    connections: input.connections.filter((c) =>
      group.bus.connectionNames.includes(c.name),
    ),
    buses: [{ ...group.bus, allowedLayers: [layerByGroup.get(group)!] }],
    differentialPairs: group.pairs,
    traces: fixed,
  })
  const packageRegionsFor = (group: (typeof groups)[number]) =>
    packageApproachRegions(
      input,
      input.minTraceWidth +
        (group.pairs[0].traceGap ??
          input.minTraceToPadEdgeClearance ??
          input.defaultObstacleMargin ??
          0.075) /
          2 +
        (input.minTraceToPadEdgeClearance ??
          input.defaultObstacleMargin ??
          0.075),
    )
  const config = (
    group: (typeof groups)[number],
  ): NativeSingleCarrierOptions => ({
    ...options,
    packageRegions: packageRegionsFor(group),
    busTargetLength:
      options.busTargetLength ??
      ((group.bus.minLength ?? 0) > 0
        ? ((group.bus.minLength ?? 0) + group.bus.maxLength!) / 2
        : group.bus.maxLength! - input.minTraceWidth / 2) -
        group.pairs[0].lengthTolerance,
    maxExpansionsPerRoute: options.maxExpansionsPerRoute ?? 150000,
    maxPasses: options.maxPasses ?? 20,
    maxLocalPasses: options.maxLocalPasses ?? 12,
    fixedConnections: input.connections,
  })
  for (const [groupIndex, group] of groups.entries()) {
    const seen = new Set([
      ...completed.map((t) => t.connection_name),
      ...group.bus.connectionNames,
    ])
    const fixed = [
      ...completed,
      ...reservations.traces.filter((t) => !seen.has(t.connection_name)),
    ] as Trace[]
    const preferred = layerByGroup.get(group)!
    const layers = [preferred, ...group.layers.filter((l) => l !== preferred)]
    const alternatives = layers.map((layer) => {
      layerByGroup.set(group, layer)
      const part = local(group, fixed)
      return {
        part,
        centerlines: nativeGroupCenterlines(
          part,
          packageRegionsFor(group),
        ).slice(0, 7),
      }
    })
    let result: Trace[] | null = null
    // Try each permitted layer before spending the next corridor alternative.
    // A blocked first layer must not monopolize the request's elapsed budget.
    for (let attempt = 0; attempt < 7; attempt++) {
      for (const { part, centerlines } of alternatives) {
        if (attempt >= centerlines.length) continue
        progress?.({
          stage: "native_group_matching",
          pass: groupIndex,
          collisions: 0,
          unfinished: group.bus.connectionNames,
          traces: completed,
        })
        result = yield* bounded(
          routeMatchedNativeSingleCarrier(
            part,
            { ...config(group), centerlines: centerlines[attempt] },
            (state) =>
              progress?.({
                ...state,
                traces: [...completed, ...state.traces],
                groupName: group.bus.name ?? "DDR bus",
                completedConnections: completed.length,
              }),
          ),
          12000,
        )
        if (result) break
      }
      if (result) break
    }
    if (!result) return null
    completed.push(...result)
  }
  for (const connection of input.connections.filter(
    (c) => !completed.some((t) => t.connection_name === c.name),
  )) {
    const allowed = getCopperLayerNames(input.layerCount).filter(
      (l) =>
        l !== "top" &&
        (!input.allowedLayers || input.allowedLayers.includes(l)) &&
        (input.buses ?? []).every(
          (b) =>
            !b.connectionNames.includes(connection.name) ||
            !b.allowedLayers ||
            b.allowedLayers.includes(l),
        ),
    )
    const usage = (layer: string) =>
      completed.filter((t) =>
        t.route.some((p) => p.route_type === "wire" && p.layer === layer),
      ).length
    allowed.sort((a, b) => usage(a) - usage(b))
    let result: Trace | null = null
    for (const layer of allowed) {
      const part = {
        ...input,
        allowedLayers: [layer],
        connections: [connection],
        buses: [],
        differentialPairs: [],
        traces: completed,
      }
      const step = input.minTraceWidth / 2,
        cells =
          (Math.ceil((input.bounds.maxX - input.bounds.minX) / step) + 1) *
          (Math.ceil((input.bounds.maxY - input.bounds.minY) / step) + 1)
      const router = new NativeCarrierRouter(part, step, [
        new Float32Array(cells),
        new Float32Array(cells),
      ])
      const candidate = yield* bounded(
        router.route(connection, { strict: true, maxExpansions: 500000 }),
        1000,
      )
      if (candidate)
        result = cleanNativeCarrierSignal(
          part,
          connection,
          candidate.trace,
          [],
          true,
        )
      if (result) break
    }
    if (!result) return null
    completed.push(result)
  }
  if (
    completed.length !== input.connections.length ||
    input.connections.some(
      (c) => completed.filter((t) => t.connection_name === c.name).length !== 1,
    )
  )
    return null
  if (
    busLengthReports(input, completed).some(
      (b) =>
        !b.aboveMinimumLength ||
        !b.withinLengthLimit ||
        (b.toleranceMm !== null && !b.matched),
    ) ||
    pairLengthReports(input, completed).some((p) => !p.matched) ||
    exteriorPairSpacingReports(input, completed).some(
      (p) => !p.applicable || !p.matched,
    )
  )
    return null
  const drc = validateRoutedCopperDrc({
    inputSrj: input,
    routedSrj: { ...input, traces: completed },
    clearance:
      input.minTraceToPadEdgeClearance ?? input.defaultObstacleMargin ?? 0.075,
    allowBlindAndBuriedVias: false,
  } as never)
  return drc.valid ? completed : null
}
