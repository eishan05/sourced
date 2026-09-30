import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pw from "playwright-core";

const { chromium } = pw;
const runFile = promisify(execFile);

const CAPTURE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CAPTURE_DIR, "../..");
const ASSETS_DIR = path.join(REPO_ROOT, "promo/assets");
const FRAMES_DIR = path.join(ASSETS_DIR, "frames");
const STILLS_DIR = path.join(ASSETS_DIR, "stills");
const RESUME_PATH = path.join(
  REPO_ROOT,
  "packages/examples/fixtures/resumes/priya-raman.txt",
);
const VIDEO_PATH = path.join(ASSETS_DIR, "demo.mp4");
const TIMELINE_PATH = path.join(ASSETS_DIR, "demo.timeline.json");
const TEMP_VIDEO_PATH = path.join(ASSETS_DIR, ".demo.capture.mp4");
const CONCAT_PATH = path.join(ASSETS_DIR, ".demo.frames.ffconcat");
const URL = "http://localhost:3000/job-application";
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const WIDTH = 2880;
const HEIGHT = 1620;
const DEVICE_SCALE_FACTOR = 2;
const FPS = 30;
const MAX_TAKES = 3;
const HEADLESS = true;

const MARK_IDS = [
  "start",
  "paste",
  "fillStart",
  "firstField",
  "fillDone",
  "chipClick",
  "highlightSettled",
  "ghostFocus",
  "ghostAccept",
  "gateAnswer",
  "reviewStart",
  "reviewKeys",
  "reviewDone",
  "humanAnswer",
  "submitReady",
  "submitClick",
  "submitted",
  "end",
];

const REGION_IDS = [
  "formPane",
  "sourcePane",
  "chipRow",
  "sourceHighlight",
  "ghostCard",
  "gateSection",
  "reviewBar",
  "humanFields",
  "submitSummary",
  "submittedJson",
];

