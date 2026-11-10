import "./fixtures/pcb-snapshot"
import { expect, spyOn, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace } from "circuit-json"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"
import * as boardOutline from "../lib/board-outline"
import { expectCompletedRouting } from "./fixtures/expect-completed-routing"

test("routes H616 byte0 with every full-board obstacle and the native outline", async () => {
  const input: SimpleRouteJson = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/h616-full-board-byte0/input.srj.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  )
  const circuit: AnyCircuitElement[] = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/h616-full-board-byte0/unrouted.circuit.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  )
  const original = structuredClone(input)
  expect(input.obstacles).toHaveLength(760)
  expect(input.outline).toHaveLength(34)
  expect(input.connections).toHaveLength(8)
  const solver = new BusLanesPipelineSolver(input)
  let boardPointChecks = 0
  let boardSegmentChecks = 0
  const originalBoardSegmentIsClear = boardOutline.boardSegmentIsClear
  const predicate = spyOn(
    boardOutline,
    "boardSegmentIsClear",
  ).mockImplementation((query): boolean => {
    if (query.start.x === query.end.x && query.start.y === query.end.y)
      boardPointChecks++
    else boardSegmentChecks++
    // Count the work without retaining millions of mock call arguments.
    if ((boardPointChecks + boardSegmentChecks) % 10_000 === 0)
      predicate.mockClear()
    return originalBoardSegmentIsClear(query)
  })
  const started = performance.now()
  try {
    solver.solve()
  } finally {
    predicate.mockRestore()
  }
  console.log(
    `H616 full-board byte0 duration=${((performance.now() - started) / 1000).toFixed(3)}s iterations=${solver.iterations} boardPointChecks=${boardPointChecks} boardSegmentChecks=${boardSegmentChecks}`,
  )
  expectCompletedRouting(solver, original)
  expect(solver.traces).toHaveLength(8)
  expect(
    solver.traces.every((trace) =>
      boardOutline.traceStaysInsideOutline(input, trace),
    ),
  ).toBe(true)
  circuit.push(...solver.traces.map((trace) => pcb_trace.parse(trace)))
  for (const [index, text] of [
    "8/8 signals connected; DRC passed",
    `Outline point checks: ${boardPointChecks}`,
  ].entries())
    circuit.push({
      type: "pcb_note_text",
      pcb_note_text_id: `routing_metrics_${index}`,
      pcb_group_id: "routing_metrics",
      text,
      anchor_position: { x: 0, y: 39 - index * 1.5 },
      font: "tscircuit2024",
      layer: "top",
      font_size: 0.65,
      anchor_alignment: "center",
    })
  await expect(circuit).toMatchPcbSnapshot({
    testPath: import.meta.path,
    svgOptions: {
      width: 900,
      height: 1600,
      backgroundColor: "white",
      showSolderMask: false,
      shouldDrawRatsNest: false,
      viewport: { minX: -14.5, maxX: 14.5, minY: -37, maxY: 41 },
    },
  })
}, 180_000)
