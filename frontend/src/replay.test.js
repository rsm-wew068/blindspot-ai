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

import { enteredCollision } from './impact.js';
test('impact sound fires only when playback enters a collision, never on scrubbing or switches', () => {
  const run = {};
  const before = {run, time:2.9, playing:true};
  const end = {run, time:3, duration:3, collision:true, fromPlayback:true};
  assert.equal(enteredCollision(before, end), true);
  assert.equal(enteredCollision(before, {...end, fromPlayback:false}), false);
  assert.equal(enteredCollision({...before, playing:false}, end), false);
  assert.equal(enteredCollision({...before, run:{}}, end), false);
  assert.equal(enteredCollision({...before, time:3}, end), false);
  assert.equal(enteredCollision(before, {...end, collision:false}), false);
});

import { highwayFrame } from './highwayScene.js';
test('highway replay interpolates lane motion and traffic by stable vehicle identity', () => {
  const frames = [
    {t:0,x:0,y:0,v:20,traffic:[{id:'a',x:10,y:0},{id:'b',x:30,y:3.6}]},
    {t:1,x:20,y:3.6,v:22,traffic:[{id:'b',x:50,y:3.6},{id:'a',x:34,y:0}]},
  ];
  const frame = highwayFrame(frames,.5);
  assert.equal(frame.x,10);assert.equal(frame.y,1.8);
  assert.equal(frame.traffic[0].x,22);assert.equal(frame.traffic[1].x,40);
  assert.deepEqual(highwayFrame(frames,5),frames[1]);
});
