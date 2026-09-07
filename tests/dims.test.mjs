import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createStore } from "../server/store.mjs";
const note = (more = {}) => ({
  type: "note",
  title: "Document",
  content: "Keep this",
  ...more,
});
const dim = (more = {}) => ({
  type: "dim",
  title: "Design studio",
  payload: { color: "#7766ff" },
  ...more,
});

test("Dims contain Desk and Storage documents while independent documents remain independent", () => {
  const s = createStore(":memory:", { seed: false });
  try {
    const a = s.createNode(dim()),
      b = s.createNode(dim({ title: "Research" }));
    const task = s.createNode({
      type: "workflow",
      title: "Execute",
      dimId: a.id,
      area: "desk",
      payload: { steps: [{ text: "Ship it", done: false }] },
    });
    const doc = s.createNode(note({ dimId: a.id, area: "storage" })),
      loose = s.createNode(note());
    s.createEdge({ source: a.id, target: b.id, label: "informs" });
    s.createEdge({ source: loose.id, target: a.id });
    assert.equal(task.area, "desk");
    assert.equal(doc.dimId, a.id);
    assert.equal(loose.dimId, null);
    s.organize({ ids: [doc.id], dimId: b.id, area: "desk" });
    assert.equal(s.getNode(doc.id).dimId, b.id);
    assert.throws(() => s.createNode(note({ dimId: loose.id })), /only belong/);
    assert.throws(() => s.createNode(dim({ dimId: a.id })), /cannot be nested/);
    assert.throws(
      () => s.updateNode(a.id, { type: "note" }),
      /cannot be changed/,
    );
  } finally {
    s.close();
  }
});
test("moving a Dim translates its children; multi-item movement is atomic at coordinate bounds", () => {
  const s = createStore(":memory:", { seed: false });
  try {
    const d = s.createNode(dim({ x: 100, z: 100 })),
      child = s.createNode(note({ dimId: d.id, x: 150, z: 175 }));
    s.batchPositions([{ id: d.id, x: 200, y: 50, z: 200 }]);
    assert.equal(s.getNode(child.id).x, 250);
    assert.equal(s.getNode(child.id).z, 275);
    s.batchPositions([
      { id: d.id, x: 300, y: 50, z: 200 },
      { id: child.id, x: 400, y: 50, z: 275 },
    ]);
    assert.equal(s.getNode(child.id).x, 400);
    const before = s.graph();
    assert.throws(
      () => s.batchPositions([{ id: d.id, x: 5000, y: 50, z: 200 }]),
      /Coordinates/,
    );
    assert.deepEqual(s.graph(), before);
    s.updateNode(d.id, { x: 350 });
    assert.equal(s.getNode(child.id).x, 450);
  } finally {
    s.close();
  }
});
test("Trash restores content, membership, coordinates and connections across restarts", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "dimention-dims-"));
  let s = createStore(join(folder, "test.sqlite"), { seed: false });
  t.after(async () => {
    s.close();
    await rm(folder, { recursive: true, force: true });
  });
  const d = s.createNode(dim()),
    doc = s.createNode(note({ dimId: d.id, x: 123, z: -77 })),
    outside = s.createNode(note());
  const edge = s.createEdge({
    source: doc.id,
    target: outside.id,
    label: "reference",
  });
  s.deleteNode(d.id);
  assert.equal(s.graph().nodes.length, 1);
  assert.equal(s.trash().nodes.length, 2);
  assert.equal(s.graph().edges.length, 0);
  s.close();
  s = createStore(join(folder, "test.sqlite"));
  s.restore(d.id);
  assert.equal(s.getNode(doc.id).content, "Keep this");
  assert.equal(s.getNode(doc.id).x, 123);
  assert.equal(s.getNode(doc.id).dimId, d.id);
  assert.deepEqual(
    s.graph().edges.map((e) => ({ ...e })),
    [edge],
  );
  s.deleteNode(doc.id);
  s.deleteNode(d.id);
  s.restore(d.id);
  assert.ok(
    s.getNode(doc.id).deletedAt,
    "Previously trashed docs stay in Trash",
  );
  s.restore(doc.id);
  assert.equal(s.graph().edges.length, 1);
});
test("restoring a child also restores a trashed parent; links stay hidden while other endpoints are trashed", () => {
  const s = createStore(":memory:", { seed: false });
  try {
    const d = s.createNode(dim()),
      a = s.createNode(note({ dimId: d.id })),
      b = s.createNode(note());
    s.createEdge({ source: a.id, target: b.id });
    s.deleteNode(d.id);
    s.deleteNode(b.id);
    s.restore(a.id);
    assert.equal(s.getNode(d.id).deletedAt, null);
    assert.equal(s.graph().edges.length, 0);
    s.restore(b.id);
    assert.equal(s.graph().edges.length, 1);
  } finally {
    s.close();
  }
});
test("version 1 and 2 JSON imports preview without writes and append atomically with remapped IDs", () => {
  const source = createStore(":memory:", { seed: false }),
    dest = createStore(":memory:", { seed: false });
  try {
    const d = source.createNode(dim()),
      n = source.createNode(note({ dimId: d.id, area: "desk" }));
    source.createEdge({ source: d.id, target: n.id, label: "contains" });
    const json = source.export();
    assert.equal(dest.importWorkspace(json, true).items, 2);
    assert.equal(dest.graph().nodes.length, 0);
    dest.createNode(note());
    const imported = dest.importWorkspace(json);
    assert.equal(imported.nodes.length, 3);
    const newDim = imported.nodes.find((n) => n.type === "dim"),
      newDoc = imported.nodes.find((n) => n.dimId);
    assert.notEqual(newDim.id, d.id);
    assert.equal(newDoc.dimId, newDim.id);
    assert.equal(newDoc.createdAt, n.createdAt);
    assert.equal(newDoc.updatedAt, n.updatedAt);
    assert.equal(imported.edges[0].source, newDim.id);
    const before = dest.graph();
    const bad = structuredClone(json);
    bad.edges.push({ source: "missing", target: n.id });
    assert.throws(() => dest.importWorkspace(bad), /Imported connections/);
    assert.deepEqual(dest.graph(), before);
    dest.importWorkspace({
      version: 1,
      nodes: [
        {
          id: "old",
          type: "note",
          title: "Legacy note",
          content: "old",
          x: 1,
          y: 2,
          z: 3,
        },
      ],
      edges: [],
    });
    assert.equal(dest.graph().nodes.length, 4);
    source.deleteNode(d.id);
    const exportedTrash = source.export();
    dest.importWorkspace(exportedTrash);
    assert.equal(dest.trash().nodes.length, 2);
    const trashedDim = dest.trash().nodes.find((n) => n.type === "dim");
    dest.restore(trashedDim.id);
    assert.equal(dest.graph().nodes.length, 6);
    assert.equal(dest.graph().edges.length, 2);
  } finally {
    source.close();
    dest.close();
  }
});
test("old SQLite schema migrates without reseeding, losing text, or changing old positions", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "dimention-old-"));
  const path = join(folder, "legacy.sqlite");
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO metadata VALUES('initialized','1');CREATE TABLE nodes(id TEXT PRIMARY KEY,title TEXT NOT NULL,type TEXT NOT NULL,content TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,z REAL NOT NULL,starred INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);INSERT INTO nodes VALUES('legacy','My real note','note','Preserve me',11,22,33,0,'{}','2026-09-01','2026-09-01');",
  );
  db.close();
  const s = createStore(path);
  t.after(async () => {
    s.close();
    await rm(folder, { recursive: true, force: true });
  });
  const n = s.getNode("legacy");
  assert.equal(s.graph().nodes.length, 1);
  assert.equal(n.content, "Preserve me");
  assert.equal(n.z, 33);
  assert.equal(n.dimId, null);
  assert.equal(n.deletedAt, null);
  assert.equal(n.createdAt, "2026-09-01");
});
