# H616 full-board byte-zero performance reproduction

This is the routing request captured from the full reference-board TSX
reconstruction of [Kirill Kononenko's H616 devboard](https://github.com/Kononenko-K/Allwinner_H616_Devboard/tree/94fe1071ff3d7c2e6a227a3e4dfccb6acae305c4).
The hardware is licensed under CERN-OHL-P-2.0; its original notice is in
[LICENSE](LICENSE). Source revisions, hashes and capture scope are recorded in
[provenance.json](provenance.json).

The unchanged SRJ requests eight DDR data signals and retains all 760 native
pad/hole obstacles, the 34-point board outline, four layers and 0.2 mm board-edge
clearance. Existing copper was removed. The Circuit JSON contains the native
board, footprints, pads, holes and ports for rendering; it contains no saved
routes. This exercises one byte in the full board environment, not a complete
board solve. No timing or impedance requirements have been invented.

Run `bun test tests/h616-full-board-byte0.test.ts`. The test reports fresh solver
duration and iteration count, independently checks connectivity and copper DRC,
checks full-width trace containment, and writes a PCB SVG only after all eight
signals pass. There is no wall-clock performance assertion. The same fixture,
test can therefore compare baseline and optimized code without a machine-dependent
pass threshold. Its SVG labels the deterministic number of zero-length board
clearance queries made during the solve. The stacked fix changes that count in
the same snapshot while preserving the completed copper. Mock call history is
cleared periodically to bound instrumentation memory; reported test durations
include this instrumentation and are separate from uninstrumented benchmarks.

Profiling the original request found repeated board-outline rasterization in
`GridVisibilitySearch` dominating the first 200 solver steps: 96.3% of samples
were in grid construction, including 86.2% in the outline-edge loop. A copper
change invalidates the combined hard-grid cache even when the board and grid
are unchanged; each surviving cell also uses a generic segment-distance check
for a zero-length segment. The stacked fix targets this redundant work while
preserving exact segment validation and the routed copper.
