import "./fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import {
  validateOriginalEndpointConnectivity,
  validateRoutedCopperDrc,
} from "@tscircuit/fanout-solver"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace, pcb_via } from "circuit-json"
import {
  BusLanesPipelineSolver,
  type Connection,
  type SimpleRouteJson,
} from "../lib"
import { expectCompletedRouting } from "./fixtures/expect-completed-routing"

test("routes H616 byte1 without changing the completed first byte", async (): Promise<void> => {
  const { input, fixedConnections, circuit } = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("./fixtures/h616-preloaded-byte1.json.gz", import.meta.url),
      ),
    ).toString("utf8"),
  ) as {
    input: SimpleRouteJson
    fixedConnections: Connection[]
    circuit: AnyCircuitElement[]
  }
  const original = structuredClone(input)
  const solver = new BusLanesPipelineSolver(input, {
    singleCarrier: { fixedConnections },
  })
  solver.solve()
  expect(input).toEqual(original)
  expect(input.connections).toHaveLength(8)
  expect(input.traces).toHaveLength(8)
  if (solver.solved) {
    expectCompletedRouting(solver, original)
    expect(solver.traces).toHaveLength(8)
  }
  // The failed baseline shows only the supplied, previously completed byte.
  const traces = solver.solved ? solver.getOutput().traces! : input.traces!
  if (!solver.solved) {
    const native = {
      ...input,
      connections: fixedConnections,
      traces: traces.map((trace) => {
        if (!trace.connection_name) throw Error("Missing supplied-copper owner")
        return { ...trace, connection_name: trace.connection_name }
      }),
      obstacles: input.obstacles.map((pad) => ({
        ...pad,
        type: "rect" as const,
      })),
    }
    const context = { inputSrj: native, routedSrj: native }
    expect(validateOriginalEndpointConnectivity(context).valid).toBe(true)
    expect(
      validateRoutedCopperDrc({
        ...context,
        clearance:
          input.minTraceToPadEdgeClearance ??
          input.defaultObstacleMargin ??
          0.075,
      }).valid,
    ).toBe(true)
  }
  circuit.push(...traces.map((trace) => pcb_trace.parse(trace)))
  for (const trace of traces)
    for (const [index, point] of trace.route.entries())
      if (point.route_type === "via")
        circuit.push(
          pcb_via.parse({
            type: "pcb_via",
            pcb_via_id: `${trace.pcb_trace_id}_via_${index}`,
            pcb_trace_id: trace.pcb_trace_id,
            x: point.x,
            y: point.y,
            outer_diameter: point.via_diameter,
            hole_diameter: point.via_hole_diameter,
            layers: point.layers ?? [point.from_layer, point.to_layer],
          }),
        )
  circuit.push({
    type: "pcb_note_text",
    pcb_note_text_id: "routing_status",
    pcb_group_id: "routing_status",
    text: solver.solved
      ? "16/16 DDR signals connected; byte 0 unchanged; DRC passed"
      : "FAILED: 0/8 new routes accepted; only 8 supplied routes shown",
    anchor_position: { x: 1.5, y: 19 },
    font: "tscircuit2024",
    layer: "top",
    font_size: 0.45,
    anchor_alignment: "center",
  })
  await expect(circuit).toMatchPcbSnapshot({
    testPath: import.meta.path,
    svgOptions: {
      backgroundColor: "white",
      width: 1400,
      height: 1000,
      viewport: { minX: -11, maxX: 14, minY: 1, maxY: 21 },
      shouldDrawErrors: false,
      shouldDrawRatsNest: false,
      showErrorsInTextOverlay: false,
    },
  })
  expect(solver.error).toBeNull()
  expect(solver.solved).toBe(true)
}, 120_000)
