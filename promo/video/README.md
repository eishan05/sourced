# sourced promo video

A standalone Remotion 4 project for the muted, 1920×1080 **sourced** product promo.

## Setup

```bash
cd promo/video
npm install
```

## Open the Studio

```bash
npm run studio
```

The Studio command first copies `../assets/demo.mp4` and `../assets/demo.timeline.json` into `public/`.

## Render

```bash
npm run render
```

The H.264 output is written to `../out/sourced-promo-1080p.mp4`. After Remotion renders, the script copies the video stream into a new MP4 with a silent 48 kHz stereo AAC track, verifies the stream layout and encoded-video hash, and extracts the scene stills. The output directory is created automatically.

## Checks

```bash
npm run check:captions
npm run check:framing
npm run test:timeline-shift
npx tsc --noEmit
```

The caption check enforces `max(1.6s, words × 0.32s)` for every caption and reports any scene or caption split that needed adjustment. Footage scenes are extended by slowing their source segment; graphic scenes hold longer.

The framing check walks every footage frame through the same pure camera and caption-placement helpers used by the composition. It asserts full video coverage, zero caption/target intersections, the Evidence hold, and visibility of the highlighted source line.

## Render after a new capture

Overwrite these two source assets without changing their names or JSON shape:

- `promo/assets/demo.mp4`
- `promo/assets/demo.timeline.json`

Then run `npm run render` again. `calculateMetadata` validates the new timeline and derives the composition duration. Footage trims, scene lengths, camera targets, and the evidence transition all use timeline marks or named region rectangles at render time, so no source-specific frame numbers or pixel boxes need editing.

The Inter and JetBrains Mono Latin variable fonts used by the composition are checked into `public/fonts/`; the render does not fetch fonts from a CDN.
