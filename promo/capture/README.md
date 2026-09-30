# sourced promo capture

Records one continuous, cursor-visible take of the sourced job-application playground. The harness uses Chrome's CDP screencast stream at 2x device scale, then turns the timestamped JPEG frames into a constant-30-fps H.264 video.

## Prerequisites

- Node.js 25 and npm
- `ffmpeg` and `ffprobe` on `PATH`
- Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- The playground already running at `http://localhost:3000`
- The playground server configured with its working OpenRouter key

The harness only checks the existing server. It never starts, stops, or restarts it. Chrome runs in headless mode (`headless: true`) with a 1440×810 CSS viewport and device scale factor 2.

The source fill uses the playground's live OpenRouter transport. For a stable submit beat, the harness answers the automatic pre-submit check with an empty successful check result; otherwise the live model can ask for optional resume data (such as an employee ID) and make identical takes non-repeatable.

## Record

```sh
cd promo/capture
npm install
npm run record
```

The command reads Priya's resume fixture from the repository and writes:

- `promo/assets/demo.mp4` — 2880×1620, 30 fps, H.264/yuv420p, no audio
- `promo/assets/demo.timeline.json` — beat timestamps, crop regions, and capture stats
- `promo/assets/stills/{paste,fillDone,highlightSettled}.jpg` — visual sanity checks

Temporary JPEG frames live in `promo/assets/frames/` during capture and are deleted after a successful assembly. A failed choreography is abandoned and retried from a fresh page, up to three takes.

## Re-take

Leave the existing playground server running and run `npm run record` again. A successful capture replaces the prior video, timeline, and three sanity stills. Existing final artifacts remain in place if all capture attempts fail.
