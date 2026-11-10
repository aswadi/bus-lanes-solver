import { Sbc } from "./lib/sbc"

/** RAM centre 20 mm below the SoC centre. Plane fanout for the SoC, the RAM
 * and the remaining parts runs first; the DDR3 phase that follows is the
 * captured routing request. */
export default () => (
  <Sbc dist={20} phases={["soc", "ram", "parts", "ddr"]} partsSkip="^.U3 " />
)
