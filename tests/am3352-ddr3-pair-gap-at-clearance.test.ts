import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { BusLanesPipelineSolver, type SimpleRouteJson } from "../lib"
import { expectCompletedRouting } from "./fixtures/expect-completed-routing"

/** AM3352 ZCZ to a 96-ball DDR3L placed 21 mm below it on six layers: 0.36 mm
 * lands, 0.4/0.2 mm vias, 0.1 mm trace and clearance. Two byte lanes and the
 * address/control group are matched to 0.635 mm; DQS0, DQS1 and CK are coupled
 * pairs whose 0.1 mm gap equals the board clearance. */
test("matches AM3352 DDR3 buses when the pair gap equals the board clearance", (): void => {
  const input: SimpleRouteJson = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/am3352-ddr3-pair-gap-at-clearance/input.srj.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  )
  expect(input.differentialPairs?.map((pair) => pair.traceGap)).toEqual([
    input.minTraceToPadEdgeClearance,
    input.minTraceToPadEdgeClearance,
    input.minTraceToPadEdgeClearance,
  ])
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  expectCompletedRouting(solver, structuredClone(input))
}, 300000)
