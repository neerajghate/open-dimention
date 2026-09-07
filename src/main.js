import './style.css';
import { createWorkspaceScene, palette, typeNames, preview } from './scene.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => structuredClone(value);
const icons = { note: '▤', idea: '✧', workflow: '☷', table: '▦' };
let graph = { nodes: [], edges: [] }, selected = null, draft = null, dirty = false, scene, loaded = false, saving = null, navigating = false;
let search = '', filter = 'all', toastTimer, localWarning = false, saveFailure = '';

$('#app').innerHTML = `
  <aside class="sidebar" aria-label="Workspace navigation">
    <a class="brand" href="/" aria-label="Dimention home"><span class="brand-icon">◇</span><span>Dimention<span class="brand-period">.</span></span></a>
    <div class="workspace-name"><span class="workspace-dot"></span> My workspace <span class="local-badge">LOCAL</span></div>
    <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Find a thought…" aria-label="Search nodes"><kbd>/</kbd></label>
    <div class="sidebar-section"><span>YOUR SPACE</span><span id="node-count">—</span></div>
    <div class="filters" aria-label="Filter by node type">${['all', ...Object.keys(typeNames)].map(type => `<button class="filter ${type === 'all' ? 'active' : ''}" data-filter="${type}" aria-pressed="${type === 'all'}">${type === 'all' ? 'All' : typeNames[type] + 's'}</button>`).join('')}</div>
    <div id="node-list" class="node-list" aria-label="Nodes"><p class="list-message">Opening your workspace…</p></div>
    <div class="create-section"><div class="sidebar-section"><span>ADD TO YOUR SPACE</span><span>＋</span></div><div class="create-grid">${Object.keys(typeNames).map(type => `<button data-create="${type}" disabled><span style="color:${palette[type]}">${icons[type]}</span>${typeNames[type]}</button>`).join('')}</div></div>
    <div class="sidebar-footer"><span class="status-dot"></span><span>Stored on this computer</span><button id="export" title="Export workspace as JSON" aria-label="Export workspace" disabled>↥</button></div>
  </aside>
  <main class="main-space">
    <header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>My space</strong></div><button id="help" class="quiet">? <span>Quick guide</span></button></header>
    <section class="stage" aria-label="Spatial workspace">
      <div class="space-heading"><span class="eyebrow">A LITTLE ROOM FOR BIG IDEAS</span><h1>Your thoughts, connected.</h1><p>Collect the pieces. Give them a place.</p></div>
      <div id="canvas-container"></div>
      <div id="scene-fallback" class="scene-fallback" hidden><span class="fallback-icon">◇</span><h2>Keep thinking in two dimensions.</h2><p>Your browser couldn’t start WebGL. Try enabling hardware acceleration, or use the list and editor to keep working.</p></div>
      <div id="empty-space" class="empty-space" hidden><span>✧</span><h2>Start with a little thought.</h2><p>Add a note, idea, workflow, or table from the sidebar.<br>This space is yours to shape.</p><button class="primary" data-create="note">＋ Create your first note</button></div>
      <div id="load-error" class="scene-fallback" hidden><h2>Couldn’t open your workspace.</h2><p id="load-error-message"></p><button id="retry" class="primary">Try again</button></div>
      <div class="view-toolbar" aria-label="3D controls"><div class="tool-segment"><button id="select-mode" class="active" aria-pressed="true" title="Click cards to edit; drag empty space to orbit">↖ <span>Select</span></button><button id="move-mode" aria-pressed="false" title="Drag a card to change its position">✥ <span>Move</span></button></div><select id="move-axis" aria-label="Movement axis" title="Movement axis" hidden><option value="screen">View plane</option><option value="x">X axis</option><option value="y">Y axis</option><option value="z">Z · depth</option></select><button id="pan-mode" aria-pressed="false" title="Drag to pan the camera">↔ <span>Pan</span></button><span class="toolbar-divider"></span><button id="fit-all" title="Fit all nodes in view">⛶ <span>Fit all</span></button><button id="reset-view" title="Restore the initial viewing angle" aria-label="Reset view">↺</button></div>
      <div class="canvas-footer"><span id="scene-status"><span class="status-dot"></span> A space in three dimensions</span><span id="control-hint">Drag space to orbit <i>·</i> Right-drag to pan <i>·</i> Scroll to zoom</span></div>
    </section>
  </main>
  <aside id="editor" class="editor" aria-label="Node editor" hidden></aside>
  <div id="toast" class="toast" role="status" hidden></div>
  <dialog id="decision-dialog"><div id="dialog-content"></div></dialog>
  <dialog id="help-dialog"><button class="dialog-close quiet" aria-label="Close guide">×</button><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2>A place to think in 3D.</h2><p>Every card has a real position in space. Open one to write in a familiar editor.</p><dl><dt>Look around</dt><dd>Drag empty space to orbit. Right-drag or middle-drag to pan. Scroll to zoom.</dd><dt>Open a thought</dt><dd>Click a card, or find it in the searchable sidebar. Search includes notes, checklist steps, and table cells.</dd><dt>Give it a place</dt><dd>Choose Move, then drag a card. Pick X, Y, or Z for a single axis. The editor also has precise coordinates. Save to keep your move.</dd><dt>Connect the pieces</dt><dd>Open a node and choose a destination under Connections. Arrows point from source to destination; labels describe the link.</dd><dt>Keep your work</dt><dd>Use Save changes or Ctrl/Cmd+S. A prompt protects unsaved edits when you switch. Local draft recovery helps after a refresh.</dd><dt>Find your bearings</dt><dd>Fit all brings every card into view. Reset view restores the original angle. Press / to search; Escape closes the editor.</dd></dl><button class="primary close-guide">Got it</button></dialog>
`;

