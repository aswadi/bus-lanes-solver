import {
  distance,
  pointSegmentDistanceToPoints,
  segmentDistance,
} from "./geometry"
import type { Point, SimpleRouteJson, Trace } from "./types"

const epsilon = 1e-9

/** Accept an open or explicitly closed, simple polygon in board-world mm. */
export function boardOutlineError(outline?: Point[]): string | undefined {
  if (!outline?.length) return
  if (outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return "Board outline contains a nonfinite point"
  const ring = outline.filter(
    (p, i) => !i || distance(p, outline[i - 1]) > epsilon,
  )
  if (ring.length > 1 && distance(ring[0], ring.at(-1)!) <= epsilon) ring.pop()
  if (ring.length < 3) return "Board outline needs at least three vertices"
  const origin = ring[0]
  const area = ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]
    return (
      sum +
      (p.x - origin.x) * (q.y - origin.y) -
      (q.x - origin.x) * (p.y - origin.y)
    )
  }, 0)
  if (Math.abs(area) <= epsilon) return "Board outline has no enclosed area"
  for (let i = 0; i < ring.length; i++)
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue
      if (
        segmentDistance(
          [ring[i], ring[(i + 1) % ring.length]],
          [ring[j], ring[(j + 1) % ring.length]],
        ) <= epsilon
      )
        return "Board outline must be a simple polygon"
    }
}

function inside(point: Point, ring: Point[]) {
  let contained = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i]
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      contained = !contained
  }
  return contained
}

/** Test the entire copper capsule, including concave cutouts and edge clearance.
 * Endpoints alone cannot detect a segment that exits and reenters the board. */
export function boardSegmentIsClear({
  input,
  start,
  end,
  copperRadiusMm,
}: {
  input: SimpleRouteJson
  start: Point
  end: Point
  copperRadiusMm: number
}) {
  const margin = copperRadiusMm + (input.minBoardEdgeClearance ?? 0),
    r = input.bounds
  if (
    [start, end].some(
      (p) =>
        p.x < r.minX + margin - epsilon ||
        p.x > r.maxX - margin + epsilon ||
        p.y < r.minY + margin - epsilon ||
        p.y > r.maxY - margin + epsilon,
    )
  )
    return false
  const ring = input.outline
  if (!ring?.length) return true
  if (start.x === end.x && start.y === end.y)
    return (
      inside(start, ring) &&
      ring.every(
        (p, i) =>
          pointSegmentDistanceToPoints(start, p, ring[(i + 1) % ring.length]) >=
          margin - epsilon,
      )
    )
  if (!inside(start, ring) || !inside(end, ring)) return false
  return ring.every(
    (p, i) =>
      segmentDistance([start, end], [p, ring[(i + 1) % ring.length]]) >=
      margin - epsilon,
  )
}

/** Check generated pad approaches and via lands as well as carrier traces. */
export function traceStaysInsideOutline(input: SimpleRouteJson, trace: Trace) {
  if (!input.outline?.length) return true
  for (const [i, point] of trace.route.entries()) {
    const radius =
      point.route_type === "via"
        ? (point.via_diameter ?? input.minViaPadDiameter ?? 0.3) / 2
        : point.width / 2
    if (
      !boardSegmentIsClear({
        input: input,
        start: point,
        end: point,
        copperRadiusMm: radius,
      })
    )
      return false
    const previous = trace.route[i - 1]
    if (!previous) continue
    const wire =
      point.route_type === "wire"
        ? point
        : previous.route_type === "wire"
          ? previous
          : undefined
    if (
      wire &&
      !boardSegmentIsClear({
        input: input,
        start: previous,
        end: point,
        copperRadiusMm:
          Math.max(
            wire.width,
            previous.route_type === "wire" ? previous.width : wire.width,
          ) / 2,
      })
    )
      return false
  }
  return true
}
