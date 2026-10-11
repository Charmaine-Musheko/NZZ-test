import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { defaults, StateDelivery } from "../src/core/protocol";
import { bootstrapScript, stateScript } from "../src/web/bootstrap";

// These run the unmodified fixture in a real browser, separately from the phone's server.
// They exercise DOM integration; they do not replace iOS / Android WebView tests.
let server: ChildProcess;
let browser: Browser;
const origin = "http://127.0.0.1:8788";
const insets = { top: 100, bottom: 32 };
before(async () => {
  server = spawn(process.execPath, ["fixture/server.mjs"], {
    cwd: resolve(".."),
    env: { ...process.env, PORT: "8788" },
    windowsHide: true,
  });
  await new Promise<void>((done, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Fixture failed to start")),
      15000,
    );
    server.stdout?.on("data", (chunk) => {
      if (String(chunk).includes("Control panel")) {
        clearTimeout(timeout);
        done();
      }
    });
    server.on("error", reject);
  });
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  const executablePath = candidates.find(
    (path): path is string => !!path && existsSync(path),
  );
  if (!executablePath)
    throw new Error(
      "Set CHROME_PATH to a Chrome or Chromium executable to run browser integration tests.",
    );
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function open(pageType: "front" | "article", id?: string) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(
    `window.__messages = []; window.ReactNativeWebView = { postMessage: function (raw) { try { window.__messages.push(JSON.parse(raw)); } catch (_) {} } };`,
  );
  await page.addInitScript(
    bootstrapScript({
      page: pageType,
      articleId: id,
      context: {
        appVersion: "1",
        appBuild: "1",
        os: "android",
        deviceType: "phone",
      },
      insets,
    }),
  );
  await page.goto(
    `${origin}/${pageType === "front" ? "front" : `article/${id}`}?ref=browser-check#consent=test-choice`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForFunction(() =>
    (window as any).__messages.some((message: any) => message.type === "ready"),
  );
  return page;
}
async function messages(page: Page, type: string) {
  return page.evaluate(
    (type) =>
      (window as any).__messages.filter(
        (message: any) => message.type === type,
      ),
    type,
  );
}

test("front-page integration: context precedes tracker, state is delivered once, links and heights work", async () => {
  const page = await open("front");
  try {
    const delivery = new StateDelivery();
    await page.evaluate(
      stateScript(
        delivery.changes(defaults, "front", insets),
        true,
        true,
        insets,
      ),
    );
    await page.evaluate(
      stateScript(
        delivery.changes(defaults, "front", insets),
        true,
        true,
        insets,
      ),
    );
    const status = await page.locator("#status").innerText();
    assert.match(status, /font scale[^\n]*applied ×1/);
    assert.match(status, /theme[^\n]*applied ×1/);
    const initialHeight = (await messages(page, "height")).at(-1).value;
    await page.evaluate(
      stateScript(
        delivery.changes({ ...defaults, fontScale: 1.4 }, "front", insets),
        true,
        true,
        insets,
      ),
    );
    await page.waitForTimeout(250);
    assert.ok((await messages(page, "height")).at(-1).value > initialHeight);
    await page.locator('a[href="#more-stories"]').first().click();
    assert.ok((await messages(page, "native:anchor")).at(-1).y > 0);
    await page.locator('a[href="/article/3?ref=front"]').first().click();
    assert.match(
      (await messages(page, "native:link")).at(-1).url,
      /\/article\/3\?ref=front$/,
    );
    assert.match(page.url(), /\/front\?/);
    const event = await page.evaluate(() =>
      (window as any).__messages.find(
        (message: any) => message.command === "trackPageView",
      ),
    );
    assert.ok(
      event.context.some((context: any) => context.data.appVersion === "1"),
    );
  } finally {
    await page.close();
  }
});

test("article integration: only the final text line counts, with chrome and screen visibility respected", async () => {
  const page = await open("article", "1");
  try {
    const delivery = new StateDelivery();
    await page.evaluate(
      stateScript(
        delivery.changes(defaults, "article", insets),
        true,
        true,
        insets,
      ),
    );
    assert.equal((await messages(page, "native:read")).length, 0);
    assert.equal(
      await page.evaluate(() => (window as any).__insetsAtStart),
      true,
    );
    await page.evaluate(stateScript([], false, true, insets));
    await page.evaluate(({ bottom }) => {
      const last = Array.from(
        document.querySelectorAll(".articlecomponent.text p"),
      ).at(-1)!;
      window.scrollTo(
        0,
        window.scrollY +
          last.getBoundingClientRect().bottom -
          (window.innerHeight - bottom - 2),
      );
    }, insets);
    await page.waitForTimeout(350);
    assert.equal(
      (await messages(page, "native:read")).length,
      0,
      "covered / inactive screens must not mark read",
    );
    await page.evaluate(stateScript([], true, true, insets));
    await page.waitForFunction(() =>
      (window as any).__messages.some(
        (message: any) => message.type === "native:read",
      ),
    );
    await page.evaluate(() => window.scrollBy(0, 100));
    await page.waitForTimeout(700);
    assert.equal((await messages(page, "native:read")).length, 1);
    assert.equal((await messages(page, "native:read"))[0].articleId, "1");
  } finally {
    await page.close();
  }
});
