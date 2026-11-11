import { effectiveCarrierLayers } from "./effective-carrier-layers"
import { distance } from "./geometry"
import { GridVisibilitySearch } from "./grid-visibility"
import type { Connection, SimpleRouteJson, Terminal } from "./types"
import { fixedCopper, VectorScene } from "./vector-scene"

/** Compare reachable surface paths before committing a branch to a trunk via. */
export function* selectBranchAttachment({
  input,
  connection,
  terminal,
  attachments,
}: {
  input: SimpleRouteJson
  connection: Connection
  terminal: Terminal
  attachments: Terminal[]
}): Generator<void, Terminal> {
  const preferred = attachments[0]
  if (!preferred) throw Error("No routed copper for a multi-terminal branch")
  const carrierLayers = effectiveCarrierLayers(input, connection)
  const candidates = attachments.filter((attachment) =>
    attachment.layers?.some(
      (layer) => layer !== terminal.layer && carrierLayers.includes(layer),
    ),
  )
  if (candidates.length < 2 || !candidates.includes(preferred)) return preferred

  const width =
    input.buses?.find((bus) => bus.connectionNames.includes(connection.name))
      ?.traceWidth ??
    connection.nominalTraceWidth ??
    connection.width ??
    input.minTraceWidth
  const scene = new VectorScene(
    input,
    { ...connection, pointsToConnect: [terminal, preferred] },
    width,
    fixedCopper(input),
  )
  const search = new GridVisibilitySearch(
    scene,
    terminal,
    preferred,
    [],
    0,
    undefined,
    {
      ends: candidates,
      allTerminalAttachments: true,
      checkReachability: true,
    },
  )
  try {
    while (!search.solved && !search.failed) {
      search.step()
      yield
    }
    // A surface search only ranks anchors; the full router can use other layers.
    if (!search.solved) return preferred
    const end = search.result.at(-1)
    if (!end) throw Error("Completed branch search has no endpoint")
    const attachment = candidates.find((point) => distance(point, end) < 1e-8)
    if (!attachment) throw Error("Completed branch search lost its attachment")
    return attachment
  } finally {
    search.cancel()
  }
}
