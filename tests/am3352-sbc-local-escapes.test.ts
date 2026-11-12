import { expect, test } from "bun:test"
import { validateRoutedCopperDrc } from "@tscircuit/fanout-solver"
import { initialSignalDogbones } from "../lib/initial-signal-dogbones"
import { routeAlternateSignalDogbones } from "../lib/alternate-signal-dogbones"
import { signalDogboneOptions } from "../lib/repair-bus-dogbones"
import { loadAm3352SbcSample } from "../scripts/am3352-sbc-sample"

// Keep this a true via-blockage fixture: bottom copper underneath a top stub
// alone is not a reason to fall back. Occupy all four adjacent via sites.
function loadBlockedViaSample() {
  const input = loadAm3352SbcSample("benchmark")
  const source = input.connections.find((c) => c.name === "source_trace_3")!
    .pointsToConnect[0]!
  for (const dx of [-0.4, 0.4])
    for (const dy of [-0.4, 0.4])
      input.obstacles.push({
        type: "rect",
        center: { x: source.x + dx, y: source.y + dy },
        width: 0.1,
        height: 0.1,
        layers: ["bottom"],
        connectedTo: [],
      })
  return input
}

test("full SBC keeps a pad on top when bottom components block every local via site", () => {
  const input = loadBlockedViaSample()
  const original = structuredClone(input)
  const targets = new Map(input.connections.map((c) => [c.name, "bottom"]))
  const options = signalDogboneOptions(input, targets)
  expect(() => routeAlternateSignalDogbones(input, options, 0)).toThrow(
    "No collision-free local dogbone assignment",
  )
  const result = initialSignalDogbones(input, options, 0)
  expect(result.connections).toHaveLength(47)
  const blocked = result.connections.find((c) => c.name === "source_trace_3")!
  expect(
    blocked.pointsToConnect.map((p) => ("layer" in p ? p.layer : undefined)),
  ).toEqual(["top", "top"])
  expect(
    result.traces.filter((t) => t.connection_name === blocked.name),
  ).toEqual([])
  expect(
    result.connections
      .filter((c) => c.name !== blocked.name)
      .every((c) =>
        c.pointsToConnect.every(
          (p) => ("layer" in p ? p.layer : undefined) === "bottom",
        ),
      ),
  ).toBe(true)
  expect(input).toEqual(original)
  expect(targets.get(blocked.name)).toBe("bottom")
}, 30_000)

test("blocked bottom escapes cannot fall back to a forbidden top layer", () => {
  const input = loadBlockedViaSample()
  input.allowedLayers = ["bottom"]
  const options = signalDogboneOptions(
    input,
    new Map(input.connections.map((c) => [c.name, "bottom"])),
  )
  expect(() => initialSignalDogbones(input, options, 0)).toThrow(
    "No collision-free local dogbone assignment",
  )
}, 30_000)

test("native-layer fallback keeps differential partners on the same layer", () => {
  const input = loadBlockedViaSample()
  input.differentialPairs = [
    {
      connectionNames: ["source_trace_3", "source_trace_4"],
      lengthTolerance: 0.127,
    },
  ]
  const result = initialSignalDogbones(
    input,
    signalDogboneOptions(
      input,
      new Map(input.connections.map((c) => [c.name, "bottom"])),
    ),
    0,
  )
  for (const name of input.differentialPairs[0].connectionNames) {
    expect(
      result.connections
        .find((c) => c.name === name)!
        .pointsToConnect.map((p) => ("layer" in p ? p.layer : undefined)),
    ).toEqual(["top", "top"])
    expect(result.traces.filter((t) => t.connection_name === name)).toEqual([])
  }
}, 30_000)

test("bottom pads under top stubs do not force native-layer fallback", () => {
  const input = loadAm3352SbcSample("benchmark")
  const original = structuredClone(input)
  const result = routeAlternateSignalDogbones(
    input,
    signalDogboneOptions(
      input,
      new Map(input.connections.map((c) => [c.name, "bottom"])),
    ),
    0,
  )
  expect(result.traces).toHaveLength(94)
  expect(
    result.connections.every((c) =>
      c.pointsToConnect.every((p) => "layer" in p && p.layer === "bottom"),
    ),
  ).toBe(true)
  expect(input).toEqual(original)
  // Supplied ground copper belongs to a plane net, not to fabricated signal
  // endpoints. Include its ownership when checking every fixed and new trace.
  const context = {
    ...input,
    connections: [
      ...input.connections,
      ...[...new Set(input.traces?.map((t) => t.connection_name!))].map(
        (name) => ({ name, pointsToConnect: [] }),
      ),
    ],
  }
  const report = validateRoutedCopperDrc({
    inputSrj: context as Parameters<
      typeof validateRoutedCopperDrc
    >[0]["inputSrj"],
    routedSrj: {
      ...context,
      traces: [...(input.traces ?? []), ...result.traces],
    } as Parameters<typeof validateRoutedCopperDrc>[0]["routedSrj"],
    clearance: input.minTraceToPadEdgeClearance!,
  })
  expect(report.issues).toEqual([])
}, 30_000)