function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.toggle('error', error); $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 8000 : 4000); }
async function api(path, options = {}) {
  let response;
  try { response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000), body: options.body === undefined ? undefined : JSON.stringify(options.body) }); }
  catch { throw new Error('The local server is unavailable. Your draft is still here. Restart the server and try again.'); }
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.'); return data;
}
function draftKey(id) { return `dimention:draft:${id}`; }
function remember() {
  try { if (draft) localStorage.setItem(draftKey(draft.id), JSON.stringify(draft)); }
  catch { if (!localWarning) { toast('Browser draft recovery is unavailable. Keep this tab open until you save.', true); localWarning = true; } }
}
function forget(id) { try { localStorage.removeItem(draftKey(id)); } catch { /* Saving to SQLite still works in private browsers. */ } }
function recover(node) {
  try {
    const raw = localStorage.getItem(draftKey(node.id)); if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.id === node.id && value.type === node.type && typeof value.title === 'string' && typeof value.content === 'string' && value.payload && ['x', 'y', 'z'].every(k => Number.isFinite(value[k]))) {
      if (value.type === 'workflow' && !Array.isArray(value.payload.steps)) return null;
      if (value.type === 'table' && (!Array.isArray(value.payload.columns) || !Array.isArray(value.payload.rows))) return null;
      return value;
    }
  } catch { /* Malformed browser drafts must not block stored data. */ }
  return null;
}
function markDirty() { dirty = true; saveFailure = ''; remember(); updateSaveStatus(); }
function updateSaveStatus(message) {
  if (!draft) return;
  const status = $('#save-status'); if (!status) return;
  status.textContent = message || (saving ? 'Saving…' : saveFailure || (dirty ? 'Unsaved changes' : 'All changes saved'));
  status.className = dirty ? 'save-status unsaved' : 'save-status';
  $('#save-node').disabled = !!saving || !dirty;
}
function displayGraph() {
  const nodes = graph.nodes.map(n => draft?.id === n.id ? draft : n);
  scene?.update(nodes, graph.edges, selected);
  $('#node-count').textContent = String(graph.nodes.length).padStart(2, '0');
  $('#empty-space').hidden = !loaded || graph.nodes.length > 0 || !scene;
  $('#scene-status').innerHTML = `<span class="status-dot"></span> ${graph.nodes.length} ${graph.nodes.length === 1 ? 'thought' : 'thoughts'} <i>·</i> ${graph.edges.length} ${graph.edges.length === 1 ? 'connection' : 'connections'}`;
}
function renderList() {
  const query = search.toLocaleLowerCase().trim();
  const nodes = graph.nodes.filter(n => (filter === 'all' || n.type === filter) && `${n.title} ${n.content} ${preview(n)} ${n.type === 'table' ? n.payload.rows.flat().join(' ') : ''}`.toLocaleLowerCase().includes(query));
  $('#node-list').innerHTML = nodes.length ? nodes.map(n => `<button class="node-list-item ${selected === n.id ? 'selected' : ''}" data-open="${escape(n.id)}" ${selected === n.id ? 'aria-current="true"' : ''}><span class="node-type-icon" style="--type-color:${palette[n.type]}">${icons[n.type]}</span><span class="node-list-copy"><span class="node-list-title">${escape(n.title)}</span><span class="node-list-preview">${escape(preview(n).replace(/\n/g, ' ') || typeNames[n.type])}</span></span><span class="node-list-chevron">›</span></button>`).join('') : `<p class="list-message">${graph.nodes.length ? 'No matching thoughts.<br>Try another search or filter.' : 'A fresh start.<br>Add your first thought below.'}</p>`;
  for (const button of document.querySelectorAll('[data-filter]')) { const active = button.dataset.filter === filter; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); }
}
async function decision({ title, message, buttons }) {
  const dialog = $('#decision-dialog');
  $('#dialog-content').innerHTML = `<h2>${escape(title)}</h2><p>${escape(message)}</p><div class="dialog-actions">${buttons.map(b => `<button data-answer="${b.value}" class="${b.class || 'secondary'}">${escape(b.label)}</button>`).join('')}</div>`;
  dialog.showModal();
  return new Promise(resolve => {
    const finish = answer => { dialog.removeEventListener('click', onClick); dialog.removeEventListener('cancel', onCancel); dialog.close(); resolve(answer); };
    const onClick = e => { const button = e.target.closest('[data-answer]'); if (button) finish(button.dataset.answer); };
    const onCancel = e => { e.preventDefault(); finish('cancel'); };
    dialog.addEventListener('click', onClick); dialog.addEventListener('cancel', onCancel);
  });
}
async function guard() {
  if (saving && !await saving) return false;
  if (!dirty) return true;
  const answer = await decision({ title: 'Keep your changes?', message: `“${draft.title || 'Untitled'}” has unsaved edits. Save them before moving on.`, buttons: [{ value: 'cancel', label: 'Keep editing' }, { value: 'discard', label: 'Discard' }, { value: 'save', label: 'Save & continue', class: 'primary' }] });
  if (answer === 'save') return save();
  if (answer === 'discard') {
    forget(draft.id); draft = clone(graph.nodes.find(n => n.id === selected)); dirty = false; saveFailure = '';
    renderEditor(); displayGraph(); return true;
  }
  return false;
}
async function navigate(action) {
  if (navigating) return; navigating = true;
  try {
    if (await guard()) {
      // A create request must finish before the previous editor can be edited again.
      if ($('#editor-fields')) $('#editor-fields').disabled = true;
      await action();
    }
  } catch (error) { toast(error.message, true); }
  finally { navigating = false; if ($('#editor-fields')) $('#editor-fields').disabled = false; }
}
function openNode(id, focus = true) {
  if (id === selected) { if (focus) scene?.focus(id); return; }
  return navigate(() => openNow(id, focus));
}
function openNow(id, focus = true) {
  const node = graph.nodes.find(n => n.id === id); if (!node) return;
  selected = id; const recovered = recover(node); draft = recovered || clone(node); dirty = !!recovered;
  saveFailure = '';
  renderEditor(); renderList(); displayGraph();
  if (focus) requestAnimationFrame(() => scene?.focus(id));
  if (recovered) toast('Recovered an unsaved draft. Review it, then save your changes.');
}
function closeNow() { selected = null; draft = null; dirty = false; $('#editor').hidden = true; renderList(); displayGraph(); }
function renderEditor() {
  const node = draft;
  $('#editor').hidden = false;
  $('#editor').innerHTML = `
    <header class="editor-header"><span class="type-chip" style="--type-color:${palette[node.type]}">${icons[node.type]} ${typeNames[node.type]}</span><div><button id="focus-node" class="quiet" title="Focus this node in space" aria-label="Focus node">⛶</button><button id="close-editor" class="quiet" aria-label="Close editor">×</button></div></header>
    <form id="editor-form" class="editor-body"><fieldset id="editor-fields">
      <div class="editor-intro"><span class="eyebrow">THOUGHT DETAILS</span><label for="node-title">Title</label><input id="node-title" class="title-input" maxlength="160" required value="${escape(node.title)}" placeholder="Give this thought a name"></div>
      <label for="node-content">${node.type === 'note' || node.type === 'idea' ? 'Your thoughts' : 'Description'}</label><textarea id="node-content" class="content-input ${['note', 'idea'].includes(node.type) ? 'long-content' : ''}" maxlength="100000" placeholder="Start anywhere. Follow the thought…">${escape(node.content)}</textarea>
      <div id="structured-editor"></div>
      <section class="editor-section"><div class="section-title"><h2>Position in space</h2><span>X / Y / Z</span></div><div class="coordinates">${['x', 'y', 'z'].map(axis => `<label><span class="axis-${axis}">${axis.toUpperCase()}${axis === 'z' ? ' · depth' : ''}</span><input id="position-${axis}" data-coordinate="${axis}" type="number" min="-5000" max="5000" step="any" required value="${node[axis]}" aria-label="${axis.toUpperCase()} coordinate"></label>`).join('')}</div><p class="field-hint">Drag in Move mode, or enter exact coordinates.</p></section>
      <section class="editor-section"><div class="section-title"><h2>Connections</h2><span id="connection-count"></span></div><div id="connection-list"></div><div class="connection-create"><label for="connection-target">Connect to</label><select id="connection-target"><option value="">Choose a destination…</option>${graph.nodes.filter(n => n.id !== node.id).map(n => `<option value="${escape(n.id)}">${escape(n.title)}</option>`).join('')}</select><label for="connection-label">Label <span class="optional">(optional)</span></label><input id="connection-label" maxlength="80" placeholder="e.g. inspires, depends on…"><button type="button" id="add-connection" class="secondary full-width">＋ Add directed connection</button><p class="field-hint">Connections are saved immediately.</p></div></section>
      <div class="node-metadata">Created ${escape(new Date(node.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</div>
    </fieldset></form>
    <footer class="editor-footer"><div id="save-status" class="save-status" role="status"></div><div class="editor-actions"><button id="delete-node" class="danger-quiet" aria-label="Delete node">Delete</button><button id="save-node" class="primary" type="submit" form="editor-form">Save changes <kbd>Ctrl S</kbd></button></div></footer>`;
  renderPayload(); renderConnections(); updateSaveStatus();
  $('#editor-form').addEventListener('submit', event => { event.preventDefault(); save(); });
  $('#editor-form').addEventListener('input', onEditorInput);
  $('#editor-form').addEventListener('click', onEditorAction);
  $('#close-editor').onclick = () => navigate(closeNow);
  $('#focus-node').onclick = () => scene?.focus(selected);
  $('#delete-node').onclick = deleteSelected;
}
function renderPayload() {
  if (draft.type === 'workflow') {
    const steps = draft.payload.steps;
    $('#structured-editor').innerHTML = `<section class="editor-section"><div class="section-title"><h2>Steps</h2><span id="step-progress">${steps.filter(s => s.done).length} / ${steps.length} complete</span></div><ol class="workflow-steps">${steps.map((step, i) => `<li><span class="step-number">${i + 1}</span><input type="checkbox" data-step-done="${i}" aria-label="Complete step ${i + 1}" ${step.done ? 'checked' : ''}><input class="step-text ${step.done ? 'completed' : ''}" data-step-text="${i}" value="${escape(step.text)}" maxlength="2000" placeholder="What happens next?" aria-label="Step ${i + 1}"><button type="button" data-remove-step="${i}" class="remove-small" aria-label="Remove step ${i + 1}">×</button></li>`).join('')}</ol><button type="button" id="add-step" class="secondary" ${steps.length >= 200 ? 'disabled' : ''}>＋ Add step</button><p class="field-hint">Up to 200 steps.</p></section>`;
  } else if (draft.type === 'table') {
    const { columns, rows } = draft.payload;
    $('#structured-editor').innerHTML = `<section class="editor-section"><div class="section-title"><h2>Your table</h2><span>${rows.length} rows · ${columns.length} columns</span></div><div class="table-scroll"><table class="data-table"><thead><tr>${columns.map((column, i) => `<th><div><input data-column="${i}" value="${escape(column)}" maxlength="80" aria-label="Column ${i + 1} name"><button type="button" data-remove-column="${i}" class="remove-small" aria-label="Remove column ${i + 1}" ${columns.length <= 1 ? 'disabled' : ''}>×</button></div></th>`).join('')}<th class="row-action"></th></tr></thead><tbody>${rows.map((row, ri) => `<tr>${row.map((cell, ci) => `<td><input data-cell="${ri},${ci}" value="${escape(cell)}" maxlength="2000" aria-label="Row ${ri + 1}, column ${ci + 1}"></td>`).join('')}<td><button type="button" data-remove-row="${ri}" class="remove-small" aria-label="Remove row ${ri + 1}">×</button></td></tr>`).join('')}</tbody></table></div><div class="table-actions"><button type="button" id="add-row" class="secondary" ${rows.length >= 200 ? 'disabled' : ''}>＋ Row</button><button type="button" id="add-column" class="secondary" ${columns.length >= 12 ? 'disabled' : ''}>＋ Column</button></div><p class="field-hint">1–12 columns · Up to 200 rows · Scroll sideways for more.</p></section>`;
  } else $('#structured-editor').innerHTML = '';
}
function renderConnections() {
  if (!draft || !$('#connection-list')) return;
  const edges = graph.edges.filter(e => e.source === selected || e.target === selected);
  $('#connection-count').textContent = edges.length;
  $('#connection-list').innerHTML = edges.length ? edges.map(edge => {
    const outgoing = edge.source === selected; const otherId = outgoing ? edge.target : edge.source;
    const other = graph.nodes.find(n => n.id === otherId);
    return `<div class="connection-item"><span class="connection-arrow" title="${outgoing ? 'Outgoing' : 'Incoming'}">${outgoing ? '↗' : '↙'}</span><button type="button" data-follow="${escape(otherId)}" class="connection-follow"><span>${escape(other?.title || 'Missing node')}</span><small>${outgoing ? 'Outgoing' : 'Incoming'}${edge.label ? ' · ' + escape(edge.label) : ''}</small></button><button type="button" data-remove-edge="${escape(edge.id)}" class="remove-small" aria-label="Remove connection to ${escape(other?.title)}">×</button></div>`;
  }).join('') : '<p class="field-hint connections-empty">No connections yet. Where could this thought lead?</p>';
}
function onEditorInput(event) {
  const element = event.target, d = element.dataset;
  if (element.id === 'node-title') draft.title = element.value;
  else if (element.id === 'node-content') draft.content = element.value;
  else if (d.coordinate !== undefined) {
    if (element.value === '' || !element.validity.valid) { dirty = true; updateSaveStatus(); return; }
    draft[d.coordinate] = Number(element.value); displayGraph();
  } else if (d.stepText !== undefined) draft.payload.steps[Number(d.stepText)].text = element.value;
  else if (d.stepDone !== undefined) {
    draft.payload.steps[Number(d.stepDone)].done = element.checked;
    element.parentElement.querySelector('.step-text').classList.toggle('completed', element.checked);
    $('#step-progress').textContent = `${draft.payload.steps.filter(s => s.done).length} / ${draft.payload.steps.length} complete`;
  } else if (d.column !== undefined) draft.payload.columns[Number(d.column)] = element.value;
  else if (d.cell !== undefined) { const [r, c] = d.cell.split(',').map(Number); draft.payload.rows[r][c] = element.value; }
  else return;
  markDirty();
}
async function onEditorAction(event) {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  const d = button.dataset;
  if (d.follow) return openNode(d.follow);
  if (d.removeEdge) {
    button.disabled = true;
    try { await api(`/connections/${d.removeEdge}`, { method: 'DELETE' }); graph.edges = graph.edges.filter(e => e.id !== d.removeEdge); renderConnections(); displayGraph(); toast('Connection removed.'); }
    catch (error) { toast(error.message, true); button.disabled = false; } return;
  }
  if (button.id === 'add-connection') {
    const target = $('#connection-target').value; if (!target) { toast('Choose a destination first.'); $('#connection-target').focus(); return; }
    const label = $('#connection-label').value; button.disabled = true;
    try { const edge = await api('/connections', { method: 'POST', body: { source: selected, target, label } }); graph.edges.push(edge); renderConnections(); displayGraph(); $('#connection-label').value = ''; toast('Connection saved.'); }
    catch (error) { toast(error.message, true); } finally { button.disabled = false; } return;
  }
  if (button.id === 'add-step') { draft.payload.steps.push({ text: '', done: false }); }
  else if (d.removeStep !== undefined) draft.payload.steps.splice(Number(d.removeStep), 1);
  else if (button.id === 'add-row') draft.payload.rows.push(draft.payload.columns.map(() => ''));
  else if (button.id === 'add-column') { draft.payload.columns.push(`Column ${draft.payload.columns.length + 1}`); draft.payload.rows.forEach(row => row.push('')); }
  else if (d.removeRow !== undefined) draft.payload.rows.splice(Number(d.removeRow), 1);
  else if (d.removeColumn !== undefined) { const i = Number(d.removeColumn); draft.payload.columns.splice(i, 1); draft.payload.rows.forEach(row => row.splice(i, 1)); }
  else return;
  markDirty(); renderPayload();
  if (button.id === 'add-step') document.querySelector('.workflow-steps li:last-child .step-text')?.focus();
}
function save() {
  if (saving) return saving;
  if (!draft || !dirty) return Promise.resolve(true);
  if (!$('#editor-form').reportValidity()) return Promise.resolve(false);
  const snapshot = clone(draft);
  saveFailure = '';
  $('#editor-fields').disabled = true; $('#delete-node').disabled = true;
  saving = (async () => {
    try {
      const stored = await api(`/nodes/${snapshot.id}`, { method: 'PATCH', body: snapshot });
      graph.nodes = graph.nodes.map(n => n.id === stored.id ? stored : n);
      draft = clone(stored); dirty = false; forget(stored.id); renderList(); displayGraph(); return true;
    } catch (error) { saveFailure = 'Save failed · draft preserved. Try saving again.'; toast(error.message, true); return false; }
    finally { saving = null; $('#editor-fields').disabled = false; $('#delete-node').disabled = false; updateSaveStatus(); }
  })(); updateSaveStatus(); return saving;
}
async function createNode(type) {
  return navigate(async () => {
    const center = scene?.getTarget() || { x: 0, y: 0, z: 0 };
    for (const key of ['x', 'y', 'z']) center[key] = Math.max(-5000, Math.min(5000, center[key] + Math.round((Math.random() - .5) * 140)));
    const payload = type === 'workflow' ? { steps: [{ text: 'Your first step', done: false }] } : type === 'table' ? { columns: ['Name', 'Details'], rows: [['', '']] } : {};
    const node = await api('/nodes', { method: 'POST', body: { type, title: `Untitled ${type}`, content: '', payload, ...center } });
    graph.nodes.push(node); openNow(node.id); $('#node-title').focus(); $('#node-title').select();
  });
}
async function deleteSelected() {
  if (navigating || saving) return; navigating = true;
  try {
    const answer = await decision({ title: 'Delete this thought?', message: `“${draft.title || 'Untitled'}”, its unsaved edits, and all its connections will be removed. This cannot be undone.`, buttons: [{ value: 'cancel', label: 'Keep thought' }, { value: 'delete', label: 'Delete thought', class: 'danger' }] });
    if (answer !== 'delete') return;
    const id = selected; await api(`/nodes/${id}`, { method: 'DELETE' });
    graph.nodes = graph.nodes.filter(n => n.id !== id); graph.edges = graph.edges.filter(e => e.source !== id && e.target !== id); forget(id); closeNow(); toast('Thought deleted.');
  } catch (error) { toast(error.message, true); } finally { navigating = false; }
}
let mode = 'select';
function setMode(next) { mode = next; for (const name of ['select', 'move', 'pan']) { $(`#${name}-mode`).classList.toggle('active', mode === name); $(`#${name}-mode`).setAttribute('aria-pressed', mode === name); } $('#move-axis').hidden = mode !== 'move'; scene?.setMode(mode, $('#move-axis').value); $('#control-hint').textContent = mode === 'move' ? 'Drag a card to move · Choose Z for depth · Save to keep changes' : mode === 'pan' ? 'Drag to pan the camera · Scroll to zoom' : 'Drag space to orbit · Right-drag to pan · Scroll to zoom'; }
$('#select-mode').onclick = () => setMode('select'); $('#move-mode').onclick = () => setMode('move'); $('#pan-mode').onclick = () => setMode('pan'); $('#move-axis').onchange = () => setMode(mode);
$('#fit-all').onclick = () => scene?.fit(); $('#reset-view').onclick = () => scene?.fit(true);
$('#search').oninput = event => { search = event.target.value; renderList(); };
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.create) createNode(button.dataset.create);
  if (button.dataset.filter) { filter = button.dataset.filter; renderList(); }
  if (button.dataset.open) openNode(button.dataset.open);
});
$('#help').onclick = () => $('#help-dialog').showModal();
for (const button of document.querySelectorAll('.dialog-close,.close-guide')) button.onclick = () => $('#help-dialog').close();
$('#export').onclick = () => navigate(async () => {
  const workspace = await api('/export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `dimention-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Workspace exported.');
});
window.addEventListener('beforeunload', event => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!document.querySelector('dialog[open]')) save(); }
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape' && selected) { event.preventDefault(); navigate(closeNow); }
  if (event.key === '/' && !event.target.matches('input,textarea,select')) { event.preventDefault(); $('#search').focus(); }
});
async function load() {
  $('#load-error').hidden = true;
  try {
    graph = await api('/workspace'); loaded = true;
    if (!scene) {
      try {
        scene = createWorkspaceScene($('#canvas-container'), {
          onSelect: id => openNode(id, false),
          canMove: id => { if (saving || navigating) return false; if (dirty && selected !== id) { toast('Save or close your current draft before moving another thought.'); return false; } return true; },
          onMove: (id, position) => { if (selected !== id) openNow(id, false); Object.assign(draft, position); markDirty(); renderEditor(); displayGraph(); toast('Position changed. Save to keep this move.'); },
          onDrag: position => { $('#scene-status').textContent = `Position: ${position.x} / ${position.y} / ${position.z}`; },
        });
      } catch (error) {
        $('#canvas-container').replaceChildren(); $('#scene-fallback').hidden = false;
        document.querySelector('.view-toolbar').hidden = true; $('#control-hint').textContent = 'Your list and editors are fully available.';
      }
    }
    renderList(); displayGraph(); scene?.fit(true);
    for (const button of document.querySelectorAll('[data-create],#export')) button.disabled = false;
    // Recover a saved browser draft on refresh without hiding it in the node list.
    const recoveredNode = graph.nodes.find(n => recover(n)); if (recoveredNode) openNow(recoveredNode.id);
  } catch (error) { $('#load-error').hidden = false; $('#load-error-message').textContent = error.message; $('#node-list').innerHTML = '<p class="list-message">Workspace unavailable.</p>'; }
}
$('#retry').onclick = load;
load();
