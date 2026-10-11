import assert from "node:assert/strict";
import { test } from "node:test";
import { ConsentService } from "../src/core/consent";

const response = (consent: string | null) =>
  new Response(JSON.stringify({ consent }));
test("five-second gate releases without cancelling the late consent answer", async () => {
  let resolve!: (response: Response) => void;
  let choices = 0;
  const fetcher = (() =>
    new Promise<Response>((done) => {
      resolve = done;
    })) as typeof fetch;
  const service = new ConsentService(
    "http://fixture",
    () => choices++,
    fetcher,
    15,
  );
  const pending = service.refresh();
  assert.equal(service.snapshot().waiting, true);
  await new Promise((done) => setTimeout(done, 30));
  assert.deepEqual(service.snapshot(), { value: null, waiting: false });
  assert.equal(choices, 0);
  resolve(response("late-choice"));
  await pending;
  assert.deepEqual(service.snapshot(), {
    value: "late-choice",
    waiting: false,
  });
  assert.equal(choices, 1);
});
test("null and errors allow reading but never allow tracking", async () => {
  for (const fetcher of [
    async () => response(null),
    async () => {
      throw new Error("offline");
    },
  ]) {
    let choices = 0;
    const service = new ConsentService(
      "http://fixture",
      () => choices++,
      fetcher as typeof fetch,
    );
    await service.refresh();
    assert.deepEqual(service.snapshot(), { value: null, waiting: false });
    assert.equal(choices, 0);
  }
});
test("an older foreground response cannot overwrite a newer choice", async () => {
  const resolvers: ((response: Response) => void)[] = [];
  const service = new ConsentService(
    "http://fixture",
    () => {},
    (() =>
      new Promise<Response>((done) => resolvers.push(done))) as typeof fetch,
  );
  const old = service.refresh();
  const fresh = service.refresh();
  resolvers[1](response("new"));
  await fresh;
  resolvers[0](response("old"));
  await old;
  assert.equal(service.snapshot().value, "new");
});
