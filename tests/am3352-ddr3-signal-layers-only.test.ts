import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"
import { expectCompletedRouting } from "./fixtures/expect-completed-routing"

/** The same AM3352 ZCZ to DDR3L board as the pair-gap reproduction, with the
 * DDR kept off the two plane layers of a signal/ground/signal/signal/power/
 * signal stack. Four carrier layers leave the 27-signal address/control group
 * needing about 270 mm of added copper; lanes need between 0 and 16 mm each. */
test("matches AM3352 DDR3 buses on the four signal layers of a six-layer stack", (): void => {
  const input: SimpleRouteJson = {
    ...JSON.parse(
      gunzipSync(
        readFileSync(
          new URL(
            "./fixtures/am3352-ddr3-pair-gap-at-clearance/input.srj.json.gz",
            import.meta.url,
          ),
        ),
      ).toString("utf8"),
    ),
    allowedLayers: ["top", "inner2", "inner3", "bottom"],
  }
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  expectCompletedRouting(solver, structuredClone(input))
  const carrierLayers = new Set(
    solver.traces.flatMap((trace) =>
      trace.route.flatMap((point) =>
        point.route_type === "wire" ? [point.layer] : [],
      ),
    ),
  )
  expect([...carrierLayers].sort()).toEqual([
    "bottom",
    "inner2",
    "inner3",
    "top",
  ])
}, 900000)
