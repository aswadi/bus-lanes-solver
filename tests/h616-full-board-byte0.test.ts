import "./fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace } from "circuit-json"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"
import { traceStaysInsideOutline } from "../lib/board-outline"
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
  const started = performance.now()
  solver.solve()
  console.log(
    `H616 full-board byte0 duration=${((performance.now() - started) / 1000).toFixed(3)}s iterations=${solver.iterations}`,
  )
  expectCompletedRouting(solver, original)
  expect(solver.traces).toHaveLength(8)
  expect(
    solver.traces.every((trace) => traceStaysInsideOutline(input, trace)),
  ).toBe(true)
  circuit.push(...solver.traces.map((trace) => pcb_trace.parse(trace)))
  await expect(circuit).toMatchPcbSnapshot({
    testPath: import.meta.path,
    svgOptions: {
      width: 900,
      height: 1600,
      backgroundColor: "white",
      showSolderMask: false,
      shouldDrawRatsNest: false,
    },
  })
}, 120_000)
