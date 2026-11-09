import "./fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import type { AnyCircuitElement } from "circuit-json"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"

test("reports the real A13 RAM byte with no legal F2 escape", async (): Promise<void> => {
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
  const solver = new BusLanesPipelineSolver(input, {
    maxSearchIterations: 1000,
  })
  solver.solve()
  circuit.push({
    type: "pcb_note_text",
    pcb_note_text_id: "routing_status",
    pcb_group_id: "routing_status",
    text: `UNROUTABLE: 0/8 RAM signals; ${solver.failureCode}`,
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
  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
  expect(solver.traces).toEqual([])
  expect(solver.input).toEqual(input)
  expect(solver.failureCode).toBe("blocked_pad_escape")
  expect(solver.iterations).toBe(0)
})
