import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { findBlockedPadEscape } from "../lib/find-blocked-pad-escape"
import type { SimpleRouteJson } from "../lib/types"
import { fixedCopper, VectorScene } from "../lib/vector-scene"

test("keeps A13 F2 in normal search when a legal escape can exist", (): void => {
  const input: SimpleRouteJson = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("./fixtures/a13-ram-byte0/input.srj.json.gz", import.meta.url),
      ),
    ).toString("utf8"),
  )
  const connection = input.connections.find(
    (candidate) => candidate.name === "source_trace_68",
  )!
  input.connections = [connection]
  input.buses = []
  const terminal = connection.pointsToConnect[1]

  // A smaller fabrication rule admits an actual interstitial via. The check
  // must not reject it even if the routing heuristic cannot find that escape.
  const smallerVia = structuredClone(input)
  smallerVia.minViaPadDiameter = 0.3
  smallerVia.minViaHoleDiameter = 0.15
  const via = { x: terminal.x - 0.4, y: terminal.y - 0.4 }
  const scene = new VectorScene(
    smallerVia,
    connection,
    0.3,
    fixedCopper(smallerVia),
  )
  expect(scene.visible(via, via)).toBe(true)
  expect(Math.hypot(via.x - terminal.x, via.y - terminal.y)).toBeGreaterThan(
    0.2 + 0.15 / 2,
  )
  expect(findBlockedPadEscape(smallerVia)).toBeUndefined()

  const smallerViaClearance = structuredClone(input)
  smallerViaClearance.minViaEdgeToPadEdgeClearance = 0.1
  expect(findBlockedPadEscape(smallerViaClearance)).toBeUndefined()

  const viaInPad = structuredClone(input)
  viaInPad.allowViaInPad = true
  expect(findBlockedPadEscape(viaInPad)).toBeUndefined()

  // Supplied escapes are immutable and may have been fabricated with a
  // different policy. Do not infer an impossible new escape from their pads.
  const suppliedEscape = structuredClone(input)
  suppliedEscape.traces = [
    {
      type: "pcb_trace",
      pcb_trace_id: "existing_escape",
      connection_name: connection.name,
      route: [
        {
          route_type: "via",
          x: terminal.x,
          y: terminal.y,
          from_layer: "top",
          to_layer: "bottom",
          via_diameter: 0.45,
          via_hole_diameter: 0.3,
        },
      ],
    },
  ]
  expect(findBlockedPadEscape(suppliedEscape)).toBeUndefined()
  const multilayer = structuredClone(input)
  multilayer.connections[0].pointsToConnect[1].layers = ["top", "bottom"]
  expect(findBlockedPadEscape(multilayer)).toBeUndefined()
})
