import assert from "node:assert/strict";
import { test } from "node:test";
import { TrackingService } from "../src/core/tracking";

test("pre-consent native and web events wait, then reach the real vendor SDK exactly once", async () => {
  const originalFetch = global.fetch;
  const batches: any[] = [];
  global.fetch = (async (_url, options) => {
    batches.push(JSON.parse(String(options?.body)));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const tracker = new TrackingService({
      namespace: "news-app-test",
      endpoint: "http://fixture",
      appVersion: "1.0.0",
      platform: "android",
    });
    tracker.screen("front");
    tracker.web(
      JSON.stringify({
        command: "trackPageView",
        event: { pageUrl: "http://fixture/front" },
      }),
    );
    tracker.web('{"type":"ready","protocol":1,"page":"front"}');
    tracker.web("tp:heartbeat");
    tracker.read("1");
    await new Promise((done) => setTimeout(done, 30));
    assert.equal(batches.length, 0);
    tracker.allow();
    tracker.allow();
    await new Promise((done) => setTimeout(done, 1100));
    const events = batches.flatMap((batch) => batch.events);
    assert.deepEqual(
      events.map((event) => event.e),
      ["screen_view", "page_view", "self_describing"],
    );
    assert.equal(new Set(events.map((event) => event.eid)).size, 3);
    assert.equal(events[1].source, "webview");
  } finally {
    global.fetch = originalFetch;
  }
});
