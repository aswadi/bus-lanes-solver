import type {
  Connection,
  Obstacle,
  Point,
  SimpleRouteJson,
  Terminal,
} from "./types"

function padEscapeIsBlocked({
  input,
  connection,
  terminal,
  pad,
}: {
  input: SimpleRouteJson
  connection: Connection
  terminal: Terminal
  pad: Obstacle
}): boolean {
  const owners = new Set(
    [connection.name, connection.source_trace_id, ...pad.connectedTo].filter(
      (owner): owner is string => !!owner,
    ),
  )
  // Existing connected copper may already provide an escape, including a via
  // that is grandfathered under a no-new-via-in-pad policy.
  if (
    input.traces?.some(
      (trace) =>
        owners.has(trace.connection_name ?? "") ||
        owners.has(trace.source_trace_id ?? ""),
    )
  )
    return false
  const foreign = input.obstacles.filter(
    (obstacle) =>
      obstacle.shape === "circle" &&
      Number.isFinite(obstacle.width) &&
      obstacle.width > 0 &&
      obstacle.width === obstacle.height &&
      obstacle.layers.includes(terminal.layer) &&
      !obstacle.connectedTo.some((owner) => owners.has(owner)),
  )
  const pitch = Math.min(
    ...foreign
      .filter(
        (obstacle) =>
          Math.abs(obstacle.center.y - pad.center.y) < 1e-8 &&
          obstacle.center.x > pad.center.x + 1e-8,
      )
      .map((obstacle) => obstacle.center.x - pad.center.x),
  )
  if (!Number.isFinite(pitch)) return false
  const bounds = {
    minX: pad.center.x - pitch,
    maxX: pad.center.x + pitch,
    minY: pad.center.y - pitch,
    maxY: pad.center.y + pitch,
  }
  const outside = (point: Point): boolean =>
    point.x < bounds.minX ||
    point.x > bounds.maxX ||
    point.y < bounds.minY ||
    point.y > bounds.maxY
  if (!connection.pointsToConnect.some(outside)) return false
  if (
    input.obstacles.some(
      (obstacle) =>
        obstacle !== pad &&
        obstacle.connectedTo.some((owner) => owners.has(owner)) &&
        obstacle.center.x + Math.hypot(obstacle.width, obstacle.height) / 2 >=
          bounds.minX &&
        obstacle.center.x - Math.hypot(obstacle.width, obstacle.height) / 2 <=
          bounds.maxX &&
        obstacle.center.y + Math.hypot(obstacle.width, obstacle.height) / 2 >=
          bounds.minY &&
        obstacle.center.y - Math.hypot(obstacle.width, obstacle.height) / 2 <=
          bounds.maxY,
    )
  )
    return false
  const clearance =
    input.minTraceToPadEdgeClearance ?? input.defaultObstacleMargin ?? 0.075
  if (!Number.isFinite(clearance) || clearance < 0) return false
  const viaClearance = Math.min(
    clearance,
    input.minViaEdgeToPadEdgeClearance ?? clearance,
  )
  if (!Number.isFinite(viaClearance) || viaClearance < 0) return false
  const width = Math.min(
    input.minTraceWidth,
    connection.width ?? Infinity,
    connection.nominalTraceWidth ?? Infinity,
    ...(input.buses ?? [])
      .filter((bus) => bus.connectionNames.includes(connection.name))
      .map((bus) => bus.traceWidth ?? Infinity),
  )
  if (!Number.isFinite(width) || width <= 0) return false
  let viaExclusionRadiusMm = Infinity
  // A complete ring of foreign circular pads encloses the terminal. Shrinking
  // each disk by its alignment error keeps the proof conservative for floats.
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue
      const x = pad.center.x + dx * pitch
      const y = pad.center.y + dy * pitch
      const neighbor = foreign.find(
        (obstacle) =>
          Math.hypot(obstacle.center.x - x, obstacle.center.y - y) < 1e-8,
      )
      if (!neighbor) return false
      const radius =
        neighbor.width / 2 -
        Math.hypot(neighbor.center.x - x, neighbor.center.y - y)
      // Every half-pitch boundary interval lies inside a forbidden trace disk.
      if (radius + width / 2 + clearance <= pitch / 2 + 1e-7) return false
      viaExclusionRadiusMm = Math.min(
        viaExclusionRadiusMm,
        radius + input.minViaPadDiameter! / 2 + viaClearance,
      )
    }
  }
  // Outside the central half-pitch square, a foreign grid pad is at most
  // pitch / sqrt(2) away. Inside it, the greatest distance to the nearest
  // foreign pad occurs diagonally at the edge of the forbidden drill disk.
  // This bound covers every possible via center, without sampling or search.
  const drillExclusionRadiusMm = (pad.width + input.minViaHoleDiameter!) / 2
  const centralExclusionRadiusMm = Math.min(
    drillExclusionRadiusMm,
    pitch / Math.SQRT2,
  )
  const diagonalOffsetMm = centralExclusionRadiusMm / Math.SQRT2
  const maxForeignPadDistanceMm = Math.hypot(
    pitch - diagonalOffsetMm,
    diagonalOffsetMm,
  )
  return viaExclusionRadiusMm > maxForeignPadDistanceMm + 1e-7
}

/** A sufficient impossibility check for an enclosed surface ball. Other pad
 * arrangements, supplied escapes and uncertain geometry retain normal search. */
export function findBlockedPadEscape(
  input: SimpleRouteJson,
): Terminal | undefined {
  if (
    input.allowViaInPad !== false ||
    input.allowBlindAndBuriedVias !== false ||
    ![
      input.minTraceWidth,
      input.minViaPadDiameter,
      input.minViaHoleDiameter,
    ].every(
      (dimension) =>
        dimension !== undefined && Number.isFinite(dimension) && dimension > 0,
    )
  )
    return undefined
  for (const connection of input.connections) {
    for (const terminal of connection.pointsToConnect) {
      if (terminal.layers?.some((layer) => layer !== terminal.layer)) continue
      const pad = input.obstacles.find(
        (obstacle) =>
          obstacle.componentId &&
          obstacle.shape === "circle" &&
          Number.isFinite(obstacle.width) &&
          obstacle.width > 0 &&
          obstacle.width === obstacle.height &&
          obstacle.layers.length === 1 &&
          obstacle.layers[0] === terminal.layer &&
          ["top", "bottom"].includes(terminal.layer) &&
          obstacle.center.x === terminal.x &&
          obstacle.center.y === terminal.y &&
          obstacle.connectedTo.some(
            (owner) =>
              owner === terminal.pcb_port_id ||
              owner === terminal.pointId ||
              owner === connection.name ||
              owner === connection.source_trace_id,
          ),
      )
      if (pad && padEscapeIsBlocked({ input, connection, terminal, pad }))
        return terminal
    }
  }
  return undefined
}
