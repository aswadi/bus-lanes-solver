import { expect, test } from "bun:test"
import { initialSignalDogbones } from "../lib/initial-signal-dogbones"
import { signalDogboneOptions } from "../lib/repair-bus-dogbones"
import { loadAm3352SbcSample } from "../scripts/am3352-sbc-sample"

test("omitted global layers preserve native escape choices and explicit bus restrictions", () => {
  const implicit = loadAm3352SbcSample("benchmark")
  // A layer restriction should reject a genuinely blocked via escape, not
  // a top stub that merely passes over bottom-layer copper.
  const source = implicit.connections.find((c) => c.name === "source_trace_3")!
    .pointsToConnect[0]!
  for (const dx of [-0.4, 0.4])
    for (const dy of [-0.4, 0.4])
      implicit.obstacles.push({
        type: "rect",
        center: { x: source.x + dx, y: source.y + dy },
        width: 0.1,
        height: 0.1,
        layers: ["bottom"],
        connectedTo: [],
      })
  delete implicit.allowedLayers
  const before = structuredClone(implicit)
  const explicit = structuredClone(implicit)
  explicit.allowedLayers = ["top", "inner1", "inner2", "bottom"]
  const targets = new Map(implicit.connections.map((c) => [c.name, "bottom"]))
  const implicitResult = initialSignalDogbones(
    implicit,
    signalDogboneOptions(implicit, targets),
    0,
  )
  const explicitResult = initialSignalDogbones(
    explicit,
    signalDogboneOptions(explicit, targets),
    0,
  )
  expect(implicitResult).toEqual(explicitResult)
  expect(implicit).toEqual(before)
  expect([...targets.values()].every((layer) => layer === "bottom")).toBe(true)
  implicit.buses = [
    {
      busId: "bottom_only",
      connectionNames: implicit.connections.map((c) => c.name),
      allowedLayers: ["bottom"],
    },
  ]
  expect(() =>
    initialSignalDogbones(implicit, signalDogboneOptions(implicit, targets), 0),
  ).toThrow("No collision-free local dogbone assignment")
}, 30_000)
