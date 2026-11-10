# AM3352 + DDR3 SBC, DDR3 phase on the full board

A six-layer single-board computer written from scratch in tscircuit TSX
([lib/sbc.tsx](lib/sbc.tsx)): AM3352 ZCZ (324 balls), MT41K256M16 DDR3L (96
balls), TPS65217C PMIC, microSD, USB-C, crystal, boot straps, headers and
decoupling, 132 components on a 72 mm wide board. Stack: top, inner1 (GND
pour), inner2, inner3, inner4 (VDD_DDR and 3.3 V pours), bottom. It is a
routing exercise, not a manufactured design, and no impedance or stackup
claims are made.

Routing runs in phases. Plane fanout for the SoC, the RAM and the remaining
parts comes first and leaves 259 fixed through vias. The DDR3 phase follows: 50
point-to-point signals, with two data byte buses and one address/control bus
matched to 0.635 mm, and the DQS0, DQS1 and CK pairs matched to 0.127 mm with a
0.1 mm gap at 0.1 mm clearance. Each capture here is the exact Core input of
that DDR3 phase, with all 782 pad and hole obstacles and the 259 fanouts as
supplied copper.

| Capture | TSX | RAM below SoC | DDR layers | `main` (`64ec508`) | With balanced pair lobes at the clearance limit |
| --- | --- | ---: | --- | --- | --- |
| `20mm` | [board-20mm.tsx](board-20mm.tsx) | 20 mm | all six | fails: `No shared tuning corridor for DDR_DQS0, DDR_DQSn0` | 50/50 routed and matched |

Published `tscircuit@0.0.3131` / Core `0.0.2315` / bus-lanes-solver `0.0.50`
fails the same way through `tsci build`.

![DDR3 phase at 20 mm, one view per copper layer](ddr-20mm.png)

With all six layers allowed the solver puts about 40% of the DDR copper on
the two plane layers (inner1 and inner4 in the image). That is the released
behaviour and is not changed here.

```sh
bun test tests/am3352-ddr3-sbc-20mm.test.ts
bun repros/am3352-ddr3-sbc/render-png.ts 20mm
# Run the TSX through the published Core stack and dump the phase inputs:
bunx tscircuit build --disable-parts-engine --autorouter-dump-srj all \
  --autorouter-debug-dir /tmp/am3352-ddr3-sbc repros/am3352-ddr3-sbc/board-20mm.tsx
```

The solve takes about 2.5 minutes on Linux x64.

Each image is a PNG render of a test-owned snapshot in
[tests/__snapshots__](../../tests/__snapshots__). A failed solve records native
pads and the supplied fanout copper under a FAILED BASELINE caption, with no
candidate copper. DDR copper is drawn only after connectivity, copper DRC
against all 259 fanouts, bus matching, pair matching and pair spacing pass.

The lane search takes a different path on macOS arm64 than on Linux x64 and
produces different, also valid, copper. The snapshots are therefore compared on
Linux x64 (the CI platform) only; every acceptance check runs on all platforms.

Each `provenance.json` beside a capture records the tool versions, the capture
command and the input hash. Footprints in [imports/](imports) were generated
by `tsci import` from the JLCPCB parts C91145, C253882, C116081, C70590,
C468247, C165948 and C318884.