function installPromoCapture() {
  const install = () => {
    let style = document.getElementById("promo-capture-style");
    if (!style) {
      const root = document.head || document.documentElement;
      if (!root) return;
      style = document.createElement("style");
      style.id = "promo-capture-style";
      style.textContent = `
        nextjs-portal { display: none !important; }
        html { scrollbar-width: none !important; }
        html::-webkit-scrollbar, body::-webkit-scrollbar,
        .anf-source-sheet-content::-webkit-scrollbar { display: none !important; }
        .anf-source-sheet-content { scrollbar-width: none !important; }
        #promo-cursor {
          position: fixed;
          left: 0;
          top: 0;
          width: 28px;
          height: 34px;
          pointer-events: none;
          z-index: 2147483647;
          transform: translate3d(72px, 72px, 0);
          filter: drop-shadow(0 2px 3px rgba(17, 17, 17, 0.28));
          animation: promo-cursor-heartbeat 120ms linear infinite alternate;
          will-change: transform, opacity;
        }
        #promo-cursor svg { display: block; overflow: visible; }
        .promo-click-ripple {
          position: fixed;
          width: 12px;
          height: 12px;
          margin: -6px 0 0 -6px;
          border: 2px solid #6366F1;
          border-radius: 999px;
          pointer-events: none;
          z-index: 2147483646;
          animation: promo-click-ripple 350ms ease-out forwards;
        }
        @keyframes promo-click-ripple {
          from { opacity: 0.95; transform: scale(0.45); }
          to { opacity: 0; transform: scale(3.2); }
        }
        @keyframes promo-cursor-heartbeat {
          from { opacity: 0.995; }
          to { opacity: 1; }
        }
      `;
      root.appendChild(style);
    }

    let cursor = document.getElementById("promo-cursor");
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.id = "promo-cursor";
      cursor.setAttribute("aria-hidden", "true");
      cursor.innerHTML = `<svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.15 1.9L24.1 20.25L14.25 21.55L9.05 31.7L2.15 1.9Z" fill="white" stroke="#111111" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      document.documentElement.appendChild(cursor);
    }

    if (!Number.isFinite(window.__promoCursorX)) window.__promoCursorX = 72;
    if (!Number.isFinite(window.__promoCursorY)) window.__promoCursorY = 72;
    window.__promoCursor = (x, y) => {
      window.__promoCursorX = x;
      window.__promoCursorY = y;
      const current = document.getElementById("promo-cursor");
      if (current) current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    window.__promoClick = () => {
      const ripple = document.createElement("div");
      ripple.className = "promo-click-ripple";
      ripple.style.left = `${window.__promoCursorX}px`;
      ripple.style.top = `${window.__promoCursorY}px`;
      document.documentElement.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 380);
    };
    if (!window.__promoScrollPatched) {
      const nativeScrollIntoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.matches?.(".anf-source-list mark")) {
          const normalized =
            typeof options === "object" && options !== null ? options : {};
          return nativeScrollIntoView.call(this, {
            ...normalized,
            behavior: "smooth",
            block: normalized.block ?? "center",
          });
        }
        return nativeScrollIntoView.call(this, options);
      };
      window.__promoScrollPatched = true;
    }
    window.__promoCursor(window.__promoCursorX, window.__promoCursorY);
  };

  window.__installPromoCapture = install;
  install();
  document.addEventListener("DOMContentLoaded", install, { once: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (!Number.isFinite(length) || length < 2) break;
    offset += length + 2;
  }
  throw new Error("Could not read dimensions from the first screencast JPEG");
}

function ffconcatPath(filePath) {
  return filePath.replaceAll("'", "'\\''");
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  ];
}

async function command(name, args, options = {}) {
  try {
    return await runFile(name, args, {
      cwd: REPO_ROOT,
      maxBuffer: 20 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    const detail = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(`${name} failed${detail ? `:\n${detail}` : ""}`);
  }
}

async function preflight() {
  if (!existsSync(CHROME_PATH)) {
    throw new Error(`System Chrome was not found at ${CHROME_PATH}`);
  }
  if (!existsSync(RESUME_PATH)) {
    throw new Error(`Resume fixture was not found at ${RESUME_PATH}`);
  }
  await Promise.all([
    command("ffmpeg", ["-version"]),
    command("ffprobe", ["-version"]),
  ]);

  let response;
  try {
    response = await fetch(URL, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    throw new Error(
      `The playground is not reachable at ${URL}. Start the existing playground dev server on port 3000, then run this command again. (${error.message})`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `The playground returned HTTP ${response.status} at ${URL}. Start or repair the existing playground dev server on port 3000, then run this command again.`,
    );
  }
}

class ScreencastRecorder {
  constructor(cdp) {
    this.cdp = cdp;
    this.frames = [];
    this.pendingWrites = new Set();
    this.error = null;
    this.running = false;
    this.onFrame = this.onFrame.bind(this);
  }

  async start() {
    this.running = true;
    this.cdp.on("Page.screencastFrame", this.onFrame);
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 95,
      maxWidth: WIDTH,
      maxHeight: HEIGHT,
      everyNthFrame: 1,
    });
    await this.nextFrame(0, 5000);
    const first = this.frames[0];
    const dimensions = jpegDimensions(first.buffer);
    if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
      throw new Error(
        `CDP screencast produced ${dimensions.width}x${dimensions.height}; expected ${WIDTH}x${HEIGHT}`,
      );
    }
  }

  onFrame(event) {
    if (!this.running) return;
    const index = this.frames.length;
    const filename = `${String(index).padStart(6, "0")}.jpg`;
    const filePath = path.join(FRAMES_DIR, filename);
    const buffer = Buffer.from(event.data, "base64");
    const write = (async () => {
      try {
        await fs.writeFile(filePath, buffer);
        this.frames.push({
          filePath,
          filename,
          timestamp: event.metadata.timestamp,
          buffer: index === 0 ? buffer : undefined,
        });
        await this.cdp.send("Page.screencastFrameAck", {
          sessionId: event.sessionId,
        });
      } catch (error) {
        this.error = error;
      }
    })();
    this.pendingWrites.add(write);
    void write.finally(() => this.pendingWrites.delete(write));
  }

  async nextFrame(previousCount, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (this.frames.length <= previousCount) {
      if (this.error) throw this.error;
      if (Date.now() >= deadline) {
        throw new Error(
          "CDP screencast stalled while waiting for the next frame",
        );
      }
      await sleep(10);
    }
    return this.frames.at(-1);
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    try {
      await this.cdp.send("Page.stopScreencast");
    } finally {
      await Promise.allSettled([...this.pendingWrites]);
      this.cdp.off("Page.screencastFrame", this.onFrame);
    }
    if (this.error) throw this.error;
  }
}

async function waitForScrollSettled(page, timeoutMs = 4000) {
  await page.evaluate(
    ({ timeout }) =>
      new Promise((resolve) => {
        const started = performance.now();
        let stable = 0;
        let previous = "";
        const sample = () => {
          const source = document.querySelector(".anf-source-sheet-content");
          const current = `${window.scrollX}:${window.scrollY}:${source?.scrollTop ?? 0}`;
          stable = current === previous ? stable + 1 : 0;
          previous = current;
          if (stable >= 6 || performance.now() - started >= timeout) {
            resolve();
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
    { timeout: timeoutMs },
  );
}

async function smoothIntoView(page, locator) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.evaluate((element) =>
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    }),
  );
  await waitForScrollSettled(page);
}

async function smoothWindowBy(page, pixels, durationMs) {
  await page.evaluate(
    ({ delta, duration }) =>
      new Promise((resolve) => {
        const start = window.scrollY;
        const target = Math.max(
          0,
          Math.min(
            start + delta,
            document.documentElement.scrollHeight - innerHeight,
          ),
        );
        const began = performance.now();
        const animate = (now) => {
          const t = Math.min(1, (now - began) / duration);
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          window.scrollTo(0, start + (target - start) * eased);
          if (t < 1) requestAnimationFrame(animate);
          else resolve();
        };
        requestAnimationFrame(animate);
      }),
    { delta: pixels, duration: durationMs },
  );
  await waitForScrollSettled(page);
}

async function smoothWindowToTop(page, durationMs = 1200) {
  const current = await page.evaluate(() => window.scrollY);
  await smoothWindowBy(page, -current, durationMs);
}

async function cursorClick(page, locator, label) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  let box = await locator.boundingBox();
  if (!box)
    throw new Error(`Cannot click ${label}: target has no bounding box`);
  const initialCenterY = box.y + box.height / 2;
  if (initialCenterY < 72 || initialCenterY > 738) {
    await smoothIntoView(page, locator);
    box = await locator.boundingBox();
  }
  if (!box)
    throw new Error(
      `Cannot click ${label}: target disappeared after scrolling`,
    );

  const target = {
    x: Math.max(4, Math.min(1436, box.x + box.width / 2)),
    y: Math.max(4, Math.min(806, box.y + box.height / 2)),
  };
  const start = await page.evaluate(() => ({
    x: window.__promoCursorX ?? 72,
    y: window.__promoCursorY ?? 72,
  }));
  const steps = 30;
  for (let index = 1; index <= steps; index += 1) {
    const amount = easeInOut(index / steps);
    const x = start.x + (target.x - start.x) * amount;
    const y = start.y + (target.y - start.y) * amount;
    await page.mouse.move(x, y);
    await page.evaluate(
      ({ nextX, nextY }) => window.__promoCursor(nextX, nextY),
      {
        nextX: x,
        nextY: y,
      },
    );
    await sleep(15);
  }
  await sleep(150);

  const cursor = page.locator("#promo-cursor");
  const visible = await cursor.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  });
  if (!visible) throw new Error(`Synthetic cursor is not visible for ${label}`);

  await page.evaluate(() => window.__promoClick());
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  console.log(
    `[click] ${label.padEnd(24)} (${Math.round(target.x)}, ${Math.round(target.y)})`,
  );
}

async function visibleBox(locator) {
  try {
    if ((await locator.count()) === 0) return null;
    const box = await locator.first().boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return box;
  } catch {
    return null;
  }
}

function paddedVideoRegion(box) {
  const pad = 24;
  const left = Math.max(0, Math.floor(box.x * DEVICE_SCALE_FACTOR - pad));
  const top = Math.max(0, Math.floor(box.y * DEVICE_SCALE_FACTOR - pad));
  const right = Math.min(
    WIDTH,
    Math.ceil((box.x + box.width) * DEVICE_SCALE_FACTOR + pad),
  );
  const bottom = Math.min(
    HEIGHT,
    Math.ceil((box.y + box.height) * DEVICE_SCALE_FACTOR + pad),
  );
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

async function captureRegion(state, id, primary, fallback, fallbackLabel) {
  let box = await visibleBox(primary);
  if (box) {
    const region = paddedVideoRegion(box);
    if (region) {
      state.regions[id] = region;
      return;
    }
  }
  box = await visibleBox(fallback);
  const region = box ? paddedVideoRegion(box) : null;
  if (!region)
    throw new Error(`Could not resolve region ${id} or its fallback`);
  state.regions[id] = region;
  state.regionFallbacks.push(`${id}: ${fallbackLabel}`);
}

async function chooseContactChip(page) {
  const result = await page.evaluate(() => {
    const container = document.querySelector(".anf-source-sheet-content");
    if (!(container instanceof HTMLElement)) return null;
    const ids = ["linkedin", "location"];
    for (const id of ids) {
      const chip = document.querySelector(`[data-field="${id}"] .anf-chip`);
      const mark = document.querySelector(
        `.anf-source-list mark[data-field-ids~="${id}"]`,
      );
      if (!(chip instanceof HTMLElement) || !(mark instanceof HTMLElement))
        continue;
      const containerBox = container.getBoundingClientRect();
      const markBox = mark.getBoundingClientRect();
      const desired = Math.max(
        0,
        Math.min(
          container.scrollHeight - container.clientHeight,
          container.scrollTop +
            markBox.top +
            markBox.height / 2 -
            (containerBox.top + container.clientHeight / 2),
        ),
      );
      if (Math.abs(desired - container.scrollTop) >= 12) {
        return { id, expectedDelta: desired - container.scrollTop };
      }
    }
    return null;
  });
  if (!result) {
    throw new Error(
      "Neither the Location nor LinkedIn provenance chip would visibly scroll the source pane",
    );
  }
  return result;
}

async function clearOptionalAskBacks(page) {
  const cleared = [];
  while ((await page.locator(".anf-askback").count()) > 0) {
    const askBack = page.locator(".anf-askback").first();
    const field = askBack.locator("xpath=ancestor::*[@data-field][1]");
    const fieldId = await field.getAttribute("data-field");
    if ((await field.locator(".anf-required").count()) > 0) {
      throw new Error(
        `Required field ${fieldId} has an unanswered free-text ask-back`,
      );
    }
    const control = field.locator(".anf-control").first();
    if ((await control.count()) === 0) {
      throw new Error(
        `Optional field ${fieldId} has an ask-back with no clearable control`,
      );
    }
    // A whitespace input is normalized by the form reducer to a true clear:
    // null value, no provenance, and no lingering question or submit blocker.
    await control.fill(" ");
    cleared.push(fieldId ?? "unknown");
    await page.waitForTimeout(20);
  }
  if (cleared.length > 0) {
    console.log(
      `[review] cleared optional unanswered ask-backs: ${cleared.join(", ")}`,
    );
  }
}

async function runTake(browser, resume, takeNumber) {
  await fs.rm(FRAMES_DIR, { recursive: true, force: true });
  await fs.mkdir(FRAMES_DIR, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.addInitScript(installPromoCapture);
  await page.route("**/api/ai-forms/fill", async (route) => {
    let request;
    try {
      request = route.request().postDataJSON();
    } catch {
      await route.continue();
      return;
    }
    if (request?.mode !== "check") {
      await route.continue();
      return;
    }
    const fillId = `promo-check-${takeNumber}`;
    const body = `${JSON.stringify({
      type: "start",
      fillId,
      targetFieldIds: [],
    })}\n${JSON.stringify({
      type: "done",
      fillId,
      counts: { proposals: 0, questions: 0, flags: 0 },
    })}\n`;
    await sleep(250);
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      headers: { "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
      body,
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error(`[browser] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.error(`[browser] ${error.message}`));

  let recorder;
  const state = {
    marks: {},
    regions: {},
    regionFallbacks: [],
    filledFields: 0,
    suggestions: 0,
    sourceScrollDelta: 0,
  };

  try {
    console.log(`\nTake ${takeNumber}/${MAX_TAKES}`);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector(".anf-drop-zone textarea", { state: "visible" });
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    await page.evaluate(() => window.__installPromoCapture?.());
    await page.locator("#promo-cursor").waitFor({ state: "visible" });
    await sleep(300);

    const badgeVisible = await page.evaluate(() =>
      [...document.querySelectorAll("nextjs-portal")].some((portal) => {
        const style = getComputedStyle(portal);
        const box = portal.getBoundingClientRect();
        return style.display !== "none" && box.width > 0 && box.height > 0;
      }),
    );
    if (badgeVisible)
      throw new Error("The Next.js development badge is still visible");

    const cdp = await context.newCDPSession(page);
    recorder = new ScreencastRecorder(cdp);
    await recorder.start();

    const mark = async (id) => {
      const previousCount = recorder.frames.length;
      let frame = await recorder.nextFrame(previousCount);
      let value = Math.round(
        (frame.timestamp - recorder.frames[0].timestamp) * 1000,
      );
      const previousId = MARK_IDS[MARK_IDS.indexOf(id) - 1];
      while (previousId && value <= state.marks[previousId]) {
        const count = recorder.frames.length;
        frame = await recorder.nextFrame(count);
        value = Math.round(
          (frame.timestamp - recorder.frames[0].timestamp) * 1000,
        );
      }
      state.marks[id] = id === "start" ? 0 : value;
      console.log(`[mark]  ${id.padEnd(24)} ${state.marks[id]} ms`);
    };

    await mark("start");
    await captureRegion(
      state,
      "formPane",
      page.locator(".anf-shell-main"),
      page.locator(".anf-form"),
      "used .anf-form",
    );
    await captureRegion(
      state,
      "sourcePane",
      page.locator(".anf-shell-source"),
      page.locator(".anf-sources"),
      "used .anf-sources",
    );
    await sleep(900);

    const sourceTextarea = page.locator(".anf-drop-zone textarea");
    await cursorClick(page, sourceTextarea, "paste textarea");
    await sourceTextarea.fill(resume);
    await sourceTextarea.dispatchEvent("input");
    await sleep(600);
    await mark("paste");

    const addButton = page.locator(".anf-drop-zone > button", {
      hasText: "Add",
    });
    await cursorClick(page, addButton, "Add source");
    await mark("fillStart");

    await page.locator(".anf-form .anf-chip").first().waitFor({
      state: "visible",
      timeout: 30000,
    });
    await mark("firstField");

    await sleep(4000);
    await smoothWindowBy(page, 700, 2000);
    await smoothWindowToTop(page, 800);

    await page.waitForFunction(
      () => {
        const status =
          document.querySelector(".anf-fill-status")?.textContent ?? "";
        return (
          !status.includes("Fill: streaming") &&
          (status.includes("Fill: done") || status.includes("Fill: error"))
        );
      },
      null,
      { timeout: 30000 },
    );
    const fillStatus = await page.locator(".anf-fill-status").innerText();
    if (!fillStatus.includes("Fill: done")) {
      throw new Error(
        `Fill did not finish successfully: ${fillStatus.replaceAll("\n", " · ")}`,
      );
    }
    await sleep(800);
    await mark("fillDone");

    const fillMatch = fillStatus.match(/(\d+)\/(\d+) filled/);
    const committedFields = fillMatch ? Number(fillMatch[1]) : 0;
    state.suggestions = await page.locator(".anf-ghost").count();
    state.filledFields = committedFields + state.suggestions;
    console.log(
      `[fill]  ${committedFields} committed + ${state.suggestions} suggested = ${state.filledFields} proposals`,
    );
    if (state.filledFields < 12) {
      throw new Error(
        `Only ${state.filledFields} fields were filled; need at least 12`,
      );
    }
    if (state.suggestions < 1) {
      throw new Error("No ghost suggestions were produced; need at least one");
    }

    const sourceScroller = page.locator(".anf-source-sheet-content");
    await smoothIntoView(
      page,
      page.locator('[data-field="linkedin"] .anf-chip'),
    );
    await sourceScroller.evaluate((element) =>
      element.scrollTo({ top: 0, behavior: "auto" }),
    );
    await waitForScrollSettled(page);
    const selectedChip = await chooseContactChip(page);
    const chip = page.locator(`[data-field="${selectedChip.id}"] .anf-chip`);
    await smoothIntoView(page, chip);
    const sourceScrollBefore = await sourceScroller.evaluate(
      (element) => element.scrollTop,
    );
    await cursorClick(page, chip, `${selectedChip.id} provenance`);
    await mark("chipClick");
    await captureRegion(
      state,
      "chipRow",
      chip.locator("xpath=ancestor::*[@data-field][1]"),
      page.locator('[data-field="location"]'),
      "used Location field row",
    );
    await sleep(700);
    await waitForScrollSettled(page);
    const sourceScrollAfter = await sourceScroller.evaluate(
      (element) => element.scrollTop,
    );
    state.sourceScrollDelta = Math.round(
      sourceScrollAfter - sourceScrollBefore,
    );
    if (Math.abs(state.sourceScrollDelta) < 4) {
      throw new Error(
        `${selectedChip.id} provenance changed source scroll by only ${state.sourceScrollDelta}px`,
      );
    }
    await sleep(1600);
    await mark("highlightSettled");
    await captureRegion(
      state,
      "sourceHighlight",
      page.locator('.anf-source-list mark[data-active="true"]'),
      page.locator(".anf-source-list"),
      "used full source list",
    );

    const ghost = page.locator(".anf-ghost").first();
    await smoothIntoView(page, ghost);
    await sleep(1600);
    await mark("ghostFocus");
    await captureRegion(
      state,
      "ghostCard",
      ghost,
      ghost.locator("xpath=ancestor::*[@data-field][1]"),
      "used containing field row",
    );

    await cursorClick(
      page,
      ghost.locator(".anf-ghost-accept"),
      "Accept suggestion",
    );
    await sleep(900);
    await mark("ghostAccept");

    const employedYes = page.locator(
      '[data-field="currentlyEmployed"] .anf-segment',
      { hasText: "Yes" },
    );
    await smoothIntoView(page, employedYes);
    await cursorClick(page, employedYes, "Currently employed: Yes");
    const gateSection = page.locator(".anf-section").filter({
      has: page.getByRole("heading", { name: "Current role", exact: true }),
    });
    await gateSection.waitFor({ state: "visible", timeout: 5000 });
    await sleep(1500);
    await mark("gateAnswer");
    await captureRegion(
      state,
      "gateSection",
      gateSection,
      page.locator('[data-field="employer"]'),
      "used Employer field row",
    );

    await clearOptionalAskBacks(page);

    const reviewBar = page.locator(".anf-review-bar");
    const startReview = reviewBar.getByRole("button", {
      name: /Start review|Review again/,
    });
    await smoothIntoView(page, reviewBar);
    await cursorClick(page, startReview, "Start review");
    await sleep(600);
    await mark("reviewStart");
    await captureRegion(
      state,
      "reviewBar",
      reviewBar,
      page.locator(".anf-form"),
      "used form pane",
    );

    let reviewPresses = 0;
    while (reviewPresses < 30) {
      const finished = (await reviewBar.innerText()).includes("All reviewed");
      if (finished) break;
      await page.keyboard.press("Enter");
      reviewPresses += 1;
      if (reviewPresses === 1) await mark("reviewKeys");
      await sleep(220);
    }
    const reviewText = await reviewBar.innerText();
    if (!reviewText.includes("All reviewed")) {
      throw new Error(
        `Review did not finish after ${reviewPresses} Enter presses: ${reviewText.replaceAll("\n", " · ")}`,
      );
    }
    await mark("reviewDone");

    const eligibility = page.locator(".anf-section").filter({
      has: page.getByRole("heading", { name: "Eligibility", exact: true }),
    });
    await smoothIntoView(page, eligibility);
    const authorization = page.locator(
      '[data-field="workAuthorization"] .anf-select',
    );
    await cursorClick(page, authorization, "Work authorization");
    await authorization.selectOption("citizen");
    const relocateYes = page.locator(
      '[data-field="willingToRelocate"] .anf-segment',
      { hasText: "Yes" },
    );
    await cursorClick(page, relocateYes, "Willing to relocate: Yes");
    await mark("humanAnswer");
    await captureRegion(
      state,
      "humanFields",
      eligibility,
      page.locator('[data-field="workAuthorization"]'),
      "used Work authorization field row",
    );

    const submitSummary = page.locator(".anf-submit-summary");
    await smoothIntoView(page, submitSummary);
    const submit = submitSummary.getByRole("button", {
      name: "Submit",
      exact: true,
    });
    await page.waitForFunction(
      () => {
        const button = [
          ...document.querySelectorAll(".anf-submit-summary button"),
        ].find((candidate) => candidate.textContent?.trim() === "Submit");
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      null,
      { timeout: 10000 },
    );
    await sleep(800);
    await mark("submitReady");
    await captureRegion(
      state,
      "submitSummary",
      submitSummary,
      page.locator("form"),
      "used form",
    );

    await cursorClick(page, submit, "Submit");
    await mark("submitClick");
    const submitted = page.locator(".anf-submitted");
    try {
      await submitted.waitFor({ state: "visible", timeout: 30000 });
    } catch {
      const diagnostic = {
        fillStatus: await page.locator(".anf-fill-status").innerText(),
        submitSummary: await submitSummary.innerText(),
      };
      throw new Error(
        `Submitted result did not render: ${JSON.stringify(diagnostic)}`,
      );
    }
    await smoothIntoView(page, submitted);
    await sleep(1500);
    await mark("submitted");
    await captureRegion(
      state,
      "submittedJson",
      submitted,
      submitSummary,
      "used submit summary",
    );
    await mark("end");

    await recorder.stop();
    const capturedFrames = recorder.frames.map(({ buffer, ...frame }) => frame);
    recorder = null;

    if (!(await page.locator(".anf-submitted").isVisible())) {
      throw new Error("The submitted result disappeared before capture ended");
    }
    if (MARK_IDS.some((id) => !Number.isInteger(state.marks[id]))) {
      throw new Error("One or more required marks were not captured");
    }
    if (REGION_IDS.some((id) => !state.regions[id])) {
      throw new Error("One or more required regions were not captured");
    }

    return { state, capturedFrames };
  } finally {
    if (recorder) {
      await recorder.stop().catch(() => {});
    }
    await context.close();
  }
}

async function assemble(frames) {
  if (frames.length < 2)
    throw new Error(`Only ${frames.length} screencast frames were captured`);
  const deltas = frames
    .slice(1)
    .map((frame, index) => frame.timestamp - frames[index].timestamp)
    .filter((delta) => Number.isFinite(delta) && delta > 0 && delta < 1);
  const tailDuration = percentile(deltas.slice(-120), 0.5) ?? 1 / FPS;
  const lines = ["ffconcat version 1.0"];
  for (let index = 0; index < frames.length; index += 1) {
    const current = frames[index];
    const next = frames[index + 1];
    const duration = next
      ? Math.max(1 / 240, next.timestamp - current.timestamp)
      : tailDuration;
    lines.push(`file '${ffconcatPath(current.filePath)}'`);
    lines.push(`duration ${duration.toFixed(9)}`);
  }
  lines.push(`file '${ffconcatPath(frames.at(-1).filePath)}'`);
  await fs.writeFile(CONCAT_PATH, `${lines.join("\n")}\n`);

  await command("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    CONCAT_PATH,
    "-an",
    "-r",
    String(FPS),
    "-vf",
    "scale=in_range=pc:out_range=tv,format=yuv420p",
    "-c:v",
    "libx264",
    "-crf",
    "16",
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-color_range",
    "tv",
    "-movflags",
    "+faststart",
    TEMP_VIDEO_PATH,
  ]);
}

