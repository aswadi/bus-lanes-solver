import { test } from "bun:test"
import { routeAm3352Ddr3Sbc } from "./fixtures/am3352-ddr3-sbc"

test("routes the DDR3 phase of the full AM3352 SBC with the RAM 19 mm from the SoC", async (): Promise<void> => {
  await routeAm3352Ddr3Sbc({
    fixture: "19mm",
    spacingMm: 19,
    testPath: import.meta.path,
  })
}, 2_400_000)
