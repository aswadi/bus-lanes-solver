import { socPins } from "./am3352"
import { ramPins, ramNetOfSignal } from "./ddr3"

export const ddrSignalNets = [
  ...Array.from({ length: 16 }, (_, i) => `DDR_D${i}`),
  "DDR_DQS0",
  "DDR_DQSn0",
  "DDR_DQS1",
  "DDR_DQSn1",
  "DDR_DQM0",
  "DDR_DQM1",
  ...Array.from({ length: 16 }, (_, i) => `DDR_A${i}`),
  "DDR_BA0",
  "DDR_BA1",
  "DDR_BA2",
  "DDR_CK",
  "DDR_CKn",
  "DDR_CKE",
  "DDR_CSn0",
  "DDR_RASn",
  "DDR_CASn",
  "DDR_WEn",
  "DDR_ODT",
  "DDR_RESETn",
]

export const byteNets = (b: number) => [
  ...Array.from({ length: 8 }, (_, i) => `DDR_D${b * 8 + i}`),
  `DDR_DQM${b}`,
  `DDR_DQS${b}`,
  `DDR_DQSn${b}`,
]
export const addrCtrlNets = [
  ...Array.from({ length: 16 }, (_, i) => `DDR_A${i}`),
  "DDR_BA0",
  "DDR_BA1",
  "DDR_BA2",
  "DDR_CK",
  "DDR_CKn",
  "DDR_CKE",
  "DDR_CSn0",
  "DDR_RASn",
  "DDR_CASn",
  "DDR_WEn",
  "DDR_ODT",
]

export const socPinOfNet = (net: string) => {
  const p = socPins.find((p) => p.signal === net)
  if (!p) throw new Error(`no SoC ball for ${net}`)
  return p.pin
}
export const ramPinOfNet = (net: string) => {
  const p = ramPins.find((p) => ramNetOfSignal(p.signal) === net)
  if (!p) throw new Error(`no RAM ball for ${net}`)
  return p.pin
}

/**
 * Point-to-point DDR3 traces between SoC `soc` and RAM `ram`, with timing
 * groups. TI SPRS717 DDR3 guidance: 25 mil skew inside a byte lane and inside
 * the address/control group, 5 mil inside each differential pair.
 */
export const DdrChannel = ({
  soc = "U1",
  ram = "U2",
  phase,
  nets = ddrSignalNets,
  byteSkew = 0.635,
  addrSkew = 0.635,
  pairSkew = 0.127,
  pairGap = 0.1,
  traceWidth,
  layers,
  constraints = true,
  addrBus = true,
}: {
  addrBus?: boolean
  soc?: string
  ram?: string
  phase?: number
  nets?: string[]
  byteSkew?: number
  addrSkew?: number
  pairSkew?: number
  pairGap?: number
  traceWidth?: number
  layers?: Partial<Record<"BYTE0" | "BYTE1" | "ADDR_CTRL", string[]>>
  constraints?: boolean
}) => {
  const has = (n: string) => nets.includes(n)
  const busProps = (name: "BYTE0" | "BYTE1" | "ADDR_CTRL") => ({
    ...(traceWidth ? { pcbTraceWidth: traceWidth } : {}),
    ...(layers?.[name] ? { pcbAllowedLayers: layers[name] as any } : {}),
  })
  return (
    <>
      {nets.map((net) => (
        <trace
          key={net}
          name={net}
          from={`.${soc} > .pin${socPinOfNet(net)}`}
          to={`.${ram} > .pin${ramPinOfNet(net)}`}
          {...(phase !== undefined ? { routingPhaseIndex: phase } : {})}
        />
      ))}
      {constraints &&
        [0, 1].map((b) =>
          byteNets(b).every(has) ? (
            <group key={b}>
              <bus
                name={`DDR_BYTE${b}`}
                connections={byteNets(b)}
                maxLengthSkew={byteSkew}
                {...busProps(`BYTE${b}` as any)}
              />
              <differentialpair
                name={`DDR_DQS${b}_PAIR`}
                positiveConnection={`DDR_DQS${b}`}
                negativeConnection={`DDR_DQSn${b}`}
                maxLengthSkew={pairSkew}
                pcbTraceGap={pairGap}
              />
            </group>
          ) : null,
        )}
      {constraints && addrBus && addrCtrlNets.every(has) && (
        <>
          <bus
            name="DDR_ADDR_CTRL"
            connections={addrCtrlNets}
            maxLengthSkew={addrSkew}
            {...busProps("ADDR_CTRL")}
          />
          <differentialpair
            name="DDR_CK_PAIR"
            positiveConnection="DDR_CK"
            negativeConnection="DDR_CKn"
            maxLengthSkew={pairSkew}
            pcbTraceGap={pairGap}
          />
        </>
      )}
    </>
  )
}
