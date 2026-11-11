import {
  BusLanesPipelineSolver,
  type BusLanesPipelineOptions,
} from "./bus-lanes-pipeline-solver"
import {
  getCopperLayerNames,
  getRouteViaSpanLayers,
} from "@tscircuit/fanout-solver"
import { effectiveCarrierLayers } from "./effective-carrier-layers"
import { selectBranchAttachment } from "./select-branch-attachment"
import type {
  Connection,
  Obstacle,
  SimpleRouteJson,
  Terminal,
  Trace,
} from "./types"

type ComponentId = NonNullable<Obstacle["componentId"]>
type CopperLayer = Terminal["layer"]

/** Board-world points in mm, +X right and +Y up. Route the main packages first,
 * then attach each extra terminal through existing same-net copper.
 * Timing-constrained trees need path-length semantics rather than lane skew. */
export function* routeMultiTerminalBuses(
  input: SimpleRouteJson,
  options: BusLanesPipelineOptions,
): Generator<void, Trace[] | null> {
  const branchedNames = new Set(
    input.connections
      .filter((connection) => connection.pointsToConnect.length > 2)
      .map((connection) => connection.name),
  )
  for (const bus of input.buses ?? []) {
    if (!bus.connectionNames.some((name) => branchedNames.has(name))) continue
    if (
      bus.minLength !== undefined ||
      bus.maxLength !== undefined ||
      bus.maxLengthSkew !== undefined
    )
      throw Error("Multi-terminal buses do not support length constraints")
  }
  for (const pair of input.differentialPairs ?? []) {
    if (pair.connectionNames.some((name) => branchedNames.has(name)))
      throw Error("Multi-terminal differential pairs are not supported")
  }

  const padCounts = new Map<ComponentId, number>()
  for (const obstacle of input.obstacles) {
    if (!obstacle.componentId) continue
    padCounts.set(
      obstacle.componentId,
      (padCounts.get(obstacle.componentId) ?? 0) + 1,
    )
  }
  const connections = input.connections.map((connection) => ({
    ...connection,
    pointsToConnect: connection.pointsToConnect
      .map((terminal) => {
        const pad = input.obstacles.find(
          (obstacle) =>
            obstacle.componentId &&
            obstacle.layers.includes(terminal.layer) &&
            Math.hypot(
              obstacle.center.x - terminal.x,
              obstacle.center.y - terminal.y,
            ) < 1e-8,
        )
        let padCount = 0
        if (pad?.componentId) padCount = padCounts.get(pad.componentId)!
        return { terminal, padCount }
      })
      .sort((a, b) => b.padCount - a.padCount)
      .map(({ terminal }) => terminal),
  }))
  const completed: Trace[] = []
  const physicalLayers = getCopperLayerNames(input.layerCount)
  let groups: Connection[][] = [
    connections.map((connection) => ({
      ...connection,
      pointsToConnect: connection.pointsToConnect.slice(0, 2),
    })),
  ]
  const terminalCount = Math.max(
    ...connections.map((connection) => connection.pointsToConnect.length),
  )
  for (let terminalIndex = 1; terminalIndex < terminalCount; terminalIndex++) {
    for (const group of groups) {
      const names = new Set(group.map((connection) => connection.name))
      const request = {
        ...input,
        connections: group,
        traces: [...(input.traces ?? []), ...completed],
        buses: input.buses
          ?.map((bus) => ({
            ...bus,
            connectionNames: bus.connectionNames.filter((name) =>
              names.has(name),
            ),
          }))
          .filter((bus) => bus.connectionNames.length > 0),
        differentialPairs: input.differentialPairs?.filter((pair) =>
          pair.connectionNames.every((name) => names.has(name)),
        ),
      }
      const solver = new BusLanesPipelineSolver(request, options)
      while (!solver.solved && !solver.failed) {
        solver.step()
        yield
      }
      if (!solver.solved)
        throw Error(solver.error ?? "Multi-terminal routing failed")
      completed.push(
        ...solver.traces.map((trace) => ({
          ...trace,
          pcb_trace_id: `multi_terminal_${terminalIndex}_${trace.pcb_trace_id}`,
        })),
      )
    }
    const branches = new Map<CopperLayer, Connection[]>()
    for (const connection of connections) {
      const terminal = connection.pointsToConnect[terminalIndex + 1]
      if (!terminal) continue
      if (!effectiveCarrierLayers(input, connection).includes(terminal.layer))
        throw Error("No permitted surface layer for a multi-terminal branch")
      const attachments: Terminal[] = completed
        .filter((trace) => trace.connection_name === connection.name)
        .flatMap((trace) => {
          const vias: Terminal[] = trace.route.flatMap((point) => {
            if (point.route_type !== "via") return []
            const layers = getRouteViaSpanLayers({
              fromLayer: point.from_layer,
              toLayer: point.to_layer,
              layers: point.layers,
              layerNames: physicalLayers,
              allowBlindAndBuriedVias: input.allowBlindAndBuriedVias ?? false,
            })
            if (!layers.includes(terminal.layer)) return []
            return [{ x: point.x, y: point.y, layer: terminal.layer, layers }]
          })
          return [
            ...vias,
            ...trace.route.flatMap((point) =>
              point.route_type === "wire" && point.layer === terminal.layer
                ? [point]
                : [],
            ),
          ]
        })
      const carrierLayers = effectiveCarrierLayers(input, connection)
      attachments.sort((a, b) => {
        const reachesAnotherCarrierA = !!a.layers?.some(
          (layer) => layer !== terminal.layer && carrierLayers.includes(layer),
        )
        const reachesAnotherCarrierB = !!b.layers?.some(
          (layer) => layer !== terminal.layer && carrierLayers.includes(layer),
        )
        return (
          Number(reachesAnotherCarrierB) - Number(reachesAnotherCarrierA) ||
          Math.hypot(a.x - terminal.x, a.y - terminal.y) -
            Math.hypot(b.x - terminal.x, b.y - terminal.y)
        )
      })
      if (!attachments.length)
        throw Error("No routed copper for a multi-terminal branch")
      const attachment = yield* selectBranchAttachment({
        input: { ...input, traces: [...(input.traces ?? []), ...completed] },
        connection,
        terminal,
        attachments,
      })
      const branch = {
        ...connection,
        pointsToConnect: [attachment, terminal],
      }
      const group = branches.get(terminal.layer) ?? []
      group.push(branch)
      branches.set(terminal.layer, group)
    }
    groups = [...branches.values()]
  }
  return completed
}
