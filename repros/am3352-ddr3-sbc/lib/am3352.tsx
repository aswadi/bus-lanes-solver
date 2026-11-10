import type { ChipProps } from "@tscircuit/props"
import ballMapJson from "./am3352-ballmap.json"
import { AM3352BZCZ100 } from "../imports/AM3352BZCZ100"

/** TI SPRS717L ZCZ ball map: ball -> signal */
export const ballMap = ballMapJson as Record<string, string>

const LETTERS = "ABCDEFGHJKLMNPRTUV"
/** The JLC import numbers pins column-major: pin1=A1, pin2=B1 ... pin19=A2 */
export const socBallOfPin = (pin: number) =>
  `${LETTERS[(pin - 1) % 18]}${Math.floor((pin - 1) / 18) + 1}`
export const socPinOfBall = (ball: string) =>
  (Number(ball.slice(1)) - 1) * 18 + LETTERS.indexOf(ball[0]!) + 1

const signalCounts: Record<string, number> = {}
for (const s of Object.values(ballMap))
  signalCounts[s] = (signalCounts[s] ?? 0) + 1

/** Unique label per ball. Repeated supply balls become e.g. VSS_H6. */
export const socLabelOfBall = (ball: string) => {
  const signal = ballMap[ball]!
  return signalCounts[signal]! > 1 ? `${signal}_${ball}` : signal
}

export const socPins = Array.from({ length: 324 }, (_, i) => {
  const pin = i + 1
  const ball = socBallOfPin(pin)
  return { pin, ball, signal: ballMap[ball]!, label: socLabelOfBall(ball) }
})

export const socPinLabels = Object.fromEntries(
  socPins.map((p) => [`pin${p.pin}`, [p.label]]),
)

/** Selector for the single ball carrying a uniquely named signal */
export const socSel = (name: string, signal: string) => {
  const p = socPins.find((p) => p.signal === signal)
  if (!p) throw new Error(`Unknown AM3352 signal ${signal}`)
  return `.${name} > .pin${p.pin}`
}

/** Local footprint position of a ball (A1 bottom-left, letters +x, numbers +y) */
export const socBallXY = (ball: string) => ({
  x: (LETTERS.indexOf(ball[0]!) - 8.5) * 0.8,
  y: (Number(ball.slice(1)) - 9.5) * 0.8,
})

/**
 * AM3352BZCZ with the complete ball map. The JLC import only names 108 of the
 * 324 balls and uses 0.24 mm lands; TI recommends ~0.36 mm lands for the
 * 0.8 mm ZCZ package, so the footprint is regenerated here.
 */
export const AM3352 = (props: ChipProps<any> & { padDiameter?: number }) => {
  const { padDiameter = 0.36, ...rest } = props
  return (
    <AM3352BZCZ100
      {...(rest as any)}
      pinLabels={socPinLabels as any}
      footprint={
        <footprint>
          {socPins.map((p) => (
            <smtpad
              key={p.pin}
              portHints={[`pin${p.pin}`]}
              pcbX={socBallXY(p.ball).x}
              pcbY={socBallXY(p.ball).y}
              shape="circle"
              radius={padDiameter / 2}
            />
          ))}
          <courtyardrect pcbX={0} pcbY={0} width={15.5} height={15.5} />
          <silkscreenrect pcbX={0} pcbY={0} width={15.2} height={15.2} />
          <silkscreencircle pcbX={-8.1} pcbY={-8.1} radius={0.25} />
        </footprint>
      }
    />
  )
}
