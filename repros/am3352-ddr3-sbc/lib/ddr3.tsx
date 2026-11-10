import type { ChipProps } from "@tscircuit/props"
import { MT41K256M16TW_107_P } from "../imports/MT41K256M16TW_107_P"

/** JEDEC 96-ball x16 DDR3 map: row -> signals for columns 1,2,3,7,8,9 */
const rows: Record<string, string[]> = {
  A: ["VDDQ", "DQ13", "DQ15", "DQ12", "VDDQ", "VSS"],
  B: ["VSSQ", "VDD", "VSS", "DQSUn", "DQ14", "VSSQ"],
  C: ["VDDQ", "DQ11", "DQ9", "DQSU", "DQ10", "VDDQ"],
  D: ["VSSQ", "VDDQ", "DMU", "DQ8", "VSSQ", "VDD"],
  E: ["VSS", "VSSQ", "DQ0", "DML", "VSSQ", "VDDQ"],
  F: ["VDDQ", "DQ2", "DQSL", "DQ1", "DQ3", "VSSQ"],
  G: ["VSSQ", "DQ6", "DQSLn", "VDD", "VSS", "VSSQ"],
  H: ["VREFDQ", "VDDQ", "DQ4", "DQ7", "DQ5", "VDDQ"],
  J: ["NC", "VSS", "RASn", "CK", "VSS", "NC"],
  K: ["ODT", "VDD", "CASn", "CKn", "VDD", "CKE"],
  L: ["NC", "CSn", "WEn", "ADDR10", "ZQ", "NC"],
  M: ["VSS", "BA0", "BA2", "ADDR15", "VREFCA", "VSS"],
  N: ["VDD", "ADDR3", "ADDR0", "ADDR12", "BA1", "VDD"],
  P: ["VSS", "ADDR5", "ADDR2", "ADDR1", "ADDR4", "VSS"],
  R: ["VDD", "ADDR7", "ADDR9", "ADDR11", "ADDR6", "VDD"],
  T: ["VSS", "RESETn", "ADDR13", "ADDR14", "ADDR8", "VSS"],
}
const ROWS = "ABCDEFGHJKLMNPRT"
const COLS = [1, 2, 3, 7, 8, 9]

/** The JLC import numbers pins column-major: pin1=A1, pin2=B1 ... pin17=A2 */
export const ramPins = Array.from({ length: 96 }, (_, i) => {
  const pin = i + 1
  const row = ROWS[i % 16]!
  const colIndex = Math.floor(i / 16)
  const ball = `${row}${COLS[colIndex]}`
  const signal = rows[row]![colIndex]!
  return { pin, ball, signal }
})
const counts: Record<string, number> = {}
for (const p of ramPins) counts[p.signal] = (counts[p.signal] ?? 0) + 1
export const ramPinLabels = Object.fromEntries(
  ramPins.map((p) => [
    `pin${p.pin}`,
    [counts[p.signal]! > 1 ? `${p.signal}_${p.ball}` : p.signal],
  ]),
)

/** Board net carried by a RAM signal (undefined = leave unconnected) */
export const ramNetOfSignal = (s: string): string | undefined => {
  if (s === "NC") return undefined
  if (s === "VSS" || s === "VSSQ") return "GND"
  if (s === "VDD" || s === "VDDQ") return "VDD_DDR"
  if (s === "VREFDQ" || s === "VREFCA") return "DDR_VREF"
  if (s === "ZQ") return "DDR_ZQ"
  if (/^DQ\d+$/.test(s)) return `DDR_D${s.slice(2)}`
  if (/^ADDR\d+$/.test(s)) return `DDR_A${s.slice(4)}`
  if (/^BA\d$/.test(s)) return `DDR_${s}`
  return (
    {
      DQSL: "DDR_DQS0",
      DQSLn: "DDR_DQSn0",
      DQSU: "DDR_DQS1",
      DQSUn: "DDR_DQSn1",
      DML: "DDR_DQM0",
      DMU: "DDR_DQM1",
      CK: "DDR_CK",
      CKn: "DDR_CKn",
      CKE: "DDR_CKE",
      CSn: "DDR_CSn0",
      RASn: "DDR_RASn",
      CASn: "DDR_CASn",
      WEn: "DDR_WEn",
      ODT: "DDR_ODT",
      RESETn: "DDR_RESETn",
    } as Record<string, string>
  )[s]
}

/** MT41K256M16 (4Gb x16 DDR3L). The JLC import's labels collide (ball A1 is
 * "A11", address A1 is "A12"), so labels are regenerated from the JEDEC map. */
export const DDR3 = (props: ChipProps<any>) => (
  <MT41K256M16TW_107_P {...(props as any)} pinLabels={ramPinLabels as any} />
)
