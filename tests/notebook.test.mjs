import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "../server/store.mjs";
import { createAppServer } from "../server/server.mjs";
import { layoutProblem } from "../shared/spatial.js";
import {
  entriesFor,
  filteredEntries,
  searchText,
  spatialPresentation,
} from "../src/workspace.js";
import { markdown } from "../src/markdown.js";
const fixture = (t) => {
  const s = createStore(":memory:", { seed: false });
  t.after(() => s.close());
  return s;
};
const dim = (s, title = "Project") =>
  s.createNode({
    type: "dim",
    title,
    autoPlace: true,
    payload: {
      goal: "Launch a useful product",
      nextAction: "Interview a creator",
    },
  });
const note = (s, extra = {}) =>
  s.createNode({
    type: "note",
    title: "Original",
    content: "One source of truth",
    autoPlace: true,
    ...extra,
  });

test("Inbox capture, tags and favorites persist; filing preserves content and reserved space", (t) => {
  const s = fixture(t),
    d = dim(s),
    n = note(s, {
      inbox: true,
      tags: ["Research", "research", " Launch "],
      starred: true,
    });
  assert.deepEqual(n.tags, ["research", "launch"]);
  assert.equal(n.inbox, true);
  const result = s.organize({ ids: [n.id], dimId: d.id, zoneId: "storage" });
  const moved = s.getNode(n.id);
  assert.equal(moved.inbox, false);
  assert.equal(moved.content, n.content);
  assert.deepEqual(moved.tags, n.tags);
  assert.equal(moved.starred, true);
  assert.equal(layoutProblem(result.nodes), null);
  assert.throws(() => note(s, { inbox: true, dimId: d.id }), /Inbox/);
  assert.throws(
    () => s.updateNode(n.id, { tags: Array(13).fill("x") }),
    /12 tags/,
  );
  assert.throws(
    () => s.favoriteNodes({ ids: [n.id, "missing"], starred: false }),
    /missing/,
  );
  assert.equal(s.getNode(n.id).starred, true);
  s.favoriteNodes({ ids: [n.id], starred: false });
  assert.equal(s.getNode(n.id).starred, false);
});
test("references share one original, survive Trash, and follow area removal without moving XYZ", (t) => {
  const s = fixture(t),
    a = dim(s, "A"),
    b = dim(s, "B"),
    n = note(s, { dimId: a.id, zoneId: "storage" }),
    z = s.createZone(b.id, { type: "storage", name: "Sources" }).zone;
  const r = s.createReference({ nodeId: n.id, dimId: b.id, zoneId: z.id });
  assert.throws(
    () => s.createReference({ nodeId: n.id, dimId: b.id, zoneId: "desk" }),
    /already referenced/,
  );
  assert.throws(
    () => s.createReference({ nodeId: n.id, dimId: a.id, zoneId: "storage" }),
    /already lives/,
  );
  s.updateNode(n.id, { content: "Updated original" });
  assert.equal(entriesFor(s.graph(), b.id)[0].node.content, "Updated original");
  s.saveContext(b.id, {
    nodeId: n.id,
    zoneId: z.id,
    view: "list",
    scroll: 250,
  });
  s.removeZone(b.id, z.id, { replacementId: "storage" });
  assert.equal(s.graph().references[0].zoneId, "storage");
  assert.equal(s.graph().contexts[0].zoneId, "storage");
  const position = s.getNode(n.id);
  assert.deepEqual([position.x, position.y, position.z], [n.x, n.y, n.z]);
  s.deleteNode(n.id);
  assert.equal(s.graph().references.length, 0);
  assert.equal(s.graph().contexts[0].nodeId, null);
  s.restore(n.id);
  assert.equal(s.graph().references[0].id, r.id);
  s.deleteReference(r.id);
  assert.equal(s.getNode(n.id).content, "Updated original");
  assert.equal(s.graph().contexts[0].nodeId, null);
});
test("moving an original into its referenced Dim removes redundant pin and protects all other references", (t) => {
  const s = fixture(t),
    a = dim(s, "A"),
    b = dim(s, "B"),
    c = dim(s, "C"),
    n = note(s, { dimId: a.id });
  s.createReference({ nodeId: n.id, dimId: b.id, zoneId: "storage" });
  s.createReference({ nodeId: n.id, dimId: c.id, zoneId: "desk" });
  s.organize({ ids: [n.id], dimId: b.id, zoneId: "desk" });
  assert.equal(entriesFor(s.graph(), b.id).length, 1);
  assert.equal(s.graph().references.length, 1);
  assert.equal(s.graph().references[0].dimId, c.id);
  assert.equal(layoutProblem(s.graph().nodes), null);
});
test("version 4 import remaps references and resume context atomically including trashed sources", (t) => {
  const s = fixture(t),
    a = dim(s, "A"),
    b = dim(s, "B"),
    n = note(s, { dimId: a.id, tags: ["source"], starred: true });
  s.createReference({ nodeId: n.id, dimId: b.id, zoneId: "storage" });
  s.saveContext(b.id, {
    nodeId: n.id,
    zoneId: "storage",
    view: "board",
    scroll: 440,
  });
  s.deleteNode(n.id);
  const data = s.export(),
    other = fixture(t),
    before = other.export();
  const invalid = structuredClone(data);
  invalid.references[0].zoneId = "missing";
  assert.throws(() => other.importWorkspace(invalid), /references/);
  assert.deepEqual(other.export().nodes, before.nodes);
  assert.equal(other.importWorkspace(data, true).references, 1);
  assert.equal(other.graph().nodes.length, 0);
  other.importWorkspace(data);
  const copy = other.export(),
    source = copy.nodes.find((x) => x.title === "Original"),
    target = copy.nodes.find((x) => x.title === "B");
  assert.notEqual(source.id, n.id);
  assert.equal(copy.references[0].nodeId, source.id);
  assert.equal(copy.references[0].dimId, target.id);
  assert.equal(copy.contexts[0].nodeId, source.id);
  assert.deepEqual(source.tags, ["source"]);
  other.restore(source.id);
  assert.equal(other.graph().contexts[0].scroll, 440);
  assert.equal(other.graph().references.length, 1);
});
test("working context and project direction survive SQLite restart without changing content timestamps or XYZ", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dimention-notebook-")),
    path = join(dir, "test.sqlite");
  let s = createStore(path, { seed: false });
  t.after(async () => {
    s.close();
    await rm(dir, { recursive: true, force: true });
  });
  const d = dim(s),
    n = note(s, { dimId: d.id });
  s.saveContext(d.id, {
    nodeId: n.id,
    zoneId: n.zoneId,
    view: "list",
    scroll: 170,
  });
  assert.equal(s.getNode(n.id).updatedAt, n.updatedAt);
  assert.equal(s.getNode(d.id).updatedAt, d.updatedAt);
  s.close();
  s = createStore(path, { seed: false });
  assert.equal(s.graph().contexts[0].nodeId, n.id);
  assert.equal(s.graph().contexts[0].view, "list");
  assert.equal(s.getNode(d.id).payload.goal, "Launch a useful product");
  assert.deepEqual(
    [s.getNode(n.id).x, s.getNode(n.id).y, s.getNode(n.id).z],
    [n.x, n.y, n.z],
  );
});
test("search indexes full workflows, tables and tags; views resolve references without duplicating originals", (t) => {
  const s = fixture(t),
    d = dim(s),
    n = note(s, { tags: ["needle"] }),
    w = s.createNode({
      type: "workflow",
      title: "Work",
      payload: { steps: [{ text: "Hidden step", done: false }] },
      autoPlace: true,
    });
  s.createReference({ nodeId: n.id, dimId: d.id, zoneId: "storage" });
  assert.ok(searchText(w).includes("hidden step"));
  assert.equal(
    filteredEntries(entriesFor(s.graph(), d.id), { query: "needle" }).length,
    1,
  );
  assert.equal(
    entriesFor(s.graph()).filter((e) => e.node.id === n.id).length,
    1,
  );
  const graph = s.graph(),
    view = spatialPresentation(graph),
    alias = view.find((n) => n.referenceNodeId);
  assert.equal(alias.referenceNodeId, n.id);
  assert.equal(alias.dimId, d.id);
  assert.equal(layoutProblem(view), null);
  assert.deepEqual(graph.nodes, s.graph().nodes);
  assert.deepEqual(
    view.find((x) => x.id === n.id),
    n,
  );
});
test("Markdown preview escapes executable markup and unsafe links, preserving ordinary formatting", () => {
  const html = markdown(
    "# Heading\n**Strong**\n<script>alert(1)</script>\n[unsafe](javascript:alert(1))\n[safe](https://example.com)\n```\n<img src=x onerror=alert(1)>\n```",
  );
  assert.ok(html.includes("<h1>Heading</h1>"));
  assert.ok(html.includes("<strong>Strong</strong>"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes("&lt;img"));
});
test("reference and resume HTTP routes reject invalid destinations and retain saved data", async (t) => {
  const app = await createAppServer({ dataPath: ":memory:", seed: false });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(() => app.close());
  const base = "http://127.0.0.1:" + app.server.address().port;
  const request = async (path, method = "GET", body) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  const d = dim(app.store),
    n = note(app.store);
  assert.equal(
    (
      await request("/references", "POST", {
        nodeId: n.id,
        dimId: d.id,
        zoneId: "bad",
      })
    ).status,
    400,
  );
  const r = await request("/references", "POST", {
    nodeId: n.id,
    dimId: d.id,
    zoneId: "storage",
  });
  assert.equal(r.status, 201);
  assert.equal(
    (
      await request("/dims/" + d.id + "/context", "PATCH", {
        nodeId: n.id,
        zoneId: "storage",
        view: "list",
        scroll: 60,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/dims/" + d.id + "/context", "PATCH", { view: "invalid" }))
      .status,
    400,
  );
  assert.equal((await request("/workspace")).data.contexts[0].scroll, 60);
  assert.equal(
    (await request("/references/" + r.data.id, "DELETE")).status,
    200,
  );
  assert.equal((await request("/workspace")).data.nodes.length, 2);
});
