import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createStore } from "../server/store.mjs";
import { insideRoom, layoutProblem } from "../shared/spatial.js";
const room = (s, more = {}) =>
  s.createNode({ type: "dim", title: "Project", x: 0, y: 0, z: 0, ...more });
const doc = (s, more = {}) =>
  s.createNode({
    type: "note",
    title: "Keep this note",
    content: "My original content",
    x: -1600,
    y: 0,
    z: 0,
    ...more,
  });
const fixture = (t) => {
  const s = createStore(":memory:", { seed: false });
  t.after(() => s.close());
  return s;
};

test("named areas preserve identity on rename; removal moves active and trashed documents without losing links", (t) => {
  const s = fixture(t),
    dim = room(s),
    z = s.createZone(dim.id, { type: "desk", name: "This week" }).zone;
  const a = doc(s, { dimId: dim.id, zoneId: z.id, autoPlace: true }),
    b = doc(s, { dimId: dim.id, zoneId: z.id, autoPlace: true }),
    outside = doc(s);
  s.createEdge({ source: a.id, target: outside.id, label: "Reference" });
  s.deleteNode(b.id);
  s.renameZone(dim.id, z.id, { name: "Next week" });
  assert.equal(s.getNode(a.id).zoneId, z.id);
  assert.equal(
    s.getNode(dim.id).payload.zones.find((x) => x.id === z.id).name,
    "Next week",
  );
  s.updateNode(dim.id, { payload: { color: "#123456" } });
  assert.equal(s.getNode(dim.id).payload.zones.length, 3);
  s.removeZone(dim.id, z.id, { replacementId: "storage" });
  for (const id of [a.id, b.id]) {
    assert.equal(s.getNode(id).zoneId, "storage");
    assert.equal(s.getNode(id).area, "storage");
    assert.equal(s.getNode(id).content, "My original content");
  }
  assert.ok(s.getNode(b.id).deletedAt);
  assert.equal(s.graph().edges.length, 1);
  s.restore(b.id);
  assert.equal(s.getNode(b.id).zoneId, "storage");
  assert.equal(layoutProblem(s.graph().nodes), null);
});

test("area names, limits, ownership and orphaned membership are validated atomically", (t) => {
  const s = fixture(t),
    dim = room(s),
    other = room(s, { x: 2200 });
  const z = s.createZone(dim.id, { type: "storage", name: "Research" }).zone;
  assert.throws(
    () => s.createZone(dim.id, { type: "storage", name: "research" }),
    /unique/,
  );
  assert.throws(() => s.renameZone(dim.id, z.id, { name: "   " }), /unique/);
  assert.throws(
    () => s.removeZone(dim.id, "desk", { replacementId: "storage" }),
    /one to four/,
  );
  assert.throws(
    () => doc(s, { dimId: other.id, zoneId: z.id, autoPlace: true }),
    /Choose a Desk/,
  );
  s.createZone(dim.id, { type: "storage", name: "Assets" });
  s.createZone(dim.id, { type: "storage", name: "Reading" });
  const before = s.export();
  assert.throws(
    () => s.createZone(dim.id, { type: "storage", name: "Overflow" }),
    /one to four/,
  );
  assert.deepEqual(s.graph().nodes, before.nodes);
  const child = doc(s, { dimId: dim.id, zoneId: z.id, autoPlace: true });
  const payload = structuredClone(s.getNode(dim.id).payload);
  payload.zones = payload.zones.filter((x) => x.id !== z.id);
  assert.throws(() => s.updateNode(dim.id, { payload }), /Move documents/);
  assert.equal(s.getNode(child.id).zoneId, z.id);
});

test("outsiders cannot enter reserved footprints by create, numeric update, batch move or height changes", (t) => {
  const s = fixture(t),
    dim = room(s),
    outside = doc(s),
    before = s.graph();
  assert.throws(
    () => doc(s, { x: 0, y: 4500, z: 0 }),
    /cover unrelated|belongs/,
  );
  assert.throws(
    () => s.updateNode(outside.id, { x: 100, y: -4000, z: 100 }),
    /cover unrelated|belongs/,
  );
  assert.throws(
    () => s.batchPositions([{ id: outside.id, x: 0, y: 0, z: 0 }]),
    /cover unrelated|belongs/,
  );
  assert.deepEqual(s.graph(), before);
  const child = doc(s, { dimId: dim.id, autoPlace: true });
  assert.throws(() => s.updateNode(child.id, { x: -1500 }), /inside their Dim/);
  const other = room(s, { x: 2400 });
  assert.throws(
    () => s.updateNode(child.id, { x: other.x }),
    /inside their Dim|belongs/,
  );
  assert.equal(layoutProblem(s.graph().nodes), null);
});

