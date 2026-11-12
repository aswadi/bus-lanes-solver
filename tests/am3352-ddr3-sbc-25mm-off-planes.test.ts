import { test } from "bun:test"
import { routeAm3352Ddr3Sbc } from "./fixtures/am3352-ddr3-sbc"

test("routes the matched DDR3 buses of the full AM3352 SBC off both plane layers at 25 mm", async (): Promise<void> => {
  await routeAm3352Ddr3Sbc({
    fixture: "25mm-off-planes",
    spacingMm: 25,
    testPath: import.meta.path,
    // A GitHub x64 runner did not reproduce the picture recorded for this
    // capture in an x64 container, although both run the same Bun build.
    // Completion and every acceptance check are still asserted.
    comparePicture: false,
  })
}, 2_400_000)
