import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["VLDO2"],
  pin2: ["VINLDO"],
  pin3: ["VLDO1"],
  pin4: ["BAT1"],
  pin5: ["BAT2"],
  pin6: ["BAT_SENSE"],
  pin7: ["SYS1"],
  pin8: ["SYS2"],
  pin9: ["PWR_EN"],
  pin10: ["AC"],
  pin11: ["TS"],
  pin12: ["USB"],
  pin13: ["nWAKEUP"],
  pin14: ["MUX_IN"],
  pin15: ["NC1"],
  pin16: ["MUX_OUT"],
  pin17: ["NC2"],
  pin18: ["VIO"],
  pin19: ["VDCDC1"],
  pin20: ["L1"],
  pin21: ["VIN_DCDC1"],
  pin22: ["VIN_DCDC2"],
  pin23: ["L2"],
  pin24: ["VDCDC2"],
  pin25: ["PB_IN"],
  pin26: ["PGOOD"],
  pin27: ["SDA"],
  pin28: ["SCL"],
  pin29: ["VDCDC3"],
  pin30: ["PGND"],
  pin31: ["L3"],
  pin32: ["VIN_DCDC3"],
  pin33: ["ISINK2"],
  pin34: ["ISINK1"],
  pin35: ["ISET1"],
  pin36: ["ISET2"],
  pin37: ["L4"],
  pin38: ["FB_WLED"],
  pin39: ["LS1_IN"],
  pin40: ["LS1_OUT"],
  pin41: ["AGND"],
  pin42: ["LS2_IN"],
  pin43: ["LS2_OUT"],
  pin44: ["nRESET"],
  pin45: ["nINT"],
  pin46: ["LDO_PGOOD"],
  pin47: ["BYPASS"],
  pin48: ["INT_LDO"],
  pin49: ["EP"],
} as const

const pinAttributes = {
  pin15: { doNotConnect: true },
  pin17: { doNotConnect: true },
  pin30: { requiresGround: true },
  pin41: { requiresGround: true },
} as const

const footprinterPinLabels = {
  ...pinLabels,
  pin49: [...pinLabels["pin49"], "thermalpad"],
} as const

export const TPS65217CRSLR = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={footprinterPinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
        jlcpcb: ["C116081"],
      }}
      manufacturerPartNumber="TPS65217CRSLR"
      footprint="qfn48_thermalpad4.05mmx4.05mm_p0.4mm_h7mm_pw0.2mm_pl0.85mm_pin1location(bottomside,left)"
      cadModel={{
        objUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C116081.obj?uuid=dc9ecc2441db447baa43f5a79af55430",
        stepUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C116081.step?uuid=dc9ecc2441db447baa43f5a79af55430",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0, z: 0 },
      }}
      {...props}
    />
  )
}
