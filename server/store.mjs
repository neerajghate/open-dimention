import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  defaultZones,
  zonesOf,
  zoneOf,
  slotPosition,
  layoutProblem,
  positionProblem,
  freePosition,
  planSpatialLayout,
} from "../shared/spatial.js";

export const TYPES = ["note", "idea", "workflow", "table", "dim"];
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (message) => {
  throw new ApiError(400, message);
};
const string = (value, name, max) => {
  if (typeof value !== "string" || value.length > max)
    fail(`${name} must be text with at most ${max} characters.`);
  return value;
};
function validateNode(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Expected a JSON object.");
  if (!TYPES.includes(input.type)) fail("Choose a valid node type.");
  const title = string(input.title, "Title", 160).trim();
  if (!title) fail("Give your node a title.");
  const content = string(input.content ?? "", "Content", 100000);
  for (const axis of ["x", "y", "z"]) {
    if (
      typeof input[axis] !== "number" ||
      !Number.isFinite(input[axis]) ||
      Math.abs(input[axis]) > 5000
    )
      fail("Coordinates must be numbers between -5000 and 5000.");
  }
  if (typeof input.starred !== "boolean")
    fail("Starred must be true or false.");
  const payload = input.payload ?? {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    fail("Invalid structured data.");
  let cleanPayload = {};
  if (input.type === "dim") {
    const color = payload.color ?? "#7c83ff";
    if (!/^#[0-9a-f]{6}$/i.test(color)) fail("Choose a valid Dim color.");
    const zones = payload.zones ?? defaultZones();
    if (!Array.isArray(zones) || zones.length < 2 || zones.length > 8)
      fail("A Dim supports up to four Desks and four Storage areas.");
    const ids = new Set(),
      names = new Set();
    cleanPayload = {
      color,
      zones: zones.map((z) => {
        if (!z || !["desk", "storage"].includes(z.type))
          fail("Choose Desk or Storage.");
        const id = string(z.id, "Area ID", 100),
          name = string(z.name, "Area name", 60).trim();
        if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
          fail("Area IDs must be valid and unique.");
        if (!name || names.has(z.type + name.toLowerCase()))
          fail(
            "Give each Desk or Storage a unique, nonempty name within its type.",
          );
        ids.add(id);
        names.add(z.type + name.toLowerCase());
        return { id, name, type: z.type };
      }),
    };
    for (const type of ["desk", "storage"]) {
      const count = zones.filter((z) => z.type === type).length;
      if (count < 1 || count > 4)
        fail("Keep one to four areas of each type in a Dim.");
    }
  }
  if (input.type === "workflow") {
    const steps =
      payload.steps ??
      content
        .split("\n")
        .filter(Boolean)
        .map((line) => ({
          text: line.replace(/^\[[ xX]\]\s*/, ""),
          done: /^\[[xX]\]/.test(line),
        }));
    if (!Array.isArray(steps) || steps.length > 200)
      fail("Workflows support up to 200 steps.");
    cleanPayload.steps = steps.map((step) => {
      if (!step || typeof step !== "object" || typeof step.done !== "boolean")
        fail("Each step needs text and a completion state.");
      return { text: string(step.text, "Step", 2000), done: step.done };
    });
  }
  if (input.type === "table") {
    const { columns, rows } = payload;
    if (
      !Array.isArray(columns) ||
      columns.length < 1 ||
      columns.length > 12 ||
      !Array.isArray(rows) ||
      rows.length > 200
    )
      fail("Tables support 1–12 columns and up to 200 rows.");
    cleanPayload = {
      columns: columns.map((c) => string(c, "Column", 80)),
      rows: rows.map((row) => {
        if (!Array.isArray(row) || row.length !== columns.length)
          fail("Every row must match the table columns.");
        return row.map((cell) => string(cell, "Cell", 2000));
      }),
    };
  }
  const dimId = input.dimId ?? null;
  if (dimId !== null) string(dimId, "Dim", 100);
  if (input.type === "dim" && dimId !== null)
    fail("Dims share the world and cannot be nested.");
  const area = input.area ?? "storage";
  if (!["desk", "storage"].includes(area)) fail("Choose Desk or Storage.");
  return {
    title,
    type: input.type,
    content,
    x: input.x,
    y: input.y,
    z: input.z,
    starred: input.starred,
    payload: cleanPayload,
    dimId,
    area,
    zoneId: input.zoneId == null ? null : string(input.zoneId, "Area ID", 100),
  };
}

const seeds = [
  {
    id: "welcome",
    type: "note",
    title: "A space for your thoughts",
    content:
      "Good ideas rarely arrive in a straight line.\n\nThis is your place to collect the pieces, follow a thread, and see how everything connects.\n\nTry orbiting the space. Open a card to write. Choose Move, then drag a card to give it a new place. Make something your own.",
    x: 0,
    y: 15,
    z: 25,
    starred: true,
  },
  {
    id: "inspiration",
    type: "idea",
    title: "What if notes had depth?",
    content:
      "A room for ideas, instead of another endless page.\n\nSpatial memory could help us find things by where they live, not just what we called them.\n\nWhat if a project was a constellation?",
    x: -310,
    y: 175,
    z: -30,
  },
  {
    id: "principles",
    type: "note",
    title: "Keep it simple",
    content:
      "A few principles to build around:\n\n• Capture first. Organize later.\n• Make connections visible.\n• Keep the writing experience calm.\n• Let ideas take up a little space.",
    x: 330,
    y: 160,
    z: -105,
  },
  {
    id: "workflow",
    type: "workflow",
    title: "From spark to something",
    content:
      "[x] Catch a little spark\n[x] Connect it to an idea\n[ ] Explore the possibilities\n[ ] Make a small prototype\n[ ] Share what you learned",
    x: -325,
    y: -95,
    z: 125,
  },
  {
    id: "reading",
    type: "table",
    title: "The inspiration shelf",
    content: "Little things worth coming back to.",
    payload: {
      columns: ["Name", "Type", "Status"],
      rows: [
        ["Spatial thinking", "Concept", "Exploring"],
        ["A calmer workspace", "Idea", "Next up"],
        ["Build a tiny version", "Experiment", "In progress"],
      ],
    },
    x: 325,
    y: -90,
    z: 180,
  },
  {
    id: "question",
    type: "idea",
    title: "Leave room for the unexpected",
    content:
      "The best connection might be the one you have not made yet.\n\nWhat could you put next to this idea?",
    x: 25,
    y: -210,
    z: -140,
  },
];

export function createStore(path, { seed = true } = {}) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL,
      x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, starred INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY, source TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      target TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE, label TEXT NOT NULL DEFAULT '',
      UNIQUE(source, target), CHECK(source <> target)
    );`);
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(nodes)")
      .all()
      .map((row) => row.name),
  );
  for (const [name, definition] of [
    ["dimId", "TEXT REFERENCES nodes(id)"],
    ["area", "TEXT NOT NULL DEFAULT 'storage'"],
    ["deletedAt", "TEXT"],
    ["deleteBatch", "TEXT"],
    ["zoneId", "TEXT"],
  ]) {
    if (!columns.has(name))
      db.exec(`ALTER TABLE nodes ADD COLUMN ${name} ${definition}`);
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS nodes_dim ON nodes(dimId); CREATE INDEX IF NOT EXISTS nodes_trash ON nodes(deletedAt);",
  );
  const parse = (row) =>
    row
      ? {
          ...row,
          starred: Boolean(row.starred),
          payload: JSON.parse(row.payload),
        }
      : null;
  const getNode = (id) =>
    parse(db.prepare("SELECT * FROM nodes WHERE id = ?").get(id));
  const active = (id) => {
    const n = getNode(id);
    if (!n || n.deletedAt)
      throw new ApiError(404, "That item is missing or in Trash.");
    return n;
  };
  const validDim = (n) => {
    if (n.dimId !== null) {
      const dim = active(n.dimId);
      if (dim.type !== "dim") fail("Documents can only belong to a Dim.");
      const zone =
        n.zoneId == null
          ? zoneOf(dim, null, n.area)
          : zonesOf(dim).find((z) => z.id === n.zoneId);
      if (!zone) fail("Choose a Desk or Storage in this Dim.");
      n.zoneId = zone.id;
      n.area = zone.type;
    } else {
      n.zoneId = null;
    }
  };
  const transaction = (action) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      const problem = layoutProblem(graph().nodes);
      if (problem) fail(problem);
      for (const n of db
        .prepare("SELECT * FROM nodes WHERE dimId IS NOT NULL")
        .all()
        .map(parse)) {
        const parent = getNode(n.dimId),
          zone = zonesOf(parent).find((z) => z.id === n.zoneId);
        if (!parent || parent.type !== "dim" || !zone || zone.type !== n.area)
          fail(
            "Move documents to another area before removing their Desk or Storage.",
          );
      }
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const writePosition = (id, p) =>
    db
      .prepare("UPDATE nodes SET x=?,y=?,z=?,updatedAt=? WHERE id=?")
      .run(p.x, p.y, p.z, new Date().toISOString(), id);
  const insert = (node, id = randomUUID()) => {
    if (!node || typeof node !== "object" || Array.isArray(node))
      fail("Expected a JSON object.");
    const n = validateNode({
      content: "",
      x: 0,
      y: 0,
      z: 0,
      starred: false,
      ...node,
    });
    validDim(n);
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO nodes (id,title,type,content,x,y,z,starred,payload,createdAt,updatedAt,dimId,area,zoneId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      n.title,
      n.type,
      n.content,
      n.x,
      n.y,
      n.z,
      Number(n.starred),
      JSON.stringify(n.payload),
      now,
      now,
      n.dimId,
      n.area,
      n.zoneId,
    );
    return getNode(id);
  };
  // Upgrade the preliminary text-only workflows without changing the schema.
  for (const row of db
    .prepare("SELECT * FROM nodes WHERE type='workflow'")
    .all()) {
    const node = parse(row);
    if (!node.payload.steps) {
      const validated = validateNode(node);
      db.prepare("UPDATE nodes SET payload=? WHERE id=?").run(
        JSON.stringify(validated.payload),
        node.id,
      );
    }
  }
  if (
    !db.prepare("SELECT value FROM metadata WHERE key = 'initialized'").get()
  ) {
    db.exec("BEGIN");
    try {
      if (seed) {
        for (const node of seeds) insert(node, node.id);
        for (const [target, label] of [
          ["inspiration", "imagines"],
          ["principles", "guided by"],
          ["workflow", "becomes"],
          ["reading", "collects"],
          ["question", "explores"],
        ]) {
          db.prepare("INSERT INTO edges VALUES (?, ?, ?, ?)").run(
            randomUUID(),
            "welcome",
            target,
            label,
          );
        }
      }
      db.prepare("INSERT INTO metadata VALUES (?, ?)").run("initialized", "1");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const graph = () => ({
    nodes: db
      .prepare(
        "SELECT * FROM nodes WHERE deletedAt IS NULL ORDER BY createdAt, id",
      )
      .all()
      .map(parse),
    edges: db
      .prepare(
        "SELECT e.* FROM edges e JOIN nodes s ON s.id=e.source JOIN nodes t ON t.id=e.target WHERE s.deletedAt IS NULL AND t.deletedAt IS NULL",
      )
      .all(),
  });
  // Reconcile only newly restored/imported items; established content stays put.
  const repairLayout = (ids) => {
    try {
      const before = graph().nodes,
        byId = new Map(before.map((n) => [n.id, n]));
      for (const n of planSpatialLayout(before, ids)) {
        const old = byId.get(n.id);
        if (n.x !== old.x || n.y !== old.y || n.z !== old.z)
          db.prepare("UPDATE nodes SET x=?,y=?,z=? WHERE id=?").run(
            n.x,
            n.y,
            n.z,
            n.id,
          );
      }
    } catch (error) {
      fail(error.message);
    }
  };
  if (
    !db.prepare("SELECT value FROM metadata WHERE key='organizers-v3'").get()
  ) {
    transaction(() => {
      for (const n of db
        .prepare("SELECT * FROM nodes WHERE type='dim'")
        .all()
        .map(parse)) {
        const payload = validateNode(n).payload;
        db.prepare("UPDATE nodes SET payload=? WHERE id=?").run(
          JSON.stringify(payload),
          n.id,
        );
      }
      db.exec(
        "UPDATE nodes SET zoneId=area WHERE dimId IS NOT NULL AND zoneId IS NULL",
      );
      repairLayout(graph().nodes.map((n) => n.id));
      db.prepare("INSERT INTO metadata VALUES(?,?)").run("organizers-v3", "1");
    });
  }
  const batchPositions = (positions) =>
    transaction(() => {
      if (
        !Array.isArray(positions) ||
        !positions.length ||
        positions.length > 1000
      )
        fail("Choose 1–1000 items to move.");
      const updates = new Map();
      for (const p of positions) {
        if (!p || typeof p.id !== "string" || updates.has(p.id))
          fail("Each moved item must have a unique ID.");
        const previous = active(p.id);
        const n = validateNode({ ...previous, x: p.x, y: p.y, z: p.z });
        updates.set(p.id, n);
      }
      for (const [id, n] of [...updates])
        if (n.type === "dim") {
          const old = active(id);
          for (const child of db
            .prepare("SELECT * FROM nodes WHERE dimId=? AND deletedAt IS NULL")
            .all(id)
            .map(parse)) {
            if (!updates.has(child.id))
              updates.set(
                child.id,
                validateNode({
                  ...child,
                  x: child.x + n.x - old.x,
                  y: child.y + n.y - old.y,
                  z: child.z + n.z - old.z,
                }),
              );
          }
        }
      for (const [id, n] of updates) writePosition(id, n);
      return graph();
    });
  const restore = (id) =>
    transaction(() => {
      const existing = new Set(graph().nodes.map((n) => n.id));
      const n = getNode(id);
      if (!n || !n.deletedAt)
        throw new ApiError(404, "That item is not in Trash.");
      const restoreOne = (item) => {
        if (item.type === "dim")
          db.prepare(
            "UPDATE nodes SET deletedAt=NULL,deleteBatch=NULL WHERE dimId=? AND deleteBatch=?",
          ).run(item.id, item.deleteBatch);
        db.prepare(
          "UPDATE nodes SET deletedAt=NULL,deleteBatch=NULL WHERE id=?",
        ).run(item.id);
      };
      if (n.dimId) {
        const parent = getNode(n.dimId);
        if (parent?.deletedAt) restoreOne(parent);
      }
      restoreOne(n);
      repairLayout(
        graph()
          .nodes.filter((n) => !existing.has(n.id))
          .map((n) => n.id),
      );
      return graph();
    });
  return {
    graph,
    trash: () => ({
      nodes: db
        .prepare(
          "SELECT * FROM nodes WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC",
        )
        .all()
        .map(parse),
    }),
    export: () => ({
      version: 3,
      exportedAt: new Date().toISOString(),
      nodes: db
        .prepare("SELECT * FROM nodes ORDER BY createdAt,id")
        .all()
        .map(parse),
      edges: db.prepare("SELECT * FROM edges").all(),
    }),
    getNode,
    createNode(node) {
      if (!node || typeof node !== "object" || Array.isArray(node))
        fail("Expected a JSON object.");
      return transaction(() => {
        if (node.autoPlace !== undefined && typeof node.autoPlace !== "boolean")
          fail("Automatic placement must be true or false.");
        if (
          node.type === "dim" &&
          graph().nodes.filter((n) => n.type === "dim").length >= 64
        )
          fail("This world supports up to 64 Dims.");
        const n = insert(node);
        if (node.autoPlace) {
          const parent = n.dimId ? getNode(n.dimId) : null;
          const count = graph().nodes.filter(
            (d) =>
              d.id !== n.id && d.dimId === n.dimId && d.zoneId === n.zoneId,
          ).length;
          writePosition(
            n.id,
            parent
              ? slotPosition(parent, n.zoneId, count)
              : freePosition(n, graph().nodes),
          );
        }
        return getNode(n.id);
      });
    },
    updateNode(id, input) {
      if (!input || typeof input !== "object" || Array.isArray(input))
        fail("Expected a JSON object.");
      const previous = active(id);
      if (input.type && input.type !== previous.type)
        fail("Item types cannot be changed. Create a new item instead.");
      const n = validateNode({
        ...previous,
        ...input,
        ...(previous.type === "dim"
          ? { payload: { ...previous.payload, ...input.payload } }
          : {}),
        zoneId:
          input.zoneId === undefined &&
          ((input.dimId !== undefined && input.dimId !== previous.dimId) ||
            (input.area !== undefined && input.area !== previous.area))
            ? null
            : input.zoneId === undefined
              ? previous.zoneId
              : input.zoneId,
      });
      validDim(n);
      if (
        n.type !== "dim" &&
        (n.dimId !== previous.dimId || n.zoneId !== previous.zoneId)
      ) {
        const parent = n.dimId ? getNode(n.dimId) : null;
        const count = graph().nodes.filter(
          (d) => d.id !== id && d.dimId === n.dimId && d.zoneId === n.zoneId,
        ).length;
        Object.assign(
          n,
          parent
            ? slotPosition(parent, n.zoneId, count)
            : freePosition(n, graph().nodes),
        );
      }
      // Moving a Dim moves its contents by the same delta, atomically.
      return transaction(() => {
        if (n.type === "dim")
          for (const child of db
            .prepare("SELECT * FROM nodes WHERE dimId=? AND deletedAt IS NULL")
            .all(id)
            .map(parse)) {
            const moved = validateNode({
              ...child,
              x: child.x + n.x - previous.x,
              y: child.y + n.y - previous.y,
              z: child.z + n.z - previous.z,
            });
            writePosition(child.id, moved);
          }
        db.prepare(
          "UPDATE nodes SET title=?,type=?,content=?,x=?,y=?,z=?,starred=?,payload=?,updatedAt=?,dimId=?,area=?,zoneId=? WHERE id=?",
        ).run(
          n.title,
          n.type,
          n.content,
          n.x,
          n.y,
          n.z,
          Number(n.starred),
          JSON.stringify(n.payload),
          new Date().toISOString(),
          n.dimId,
          n.area,
          n.zoneId,
          id,
        );
        return getNode(id);
      });
    },
    deleteNode(id) {
      const n = active(id),
        batch = randomUUID(),
        now = new Date().toISOString();
      transaction(() => {
        db.prepare("UPDATE nodes SET deletedAt=?,deleteBatch=? WHERE id=?").run(
          now,
          batch,
          id,
        );
        if (n.type === "dim")
          db.prepare(
            "UPDATE nodes SET deletedAt=?,deleteBatch=? WHERE dimId=? AND deletedAt IS NULL",
          ).run(now, batch, id);
      });
    },
    restore,
    batchPositions,
    organize({ ids, dimId = null, area = "storage", zoneId = null }) {
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 1000 ||
        new Set(ids).size !== ids.length
      )
        fail("Choose unique documents to organize.");
      return transaction(() => {
        const parent = dimId ? active(dimId) : null;
        if (parent && parent.type !== "dim") fail("Choose a Dim.");
        const zone = parent
          ? zoneId
            ? zonesOf(parent).find((z) => z.id === zoneId)
            : zoneOf(parent, null, area)
          : null;
        if (parent && !zone) fail("Choose an area in this Dim.");
        let count = parent
          ? graph().nodes.filter(
              (n) =>
                !ids.includes(n.id) &&
                n.dimId === dimId &&
                n.zoneId === zone.id,
            ).length
          : 0;
        for (const id of ids) {
          const n = active(id);
          if (n.type === "dim")
            fail("Only documents can be assigned to a Dim.");
          const next = {
            ...n,
            dimId,
            area: zone?.type ?? area,
            zoneId: zone?.id ?? null,
          };
          Object.assign(
            next,
            parent
              ? slotPosition(parent, zone.id, count++)
              : freePosition(next, graph().nodes),
          );
          validateNode(next);
          validDim(next);
          db.prepare("UPDATE nodes SET dimId=?,area=?,zoneId=? WHERE id=?").run(
            next.dimId,
            next.area,
            next.zoneId,
            id,
          );
          writePosition(id, next);
        }
        return graph();
      });
    },
    createZone(dimId, { type, name }) {
      return transaction(() => {
        const dim = active(dimId);
        if (dim.type !== "dim") fail("Choose a Dim.");
        const zone = { id: randomUUID(), type, name };
        const next = validateNode({
          ...dim,
          payload: { ...dim.payload, zones: [...zonesOf(dim), zone] },
        });
        db.prepare("UPDATE nodes SET payload=?,updatedAt=? WHERE id=?").run(
          JSON.stringify(next.payload),
          new Date().toISOString(),
          dimId,
        );
        return { zone: next.payload.zones.at(-1), ...graph() };
      });
    },
    renameZone(dimId, zoneId, { name }) {
      return transaction(() => {
        const dim = active(dimId);
        if (dim.type !== "dim" || !zonesOf(dim).some((z) => z.id === zoneId))
          fail("That area is unavailable.");
        const next = validateNode({
          ...dim,
          payload: {
            ...dim.payload,
            zones: zonesOf(dim).map((z) =>
              z.id === zoneId ? { ...z, name } : z,
            ),
          },
        });
        db.prepare("UPDATE nodes SET payload=?,updatedAt=? WHERE id=?").run(
          JSON.stringify(next.payload),
          new Date().toISOString(),
          dimId,
        );
        return graph();
      });
    },
    removeZone(dimId, zoneId, { replacementId }) {
      return transaction(() => {
        const dim = active(dimId),
          zones = zonesOf(dim),
          old = zones.find((z) => z.id === zoneId),
          target = zones.find((z) => z.id === replacementId);
        if (dim.type !== "dim" || !old || !target || old.id === target.id)
          fail("Choose another area for the documents.");
        const next = validateNode({
          ...dim,
          payload: {
            ...dim.payload,
            zones: zones.filter((z) => z.id !== zoneId),
          },
        });
        db.prepare("UPDATE nodes SET payload=?,updatedAt=? WHERE id=?").run(
          JSON.stringify(next.payload),
          new Date().toISOString(),
          dimId,
        );
        db.prepare(
          "UPDATE nodes SET zoneId=?,area=? WHERE dimId=? AND zoneId=?",
        ).run(target.id, target.type, dimId, zoneId);
        const counts = new Map();
        for (const n of graph().nodes.filter((n) => n.dimId === dimId)) {
          const count = counts.get(n.zoneId) || 0;
          writePosition(n.id, slotPosition(next, n.zoneId, count));
          counts.set(n.zoneId, count + 1);
        }
        return graph();
      });
    },
    importWorkspace(input, previewOnly = false) {
      if (
        !input ||
        typeof input !== "object" ||
        ![1, 2, 3].includes(input.version ?? 1) ||
        !Array.isArray(input.nodes) ||
        !Array.isArray(input.edges)
      )
        fail("Choose a Dimention JSON export (version 1, 2 or 3).");
      if (input.nodes.length > 1000 || input.edges.length > 5000)
        fail("Import supports up to 1000 items and 5000 connections.");
      const ids = new Map(),
        validated = [];
      for (const raw of input.nodes) {
        if (
          !raw ||
          typeof raw.id !== "string" ||
          !raw.id ||
          raw.id.length > 100 ||
          ids.has(raw.id)
        )
          fail("Imported items need unique IDs.");
        ids.set(raw.id, randomUUID());
        const n = validateNode({ starred: false, ...raw });
        if (
          raw.deletedAt != null &&
          (typeof raw.deletedAt !== "string" ||
            !Number.isFinite(Date.parse(raw.deletedAt)))
        )
          fail("Invalid Trash timestamp.");
        for (const key of ["createdAt", "updatedAt"])
          if (
            raw[key] !== undefined &&
            (typeof raw[key] !== "string" ||
              !Number.isFinite(Date.parse(raw[key])))
          )
            fail("Invalid imported timestamp.");
        validated.push({
          ...n,
          id: raw.id,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
          deletedAt: raw.deletedAt ?? null,
          deleteBatch: raw.deleteBatch ?? null,
        });
      }
      const lookup = new Map(validated.map((n) => [n.id, n]));
      for (const n of validated)
        if (n.dimId) {
          const parent = lookup.get(n.dimId);
          if (
            !parent ||
            parent.type !== "dim" ||
            (!n.deletedAt && parent.deletedAt)
          )
            fail("Every document must reference an available imported Dim.");
          const zone = n.zoneId
            ? zonesOf(parent).find((z) => z.id === n.zoneId)
            : zoneOf(parent, null, n.area);
          if (!zone)
            fail("An imported document references a missing Desk or Storage.");
          n.zoneId = zone.id;
          n.area = zone.type;
        }
      const pairs = new Set(),
        edges = input.edges.map((e) => {
          if (
            !e ||
            !ids.has(e.source) ||
            !ids.has(e.target) ||
            e.source === e.target
          )
            fail(
              "Imported connections must link two different imported items.",
            );
          const pair = JSON.stringify([e.source, e.target]);
          if (pairs.has(pair))
            fail("The import contains duplicate directed connections.");
          pairs.add(pair);
          return {
            source: e.source,
            target: e.target,
            label: string(e.label ?? "", "Connection label", 80),
          };
        });
      const summary = {
        items: validated.length,
        dims: validated.filter((n) => n.type === "dim").length,
        connections: edges.length,
        trashed: validated.filter((n) => n.deletedAt).length,
      };
      try {
        planSpatialLayout(
          [
            ...graph().nodes,
            ...validated.map((n) => ({
              ...n,
              id: ids.get(n.id),
              dimId: n.dimId ? ids.get(n.dimId) : null,
            })),
          ],
          [...ids.values()],
        );
      } catch (error) {
        fail(error.message);
      }
      if (previewOnly) return summary;
      return transaction(() => {
        const batches = new Map();
        for (const n of [...validated].sort(
          (a, b) => Number(b.type === "dim") - Number(a.type === "dim"),
        )) {
          insert(
            { ...n, dimId: n.dimId ? ids.get(n.dimId) : null },
            ids.get(n.id),
          );
          if (n.createdAt)
            db.prepare(
              "UPDATE nodes SET createdAt=?,updatedAt=? WHERE id=?",
            ).run(n.createdAt, n.updatedAt || n.createdAt, ids.get(n.id));
        }
        for (const e of edges)
          db.prepare("INSERT INTO edges VALUES(?,?,?,?)").run(
            randomUUID(),
            ids.get(e.source),
            ids.get(e.target),
            e.label,
          );
        for (const n of validated)
          if (n.deletedAt) {
            const key = n.deleteBatch || n.id;
            if (!batches.has(key)) batches.set(key, randomUUID());
            db.prepare(
              "UPDATE nodes SET deletedAt=?,deleteBatch=? WHERE id=?",
            ).run(n.deletedAt, batches.get(key), ids.get(n.id));
          }
        repairLayout([...ids.values()]);
        return { ...summary, ...graph() };
      });
    },
    createEdge(input) {
      if (!input || typeof input !== "object" || Array.isArray(input))
        fail("Expected a JSON object.");
      const source = string(input.source, "Source", 100);
      const target = string(input.target, "Target", 100);
      const label = string(input.label ?? "", "Connection label", 80).trim();
      if (source === target) fail("Connect two different nodes.");
      if (
        !getNode(source) ||
        !getNode(target) ||
        getNode(source).deletedAt ||
        getNode(target).deletedAt
      )
        fail("Both items must exist outside Trash.");
      if (
        db
          .prepare("SELECT id FROM edges WHERE source=? AND target=?")
          .get(source, target)
      )
        throw new ApiError(
          409,
          "These nodes are already connected in that direction.",
        );
      const edge = { id: randomUUID(), source, target, label };
      db.prepare("INSERT INTO edges VALUES (?, ?, ?, ?)").run(
        edge.id,
        source,
        target,
        label,
      );
      return edge;
    },
    deleteEdge(id) {
      if (!db.prepare("DELETE FROM edges WHERE id=?").run(id).changes)
        throw new ApiError(404, "That connection no longer exists.");
    },
    close: () => db.close(),
  };
}
