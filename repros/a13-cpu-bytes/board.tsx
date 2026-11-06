import type { ReactElement } from "react"
import source from "../a13-cpu-byte0/native-source.json"
import { NativePart } from "../a13-cpu-byte0/source-part"

const bytes = ["byte0", "byte1"]
const connections = source.traces.filter((trace) => bytes.includes(trace.group))
const connectionNames = connections.map((trace) => trace.name)

/** Original board-world placements in mm: +X right, +Y up, +Z above. */
export default function A13CpuBytes(): ReactElement {
  return (
    <board
      title="A13 CPU-side DDR data bytes"
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
        name="cpu_bytes_joint"
        phaseIndex={0}
        autorouter="bus_lanes"
        connections={connectionNames}
      />
      {source.traces.map((trace) => {
        let routingPhaseIndex: number | undefined
        if (connectionNames.includes(trace.name)) routingPhaseIndex = 0
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
      {bytes.map((byte) => (
        <bus
          key={byte}
          name={`DDR_BUS_${byte}`}
          routingPhaseIndex={0}
          connections={connections
            .filter((trace) => trace.group === byte)
            .map((trace) => trace.name)}
          pcbAllowedLayers={source.signalLayers}
        />
      ))}
      <pcbnotetext
        pcbY={source.height / 2 - 0.8}
        fontSize={0.5}
        text="A13: 16 CPU-side DDR data nets requested; all 378 pads retained"
      />
    </board>
  )
}
