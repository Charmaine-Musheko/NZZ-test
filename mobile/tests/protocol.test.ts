import assert from "node:assert/strict";
import { test } from "node:test";
import {
  articlePath,
  defaults,
  markRead,
  pageUrl,
  parseMessage,
  restorePreferences,
  StateDelivery,
} from "../src/core/protocol";

test("only same-origin article paths stay in the app, preserving query strings", () => {
  const origin = "http://localhost:8787";
  assert.equal(
    articlePath("/article/3?ref=related&x=1", origin),
    "/article/3?ref=related&x=1",
  );
  assert.equal(
    articlePath("http://localhost.example.org:8787/article/3", origin),
    null,
  );
  assert.equal(
    articlePath("https://partner.example.org/article/3", origin),
    null,
  );
  assert.equal(articlePath("mailto:news@example.org", origin), null);
  assert.equal(articlePath("/article/3/extra", origin), null);
});
test("consent uses an encoded fragment and never loses the query", () => {
  const url = new URL(
    pageUrl("/article/2?ref=front", "http://localhost:8787", "choice&=/#"),
  );
  assert.equal(url.search, "?ref=front");
  assert.equal(url.hash, "#consent=choice%26%3D%2F%23");
  assert.equal(new URL(pageUrl("/front", url.origin, null)).hash, "");
});
test("initial state once, each changed field once, fresh document receives a fresh snapshot", () => {
  const delivery = new StateDelivery();
  const insets = { top: 70, bottom: 20 };
  const first = delivery.next(defaults, "front", insets);
  assert.equal(first.events.length, 4);
  delivery.ack(first.seq);
  assert.equal(delivery.next(defaults, "front", insets).events.length, 0);
  const changed = delivery.next({ ...defaults, theme: "dark" }, "front", insets);
  assert.deepEqual(changed.events, [["app:theme", { value: "dark" }]]);
  delivery.ack(changed.seq);
  assert.equal(
    new StateDelivery().next(defaults, "article", insets).events.length,
    4,
  );
});
test("an injection the page never acknowledges is offered again", () => {
  const delivery = new StateDelivery();
  const insets = { top: 70, bottom: 20 };
  const first = delivery.next(defaults, "front", insets);
  assert.equal(first.events.length, 4);
  assert.equal(delivery.awaiting, true);
  // Unacknowledged: the same payload must come back, under the same sequence
  // number, so a resend cannot be mistaken for a second change.
  const retry = delivery.next(defaults, "front", insets);
  assert.equal(retry.seq, first.seq);
  assert.deepEqual(retry.events, first.events);
  // A change while the first is still outstanding supersedes it and still
  // carries everything the page has not confirmed.
  const changed = delivery.next({ ...defaults, theme: "dark" }, "front", insets);
  assert.notEqual(changed.seq, first.seq);
  assert.equal(changed.events.length, 4);
  delivery.ack(first.seq);
  assert.equal(delivery.awaiting, true, "a stale acknowledgement means nothing");
  delivery.ack(changed.seq);
  assert.equal(delivery.awaiting, false);
  assert.equal(delivery.next({ ...defaults, theme: "dark" }, "front", insets).events.length, 0);
});
test("read history is unique, ordered by most recent reading, and limited to five", () => {
  let state = defaults;
  for (let n = 1; n <= 7; n++)
    state = markRead(state, {
      id: String(n),
      title: `Story ${n}`,
      path: `/article/${n}`,
    });
  state = markRead(state, { id: "4", title: "Story 4", path: "/article/4" });
  assert.deepEqual(
    state.recent.map((a) => a.id),
    ["4", "7", "6", "5", "3"],
  );
  assert.equal(state.read.length, 7);
});
test("malformed messages and corrupted preferences cannot crash the bridge", () => {
  for (const input of ["tp:heartbeat", "null", "[]", "{"])
    assert.equal(parseMessage(input), null);
  assert.deepEqual(restorePreferences("{"), defaults);
  assert.equal(restorePreferences('{"fontScale":100}').fontScale, 1.6);
  assert.deepEqual(
    restorePreferences('{"bookmarks":["1",null,"1",3]}').bookmarks,
    ["1"],
  );
});
