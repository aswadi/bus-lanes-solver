import { Sbc } from "./lib/sbc"

/** RAM centre 25 mm below the SoC centre, with the three matched DDR buses
 * kept off the ground plane layer (inner1) and the power plane layer (inner4).
 * Plane fanout for the SoC, the RAM and the remaining parts runs first; the
 * DDR3 phase that follows is the captured routing request. */
export default () => (
  <Sbc
    dist={25}
    phases={["soc", "ram", "parts", "ddr"]}
    partsSkip="^.U3 "
    ddrLayers={["top", "inner2", "inner3", "bottom"]}
  />
)
