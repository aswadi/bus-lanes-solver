# A13 RAM-side data byte

The eight requested connections come from the native Allwinner A13 board,
captured through `tscircuit@0.0.3128` and Core's local bus routing pipeline.
All 378 component pads, placements, signal layers, widths and clearances are
retained. The capture comes from
[`board.tsx`](../../../repros/a13-ram-byte0/board.tsx). See `provenance.json`
for the original KiCad revision and hashes.

Run `bun test tests/a13-ram-byte0.test.ts --update-snapshots`.
The snapshot deliberately shows the failed reproduction, native pads and no
unaccepted copper. A short deterministic search budget keeps the repro bounded;
the same published input exceeded 120 seconds with default options.

RAM ball F2 (`ddr-d2`) is surrounded by eight foreign 0.4 mm pads on a 0.8 mm
pitch. With 0.1016 mm traces and 0.2 mm clearance, their trace exclusion regions
close every surface exit. Inside that enclosure, a 0.45 mm via cannot clear the
foreign pads while its 0.30 mm drill stays outside F2. Via-in-pad and blind vias
are disabled. Searching longer cannot create a legal escape under these rules.

![Actual RAM-side reproduction](../../__snapshots__/a13-ram-byte0-pcb.snap.svg)
