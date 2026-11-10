import { readFileSync, writeFileSync } from "node:fs"
import { Resvg } from "@resvg/resvg-js"

/** Rasterize the test-owned layer snapshots for the README and PR pages.
 * usage: bun repros/am3352-ddr3-sbc/render-png.ts 20mm [19mm ...] */
for (const name of process.argv.slice(2)) {
  const svg = readFileSync(
    new URL(
      `../../tests/__snapshots__/am3352-ddr3-sbc-${name}-layers.snap.svg`,
      import.meta.url,
    ),
  )
  writeFileSync(
    new URL(`./ddr-${name}.png`, import.meta.url),
    new Resvg(svg, { background: "white" }).render().asPng(),
  )
}
