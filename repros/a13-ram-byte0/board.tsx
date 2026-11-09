import type { ReactElement } from "react"
import source from "../a13-cpu-byte0/native-source.json"
import { NativePart } from "../a13-cpu-byte0/source-part"

const ramByte0 = source.traces.filter((trace) => trace.group === "ram_byte0")
const ramByte0Names = new Set(ramByte0.map((trace) => trace.name))
const padClearance = source.rules.appliedGlobalClearance

/** Original board-world placements in mm: +X right, +Y up, +Z above. */
export default function A13RamByte0(): ReactElement {
  return (
    <board
      title="A13 RAM-side DDR data byte"
      width={source.width}
      height={source.height}
      layers={source.layers}
      schematicDisabled
      routeRemaining={false}
      isViaInPadAllowed={false}
      minTraceWidth={Math.min(...source.rules.widths)}
      minTraceToPadEdgeClearance={padClearance}
      minViaEdgeToPadEdgeClearance={padClearance}
      minViaPadDiameter={source.rules.viaPad}
      minViaHoleDiameter={source.rules.viaDrill}
    >
      {source.parts.map((part) => (
        <NativePart key={part.name} part={part} />
      ))}
      <autoroutingphase
        name="ram_byte0"
        phaseIndex={0}
        autorouter="bus_lanes"
        connections={[...ramByte0Names]}
      />
      {source.traces.map((trace) => {
        let routingPhaseIndex: number | undefined
        if (ramByte0Names.has(trace.name)) routingPhaseIndex = 0
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
        name="DDR_BUS_ram_byte0"
        routingPhaseIndex={0}
        connections={[...ramByte0Names]}
        pcbAllowedLayers={source.signalLayers}
      />
      <pcbnotetext
        pcbY={source.height / 2 - 0.8}
        fontSize={0.5}
        text="A13: 8 RAM-side DDR data nets requested; all 378 pads retained"
      />
    </board>
  )
}