async function probeVideo(filePath) {
  const { stdout } = await command("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_entries",
    "stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,pix_fmt,nb_read_frames:format=duration",
    "-of",
    "json",
    filePath,
  ]);
  return JSON.parse(stdout);
}

function validateProbe(probe) {
  const videoStreams = probe.streams.filter(
    (stream) => stream.codec_type === "video",
  );
  const audioStreams = probe.streams.filter(
    (stream) => stream.codec_type === "audio",
  );
  const video = videoStreams[0];
  if (videoStreams.length !== 1 || audioStreams.length !== 0) {
    throw new Error(
      "Encoded video must contain exactly one video stream and no audio",
    );
  }
  if (
    video.codec_name !== "h264" ||
    video.width !== WIDTH ||
    video.height !== HEIGHT ||
    video.r_frame_rate !== "30/1" ||
    video.avg_frame_rate !== "30/1" ||
    video.pix_fmt !== "yuv420p"
  ) {
    throw new Error(
      `Encoded video has unexpected properties: ${JSON.stringify(video)}`,
    );
  }
  const durationSeconds = Number(probe.format.duration);
  const frameCount = Number(video.nb_read_frames);
  if (durationSeconds < 25) {
    throw new Error(
      `Encoded video is only ${durationSeconds.toFixed(3)} seconds; need at least 25`,
    );
  }
  if (Math.abs(frameCount - durationSeconds * FPS) > 1) {
    throw new Error(
      `Frame count ${frameCount} does not match ${durationSeconds.toFixed(3)} seconds at ${FPS} fps`,
    );
  }
  return { video, durationSeconds, frameCount };
}

