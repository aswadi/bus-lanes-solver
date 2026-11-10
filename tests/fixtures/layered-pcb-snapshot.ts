import "bun-match-svg"
import { expect, type MatcherResult } from "bun:test"
import { svgAlphabet } from "@tscircuit/alphabet"
import type { AnyCircuitElement, LayerRef } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

type LayeredPcbSnapshotOptions = {
  testPath: string
  snapshotName?: string
  /** First caption line, e.g. the completion status. */
  title: string
  /** Further caption lines. */
  lines?: string[]
  /** One panel per entry, left to right, then top to bottom. */
  layers: { layer: LayerRef; label: string }[]
  /** Board-world mm, +X right and +Y up. Every panel shows this window. */
  viewport: { minX: number; maxX: number; minY: number; maxY: number }
  /** Panel width in px. */
  panelWidth?: number
  columns?: number
}

/** Elements that only add clutter to a per-layer copper view. */
const hidden =
  /error|warning|pcb_copper_pour|pcb_solder_paste|pcb_courtyard|pcb_fabrication|pcb_silkscreen|pcb_debug|^source_|^cad_|^schematic_/

/** Stroke text from the tscircuit vector alphabet. The image then does not
 * depend on the fonts installed on the machine that renders it. */
function strokeText(
  text: string,
  { x, y, size }: { x: number; y: number; size: number },
): string {
  let out = ""
  let cursor = x
  const dot = (height: number) =>
    `<circle cx="${(cursor + size * 0.2).toFixed(1)}" cy="${(y + size * height).toFixed(1)}" r="${(size * 0.055).toFixed(2)}" fill="#111"/>`
  for (const char of text) {
    const glyph = svgAlphabet[char as keyof typeof svgAlphabet]
    // The alphabet has no colon, and its period is drawn too high to read.
    if (char === ".") out += dot(0.93)
    else if (char === ":") out += dot(0.93) + dot(0.55)
    else if (glyph)
      out += `<path d="${glyph}" transform="translate(${cursor.toFixed(1)} ${y}) scale(${size})" fill="none" stroke="#111" stroke-width="${(1.5 / size).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/>`
    cursor += size * (char === " " ? 0.5 : char === "." || char === ":" ? 0.4 : 0.78)
  }
  return out
}

const traceSegment =
  /<path class="pcb-trace"([^>]*?) d="M (\S+) (\S+) L (\S+) (\S+)"([^>]*?)\/>/g

/** The renderer writes one path per trace segment, about 300 bytes each, and
 * a length-matched bus has several thousand of them per layer. Join each run
 * of connected segments into one path, shorten coordinates to 0.01 px and
 * drop inspection-only attributes. The drawn copper is unchanged. */
function compact(rendered: string): string {
  const svg = rendered
    .replace(/(\d+\.\d\d)\d+/g, "$1")
    .replace(/ data-[a-z-]+="[^"]*"/g, "")
  let out = ""
  let consumed = 0
  let run: { head: string; tail: string; d: string; end: string } | undefined
  const flush = () => {
    if (run) out += `<path class="pcb-trace"${run.head} d="${run.d}"${run.tail}/>`
    run = undefined
  }
  for (const match of svg.matchAll(traceSegment)) {
    const [whole, head, x1, y1, x2, y2, tail] = match
    const between = svg.slice(consumed, match.index)
    if (
      run &&
      between === "" &&
      run.head === head &&
      run.tail === tail &&
      run.end === `${x1} ${y1}`
    )
      run.d += ` L ${x2} ${y2}`
    else {
      flush()
      out += between
      run = { head, tail, d: `M ${x1} ${y1} L ${x2} ${y2}`, end: "" }
    }
    run.end = `${x2} ${y2}`
    consumed = match.index + whole.length
  }
  flush()
  return out + svg.slice(consumed)
}

/** One PCB view per copper layer in a single SVG, under a caption. Plane
 * layers get their own panel, so copper routed across a plane is visible. */
export function layeredPcbSvg(
  circuit: AnyCircuitElement[],
  {
    title,
    lines = [],
    layers,
    viewport,
    panelWidth = 560,
    columns = 3,
  }: Omit<LayeredPcbSnapshotOptions, "testPath" | "snapshotName">,
): string {
  const shown = circuit.filter((element) => !hidden.test(element.type))
  const gap = 14
  const label = 30
  const head = 46 + lines.length * 26 + 8
  const panelHeight = Math.round(
    (panelWidth * (viewport.maxY - viewport.minY)) /
      (viewport.maxX - viewport.minX),
  )
  const rows = Math.ceil(layers.length / columns)
  const width = columns * panelWidth + (columns + 1) * gap
  const height = head + rows * (panelHeight + label + gap)
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/>`
  out += strokeText(title, { x: gap, y: 8, size: 30 })
  for (const [index, line] of lines.entries())
    out += strokeText(line, { x: gap, y: 46 + index * 26, size: 19 })
  for (const [index, { layer, label: text }] of layers.entries()) {
    const x = gap + (index % columns) * (panelWidth + gap)
    const y = head + Math.floor(index / columns) * (panelHeight + label + gap)
    out += strokeText(text, { x, y: y + 3, size: 20 })
    out += compact(
      convertCircuitJsonToPcbSvg(shown, {
        width: panelWidth,
        height: panelHeight,
        backgroundColor: "white",
        layer,
        showSolderMask: false,
        shouldDrawRatsNest: false,
        shouldDrawErrors: false,
        showErrorsInTextOverlay: false,
        viewport,
      }),
    ).replace(/^<svg /, `<svg x="${x}" y="${y + label}" `)
    out += `<rect x="${x - 0.5}" y="${y + label - 0.5}" width="${panelWidth + 1}" height="${panelHeight + 1}" fill="none" stroke="#888"/>`
  }
  return `${out}</svg>`
}

expect.extend({
  async toMatchLayeredPcbSnapshot(
    received: unknown,
    { testPath, snapshotName, ...options }: LayeredPcbSnapshotOptions,
  ): Promise<MatcherResult> {
    if (!Array.isArray(received)) throw Error("Expected Circuit JSON elements")
    await expect(
      layeredPcbSvg(received as AnyCircuitElement[], options),
    ).toMatchSvgSnapshot(testPath, snapshotName ?? "layers")
    return { pass: true, message: () => "Layered PCB snapshot matches" }
  },
})

declare module "bun:test" {
  interface Matchers<T = unknown> {
    toMatchLayeredPcbSnapshot(
      options: LayeredPcbSnapshotOptions,
    ): Promise<MatcherResult>
  }
}
