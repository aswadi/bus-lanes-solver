import type {
  Connection,
  Obstacle,
  Point,
  SimpleRouteJson,
  Terminal,
} from "./types"

type Disk = Point & { radius: number }
type Box = SimpleRouteJson["bounds"]

/** Prove coverage, never infer it from sampled via positions. Unresolved boxes
 * leave routing enabled. Coordinates and radii are board-world millimetres. */
function disksCoverBox(disks: Disk[], bounds: Box): boolean {
  const pending = [{ ...bounds, depth: 0 }]
  let visited = 0
  while (pending.length) {
    if (++visited > 1024) return false
    const box = pending.pop()!
    const covered = disks.some((disk) => {
      const dx = Math.max(
        Math.abs(box.minX - disk.x),
        Math.abs(box.maxX - disk.x),
      )
      const dy = Math.max(
        Math.abs(box.minY - disk.y),
        Math.abs(box.maxY - disk.y),
      )
      return Math.hypot(dx, dy) < disk.radius - 1e-7
    })
    if (covered) continue
    if (box.depth === 10) return false
    const midX = (box.minX + box.maxX) / 2
    const midY = (box.minY + box.maxY) / 2
    for (const [minX, maxX] of [
      [box.minX, midX],
      [midX, box.maxX],
    ])
      for (const [minY, maxY] of [
        [box.minY, midY],
        [midY, box.maxY],
      ])
        pending.push({ minX, maxX, minY, maxY, depth: box.depth + 1 })
  }
  return true
}

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
  const width = Math.min(
    input.minTraceWidth,
    connection.width ?? Infinity,
    connection.nominalTraceWidth ?? Infinity,
    ...(input.buses ?? [])
      .filter((bus) => bus.connectionNames.includes(connection.name))
      .map((bus) => bus.traceWidth ?? Infinity),
  )
  if (!Number.isFinite(width) || width <= 0) return false
  const disks: Disk[] = [
    {
      ...pad.center,
      radius: (pad.width + input.minViaHoleDiameter!) / 2,
    },
  ]
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
      disks.push({
        x,
        y,
        radius: radius + input.minViaPadDiameter! / 2 + clearance,
      })
    }
  }
  return disksCoverBox(disks, bounds)
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