function validateTimeline(timeline) {
  const values = MARK_IDS.map((id) => timeline.marks[id]);
  if (
    values.some((value) => !Number.isInteger(value)) ||
    values.some((value, index) => index > 0 && value <= values[index - 1]) ||
    values.some((value) => value < 0 || value > timeline.durationMs)
  ) {
    throw new Error(
      "Timeline marks are missing, unordered, or outside the video duration",
    );
  }
  for (const id of REGION_IDS) {
    const region = timeline.regions[id];
    if (
      !region ||
      ![region.x, region.y, region.w, region.h].every(Number.isInteger) ||
      region.w <= 0 ||
      region.h <= 0 ||
      region.x < 0 ||
      region.y < 0 ||
      region.x + region.w > WIDTH ||
      region.y + region.h > HEIGHT
    ) {
      throw new Error(
        `Timeline region ${id} is missing or outside the video canvas`,
      );
    }
  }
  if (timeline.stats.filledFields < 12 || timeline.stats.suggestions < 1) {
    throw new Error("Timeline fill statistics do not meet the minimums");
  }
}

async function extractStills(marks) {
  await fs.mkdir(STILLS_DIR, { recursive: true });
  for (const id of ["paste", "fillDone", "highlightSettled"]) {
    const output = path.join(STILLS_DIR, `${id}.jpg`);
    await command("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      (marks[id] / 1000).toFixed(3),
      "-i",
      TEMP_VIDEO_PATH,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      output,
    ]);
    const stat = await fs.stat(output);
    if (stat.size <= 50 * 1024) {
      throw new Error(
        `${id}.jpg is only ${stat.size} bytes; the still may be blank`,
      );
    }
  }
}

