import "./fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace } from "circuit-json"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"
import { expectCompletedRouting } from "./fixtures/expect-completed-routing"

test("routes the real A13 RAM byte with five-mil pad clearance", async (): Promise<void> => {
  const input: SimpleRouteJson = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("./fixtures/a13-ram-byte0/input.srj.json.gz", import.meta.url),
      ),
    ).toString("utf8"),
  )
  const circuit: AnyCircuitElement[] = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/a13-ram-byte0/unrouted.circuit.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  )
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  expectCompletedRouting(solver, input)
  circuit.push(...solver.traces.map((trace) => pcb_trace.parse(trace)))
  circuit.push({
    type: "pcb_note_text",
    pcb_note_text_id: "routing_status",
    pcb_group_id: "routing_status",
    text: "COMPLETED: 8/8 RAM signals; 0.127 mm pad clearance; DRC passed",
    anchor_position: { x: 2, y: 14 },
    font: "tscircuit2024",
    layer: "top",
    font_size: 0.45,
    anchor_alignment: "center",
  })
  await expect(circuit).toMatchPcbSnapshot({
    testPath: import.meta.path,
    svgOptions: {
      backgroundColor: "white",
      width: 1200,
      height: 1000,
      viewport: { minX: -14, maxX: 20, minY: -12, maxY: 16 },
      shouldDrawErrors: false,
      shouldDrawRatsNest: false,
      showErrorsInTextOverlay: false,
    },
  })
}, 180000)
