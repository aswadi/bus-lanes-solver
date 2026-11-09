# A13 RAM-side DDR data byte

[board.tsx](board.tsx) requests the eight `ram_byte0` data connections from the
original A13 board. It reuses the captured native parts and keeps all 378 pads,
placements, layers, source nets, widths and via rules.

```sh
bunx tscircuit build repros/a13-ram-byte0/board.tsx
bun test tests/a13-ram-byte0.test.ts --timeout 180000
```

This variant explicitly uses **0.127 mm (5 mil) pad clearance**, requiring
compatible fabrication rules. The unchanged source capture records the original
0.20 mm DDR class. The original clearance prevents F2 from escaping; with the
chosen clearance, all eight signals route on TOP without vias.

This is a board-rule adjustment for the reproduction. Router defaults, source
footprints, placement, signal layers, widths and via rules are unchanged. No DDR
timing closure is claimed.

[Capture provenance](../../tests/fixtures/a13-ram-byte0/provenance.json).

![RAM byte](../../tests/__snapshots__/a13-ram-byte0-pcb.snap.svg)
