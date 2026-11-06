import "./fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace } from "circuit-json"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"
import { expectCompletedRouting } from "./fixtures/expect-completed-routing"

test("routes the real A13 CPU-side DDR byte beside its rotated pads", async (): Promise<void> => {
  const input: SimpleRouteJson = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("./fixtures/a13-cpu-byte0/input.srj.json.gz", import.meta.url),
      ),
    ).toString("utf8"),
  )
  const circuit: AnyCircuitElement[] = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/a13-cpu-byte0/unrouted.circuit.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  )
  const original = structuredClone(input)
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  let caption = "FAILED BASELINE: 0/8 CPU-side DDR data signals connected"
  if (solver.solved) {
    expectCompletedRouting(solver, original)
    circuit.push(...solver.traces.map((trace) => pcb_trace.parse(trace)))
    caption = "COMPLETED: 8/8 CPU-side DDR data signals connected; DRC passed"
  }
  circuit.push({
    type: "pcb_note_text",
    pcb_note_text_id: "routing_status",
    pcb_group_id: "routing_status",
    text: caption,
    anchor_position: { x: 8, y: 18.4 },
    font: "tscircuit2024",
    layer: "top",
    font_size: 0.5,
    anchor_alignment: "center",
  })
  await expect(circuit).toMatchPcbSnapshot({
    testPath: import.meta.path,
    svgOptions: {
      backgroundColor: "white",
      width: 1400,
      height: 1000,
      viewport: { minX: -15, maxX: 32, minY: -19, maxY: 22 },
      shouldDrawErrors: false,
      shouldDrawRatsNest: false,
      showErrorsInTextOverlay: false,
    },
  })
  expect(solver.error).toBeNull()
  expect(solver.solved).toBe(true)
})
