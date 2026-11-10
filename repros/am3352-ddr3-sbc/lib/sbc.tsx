import { AM3352, socPins } from "./am3352"
import { DDR3, ramPins, ramNetOfSignal } from "./ddr3"
import { DdrChannel, ddrSignalNets, ramPinOfNet } from "./ddr-channel"
import { TPS65217CRSLR } from "../imports/TPS65217CRSLR"
import { TF_01A } from "../imports/TF_01A"
import { TYPE_C_31_M_12 } from "../imports/TYPE_C_31_M_12"
import { X322524MOB4SI } from "../imports/X322524MOB4SI"
import { TS_1187A_B_A_B } from "../imports/TS_1187A_B_A_B"

export type SbcOptions = {
  /** SoC-to-RAM centre distance, mm */
  dist?: number
  ramX?: number
  /** how the 49 DDR signals are routed */
  ddr?: "bus_lanes" | "global" | "none"
  ddrLayers?: string[]
  /** escape plane nets with the fanout router */
  planeFanout?: boolean
  /** where SoC decoupling sits */
  caps?: "under" | "ring" | "none"
  /** route everything that is not DDR / plane */
  routeRest?: boolean
  /** include everything that is not SoC + RAM */
  peripherals?: boolean
  channel?: any
  /**
   * Phase order. soc/ram/parts = plane fanout for that group's supply pins,
   * ddr = DDR signals, rest = everything else with the default router.
   */
  phases?: Array<"soc" | "ram" | "parts" | "ddr" | "rest">
  /** also hand the plane nets to the default router in the rest phase */
  planeNetsInRest?: boolean
  effort?: string
  boardProps?: any
  /** regex: only these selectors join the parts fanout / these are left out */
  partsOnly?: string
  partsSkip?: string
  /** fan out every connected non-DDR SoC ball in the soc phase, not only plane balls */
  socAll?: boolean
  /** regex of net names left out of the rest phase */
  restSkip?: string
}

const PLANE_NETS = ["GND", "VDD_DDR", "VDD_3V3A"]
const DDR_SET = new Set(ddrSignalNets)

/** Board net for each AM3352 signal; undefined = not connected */
const socNetOfSignal = (s: string): string | undefined => {
  if (DDR_SET.has(s)) return undefined // handled by DdrChannel
  if (/^VSS/.test(s) || s === "VREFN" || s === "RTC_KALDO_ENn") return "GND"
  if (s === "VDD_CORE" || s === "VDD_MPU") return s
  if (s === "VDDS_DDR") return "VDD_DDR"
  if (/^VDDSHV\d$/.test(s) || /^VDDA3P3V_USB/.test(s)) return "VDD_3V3A"
  if (s === "VDDS_RTC") return "VDD_RTC"
  if (
    /^VDDS/.test(s) ||
    /^VDDA1P8V/.test(s) ||
    s === "VDDA_ADC" ||
    s === "VREFP"
  )
    return "VDD_1V8"
  if (/^CAP_/.test(s) || s === "DDR_VREF" || s === "DDR_VTP") return s
  if (/^LCD_DATA\d+$/.test(s)) return `SYSBOOT${s.slice(8)}`
  if (/^GPMC_A[5-8]$/.test(s)) return `LED${Number(s.slice(6)) - 5}`
  if (/^GPMC_AD(8|9|1\d)$/.test(s)) return s
  const direct = [
    "PWRONRSTn",
    "RTC_PWRONRSTn",
    "PMIC_POWER_EN",
    "EXT_WAKEUP",
    "EXTINTn",
    "WARMRSTn",
    "I2C0_SDA",
    "I2C0_SCL",
    "XTALIN",
    "XTALOUT",
    "MMC0_CLK",
    "MMC0_CMD",
    "MMC0_DAT0",
    "MMC0_DAT1",
    "MMC0_DAT2",
    "MMC0_DAT3",
    "UART0_RXD",
    "UART0_TXD",
    "USB0_DP",
    "USB0_DM",
    "TRSTn",
    "SPI0_SCLK",
    "SPI0_D0",
    "SPI0_D1",
    "SPI0_CS0",
    "UART1_TXD",
    "UART1_RXD",
    "AIN0",
    "AIN1",
    "AIN7",
  ]
  if (direct.includes(s)) return s
  if (s === "SPI0_CS1") return "SD_CD"
  if (s === "USB0_VBUS") return "VBUS"
  return undefined
}

