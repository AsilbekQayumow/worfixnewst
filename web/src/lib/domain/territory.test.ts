import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTrace, contains, decay, loopAround, loopState, overlapM2, shapeArea, shrinkShape, subtractShape, TERRITORY, traceToShape, unionShapes, type Shape } from "./territory";

const C = { lat: 39.6542, lng: 66.9597 };
const ok = (r: ReturnType<typeof traceToShape>) => { if ("error" in r) throw new Error(r.error); return r; };

test("a 150 m loop on foot becomes an area of about π·150²", () => {
  const r = ok(traceToShape(loopAround(C, 150)));
  assert.ok(r.areaM2 > 55_000 && r.areaM2 < 85_000, String(r.areaM2));
  assert.ok(contains(r.shape, C));
  assert.ok(!contains(r.shape, { lat: C.lat + 0.01, lng: C.lng }));
});

test("driving does not count: fixes reached too fast are dropped", () => {
  const car = loopAround(C, 300, 36, 0, 45);
  const c = cleanTrace(car);
  assert.ok(c.droppedFast > 20);
  assert.equal("error" in traceToShape(car), true);
});

test("a walk that does not come back is not closed; Finish works only near the start", () => {
  const open = loopAround(C, 150).slice(0, 30);
  const r = traceToShape(open);
  assert.ok("error" in r && r.error === "not_closed" && (r.toStartM ?? 0) > 100);
  const almost = loopAround(C, 150, 72).slice(0, 70); // ~26 m short of the start
  assert.equal(loopState(almost).canFinish, true);
  assert.ok(!("error" in traceToShape(almost, { forceClose: true })));
});

test("tiny and huge loops are refused", () => {
  const tiny = traceToShape(loopAround(C, 20, 30, 0, 3));
  assert.ok("error" in tiny);
  const huge = traceToShape(loopAround(C, 1500, 120, 0, 12, 0));
  assert.ok("error" in huge && huge.error === "too_big");
});

test("union, subtraction and overlap", () => {
  const a = ok(traceToShape(loopAround(C, 150))).shape;
  const b = ok(traceToShape(loopAround({ lat: C.lat, lng: C.lng + 0.0025 }, 150))).shape;
  const ov = overlapM2(a, b);
  assert.ok(ov > 5_000, String(ov));
  const u = unionShapes(a, b)!;
  assert.ok(Math.abs(shapeArea(u) - (shapeArea(a) + shapeArea(b) - ov)) < 2_000);
  const left = subtractShape(a, b)!;
  assert.ok(Math.abs(shapeArea(left) - (shapeArea(a) - ov)) < 2_000);
  assert.equal(subtractShape(a, a), null);
});

test("decay: an ignored mission shrinks the area 10% a day after the grace period", () => {
  const s: Shape = ok(traceToShape(loopAround(C, 150))).shape;
  const a0 = shapeArea(s);
  const now = Date.parse("2026-11-10T12:00:00Z");
  const none = decay(s, "2026-11-01T00:00:00Z", [], now);
  assert.equal(none.days, 0);
  const r = decay(s, "2026-11-01T00:00:00Z", ["2026-11-07T12:00:00Z"], now);
  assert.equal(r.days, 3);
  assert.ok(Math.abs(shapeArea(r.shape) / a0 - TERRITORY.dailyKeep ** 3) < 0.02);
  // a second run the same day changes nothing
  assert.equal(decay(r.shape!, r.checkedAt, ["2026-11-07T12:00:00Z"], now).days, 0);
  assert.equal(shrinkShape(s, 0.001), null);
});
