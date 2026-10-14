import test from "node:test";
import assert from "node:assert/strict";
import { frameAt } from "./replay.js";
const frames = [
  { t: 0, x: 0, v: 10, ped_y: 5, visible: false, a: 0 },
  { t: 1, x: 8, v: 6, ped_y: 3, visible: true, a: -4 },
];
test("interpolation preserves observations until their recorded timestamp", () => {
  const f = frameAt(frames, 0.5);
  assert.equal(f.x, 4);
  assert.equal(f.v, 8);
  assert.equal(f.ped_y, 4);
  assert.equal(f.visible, false);
  assert.equal(frameAt(frames, 1).visible, true);
});
test("end of replay is clamped and absent pedestrians remain absent", () => {
  assert.deepEqual(frameAt(frames, 10), frames[1]);
  assert.equal(
    frameAt(
      frames.map((f) => ({ ...f, ped_y: null })),
      0.5,
    ).ped_y,
    null,
  );
});
