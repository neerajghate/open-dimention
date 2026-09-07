import test from "node:test";
import assert from "node:assert/strict";
import { Motion } from "../src/motion.js";
test("storage motion completes at its target and stops requesting frames", () => {
  const motion = new Motion();
  motion.set(1, 100);
  assert.equal(motion.tick(410), true);
  assert.equal(motion.value, 0.5);
  assert.equal(motion.tick(720), false);
  assert.equal(motion.value, 1);
  assert.equal(motion.tick(1200), false);
});
test("reversing storage motion stays continuous and finishes closed", () => {
  const motion = new Motion();
  motion.set(1, 0);
  motion.tick(310);
  motion.set(0, 310);
  assert.equal(motion.value, 0.5);
  assert.equal(motion.tick(425), true);
  assert.ok(motion.value > 0 && motion.value < 0.5);
  assert.equal(motion.tick(540), false);
  assert.equal(motion.value, 0);
});
test("reduced motion settles immediately, including an interrupted opening", () => {
  const motion = new Motion();
  motion.set(1, 0);
  motion.tick(100);
  motion.set(0, 100, true);
  assert.equal(motion.value, 0);
  assert.equal(motion.tick(200), false);
  motion.set(1, 200, true);
  assert.equal(motion.value, 1);
  assert.equal(motion.tick(300), false);
});
