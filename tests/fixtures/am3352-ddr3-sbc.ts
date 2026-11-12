import "./layered-pcb-snapshot"
import { expect } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace } from "circuit-json"
import {
  BusLanesPipelineSolver,
  type Connection,
  type SimpleRouteJson,
} from "../../lib"
import { busLengthReports, pairLengthReports } from "../../lib/route-lengths"
import { expectCompletedRouting } from "./expect-completed-routing"

const layers = ["top", "inner1", "inner2", "inner3", "inner4", "bottom"]

function load<T>(fixture: string, file: string): T {
  return JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(`./am3352-ddr3-sbc-${fixture}/${file}`, import.meta.url),
      ),
    ).toString("utf8"),
  )
}

/** Route the DDR3 phase of the full AM3352 SBC with the RAM `spacingMm` below
 * the SoC, and record one board view per copper layer. A failed solve records
 * the unrouted board with a FAILED BASELINE caption and no candidate copper;
 * DDR copper is drawn only after every acceptance check has passed. */
export async function routeAm3352Ddr3Sbc({
  fixture,
  spacingMm,
  testPath,
  comparePicture = true,
}: {
  /** Directory suffix under tests/fixtures/am3352-ddr3-sbc-. */
  fixture: string
  /** SoC centre to RAM centre, mm. */
  spacingMm: number
  testPath: string
  /** False for a capture whose copper is not reproducible across x64
   * machines. Its picture is then only written, on request, after all
   * acceptance checks pass (BUN_UPDATE_SNAPSHOTS=1), and never compared. */
  comparePicture?: boolean
}): Promise<void> {
  const input = load<SimpleRouteJson>(fixture, "input.srj.json.gz")
  const circuit = load<AnyCircuitElement[]>(fixture, "unrouted.circuit.json.gz")
  const original = structuredClone(input)
  const signals = input.connections.length
  const fixedVias = (input.traces ?? []).flatMap((trace) =>
    trace.route.filter((point) => point.route_type === "via"),
  ).length
  expect(signals).toBe(50)
  expect(input.obstacles.length).toBeGreaterThan(700)
  expect(fixedVias).toBe(259)
  const busLayers = input.buses?.[0]?.allowedLayers

  const solver = new BusLanesPipelineSolver(input)
  solver.solve()

  const netName = new Map(
    circuit.flatMap((element) =>
      element.type === "source_trace" && element.name
        ? [[element.source_trace_id, element.name] as const]
        : [],
    ),
  )
  const matched = new Set(input.buses?.flatMap((bus) => bus.connectionNames))
  const unmatched = input.connections
    .filter((connection) => !matched.has(connection.name))
    .map((connection) => netName.get(connection.name) ?? connection.name)
  let title = `FAILED BASELINE: 0/${signals} DDR3 signals routed`
  const lines = [
    `AM3352 SBC, RAM ${spacingMm} mm below the SoC, six layers, ${input.obstacles.length} pad and hole obstacles, ${fixedVias} fixed plane-fanout vias`,
    busLayers
      ? `Matched DDR buses limited to ${busLayers.join(", ")}, unmatched and unrestricted: ${unmatched.join(", ")}`
      : "DDR allowed on all six layers",
  ]
  if (solver.solved) {
    // The earlier phases' plane fanouts are supplied copper of other nets.
    // Each one is owned by its pad, so the independent connectivity and
    // copper DRC checks cover the DDR routes together with all 259 of them.
    const fanoutOwners: Connection[] = (input.traces ?? []).map((trace) => {
      const pad = trace.route[0]
      if (pad.route_type !== "wire") throw Error("Fanout must start at a pad")
      return {
        name: trace.connection_name!,
        source_trace_id: trace.connection_name!,
        pointsToConnect: [{ x: pad.x, y: pad.y, layer: pad.layer }],
      }
    })
    expectCompletedRouting(solver, original, fanoutOwners)
    circuit.push(...solver.traces.map((trace) => pcb_trace.parse(trace)))
    const copper = new Map<string, number>()
    for (const trace of solver.traces)
      for (const [index, point] of trace.route.entries()) {
        const next = trace.route[index + 1]
        if (
          point.route_type !== "wire" ||
          next?.route_type !== "wire" ||
          next.layer !== point.layer
        )
          continue
        copper.set(
          point.layer,
          (copper.get(point.layer) ?? 0) +
            Math.hypot(next.x - point.x, next.y - point.y),
        )
      }
    title = `COMPLETED: ${signals}/${signals} DDR3 signals routed, connectivity and copper DRC passed`
    lines.push(
      `Bus skew ${busLengthReports(input, solver.traces)
        .map((report) => report.skewMm!.toFixed(3))
        .join(" / ")} mm (limit 0.635), pair skew ${pairLengthReports(
        input,
        solver.traces,
      )
        .map((report) => report.skewMm!.toFixed(3))
        .join(" / ")} mm (limit 0.127)`,
      `DDR copper per layer, mm: ${layers
        .map((layer) => `${layer} ${(copper.get(layer) ?? 0).toFixed(0)}`)
        .join(", ")}`,
    )
  } else {
    lines.push(
      `Solver error: ${String(solver.error)
        .replace(/^(Error: )+/, "")
        .replace(/source_trace_\d+/g, (id) => netName.get(id) ?? id)
        .slice(0, 110)}`,
    )
  }

  // The job log records the outcome whether or not a picture is compared.
  console.log([title, ...lines].join("\n"))

  // The lane search takes a different path on other JavaScriptCore builds
  // (macOS arm64 completes the same boards with different copper), so the
  // picture is compared on the CI platform only. Every check above and below
  // runs everywhere.
  const recording =
    Boolean(process.env.BUN_UPDATE_SNAPSHOTS) ||
    process.argv.includes("--update-snapshots") ||
    process.argv.includes("-u")
  if (
    process.platform === "linux" &&
    process.arch === "x64" &&
    (comparePicture || recording)
  )
    await expect(circuit).toMatchLayeredPcbSnapshot({
      testPath,
      title,
      lines,
      layers: [
        { layer: "top", label: "top" },
        { layer: "inner1", label: "inner1 (GND plane layer)" },
        { layer: "inner2", label: "inner2" },
        { layer: "inner3", label: "inner3" },
        { layer: "inner4", label: "inner4 (power plane layer)" },
        { layer: "bottom", label: "bottom" },
      ],
      viewport: { minX: -13.5, maxX: 12.5, minY: -spacingMm - 8.5, maxY: 9.5 },
    })
  expect(solver.error).toBeNull()
  expect(solver.solved).toBe(true)
}
