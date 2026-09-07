import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import { createAppServer } from '../server/server.mjs';

async function fixture(t, { seed = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dimention-test-'));
  const dataPath = join(directory, 'workspace.sqlite');
  let app, base;
  async function start() { app = await createAppServer({ dataPath, seed }); await new Promise(done => app.server.listen(0, '127.0.0.1', done)); base = `http://127.0.0.1:${app.server.address().port}`; }
  await start();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { dataPath, get base() { return base; }, async restart() { await app.close(); await start(); }, async request(path, method = 'GET', input) { const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) }); return { status: response.status, data: await response.json(), headers: response.headers }; } };
}
const node = (type = 'note') => ({ type, title: `A ${type}`, content: 'A long thought\nwith new lines & <literal> markup.', x: -18.5, y: 80, z: 340, payload: type === 'workflow' ? { steps: [{ text: 'First', done: false }, { text: 'Second', done: true }] } : type === 'table' ? { columns: ['Name', 'State'], rows: [['one', 'open'], ['two', 'done']] } : {} });

test('all four types create, update and survive a server restart; export equals stored graph', async t => {
  const f = await fixture(t); const expected = [];
  assert.equal((await f.request('/health')).data.ok, true);
  for (const type of ['note', 'idea', 'workflow', 'table']) {
    const created = await f.request('/nodes', 'POST', node(type)); assert.equal(created.status, 201); assert.ok(created.data.createdAt);
    const changed = { ...node(type), title: `Edited ${type}`, z: -450.75 };
    if (type === 'workflow') changed.payload.steps = [{ text: 'Edited first', done: true }, { text: 'Added step', done: false }];
    if (type === 'table') changed.payload = { columns: ['Renamed', 'Status', 'Extra'], rows: [['changed', 'ready', 'persistent']] };
    const updated = await f.request('/nodes/' + created.data.id, 'PATCH', changed); assert.equal(updated.status, 200); expected.push(updated.data);
  }
  const edge = await f.request('/connections', 'POST', { source: expected[0].id, target: expected[1].id, label: 'inspires' }); assert.equal(edge.status, 201);
  await f.restart(); const graph = (await f.request('/workspace')).data;
  assert.deepEqual(graph.nodes, expected); assert.deepEqual(graph.edges, [edge.data]);
  const exported = await f.request('/export'); assert.equal(exported.data.version, 1); assert.deepEqual(exported.data.nodes, expected); assert.deepEqual(exported.data.edges, graph.edges); assert.match(exported.headers.get('content-disposition'), /attachment/);
});

test('directed edges reject duplicates, self-links and missing nodes; delete cascades', async t => {
  const f = await fixture(t); const a = (await f.request('/nodes', 'POST', node())).data; const b = (await f.request('/nodes', 'POST', node('idea'))).data;
  const edge = { source: a.id, target: b.id, label: 'connects' };
  assert.equal((await f.request('/connections', 'POST', edge)).status, 201);
  assert.equal((await f.request('/connections', 'POST', edge)).status, 409);
  const reverse = await f.request('/connections', 'POST', { source: b.id, target: a.id }); assert.equal(reverse.status, 201);
  assert.equal((await f.request('/connections', 'POST', { source: a.id, target: a.id })).status, 400);
  assert.equal((await f.request('/connections', 'POST', { source: a.id, target: 'missing' })).status, 400);
  assert.equal((await f.request('/connections/' + reverse.data.id, 'DELETE')).status, 200);
  assert.equal((await f.request('/connections/' + reverse.data.id, 'DELETE')).status, 404);
  assert.equal((await f.request('/nodes/' + a.id, 'DELETE')).status, 200);
  assert.equal((await f.request('/workspace')).data.edges.length, 0);
  assert.equal((await f.request('/nodes/' + a.id, 'PATCH', { title: 'ghost' })).status, 404);
  assert.equal((await f.request('/nodes/' + b.id, 'DELETE')).status, 200);
  assert.equal((await f.request('/workspace')).data.nodes.length, 0);
});

test('first initialization seeds once; deleting every type never recreates samples', async t => {
  const f = await fixture(t, { seed: true }); const initial = (await f.request('/workspace')).data;
  assert.equal(initial.nodes.length, 6); assert.equal(new Set(initial.nodes.map(n => n.type)).size, 4); assert.ok(new Set(initial.nodes.map(n => n.z)).size > 3);
  assert.equal(initial.nodes.find(n => n.type === 'workflow').payload.steps.length, 5);
  await f.restart(); assert.equal((await f.request('/workspace')).data.nodes.length, 6);
  for (const n of initial.nodes) assert.equal((await f.request('/nodes/' + n.id, 'DELETE')).status, 200);
  await f.restart(); assert.deepEqual((await f.request('/workspace')).data, { nodes: [], edges: [] });
});