function printSummary(timeline, probe) {
  console.log("\nFinal marks");
  console.table(
    Object.entries(timeline.marks).map(([mark, timestampMs]) => ({
      mark,
      timestampMs,
    })),
  );
  console.log("Stats");
  console.table(timeline.stats);
  console.log("ffprobe");
  console.log(JSON.stringify(probe, null, 2));
  console.log(`Headless mode: ${HEADLESS}`);
  console.log(
    `Region fallbacks: ${timeline.regionFallbacks?.length ? timeline.regionFallbacks.join("; ") : "none"}`,
  );
  console.log(`Takes: ${timeline.stats.takes}`);
}

async function main() {
  await preflight();
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  const resume = await fs.readFile(RESUME_PATH, "utf8");
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: HEADLESS,
    args: [
      "--hide-scrollbars",
      "--disable-infobars",
      "--force-device-scale-factor=2",
    ],
  });

  let successful;
  let lastError;
  try {
    for (let take = 1; take <= MAX_TAKES; take += 1) {
      try {
        successful = await runTake(browser, resume, take);
        successful.take = take;
        break;
      } catch (error) {
        lastError = error;
        console.error(`Take ${take} abandoned: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (!successful) {
    throw new Error(
      `All ${MAX_TAKES} takes failed. Last failure: ${lastError?.message}`,
    );
  }

  await assemble(successful.capturedFrames);
  const probe = await probeVideo(TEMP_VIDEO_PATH);
  const { durationSeconds, frameCount } = validateProbe(probe);
  const timeline = {
    version: 1,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    video: "demo.mp4",
    durationMs: Math.round(durationSeconds * 1000),
    capturedAt: new Date().toISOString(),
    marks: successful.state.marks,
    regions: successful.state.regions,
    stats: {
      filledFields: successful.state.filledFields,
      suggestions: successful.state.suggestions,
      frames: frameCount,
      takes: successful.take,
    },
  };
  if (successful.state.regionFallbacks.length > 0) {
    timeline.regionFallbacks = successful.state.regionFallbacks;
  }
  validateTimeline(timeline);
  await extractStills(timeline.marks);
  await fs.rename(TEMP_VIDEO_PATH, VIDEO_PATH);
  await fs.writeFile(
    `${TIMELINE_PATH}.tmp`,
    `${JSON.stringify(timeline, null, 2)}\n`,
  );
  await fs.rename(`${TIMELINE_PATH}.tmp`, TIMELINE_PATH);
  await fs.rm(CONCAT_PATH, { force: true });
  await fs.rm(FRAMES_DIR, { recursive: true, force: true });

  printSummary(timeline, probe);
}

main().catch(async (error) => {
  await fs.rm(TEMP_VIDEO_PATH, { force: true }).catch(() => {});
  await fs.rm(CONCAT_PATH, { force: true }).catch(() => {});
  console.error(`\nCapture failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
