// Explicit, disposable destination only. Never replaces an existing database.
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createStore } from "../../server/store.mjs";
const path = process.argv[2] && resolve(process.argv[2]);
if (!path || existsSync(path) || basename(path) === "dimention.sqlite")
  throw Error(
    "Pass a new, disposable SQLite filename. Existing files are never overwritten.",
  );
const s = createStore(path, { seed: false }),
  nodes = [];
try {
  for (let i = 0; i < 4; i++) {
    const dim = s.createNode({
      type: "dim",
      title: `Performance room ${i + 1}`,
      x: i % 2 ? 2300 : -2300,
      y: 0,
      z: i < 2 ? -1900 : 1900,
    });
    nodes.push(dim);
    for (let j = 0; j < 6; j++)
      nodes.push(
        s.createNode({
          type: "note",
          title: `Room ${i + 1} document ${j + 1}`,
          content: "A readable document for the rendering smoke test. ".repeat(
            12,
          ),
          dimId: dim.id,
          area: j < 3 ? "desk" : "storage",
          autoPlace: true,
        }),
      );
  }
  for (let i = 0; i < 72; i++)
    nodes.push(
      s.createNode({
        type: "note",
        title: `Floating document ${i + 1}`,
        content: "Independent content stays outside every Dim. ".repeat(12),
        x: -4500 + (i % 11) * 900,
        y: Math.floor(i / 22) * 180,
        z: 3500 + Math.floor(i / 11) * 140,
      }),
    );
  for (let i = 1; i < nodes.length; i++)
    s.createEdge({
      source: nodes[i - 1].id,
      target: nodes[i].id,
      label: `Route ${i}`,
    });
  console.log(
    JSON.stringify({
      path,
      nodes: nodes.length,
      edges: s.graph().edges.length,
    }),
  );
} finally {
  s.close();
}
