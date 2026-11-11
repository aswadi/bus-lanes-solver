import "bun-match-svg"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import {
  validateOriginalEndpointConnectivity,
  validateRoutedCopperDrc,
} from "@tscircuit/fanout-solver"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { BusLanesPipelineSolver, BusLanesSolver } from "../../lib"
import { GridVisibilitySearch } from "../../lib/grid-visibility"
import type { Connection, SimpleRouteJson } from "../../lib/types"
import { fixedCopper, VectorScene } from "../../lib/vector-scene"

test("ButterStick RAM branches leave the native UDM pin reachable", async (): Promise<void> => {
  const { inputSrj, physicalInputSrj, futureConnection } = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "../fixtures/butterstick-branch-attachment.srj.json.gz",
          import.meta.url,
        ),
      ),
    ).toString(),
  ) as {
    inputSrj: SimpleRouteJson
    physicalInputSrj: SimpleRouteJson
    futureConnection: Connection
  }
  const original = structuredClone(inputSrj)
  const solver = new BusLanesPipelineSolver(inputSrj)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.error).toBeNull()
  expect(inputSrj).toEqual(original)

  const output = {
    ...physicalInputSrj,
    traces: [...physicalInputSrj.traces!, ...solver.traces],
  }
  const context = { inputSrj: physicalInputSrj, routedSrj: output }
  const connectivity = validateOriginalEndpointConnectivity(context)
  expect(connectivity.connectedConnectionCount).toBe(16)
  expect(connectivity.connectedEndpointCount).toBe(48)
  expect(connectivity.valid).toBe(true)
  expect(
    validateRoutedCopperDrc({
      ...context,
      clearance: inputSrj.minTraceToPadEdgeClearance,
      allowBlindAndBuriedVias: false,
    }).issues,
  ).toEqual([])
  const futureInput = {
    ...output,
    connections: [...output.connections, futureConnection],
  }
  const graphics = new BusLanesSolver(futureInput).visualize()
  graphics.title = "ButterStick: sixteen completed DDR nets, UDM still pending"
  await expect(
    getSvgFromGraphicsObject(graphics, { backgroundColor: "white" }),
  ).toMatchSvgSnapshot(import.meta.path)

  const scene = new VectorScene(
    futureInput,
    futureConnection,
    futureConnection.width!,
    fixedCopper(futureInput),
  )
  const [start, end] = futureConnection.pointsToConnect
  const search = new GridVisibilitySearch(scene, start, end, [], 0, undefined, {
    allTerminalAttachments: true,
    checkReachability: true,
  })
  try {
    while (!search.solved && !search.failed) search.step()
    expect(search.solved).toBe(true)
  } finally {
    search.cancel()
  }
})