// SYSBOOT[15:0] = 0100 0000 0001 1000 : 24 MHz crystal, boot order SPI0/MMC0/USB0/UART0
const SYSBOOT = 0b0100000000011000

export const Sbc = ({
  dist = 22,
  ramX = -1.2,
  ddr = "bus_lanes",
  ddrLayers,
  planeFanout = true,
  caps = "ring",
  routeRest = true,
  peripherals = true,
  channel = {},
  phases,
  planeNetsInRest = false,
  effort,
  boardProps = {},
  partsOnly,
  partsSkip,
  socAll,
  restSkip,
}: SbcOptions) => {
  const order =
    phases ??
    ([
      ...(planeFanout ? ["soc", "ram"] : []),
      ...(ddr !== "none" ? ["ddr"] : []),
      ...(planeFanout && peripherals ? ["parts"] : []),
      ...(routeRest ? ["rest"] : []),
    ] as NonNullable<SbcOptions["phases"]>)
  const ph = (name: string) =>
    order.indexOf(name as any) >= 0 ? order.indexOf(name as any) : undefined
  const PH_DDR = ph("ddr")
  const PH_REST = ph("rest")
  const planePins: Record<"soc" | "ram" | "parts" | "holes", string[]> = {
    soc: [],
    ram: [],
    parts: [],
    holes: [],
  }
  const nets = new Set<string>()
  const els: any[] = []
  let k = 0
  /** connect a port selector to a net */
  const conn = (from: string, net: string) => {
    nets.add(net)
    if (socAll && /^\.U1 /.test(from) && !PLANE_NETS.includes(net))
      planePins.soc.push(from)
    if (PLANE_NETS.includes(net)) {
      const owner = /^\.U1 /.test(from)
        ? "soc"
        : /^\.U2 /.test(from)
          ? "ram"
          : /^\.(J1|J2) |^\.USB1 > \.EH|^\.U3 > \.EP/.test(from) ||
              (partsOnly && !new RegExp(partsOnly).test(from)) ||
              (partsSkip && new RegExp(partsSkip).test(from))
            ? "holes"
            : "parts"
      planePins[owner].push(from)
    }
    els.push(<trace key={`t${k++}`} from={from} to={`net.${net}`} />)
  }
  const cap = (
    name: string,
    value: string,
    a: string,
    b: string,
    x: number,
    y: number,
    o: any = {},
  ) => {
    els.push(
      <capacitor
        key={name}
        name={name}
        capacitance={value}
        footprint={o.fp ?? "0402"}
        pcbX={x}
        pcbY={y}
        layer={o.layer ?? "top"}
        schX={0}
        schY={0}
      />,
    )
    conn(`.${name} > .pin1`, a)
    conn(`.${name} > .pin2`, b)
  }
  const res = (
    name: string,
    value: string,
    a: string,
    b: string,
    x: number,
    y: number,
    o: any = {},
  ) => {
    els.push(
      <resistor
        key={name}
        name={name}
        resistance={value}
        footprint={o.fp ?? "0402"}
        pcbX={x}
        pcbY={y}
        layer={o.layer ?? "top"}
      />,
    )
    conn(`.${name} > .pin1`, a)
    conn(`.${name} > .pin2`, b)
  }

  // ---------------- SoC + RAM pins ----------------
  for (const p of socPins) {
    const net = socNetOfSignal(p.signal)
    if (net && (peripherals || PLANE_NETS.includes(net)))
      conn(`.U1 > .pin${p.pin}`, net)
  }
  const ramY = -dist
  for (const p of ramPins) {
    const net = ramNetOfSignal(p.signal)
    if (!net || DDR_SET.has(net)) continue
    if (peripherals || PLANE_NETS.includes(net)) conn(`.U2 > .pin${p.pin}`, net)
  }

  if (peripherals) {
    // ---------------- SoC decoupling ----------------
    const socCaps: Array<[string, string]> = [
      ...Array(8).fill(["VDD_CORE", "100nF"]),
      ...Array(4).fill(["VDD_MPU", "100nF"]),
      ...Array(8).fill(["VDD_3V3A", "100nF"]),
      ...Array(8).fill(["VDD_1V8", "100nF"]),
      ["VDD_RTC", "100nF"],
      ["CAP_VDD_RTC", "1uF"],
      ["CAP_VDD_SRAM_CORE", "1uF"],
      ["CAP_VDD_SRAM_MPU", "1uF"],
      ["CAP_VBB_MPU", "1uF"],
      ["DDR_VREF", "100nF"],
    ] as any
    if (caps !== "none") {
      const slots: Array<[number, number]> = []
      if (caps === "under") {
        // bottom side, directly under the power balls in the BGA centre
        for (let r = 0; r < 7; r++)
          for (let c = 0; c < 6; c++) slots.push([-6 + c * 2.4, 3.9 - r * 1.3])
      } else {
        // bottom side, ring just outside the BGA via field (north, west, east)
        for (let i = 0; i < 9; i++)
          slots.push([-8 + i * 2, 9.2], [-8 + i * 2, 10.4])
        for (let i = 0; i < 8; i++)
          slots.push(
            [-9.6, 7 - i * 1.3],
            [9.6, 7 - i * 1.3],
            [-11.6, 7 - i * 1.3],
          )
      }
      socCaps.forEach(([net, value], i) => {
        const [x, y] = slots[i]!
        cap(`C${101 + i}`, value, net, "GND", x, y, { layer: "bottom" })
      })
    }
    // VDDS_DDR decoupling sits inside the VDD_DDR plane zone, flanking the DDR balls
    ;[
      [-9, -4.6],
      [-9, -5.9],
      [-9, -7.2],
      [8, -5.6],
      [8, -6.9],
      [8, -8.2],
    ].forEach(([x, y], i) =>
      cap(`C${150 + i}`, "100nF", "VDD_DDR", "GND", x!, y!, {
        layer: "bottom",
      }),
    )
    for (const [i, net] of [
      "VDD_DDR",
      "VDD_CORE",
      "VDD_MPU",
      "VDD_3V3A",
      "VDD_1V8",
    ].entries())
      cap(`C${60 + i}`, "10uF", net, "GND", -13.5, -6.2 + i * 2.2, {
        fp: "0805",
      })
    res("R1", "49.9", "DDR_VTP", "GND", -0.4, -8.7, { layer: "bottom" })
    res("R2", "4.7k", "TRSTn", "GND", -9.5, 12.6)

    // ---------------- RAM support ----------------
    for (let i = 0; i < 8; i++)
      cap(
        `C${70 + i}`,
        "100nF",
        "VDD_DDR",
        "GND",
        ramX - 7 + i * 2,
        ramY - 5.4,
        { layer: "bottom" },
      )
    cap("C78", "10uF", "VDD_DDR", "GND", ramX + 10.2, ramY + 1.5, {
      fp: "0805",
    })
    cap("C79", "10uF", "VDD_DDR", "GND", ramX + 10.2, ramY - 1.5, {
      fp: "0805",
    })
    res("R3", "1k", "VDD_DDR", "DDR_VREF", ramX - 10.5, ramY + 2.5)
    res("R4", "1k", "DDR_VREF", "GND", ramX - 10.5, ramY + 1)
    cap("C80", "100nF", "DDR_VREF", "GND", ramX - 10.5, ramY - 0.5)
    cap("C81", "100nF", "DDR_VREF", "GND", ramX - 10.5, ramY - 2)
    res("R5", "240", "DDR_ZQ", "GND", ramX - 2, ramY - 5.4)
    // Pull-downs tap the point-to-point DDR traces at the RAM ball. They cannot use
    // net.DDR_RESETn: a <trace name="X"> between two pins does not create or join net.X.
    res("R6", "10k", "DDR_RESETn_PD", "GND", ramX - 10.5, ramY - 3.5)
    els.push(
      <trace
        key="resetpd"
        from=".R6 > .pin1"
        to={`.U2 > .pin${ramPinOfNet("DDR_RESETn")}`}
        {...(PH_REST !== undefined ? { routingPhaseIndex: PH_REST } : {})}
      />,
    )
    if (channel.ckePulldown) {
      res("R7", "10k", "DDR_CKE_PD", "GND", ramX + 2, ramY - 5.4)
      els.push(
        <trace
          key="ckepd"
          from=".R7 > .pin1"
          to={`.U2 > .pin${ramPinOfNet("DDR_CKE")}`}
          {...(PH_REST !== undefined ? { routingPhaseIndex: PH_REST } : {})}
        />,
      )
    }

    // ---------------- PMIC ----------------
    const PX = -24,
      PY = 4
    els.push(<TPS65217CRSLR key="U3" name="U3" pcbX={PX} pcbY={PY} />)
    const pm = (pin: string, net: string) => conn(`.U3 > .${pin}`, net)
    for (const [pin, net] of Object.entries({
      VLDO2: "VDD_3V3A",
      VINLDO: "SYS_5V",
      VLDO1: "VDD_RTC",
      BAT1: "VBAT",
      BAT2: "VBAT",
      BAT_SENSE: "VBAT",
      SYS1: "SYS_5V",
      SYS2: "SYS_5V",
      PWR_EN: "PMIC_POWER_EN",
      AC: "VBUS",
      TS: "PMIC_TS",
      USB: "GND",
      nWAKEUP: "EXT_WAKEUP",
      MUX_OUT: "AIN7",
      VIO: "VDD_3V3A",
      VDCDC1: "VDD_DDR",
      L1: "SW_DDR",
      VIN_DCDC1: "SYS_5V",
      VIN_DCDC2: "SYS_5V",
      L2: "SW_MPU",
      VDCDC2: "VDD_MPU",
      PB_IN: "PMIC_PB",
      PGOOD: "PWRONRSTn",
      SDA: "I2C0_SDA",
      SCL: "I2C0_SCL",
      VDCDC3: "VDD_CORE",
      PGND: "GND",
      L3: "SW_CORE",
      VIN_DCDC3: "SYS_5V",
      ISINK2: "GND",
      ISINK1: "GND",
      ISET1: "GND",
      ISET2: "GND",
      FB_WLED: "GND",
      LS1_IN: "SYS_5V",
      LS1_OUT: "VDD_1V8",
      AGND: "GND",
      LS2_IN: "SYS_5V",
      LS2_OUT: "VDD_3V3B",
      nRESET: "WARMRSTn",
      nINT: "EXTINTn",
      LDO_PGOOD: "RTC_PWRONRSTn",
      BYPASS: "PMIC_BYPASS",
      INT_LDO: "PMIC_INT_LDO",
      EP: "GND",
    }))
      pm(pin, net)
    const ind = (name: string, a: string, b: string, x: number, y: number) => {
      els.push(
        <inductor
          key={name}
          name={name}
          inductance="2.2uH"
          footprint="0805"
          pcbX={x}
          pcbY={y}
        />,
      )
      conn(`.${name} > .pin1`, a)
      conn(`.${name} > .pin2`, b)
    }
    ind("L1", "SW_DDR", "VDD_DDR", PX + 7, PY - 1.2)
    cap("C54", "10uF", "VDD_DDR", "GND", PX + 7, PY - 3.4, { fp: "0805" })
    ind("L2", "SW_MPU", "VDD_MPU", PX + 7, PY + 3.2)
    cap("C41", "10uF", "VDD_MPU", "GND", PX + 7, PY + 5.4, { fp: "0805" })
    ind("L3", "SW_CORE", "VDD_CORE", PX - 0.5, PY + 7)
    cap("C42", "10uF", "VDD_CORE", "GND", PX + 3.1, PY + 7, { fp: "0805" })
    cap("C43", "10uF", "SYS_5V", "GND", PX + 7, PY + 1.0, { fp: "0805" })
    cap("C44", "10uF", "SYS_5V", "GND", PX - 4.1, PY + 7, { fp: "0805" })
    cap("C45", "10uF", "SYS_5V", "GND", PX + 0.5, PY - 6, { fp: "0805" })
    cap("C46", "10uF", "VBUS", "GND", PX + 4.1, PY - 6, { fp: "0805" })
    cap("C47", "10uF", "VBAT", "GND", PX - 3.1, PY - 6, { fp: "0805" })
    cap("C48", "2.2uF", "VDD_RTC", "GND", PX - 7.3, PY - 4.4)
    cap("C49", "2.2uF", "VDD_3V3A", "GND", PX - 7.3, PY - 5.6)
    cap("C50", "10uF", "VDD_1V8", "GND", PX - 7, PY + 1.6, { fp: "0805" })
    cap("C51", "10uF", "VDD_3V3B", "GND", PX - 7, PY - 0.4, { fp: "0805" })
    cap("C52", "10uF", "PMIC_BYPASS", "GND", PX - 7, PY - 2.4, { fp: "0805" })
    cap("C53", "100nF", "PMIC_INT_LDO", "GND", PX - 7.3, PY - 6.8)
    res("R10", "10k", "PMIC_TS", "GND", PX + 2, PY - 4.4)
    res("R11", "4.7k", "I2C0_SDA", "VDD_3V3A", -12, 13)
    res("R12", "4.7k", "I2C0_SCL", "VDD_3V3A", -12, 14.2)
    res("R13", "10k", "EXTINTn", "VDD_3V3A", -12, 15.4)
    res("R14", "10k", "WARMRSTn", "VDD_3V3A", -12, 16.6)
    res("R15", "10k", "PMIC_PB", "SYS_5V", PX + 3, PY + 9)
    res("R16", "10k", "EXT_WAKEUP", "VDD_RTC", -12, 11.8)

    // ---------------- buttons ----------------
    els.push(
      <TS_1187A_B_A_B key="SW1" name="SW1" pcbX={-34} pcbY={27} />,
      <TS_1187A_B_A_B key="SW2" name="SW2" pcbX={-25} pcbY={27} />,
    )
    conn(".SW1 > .pin1", "WARMRSTn")
    conn(".SW1 > .pin3", "GND")
    conn(".SW2 > .pin1", "PMIC_PB")
    conn(".SW2 > .pin3", "GND")

    // ---------------- USB-C (USB0 device + 5 V in) ----------------
    els.push(
      <TYPE_C_31_M_12
        key="USB1"
        name="USB1"
        pcbX={-34}
        pcbY={-10}
        pcbRotation={-90}
      />,
    )
    for (const [pin, net] of Object.entries({
      A6: "USB0_DP",
      B6: "USB0_DP",
      A7: "USB0_DM",
      B7: "USB0_DM",
      A5: "USB_CC1",
      B5: "USB_CC2",
      VBUS1: "VBUS",
      VBUS2: "VBUS",
      GND1: "GND",
      GND2: "GND",
      EH1: "GND",
      EH2: "GND",
      EH3: "GND",
      EH4: "GND",
    }))
      conn(`.USB1 > .${pin}`, net)
    res("R20", "5.1k", "USB_CC1", "GND", -29, -7)
    res("R21", "5.1k", "USB_CC2", "GND", -29, -13)

    // ---------------- 24 MHz crystal ----------------
    els.push(
      <X322524MOB4SI
        key="Y1"
        name="Y1"
        pcbX={12.5}
        pcbY={0.8}
        {...({ loadCapacitance: "18pF" } as any)}
      />,
    )
    conn(".Y1 > .pin1", "XTALIN")
    conn(".Y1 > .pin3", "XTALOUT")
    conn(".Y1 > .pin2", "GND")
    conn(".Y1 > .pin4", "GND")
    cap("C90", "18pF", "XTALIN", "GND", 12.5, 3.6)
    cap("C91", "18pF", "XTALOUT", "GND", 12.5, -2)

    // ---------------- microSD on MMC0 ----------------
    els.push(<TF_01A key="SD1" name="SD1" pcbX={4} pcbY={25} />)
    for (const [pin, net] of Object.entries({
      DAT2_RSV: "MMC0_DAT2",
      CDDAT3_CS: "MMC0_DAT3",
      CMD_DI: "MMC0_CMD",
      VDD: "VDD_3V3B",
      CLK_SCLK: "MMC0_CLK",
      VSS: "GND",
      DAT0_D0: "MMC0_DAT0",
      DAT1_RSV: "MMC0_DAT1",
      CD: "SD_CD",
      GND1: "GND",
      GND2: "GND",
      GND3: "GND",
      GND4: "GND",
    }))
      conn(`.SD1 > .${pin}`, net)
    ;[
      "MMC0_CMD",
      "MMC0_DAT0",
      "MMC0_DAT1",
      "MMC0_DAT2",
      "MMC0_DAT3",
      "SD_CD",
    ].forEach((net, i) =>
      res(`R${30 + i}`, "10k", net, "VDD_3V3B", -7 + i * 2, 12.6),
    )
    cap("C92", "10uF", "VDD_3V3B", "GND", 15, 25, { fp: "0805" })

    // ---------------- SYSBOOT straps on LCD_DATA[15:0] ----------------
    for (let i = 0; i < 16; i++)
      res(
        `R${40 + i}`,
        "100k",
        `SYSBOOT${i}`,
        (SYSBOOT >> i) & 1 ? "VDD_3V3A" : "GND",
        11.5 + (i % 4) * 2,
        -4.5 - Math.floor(i / 4) * 1.4,
      )

    // ---------------- user LEDs ----------------
    for (let i = 0; i < 4; i++) {
      els.push(
        <led
          key={`D${i + 1}`}
          name={`D${i + 1}`}
          color="blue"
          footprint="0603"
          pcbX={12 + i * 3.2}
          pcbY={12}
        />,
      )
      res(`R${60 + i}`, "470", `LED${i}`, `LED${i}_A`, 12 + i * 3.2, 9.6)
      conn(`.D${i + 1} > .anode`, `LED${i}_A`)
      conn(`.D${i + 1} > .cathode`, "GND")
    }

    // ---------------- headers ----------------
    els.push(
      <pinheader
        key="J1"
        name="J1"
        pinCount={4}
        pitch="2.54mm"
        pcbX={-14}
        pcbY={22}
        pinLabels={["GND", "RX", "TX", "V3"]}
      />,
    )
    conn(".J1 > .pin1", "GND")
    conn(".J1 > .pin2", "UART0_RXD")
    conn(".J1 > .pin3", "UART0_TXD")
    conn(".J1 > .pin4", "VDD_3V3B")
    const hdr = [
      "VDD_3V3B",
      "SYS_5V",
      "GND",
      "GND",
      "GPMC_AD8",
      "GPMC_AD9",
      "GPMC_AD10",
      "GPMC_AD11",
      "GPMC_AD12",
      "GPMC_AD13",
      "GPMC_AD14",
      "GPMC_AD15",
      "SPI0_SCLK",
      "SPI0_D0",
      "SPI0_D1",
      "SPI0_CS0",
      "UART1_TXD",
      "UART1_RXD",
      "AIN0",
      "AIN1",
    ]
    els.push(
      <pinheader
        key="J2"
        name="J2"
        pinCount={20}
        doubleRow
        pitch="2.54mm"
        pcbX={27}
        pcbY={0}
        pcbRotation={90}
      />,
    )
    hdr.forEach((net, i) => conn(`.J2 > .pin${i + 1}`, net))
  }

  const minY = -dist - 9
  const bw = peripherals ? 72 : 44,
    bx = peripherals ? -4 : -4
  const top = peripherals ? 34 : 10
  const bL = bx - bw / 2 + 1,
    bR = bx + bw / 2 - 1
  const pts = (a: number[][]) => a.map(([x, y]) => ({ x: x!, y: y! }))
  return (
    <board
      width={bw}
      height={top - minY}
      pcbX={0}
      outlineOffsetX={bx}
      outlineOffsetY={(top + minY) / 2}
      layers={6}
      minTraceWidth={0.1}
      minTraceToPadEdgeClearance={0.1}
      minViaPadDiameter={0.4}
      minViaHoleDiameter={0.2}
      routeRemaining={false}
      schAutoLayoutEnabled={false}
      schematicDisabled
      {...(effort ? { autorouterEffortLevel: effort as any } : {})}
      {...boardProps}
    >
      {[...nets].map((n) => (
        <net
          key={`net-${n}`}
          name={n}
          {...(n === "GND"
            ? { isGroundNet: true }
            : /^VDD|^SYS_5V|^VBUS/.test(n)
              ? { isPowerNet: true }
              : {})}
          {...(PH_REST !== undefined &&
          (planeNetsInRest || !PLANE_NETS.includes(n)) &&
          !(restSkip && new RegExp(restSkip).test(n))
            ? { routingPhaseIndex: PH_REST }
            : {})}
        />
      ))}
      <copperpour layer="inner1" connectsTo="net.GND" />
      <copperpour
        layer="inner4"
        connectsTo="net.VDD_DDR"
        outline={pts([
          [-19.5, 4.2],
          [-15.3, 4.2],
          [-15.3, -4.2],
          [-10, -4.2],
          [-10, -3.2],
          [2.0, -3.2],
          [2.0, -4.7],
          [9, -4.7],
          [9, -12],
          [12, -12],
          [12, minY + 1.5],
          [-14, minY + 1.5],
          [-14, -12],
          [-10, -12],
          [-10, -8],
          [-19.5, -8],
        ])}
      />
      {peripherals ? (
        <copperpour
          layer="inner4"
          connectsTo="net.VDD_3V3A"
          outline={pts([
            [bL, minY + 1],
            [bL, top - 1],
            [bR, top - 1],
            [bR, minY + 1],
            [12.5, minY + 1],
            [12.5, -11.5],
            [9.5, -11.5],
            [9.5, -4.2],
            [2.4, -4.2],
            [2.4, -2.7],
            [-10.5, -2.7],
            [-10.5, -3.7],
            [-14.8, -3.7],
            [-14.8, 4.7],
            [-20, 4.7],
            [-20, -8.5],
            [-10.5, -8.5],
            [-10.5, -11.5],
            [-14.5, -11.5],
            [-14.5, minY + 1],
          ])}
        />
      ) : (
        <copperpour
          layer="inner4"
          connectsTo="net.VDD_3V3A"
          outline={pts([
            [bL, -2.7],
            [bL, top - 1],
            [bR, top - 1],
            [bR, -4.2],
            [2.4, -4.2],
            [2.4, -2.7],
          ])}
        />
      )}
      {(["soc", "ram", "parts"] as const).map((g) =>
        ph(g) !== undefined && planePins[g].length > 0 ? (
          <autoroutingphase
            key={g}
            name={`PLANE_FANOUT_${g.toUpperCase()}`}
            phaseIndex={ph(g)}
            autorouter="fanout"
            fanoutPourNetMap={{
              inner1: "GND",
              inner4: ["VDD_DDR", "VDD_3V3A"],
            }}
            {...(socAll && g === "soc"
              ? { fanoutRoutingLayers: ["top", "inner2", "inner3", "bottom"] }
              : {})}
            connections={planePins[g]}
          />
        ) : null,
      )}
      {PH_DDR !== undefined && ddr === "bus_lanes" && (
        <autoroutingphase
          name="DDR_BUS_LANES"
          phaseIndex={PH_DDR}
          autorouter="bus_lanes"
        />
      )}
      {PH_DDR !== undefined && ddr === "global" && (
        <autoroutingphase name="DDR_GLOBAL" phaseIndex={PH_DDR} />
      )}
      {PH_REST !== undefined && (
        <autoroutingphase name="REST" phaseIndex={PH_REST} />
      )}
      <AM3352 name="U1" pcbX={0} pcbY={0} noSchematicRepresentation />
      <DDR3
        name="U2"
        pcbX={ramX}
        pcbY={ramY}
        pcbRotation={-90}
        noSchematicRepresentation
      />
      {ddr !== "none" && PH_DDR !== undefined && (
        <DdrChannel
          phase={PH_DDR}
          {...(ddrLayers
            ? {
                layers: {
                  BYTE0: ddrLayers,
                  BYTE1: ddrLayers,
                  ADDR_CTRL: ddrLayers,
                },
              }
            : {})}
          {...channel}
        />
      )}
      {els}
    </board>
  )
}
