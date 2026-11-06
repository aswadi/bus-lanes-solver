import type { ReactElement } from "react"
import source from "./native-source.json"
import { NativePart } from "./source-part"

const byte0 = source.traces.filter((trace) => trace.group === "byte0")
const byte0Names = new Set(byte0.map((trace) => trace.name))

/** Original board-world placements in mm: +X right, +Y up, +Z above. */
export default function A13CpuByte0(): ReactElement {
  return (
    <board
      title="A13 CPU-side DDR data byte"
      width={source.width}
      height={source.height}
      layers={source.layers}
      schematicDisabled
      routeRemaining={false}
      isViaInPadAllowed={false}
      minTraceWidth={Math.min(...source.rules.widths)}
      minTraceToPadEdgeClearance={source.rules.appliedGlobalClearance}
      minViaEdgeToPadEdgeClearance={source.rules.appliedGlobalClearance}
      minViaPadDiameter={source.rules.viaPad}
      minViaHoleDiameter={source.rules.viaDrill}
    >
      {source.parts.map((part) => (
        <NativePart key={part.name} part={part} />
      ))}
      <autoroutingphase
        name="cpu_byte0"
        phaseIndex={0}
        autorouter="bus_lanes"
        connections={[...byte0Names]}
      />
      {source.traces.map((trace) => {
        let routingPhaseIndex: number | undefined
        if (byte0Names.has(trace.name)) routingPhaseIndex = 0
        return (
          <trace
            key={trace.name}
            name={trace.name}
            path={trace.path}
            thickness={trace.width}
            routingPhaseIndex={routingPhaseIndex}
          />
        )
      })}
      <bus
        name="DDR_BUS_byte0"
        routingPhaseIndex={0}
        connections={[...byte0Names]}
        pcbAllowedLayers={source.signalLayers}
      />
      <pcbnotetext
        pcbY={source.height / 2 - 0.8}
        fontSize={0.5}
        text="A13: 8 CPU-side DDR data nets requested; all 378 pads retained"
      />
    </board>
  )
}
