import "./fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace } from "circuit-json"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"
import { expectCompletedRouting } from "./fixtures/expect-completed-routing"

test("routes both real A13 CPU-side DDR bytes", async (): Promise<void> => {
  const input: SimpleRouteJson = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("./fixtures/a13-cpu-bytes/input.srj.json.gz", import.meta.url),
      ),
    ).toString("utf8"),
  )
  const circuit: AnyCircuitElement[] = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/a13-cpu-bytes/unrouted.circuit.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  )
  const original = structuredClone(input)
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  expectCompletedRouting(solver, original)
  circuit.push(...solver.traces.map((trace) => pcb_trace.parse(trace)))
  circuit.push({
    type: "pcb_note_text",
    pcb_note_text_id: "routing_status",
    pcb_group_id: "routing_status",
    text: `16/16 CPU-side DDR signals connected; DRC passed; ${solver.iterations} solver steps`,
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
}, 240000)
