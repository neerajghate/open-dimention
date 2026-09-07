import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const TYPES = ['note', 'idea', 'workflow', 'table'];
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (message) => { throw new ApiError(400, message); };
const string = (value, name, max) => {
  if (typeof value !== 'string' || value.length > max) fail(`${name} must be text with at most ${max} characters.`);
  return value;
};
function validateNode(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Expected a JSON object.');
  if (!TYPES.includes(input.type)) fail('Choose a valid node type.');
  const title = string(input.title, 'Title', 160).trim();
  if (!title) fail('Give your node a title.');
  const content = string(input.content ?? '', 'Content', 100000);
  for (const axis of ['x', 'y', 'z']) {
    if (typeof input[axis] !== 'number' || !Number.isFinite(input[axis]) || Math.abs(input[axis]) > 5000) fail('Coordinates must be numbers between -5000 and 5000.');
  }
  if (typeof input.starred !== 'boolean') fail('Starred must be true or false.');
  const payload = input.payload ?? {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('Invalid structured data.');
  let cleanPayload = {};
  if (input.type === 'workflow') {
    const steps = payload.steps ?? content.split('\n').filter(Boolean).map(line => ({ text: line.replace(/^\[[ xX]\]\s*/, ''), done: /^\[[xX]\]/.test(line) }));
    if (!Array.isArray(steps) || steps.length > 200) fail('Workflows support up to 200 steps.');
    cleanPayload.steps = steps.map(step => {
      if (!step || typeof step !== 'object' || typeof step.done !== 'boolean') fail('Each step needs text and a completion state.');
      return { text: string(step.text, 'Step', 2000), done: step.done };
    });
  }
  if (input.type === 'table') {
    const { columns, rows } = payload;
    if (!Array.isArray(columns) || columns.length < 1 || columns.length > 12 || !Array.isArray(rows) || rows.length > 200) fail('Tables support 1–12 columns and up to 200 rows.');
    cleanPayload = {
      columns: columns.map(c => string(c, 'Column', 80)),
      rows: rows.map(row => {
        if (!Array.isArray(row) || row.length !== columns.length) fail('Every row must match the table columns.');
        return row.map(cell => string(cell, 'Cell', 2000));
      }),
    };
  }
  return { title, type: input.type, content, x: input.x, y: input.y, z: input.z, starred: input.starred, payload: cleanPayload };
}

const seeds = [
  { id: 'welcome', type: 'note', title: 'A space for your thoughts', content: 'Good ideas rarely arrive in a straight line.\n\nThis is your place to collect the pieces, follow a thread, and see how everything connects.\n\nTry orbiting the space. Open a card to write. Choose Move, then drag a card to give it a new place. Make something your own.', x: 0, y: 15, z: 25, starred: true },
  { id: 'inspiration', type: 'idea', title: 'What if notes had depth?', content: 'A room for ideas, instead of another endless page.\n\nSpatial memory could help us find things by where they live, not just what we called them.\n\nWhat if a project was a constellation?', x: -310, y: 175, z: -30 },
  { id: 'principles', type: 'note', title: 'Keep it simple', content: 'A few principles to build around:\n\n• Capture first. Organize later.\n• Make connections visible.\n• Keep the writing experience calm.\n• Let ideas take up a little space.', x: 330, y: 160, z: -105 },
  { id: 'workflow', type: 'workflow', title: 'From spark to something', content: '[x] Catch a little spark\n[x] Connect it to an idea\n[ ] Explore the possibilities\n[ ] Make a small prototype\n[ ] Share what you learned', x: -325, y: -95, z: 125 },
  { id: 'reading', type: 'table', title: 'The inspiration shelf', content: 'Little things worth coming back to.', payload: { columns: ['Name', 'Type', 'Status'], rows: [['Spatial thinking', 'Concept', 'Exploring'], ['A calmer workspace', 'Idea', 'Next up'], ['Build a tiny version', 'Experiment', 'In progress']] }, x: 325, y: -90, z: 180 },
  { id: 'question', type: 'idea', title: 'Leave room for the unexpected', content: 'The best connection might be the one you have not made yet.\n\nWhat could you put next to this idea?', x: 25, y: -210, z: -140 },
];

export function createStore(path, { seed = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
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
  const parse = row => row ? { ...row, starred: Boolean(row.starred), payload: JSON.parse(row.payload) } : null;
  const getNode = id => parse(db.prepare('SELECT * FROM nodes WHERE id = ?').get(id));
  const insert = (node, id = randomUUID()) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) fail('Expected a JSON object.');
    const n = validateNode({ content: '', x: 0, y: 0, z: 0, starred: false, ...node });
    const now = new Date().toISOString();
    db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, n.title, n.type, n.content, n.x, n.y, n.z, Number(n.starred), JSON.stringify(n.payload), now, now);
    return getNode(id);
  };
  // Upgrade the preliminary text-only workflows without changing the schema.
  for (const row of db.prepare("SELECT * FROM nodes WHERE type='workflow'").all()) {
    const node = parse(row);
    if (!node.payload.steps) {
      const validated = validateNode(node);
      db.prepare('UPDATE nodes SET payload=? WHERE id=?').run(JSON.stringify(validated.payload), node.id);
    }
  }
  if (!db.prepare("SELECT value FROM metadata WHERE key = 'initialized'").get()) {
    db.exec('BEGIN');
    try {
      if (seed) {
        for (const node of seeds) insert(node, node.id);
        for (const [target, label] of [['inspiration', 'imagines'], ['principles', 'guided by'], ['workflow', 'becomes'], ['reading', 'collects'], ['question', 'explores']]) {
          db.prepare('INSERT INTO edges VALUES (?, ?, ?, ?)').run(randomUUID(), 'welcome', target, label);
        }
      }
      db.prepare('INSERT INTO metadata VALUES (?, ?)').run('initialized', '1');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {
    graph: () => ({ nodes: db.prepare('SELECT * FROM nodes ORDER BY createdAt, id').all().map(parse), edges: db.prepare('SELECT * FROM edges').all() }),
    getNode,
    createNode: insert,
    updateNode(id, input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Expected a JSON object.');
      const previous = getNode(id);
      if (!previous) throw new ApiError(404, 'That node no longer exists.');
      const n = validateNode({ ...previous, ...input });
      db.prepare('UPDATE nodes SET title=?, type=?, content=?, x=?, y=?, z=?, starred=?, payload=?, updatedAt=? WHERE id=?')
        .run(n.title, n.type, n.content, n.x, n.y, n.z, Number(n.starred), JSON.stringify(n.payload), new Date().toISOString(), id);
      return getNode(id);
    },
    deleteNode(id) {
      if (!db.prepare('DELETE FROM nodes WHERE id = ?').run(id).changes) throw new ApiError(404, 'That node no longer exists.');
    },
    createEdge(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Expected a JSON object.');
      const source = string(input.source, 'Source', 100);
      const target = string(input.target, 'Target', 100);
      const label = string(input.label ?? '', 'Connection label', 80).trim();
      if (source === target) fail('Connect two different nodes.');
      if (!getNode(source) || !getNode(target)) fail('Both nodes must exist.');
      if (db.prepare('SELECT id FROM edges WHERE source=? AND target=?').get(source, target)) throw new ApiError(409, 'These nodes are already connected in that direction.');
      const edge = { id: randomUUID(), source, target, label };
      db.prepare('INSERT INTO edges VALUES (?, ?, ?, ?)').run(edge.id, source, target, label);
      return edge;
    },
    deleteEdge(id) {
      if (!db.prepare('DELETE FROM edges WHERE id=?').run(id).changes) throw new ApiError(404, 'That connection no longer exists.');
    },
    close: () => db.close(),
  };
}
