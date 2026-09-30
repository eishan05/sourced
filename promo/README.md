# promo

The promotional video for **sourced**: a scripted screen recording of the playground filling a real job
application, cut into a 1920x1080 clip with titles, captions and zooms.

Two stages, joined by a file contract.

```
capture/   Playwright + CDP screencast  ->  assets/demo.mp4 + assets/demo.timeline.json
video/     Remotion composition         ->  out/sourced-promo-1080p.mp4
```

`assets/demo.timeline.json` is the contract. The capture writes the millisecond offset of each beat
(`paste`, `fillStart`, `firstField`, `fillDone`, `chipClick`, `ghostFocus`, `submitted`, ...) and the bounding
box of each region worth zooming into (`chipRow`, `sourceHighlight`, `ghostCard`, `reviewBar`, ...) in video
pixels. The Remotion composition derives every cut, zoom and caption from that file, so a fresh recording with
different timings renders correctly with no code changes.

## Re-record

Needs the playground running on http://localhost:3000 with `OPENROUTER_API_KEY` in its environment. The harness
uses the server that is already running and never starts or stops one.

```sh
cd promo/capture && npm install && npm run record
```

The fill is a genuine live model call. The pre-submit `mode: "check"` request is answered with an empty result
so takes stay repeatable — see `capture/README.md`.

## Re-render

```sh
cd promo/video && npm install && npm run render
```

Writes `out/sourced-promo-1080p.mp4` (H.264 + a silent AAC track, for upload compatibility) and scene stills
plus a filmstrip contact sheet under `out/stills/`. `npm run studio` opens the Remotion editor for iterating on
the composition.

Recordings and renders are gitignored; the source that produces them is not.