test('invalid node, workflow and table inputs produce controlled errors without writes', async t => {
  const f = await fixture(t);
  const inputs = [null, [], 'text', {}, { ...node(), type: 'other' }, { ...node(), title: '  ' }, { ...node(), title: 'a'.repeat(161) }, { ...node(), z: 5001 }, { ...node(), y: '5' }, { ...node(), content: 'x'.repeat(100001) }, { ...node(), payload: [] }, { ...node(), starred: 'yes' }, { ...node('workflow'), payload: { steps: [{ text: 'test', done: 1 }] } }, { ...node('workflow'), payload: { steps: Array.from({ length: 201 }, () => ({ text: 'x', done: false })) } }, { ...node('table'), payload: { columns: [], rows: [] } }, { ...node('table'), payload: { columns: ['a'], rows: [['x','y']] } }, { ...node('table'), payload: { columns: ['a'], rows: [[true]] } }];
  for (const input of inputs) { const response = await f.request('/nodes', 'POST', input); assert.equal(response.status, 400, JSON.stringify(input).slice(0, 150)); assert.equal(typeof response.data.error, 'string'); assert.equal(response.data.stack, undefined); }
  assert.equal((await f.request('/connections', 'POST', null)).status, 400);
  assert.deepEqual((await f.request('/workspace')).data, { nodes: [], edges: [] });
});

test('parameterized SQL safely stores SQL-like text and partial position updates preserve data', async t => {
  const f = await fixture(t); const title = "'; DROP TABLE nodes; --";
  const created = (await f.request('/nodes', 'POST', { ...node('table'), title })).data;
  const updated = (await f.request('/nodes/' + created.id, 'PATCH', { x: 123 })).data;
  assert.equal(updated.title, title); assert.deepEqual(updated.payload, created.payload); assert.equal(updated.x, 123); assert.equal(updated.z, created.z);
  assert.equal((await f.request('/nodes/' + created.id, 'PATCH', null)).status, 400);
  assert.equal((await f.request('/workspace')).data.nodes.length, 1);
});

test('bounded requests, content types, malformed JSON, origins and paths are checked', async t => {
  const f = await fixture(t);
  let response = await fetch(f.base + '/api/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{wrong' }); assert.equal(response.status, 400);
  response = await fetch(f.base + '/api/nodes', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); assert.equal(response.status, 415);
  response = await fetch(f.base + '/api/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x'.repeat(6 * 1024 * 1024) }) }); assert.equal(response.status, 413);
  response = await fetch(f.base + '/api/workspace', { headers: { Origin: 'https://example.com' } }); assert.equal(response.status, 403);
  const badHost = await new Promise((done, reject) => { http.get(f.base + '/api/health', { headers: { Host: 'evil.example' } }, res => { res.resume(); done(res.statusCode); }).on('error', reject); }); assert.equal(badHost, 403);
  assert.equal((await f.request('/missing')).status, 404);
  response = await fetch(f.base + '/server/store.mjs'); assert.equal(response.status, 404);
  response = await fetch(f.base + '/'); assert.equal(response.status, 200); assert.match(await response.text(), /Dimention/);
});

test('preliminary workflow text migrates to structured steps without losing other records', async t => {
  const f = await fixture(t); const created = (await f.request('/nodes', 'POST', { ...node('workflow'), content: '[x] Complete\n[ ] Next' })).data;
  const db = new DatabaseSync(f.dataPath); db.prepare('UPDATE nodes SET payload=? WHERE id=?').run('{}', created.id); db.close();
  await f.restart(); const migrated = (await f.request('/workspace')).data.nodes[0];
  assert.deepEqual(migrated.payload.steps, [{ text: 'Complete', done: true }, { text: 'Next', done: false }]); assert.equal(migrated.id, created.id);
});

test('100-node graph persists without missing nodes or orphaned edges', async t => {
  const f = await fixture(t); const ids = [];
  for (let i = 0; i < 100; i++) { const created = await f.request('/nodes', 'POST', { ...node(), title: `Thought ${i}`, x: i * 10, y: i % 7 * 60, z: i % 11 * 90 }); ids.push(created.data.id); if (i) assert.equal((await f.request('/connections', 'POST', { source: ids[i - 1], target: ids[i] })).status, 201); }
  await f.restart(); const graph = (await f.request('/workspace')).data; assert.equal(graph.nodes.length, 100); assert.equal(graph.edges.length, 99);
  await f.request('/nodes/' + ids[50], 'DELETE'); const after = (await f.request('/workspace')).data;
  assert.equal(after.nodes.length, 99); assert.equal(after.edges.length, 97); assert.ok(after.edges.every(e => after.nodes.some(n => n.id === e.source) && after.nodes.some(n => n.id === e.target)));
});
