import { expect, test } from "bun:test"
import { validateRoutedCopperDrc } from "@tscircuit/fanout-solver"
import { BusLanesPipelineSolver } from "../lib/bus-lanes-pipeline-solver"
import { busLengthReports } from "../lib/route-lengths"
import type { SimpleRouteJson, Trace } from "../lib/types"

function makePairBusInput(options?: {
  preferredLayers?: string[]
  preferredLayer?: string
  allowedLayers?: string[]
  globalAllowedLayers?: string[]
  extraSignals?: number
}): SimpleRouteJson {
  const signalCount = 2 + (options?.extraSignals ?? 0)
  const cols = Math.max(3, signalCount + 1)
  const pitch = 1.0
  const obstacles: SimpleRouteJson["obstacles"] = []
  const connections: SimpleRouteJson["connections"] = []

  const signalNames = Array.from({ length: signalCount }, (_, i) =>
    i === 0 ? "DQS1" : i === 1 ? "DQSn1" : `DQ${i - 2}`,
  )

  for (const [componentId, baseY] of [
    ["U1", 4.0],
    ["U2", -4.8],
  ] as const) {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < cols; col++) {
        const x = (col - (cols - 1) / 2) * pitch
        const y = baseY + row * pitch
        const connectedSignal =
          col < signalCount &&
          ((componentId === "U1" && row === col % 2) ||
            (componentId === "U2" && row === 1))
            ? signalNames[col]
            : undefined
        obstacles.push({
          type: "rect",
          shape: "circle",
          componentId,
          center: { x, y },
          width: 0.4,
          height: 0.4,
          layers: ["top"],
          connectedTo: connectedSignal ? [connectedSignal] : [],
        })
      }
    }
  }

  for (const name of signalNames) {
    const pads = obstacles.filter((o) => o.connectedTo.includes(name))
    connections.push({
      name,
      pointsToConnect: pads.map((pad) => ({
        x: pad.center.x,
        y: pad.center.y,
        layer: "top",
      })),
    })
  }

  return {
    layerCount: 4,
    ...(options?.globalAllowedLayers
      ? { allowedLayers: options.globalAllowedLayers }
      : {}),
    minTraceWidth: 0.1,
    minViaPadDiameter: 0.3,
    minViaHoleDiameter: 0.15,
    minTraceToPadEdgeClearance: 0.1,
    bounds: { minX: -8, maxX: 8, minY: -8, maxY: 8 },
    connections,
    obstacles,
    buses: [
      {
        busId: "DQS_PAIR",
        connectionNames: signalNames,
        allowedLayers: options?.allowedLayers ?? ["top", "bottom"],
        maxLengthSkew: 0.127,
        ...(options?.preferredLayers
          ? { preferredLayers: options.preferredLayers }
          : {}),
        ...(options?.preferredLayer
          ? { preferredLayer: options.preferredLayer }
          : {}),
      },
    ],
    traces: [],
  }
}

function dominantWireLayer(trace: Trace): string {
  const byLayer = new Map<string, number>()
  for (let i = 0; i + 1 < trace.route.length; i++) {
    const a = trace.route[i]
    const b = trace.route[i + 1]
    if (
      a.route_type === "wire" &&
      b.route_type === "wire" &&
      a.layer === b.layer
    ) {
      const segLen = Math.hypot(b.x - a.x, b.y - a.y)
      byLayer.set(a.layer, (byLayer.get(a.layer) ?? 0) + segLen)
    }
  }
  return [...byLayer.entries()].sort((a, b) => b[1] - a[1])[0]![0]
}

test("2-connection skew-matched bus honors preferredLayers while preserving zero-via default when unpreferred", () => {
  const unpreferred = makePairBusInput()
  const unpreferredSolver = new BusLanesPipelineSolver(unpreferred)
  unpreferredSolver.solve()
  expect(unpreferredSolver.solved).toBe(true)
  for (const trace of unpreferredSolver.traces) {
    expect(dominantWireLayer(trace)).toBe("top")
    expect(trace.route.filter((p) => p.route_type === "via")).toHaveLength(0)
  }

  const bottomPreferred = makePairBusInput({ preferredLayers: ["bottom"] })
  const bottomSolver = new BusLanesPipelineSolver(bottomPreferred)
  bottomSolver.solve()
  expect(bottomSolver.solved).toBe(true)
  expect(bottomSolver.stats.carrierStrategy).toBe("preferred")
  for (const trace of bottomSolver.traces) {
    expect(dominantWireLayer(trace)).toBe("bottom")
    expect(trace.route.filter((p) => p.route_type === "via")).toHaveLength(2)
  }
  expect(
    busLengthReports(bottomPreferred, bottomSolver.traces).every(
      (report) => report.matched,
    ),
  ).toBe(true)
  expect(
    validateRoutedCopperDrc({
      inputSrj: bottomPreferred,
      routedSrj: bottomSolver.getOutput(),
      clearance: 0.1,
      allowBlindAndBuriedVias: false,
    } as Parameters<typeof validateRoutedCopperDrc>[0]).issues,
  ).toEqual([])
})

test("coupled traces in multi-signal buses stay on preferredLayers without diverging across carriers, and fall back when blocked", () => {
  const multiBus = makePairBusInput({
    globalAllowedLayers: ["top", "inner1", "bottom"],
    allowedLayers: ["top", "inner1", "bottom"],
    preferredLayers: ["bottom"],
    extraSignals: 2,
  })
  const multiSolver = new BusLanesPipelineSolver(multiBus)
  multiSolver.solve()
  expect(multiSolver.solved).toBe(true)
  expect(multiSolver.traces).toHaveLength(4)
  for (const trace of multiSolver.traces) {
    expect(dominantWireLayer(trace)).toBe("bottom")
  }
  expect(
    busLengthReports(multiBus, multiSolver.traces).every(
      (report) => report.matched,
    ),
  ).toBe(true)

  const blockedBottom = makePairBusInput({ preferredLayers: ["bottom"] })
  blockedBottom.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 18,
    height: 1,
    layers: ["bottom"],
    connectedTo: [],
  })
  const fallbackSolver = new BusLanesPipelineSolver(blockedBottom)
  fallbackSolver.solve()
  expect(fallbackSolver.solved).toBe(true)
  expect(fallbackSolver.stats.carrierStrategy).toBe("native_fallback")
  for (const trace of fallbackSolver.traces) {
    expect(dominantWireLayer(trace)).toBe("top")
  }
})
