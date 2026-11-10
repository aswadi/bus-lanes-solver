import "../fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../../lib"
import { pointSegmentDistance } from "../../lib/geometry"
import { expectCompletedRouting } from "../fixtures/expect-completed-routing"
import { nativePairCircuit } from "../fixtures/native-pair-circuit"

const viaCenter = { x: 0, y: 0 }
const padDiameter = 1
const clearance = 0.075
const traceWidth = 0.1

function routePastVia({
  viaDiameter,
  boardDiameter,
  signalY = 0.35,
}: {
  viaDiameter?: number
  boardDiameter?: number
  signalY?: number
}) {
  const groundStart = { x: 0, y: -1.2, layer: "top" }
  const groundEnd = { x: 1, y: -1, layer: "bottom" }
  const input: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: traceWidth,
    minViaPadDiameter: boardDiameter,
    minTraceToPadEdgeClearance: clearance,
    bounds: { minX: -4, maxX: 4, minY: -2, maxY: 2 },
    obstacles: [],
    connections: [
      {
        name: "SIG",
        pointsToConnect: [
          { x: -3, y: signalY, layer: "top" },
          { x: 3, y: signalY, layer: "top" },
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
  const gap =
    distanceToCenter - ((viaDiameter ?? boardDiameter ?? 0.3) + traceWidth) / 2
  return { input, solver, gap }
}

test("an omitted fixed-via diameter keeps the same clearance as the explicit control", async () => {
  const control = routePastVia({
    viaDiameter: padDiameter,
    boardDiameter: padDiameter,
  })
  expectCompletedRouting(control.solver, control.input)
  const { input, solver, gap } = routePastVia({ boardDiameter: padDiameter })
  expect(gap).toBeGreaterThanOrEqual(clearance - 1e-8)
  expectCompletedRouting(solver, input)
  expect(solver.traces).toEqual(control.solver.traces)
  const circuit = nativePairCircuit({ input, traces: solver.traces })
  circuit.push({
    type: "pcb_note_text",
    pcb_note_text_id: "via_clearance_result",
    pcb_group_id: "via_clearance_result",
    text: `DRC PASS   SIG to GND via clearance ${gap.toFixed(6)} mm`,
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

test("a larger explicit via pad takes precedence over the board minimum", () => {
  const { input, solver, gap } = routePastVia({
    viaDiameter: 1.4,
    boardDiameter: padDiameter,
  })
  expect(gap).toBeGreaterThanOrEqual(clearance - 1e-8)
  expectCompletedRouting(solver, input)
})

test("a fixed via keeps its 0.3 mm default when both diameters are omitted", () => {
  const { solver, gap } = routePastVia({ signalY: 0.2 })
  expect(gap).toBeGreaterThanOrEqual(clearance - 1e-8)
  expect(solver.traces).toEqual(
    routePastVia({ viaDiameter: 0.3, signalY: 0.2 }).solver.traces,
  )
})
