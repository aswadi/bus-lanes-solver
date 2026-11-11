import { test } from "bun:test"
import { routeAm3352Ddr3Sbc } from "./fixtures/am3352-ddr3-sbc"

test("routes the matched DDR3 buses of the full AM3352 SBC off both plane layers at 25 mm", async (): Promise<void> => {
  await routeAm3352Ddr3Sbc({
    fixture: "25mm-off-planes",
    spacingMm: 25,
    testPath: import.meta.path,
  })
}, 2_400_000)
