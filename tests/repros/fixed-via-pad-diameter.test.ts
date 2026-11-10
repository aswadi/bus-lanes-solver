import "../fixtures/pcb-snapshot"
import {
  validateOriginalEndpointConnectivity,
  validateRoutedCopperDrc,
} from "@tscircuit/fanout-solver"
import { expect, test } from "bun:test"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../../lib"
import { pointSegmentDistance } from "../../lib/geometry"
import {
  expectCompletedRouting,
  nativeRoutingValidationInputs,
} from "../fixtures/expect-completed-routing"
import { nativePairCircuit } from "../fixtures/native-pair-circuit"

const viaCenter = { x: 0, y: 0 }
const padDiameter = 1
const clearance = 0.075
const traceWidth = 0.1

function routePastVia(viaDiameter?: number) {
  const groundStart = { x: 0, y: -1.2, layer: "top" }
  const groundEnd = { x: 1, y: -1, layer: "bottom" }
  const input: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: traceWidth,
    minViaPadDiameter: padDiameter,
    minTraceToPadEdgeClearance: clearance,
    bounds: { minX: -4, maxX: 4, minY: -2, maxY: 2 },
    obstacles: [],
    connections: [
      {
        name: "SIG",
        pointsToConnect: [
          { x: -3, y: 0.35, layer: "top" },
          { x: 3, y: 0.35, layer: "top" },
        ],
      },
    ],
    traces: [
      {
        type: "pcb_trace",
        pcb_trace_id: "fixed-ground-via",
        connection_name: "GND",
        route: [
          { route_type: "wire", ...groundStart, width: traceWidth },
          { route_type: "wire", ...viaCenter, layer: "top", width: traceWidth },
          {
            route_type: "via",
            ...viaCenter,
            from_layer: "top",
            to_layer: "bottom",
            ...(viaDiameter !== undefined && { via_diameter: viaDiameter }),
          },
          {
            route_type: "wire",
            ...viaCenter,
            layer: "bottom",
            width: traceWidth,
          },
          { route_type: "wire", ...groundEnd, width: traceWidth },
        ],
      },
    ],
  }

  const solver = new BusLanesPipelineSolver(input, {
    fanout: "none",
    singleCarrier: {
      fixedConnections: [
        {
          name: "GND",
          pointsToConnect: [groundStart, groundEnd],
        },
      ],
    },
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.traces).toHaveLength(1)
  const route = solver.traces[0].route
  expect(route.length).toBeGreaterThanOrEqual(2)
  const distanceToCenter = Math.min(
    ...route
      .slice(1)
      .map((point, i) => pointSegmentDistance(viaCenter, [route[i], point])),
  )
  const gap = distanceToCenter - ((viaDiameter ?? padDiameter) + traceWidth) / 2
  return { input, solver, gap }
}

test("an explicit 1 mm fixed via leaves room for the signal", () => {
  const { input, solver, gap } = routePastVia(padDiameter)
  expect(gap).toBeGreaterThanOrEqual(clearance - 1e-8)
  expectCompletedRouting(solver, input)
})

test("an omitted fixed-via diameter currently lets the signal overlap its land", async () => {
  const { input, solver, gap } = routePastVia()
  expect(gap).toBeCloseTo(-0.2, 8)
  const native = nativeRoutingValidationInputs(solver)
  expect(validateOriginalEndpointConnectivity(native).valid).toBe(true)
  const drc = validateRoutedCopperDrc({ ...native, clearance })
  expect(drc.valid).toBe(false)
  expect(drc.issues).toEqual([
    expect.objectContaining({
      code: "different-net-trace-via-clearance",
      connectionName: "GND",
      otherConnectionName: "SIG",
      layer: "top",
    }),
  ])
  const circuit = nativePairCircuit({ input, traces: solver.traces })
  circuit.push({
    type: "pcb_note_text",
    pcb_note_text_id: "via_clearance_result",
    pcb_group_id: "via_clearance_result",
    text: `DRC FAIL   SIG overlaps GND via by ${Math.abs(gap).toFixed(3)} mm`,
    anchor_position: { x: 0, y: -1.65 },
    anchor_alignment: "center",
    layer: "top",
    font: "tscircuit2024",
    font_size: 0.18,
  })
  await expect(circuit).toMatchPcbSnapshot({
    testPath: import.meta.path,
    svgOptions: {
      width: 900,
      height: 450,
      showSolderMask: false,
      viewport: { minX: -4.3, maxX: 4.3, minY: -2.15, maxY: 2.15 },
    },
  })
})
