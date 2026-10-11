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
  assert.equal(delivery.changes(defaults, "front", insets).length, 4);
  assert.equal(delivery.changes(defaults, "front", insets).length, 0);
  assert.deepEqual(
    delivery.changes({ ...defaults, theme: "dark" }, "front", insets),
    [["app:theme", { value: "dark" }]],
  );
  assert.equal(
    new StateDelivery().changes(defaults, "article", insets).length,
    4,
  );
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