test("assignment is the deliberate way into a room; leaving places documents outside every room", (t) => {
  const s = fixture(t),
    dim = room(s),
    other = room(s, { x: 2400 }),
    outside = doc(s),
    z = s.createZone(dim.id, { type: "desk", name: "Launch" }).zone;
  s.organize({ ids: [outside.id], dimId: dim.id, zoneId: z.id });
  const assigned = s.getNode(outside.id);
  assert.equal(assigned.zoneId, z.id);
  assert.equal(assigned.area, "desk");
  assert.ok(insideRoom(assigned, dim));
  s.updateNode(outside.id, { dimId: other.id, zoneId: null });
  assert.equal(s.getNode(outside.id).dimId, other.id);
  assert.equal(s.getNode(outside.id).zoneId, "desk");
  s.organize({ ids: [outside.id], dimId: null });
  const released = s.getNode(outside.id);
  assert.equal(released.zoneId, null);
  assert.equal(released.dimId, null);
  assert.ok(!insideRoom(released, other, 135));
  assert.equal(layoutProblem(s.graph().nodes), null);
});

test("moving rooms cannot sweep over outsiders or overlap other rooms; valid groups move exactly once", (t) => {
  const s = fixture(t),
    dim = room(s),
    child = doc(s, { dimId: dim.id, autoPlace: true }),
    outside = doc(s),
    other = room(s, { x: 2400 }),
    before = s.graph();
  assert.throws(
    () => s.updateNode(dim.id, { x: outside.x }),
    /unrelated|belongs/,
  );
  assert.throws(
    () => s.batchPositions([{ id: dim.id, x: other.x, y: 0, z: 0 }]),
    /own space/,
  );
  assert.deepEqual(s.graph(), before);
  s.batchPositions([
    { id: dim.id, x: 0, y: 30, z: 100 },
    { id: child.id, x: child.x, y: child.y + 30, z: child.z + 100 },
  ]);
  assert.equal(s.getNode(child.id).y, child.y + 30);
  assert.equal(s.getNode(child.id).z, child.z + 100);
});

test("restore relocates a room when its old space is occupied and keeps document relationships", (t) => {
  const s = fixture(t),
    dim = room(s),
    child = doc(s, { dimId: dim.id, autoPlace: true }),
    outside = doc(s);
  s.createEdge({ source: child.id, target: outside.id });
  s.deleteNode(dim.id);
  const blocker = doc(s, { x: 0, z: 0 });
  s.restore(dim.id);
  const restored = s.getNode(dim.id),
    n = s.getNode(child.id);
  assert.deepEqual(s.getNode(blocker.id), blocker);
  assert.equal(n.x - restored.x, child.x - dim.x);
  assert.equal(n.z - restored.z, child.z - dim.z);
  assert.equal(s.graph().edges.length, 1);
  assert.equal(layoutProblem(s.graph().nodes), null);
});

test("version 3 import keeps named areas and repairs incoming overlap without shifting existing content", (t) => {
  const s = fixture(t),
    source = createStore(":memory:", { seed: false });
  t.after(() => source.close());
  const existing = room(s),
    loose = doc(s),
    r = room(source),
    z = source.createZone(r.id, { type: "storage", name: "Sources" }).zone;
  const n = doc(source, { dimId: r.id, zoneId: z.id, autoPlace: true });
  source.createEdge({ source: r.id, target: n.id });
  const data = source.export();
  assert.equal(data.version, 4);
  const preview = s.importWorkspace(data, true);
  assert.equal(preview.items, 2);
  assert.equal(s.graph().nodes.length, 2);
  s.importWorkspace(data);
  assert.deepEqual(s.getNode(existing.id), existing);
  assert.deepEqual(s.getNode(loose.id), loose);
  const imported = s.graph().nodes.find((n) => n.dimId);
  assert.equal(imported.zoneId, z.id);
  assert.equal(
    s
      .getNode(imported.dimId)
      .payload.zones.find((z) => z.id === imported.zoneId).name,
    "Sources",
  );
  assert.equal(layoutProblem(s.graph().nodes), null);
  const bad = structuredClone(data);
  bad.nodes.find((n) => n.type === "note").zoneId = "missing";
  const before = s.graph();
  assert.throws(() => s.importWorkspace(bad, true), /missing Desk/);
  assert.throws(() => s.importWorkspace(bad), /missing Desk/);
  assert.deepEqual(s.graph(), before);
});

test("organizer migration handles old Dim payloads and spatial conflicts once, preserving content across restart", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "dimention-organizers-")),
    path = join(folder, "old.sqlite");
  t.after(() => rm(folder, { recursive: true, force: true }));
  let s = createStore(path, { seed: false });
  const dim = room(s),
    child = doc(s, { dimId: dim.id, autoPlace: true }),
    outside = doc(s);
  s.createEdge({ source: child.id, target: outside.id });
  s.close();
  const db = new DatabaseSync(path);
  db.prepare("DELETE FROM metadata WHERE key=?").run("organizers-v3");
  db.prepare("UPDATE nodes SET payload=? WHERE id=?").run(
    JSON.stringify({ color: "#8580ff" }),
    dim.id,
  );
  db.prepare("UPDATE nodes SET zoneId=NULL WHERE id=?").run(child.id);
  db.prepare("UPDATE nodes SET x=0,z=0 WHERE id=?").run(outside.id);
  db.close();
  s = createStore(path);
  assert.equal(s.getNode(child.id).zoneId, "storage");
  assert.equal(s.getNode(child.id).content, child.content);
  assert.equal(s.graph().edges.length, 1);
  assert.equal(layoutProblem(s.graph().nodes), null);
  const migrated = s.graph();
  s.close();
  s = createStore(path);
  assert.deepEqual(s.graph(), migrated);
  s.close();
});
