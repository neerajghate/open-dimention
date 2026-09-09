import "./style.css";
import "./organizer.css";
import "./workspace.css";
import {
  renderWorkspace,
  searchText,
  entriesFor,
  spatialPresentation,
} from "./workspace.js";
import { workspaceActions } from "./workspace-actions.js";
import { markdown } from "./markdown.js";
import { createWorkspaceScene, palette, typeNames, preview } from "./scene.js";
import { renderPayload } from "./structured.js";
import { $, escape as esc, icons, safeGet, safeSet } from "./ui.js";
import {
  zonesOf,
  zoneOf,
  slotPosition,
  freePosition,
} from "../shared/spatial.js";
import { dimDock, dimOverview, areaName, areaOptions } from "./organizer.js";
import { areaActions } from "./area-actions.js";

let graph = { nodes: [], edges: [], references: [], contexts: [] },
  trash = [],
  scene,
  loaded = false,
  draft = null,
  dirty = false,
  saving = null,
  busy = false,
  saveError = "",
  activeDim = null,
  activeZone = null,
  focusAfterEdit = false,
  scope = "all",
  filter = "all",
  query = "",
  mode = "select",
  multi = new Set(),
  trail = [],
  toastTimer;
let workspaceView = "room",
  workspaceLimit = 60,
  showAllLinks = false,
  workspaceOptions = { query: "", type: "all", tag: "", sort: "updated" },
  editorHome = null,
  editorReading = safeGet("dimention:focus") === "1",
  notePreview = safeGet("dimention:preview") === "1",
  readingTimer;
const contextQueues = new Map();
let lastSpatialNodes,
  lastSpatialReferences,
  spatialNodes = [];
const clone = structuredClone,
  documents = () => graph.nodes.filter((n) => n.type !== "dim"),
  dims = () => graph.nodes.filter((n) => n.type === "dim"),
  get = (id) => graph.nodes.find((n) => n.id === id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const dot = (n) =>
  `<span class="type-icon" style="--item-color:${n.type === "dim" ? n.payload.color : palette[n.type]}">${icons[n.type]}</span>`;
$("#app").innerHTML = `
<aside id="sidebar" class="sidebar" aria-label="Workspace navigation">
  <div class="brand-row"><button id="home" class="brand" aria-label="Show all of my world"><span class="brand-mark">D<span>·</span></span><span class="sidebar-label">dimention<span class="beta">05</span></span></button><button id="collapse" class="icon-button" aria-label="Collapse sidebar" title="Collapse sidebar">◧</button></div>
  <div class="sidebar-main"><label class="search"><span>⌕</span><input id="search" type="search" placeholder="Find anything…" aria-label="Search everything"><kbd>/</kbd></label>
  <button class="primary quick-capture" data-quick-capture title="Quick capture · Ctrl+Shift+N"><span>＋</span><span class="sidebar-label">Quick capture</span><kbd>N</kbd></button><nav class="main-nav"><button data-scope="inbox" class="nav-item" title="Inbox"><span>⌑</span><span class="sidebar-label">Inbox</span><small id="inbox-count"></small></button><button data-scope="starred" class="nav-item" title="Favorites"><span>☆</span><span class="sidebar-label">Favorites</span></button><button data-scope="all" class="nav-item active" title="All of my world"><span>⌘</span><span class="sidebar-label">My world</span><small id="world-count"></small></button><button data-scope="loose" class="nav-item" title="Independent documents"><span>▤</span><span class="sidebar-label">Independent docs</span><small id="loose-count"></small></button><button id="connections" class="nav-item" title="Browse all connections"><span>⇄</span><span class="sidebar-label">Connections</span><small id="edge-count"></small></button></nav>
  <div class="section-caption"><span class="sidebar-label">QUICK ACCESS</span><button data-new-dim aria-label="Create a Dim" title="Create a Dim">＋ Dim</button></div><div id="dim-list"></div>
  <div class="section-caption sidebar-label"><span id="list-heading">DOCUMENTS</span><select id="type-filter" aria-label="Filter documents"><option value="all">All types</option>${["note", "idea", "workflow", "table"].map((t) => `<option value="${t}">${typeNames[t]}s</option>`).join("")}</select></div>
  <div id="node-list" class="node-list"></div></div>
  <div class="sidebar-bottom"><button class="primary new-dim" data-new-dim title="New Dim"><span>＋</span><span class="sidebar-label">New Dim</span></button><button id="new-document" aria-label="New document" class="secondary" title="New document"><span>＋</span><span class="sidebar-label">New document</span></button><div class="utilities"><button id="trash" title="Trash" aria-label="Open Trash">♧ <span class="sidebar-label">Trash</span><small id="trash-count">0</small></button><button id="import" aria-label="Import JSON" title="Import JSON">↓</button><button id="export" aria-label="Export JSON" title="Export JSON">↑</button></div><div class="local-status sidebar-label"><span></span> Yours. On this computer.</div></div>
</aside>
<main id="world" class="world"><header class="world-topbar"><div class="breadcrumb"><span class="world-dot"></span><span id="world-title">My world</span><span class="slash">/</span><span class="muted">Your spatial workspace</span></div><div class="top-actions"><div class="workspace-view-switch" aria-label="Workspace view"><button data-workspace-view="room" aria-pressed="true">3D Space</button><button data-workspace-view="board" aria-pressed="false">Board</button><button data-workspace-view="list" aria-pressed="false">List</button></div><button id="help" class="dark-quiet">? Guide</button><button class="dark-primary" data-new-dim>＋ New Dim</button></div></header>
  <section class="stage" aria-label="3D world"><div id="canvas-container"></div><section id="workspace-surface" class="workspace-surface" aria-label="Document workspace" hidden></section><div class="world-heading"><span class="eyebrow">THINK IN A NEW DIMENSION</span><h1>A place for every project<span>.</span></h1><p>Enter a Dim to pick up where you left off.</p></div>
  <div id="world-notice" class="world-notice" hidden></div><div id="dim-focus" class="dim-focus" hidden></div>
  <div id="selection-bar" class="selection-bar" hidden></div>
  <div class="view-presets" aria-label="Camera alignment"><label class="camera-lock"><input id="camera-lock" type="checkbox" checked>Lock angle</label><label class="camera-lock"><input id="show-all-links" type="checkbox">All connections</label><button data-view="room" aria-pressed="true" title="View the 3D Dim platforms">Perspective</button><button data-view="aligned" aria-pressed="false" title="Center the camera on the room axes">Aligned 3D</button><button data-view="top" aria-pressed="false" title="Look straight down at the X/Z plane">Top</button></div>
  <div class="view-toolbar" aria-label="View and placement controls">${[
    ["select", "↖", "Explore"],
    ["multi", "▧", "Select items"],
    ["move", "✥", "Move"],
    ["pan", "↔", "Pan"],
  ]
    .map(
      ([m, i, t]) =>
        `<button data-mode="${m}" aria-label="${t}" title="${t}" aria-pressed="${m === "select"}" class="${m === "select" ? "active" : ""}">${i}<span>${t}</span></button>`,
    )
    .join(
      "",
    )}<span class="tool-divider"></span><select id="move-axis" aria-label="Movement axis"><option value="screen">View plane</option><option value="x">X axis</option><option value="y">Y axis</option><option value="z">Z · depth</option></select><label class="snap-control"><input id="snap" type="checkbox">Snap</label><span class="tool-divider"></span><button id="fit" aria-label="Fit all" title="Fit everything">⛶<span>Fit all</span></button><button id="reset" aria-label="Reset view">↺</button></div>
  <footer class="world-footer"><span id="world-stats">Opening your world…</span><span id="controls-hint">Drag to pan · Unlock angle to orbit · Scroll to zoom</span></footer></section>
</main>
<section id="editor" class="editor" role="dialog" aria-modal="true" aria-label="Full-page editor" hidden></section>
<dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" class="toast" role="status" hidden></div><input id="import-file" type="file" accept=".json,application/json" hidden>`;

function toast(message, error = false, action = null) {
  clearTimeout(toastTimer);
  $("#toast").innerHTML =
    `<span>${esc(message)}</span>${action ? `<button id="toast-action">${esc(action.label)}</button>` : ""}`;
  if (error && $("#dialog").open) {
    let alert = $("#dialog-error");
    if (!alert) {
      alert = document.createElement("p");
      alert.id = "dialog-error";
      alert.setAttribute("role", "alert");
      $("#dialog-content").append(alert);
    }
    alert.textContent = message;
  }
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  if (action) $("#toast-action").onclick = () => action.run();
  toastTimer = setTimeout(
    () => {
      $("#toast").hidden = true;
    },
    action ? 12000 : error ? 9000 : 4500,
  );
}
async function api(path, { method = "GET", body } = {}) {
  let r;
  try {
    r = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "The local server is unavailable. Your draft is still here. Try again after restarting it.",
    );
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(
      "The server returned an unreadable response. Please try again.",
    );
  }
  if (!r.ok)
    throw new Error(data.error || "The request could not be completed.");
  return data;
}
async function refresh() {
  const [next, bin] = await Promise.all([api("/workspace"), api("/trash")]);
  graph = next;
  trash = bin.nodes;
  multi = new Set([...multi].filter((id) => get(id)));
  if (activeDim && !get(activeDim)) {
    activeDim = null;
    scope = "all";
  }
  renderWorld();
}
function remember() {
  if (draft && !safeSet(`dimention:draft:${draft.id}`, JSON.stringify(draft)))
    toast(
      "Browser draft recovery is unavailable. Save before closing this page.",
      true,
    );
}
function forget(id) {
  safeSet(`dimention:draft:${id}`, null);
}
function recovered(node) {
  try {
    const r = JSON.parse(safeGet(`dimention:draft:${node.id}`));
    if (
      r &&
      r.id === node.id &&
      r.type === node.type &&
      typeof r.title === "string" &&
      typeof r.content === "string" &&
      r.payload &&
      ["x", "y", "z"].every((k) => Number.isFinite(r[k]))
    ) {
      const recoveredDraft = { ...node, ...r };
      if (recoveredDraft.type === "dim")
        recoveredDraft.payload = {
          ...node.payload,
          ...r.payload,
          zones: node.payload.zones,
        };
      if (recoveredDraft.dimId) {
        const parent = get(recoveredDraft.dimId);
        if (
          !parent ||
          !zonesOf(parent).some((z) => z.id === recoveredDraft.zoneId)
        )
          Object.assign(recoveredDraft, {
            dimId: node.dimId,
            zoneId: node.zoneId,
            area: node.area,
            x: node.x,
            y: node.y,
            z: node.z,
          });
      }
      return recoveredDraft;
    }
  } catch {}
  return null;
}
function markDirty() {
  dirty = true;
  saveError = "";
  remember();
  saveStatus();
}
function saveStatus() {
  if (!draft) return;
  $("#save-status").textContent = saving
    ? "Saving…"
    : saveError || (dirty ? "Unsaved changes" : "All changes saved");
  $("#save-status").classList.toggle("unsaved", dirty);
  $("#save-node").disabled = !!saving || !dirty;
}
function renderWorld() {
  const allDocs = documents(),
    allDims = dims(),
    counts = new Map();
  for (const n of allDocs)
    if (n.dimId) counts.set(n.dimId, (counts.get(n.dimId) || 0) + 1);
  for (const r of graph.references || [])
    counts.set(r.dimId, (counts.get(r.dimId) || 0) + 1);
  if (activeDim && !get(activeDim)) {
    activeDim = null;
    activeZone = null;
  }
  if (
    activeDim &&
    activeZone &&
    !zonesOf(get(activeDim)).some((z) => z.id === activeZone)
  )
    activeZone = null;
  $("#world-count").textContent = graph.nodes.length;
  $("#loose-count").textContent = allDocs.filter(
    (n) => !n.dimId && !n.inbox,
  ).length;
  $("#inbox-count").textContent = allDocs.filter((n) => n.inbox).length;
  $("#edge-count").textContent = graph.edges.length;
  $("#trash-count").textContent = trash.length;
  $("#dim-list").innerHTML = allDims.length
    ? allDims
        .map(
          (n) =>
            `<div class="dim-nav ${activeDim === n.id ? "active" : ""}"><button data-room="${n.id}" aria-label="Zoom to ${esc(n.title)}" title="Zoom to ${esc(n.title)}">${dot(n)}<span class="sidebar-label"><strong>${esc(n.title)}</strong><small>${zonesOf(n).filter((z) => z.type === "desk").length} ${zonesOf(n).filter((z) => z.type === "desk").length === 1 ? "desk" : "desks"} · ${zonesOf(n).filter((z) => z.type === "storage").length} storage · ${counts.get(n.id) || 0} docs</small></span></button><button data-open="${n.id}" class="enter-room sidebar-label" aria-label="Open ${esc(n.title)} overview">↗</button></div>`,
        )
        .join("")
    : '<p class="nav-empty sidebar-label">Create a Dim for a project or topic.<br>Click its name here to zoom in.</p>';
  const lower = query.toLowerCase(),
    list = allDocs.filter(
      (n) =>
        (query || scope !== "loose" || (!n.dimId && !n.inbox)) &&
        (query || scope !== "inbox" || n.inbox) &&
        (query || scope !== "starred" || n.starred) &&
        (query ||
          !activeDim ||
          n.dimId === activeDim ||
          (graph.references || []).some(
            (r) => r.dimId === activeDim && r.nodeId === n.id,
          )) &&
        (query ||
          !activeZone ||
          (n.dimId === activeDim && n.zoneId === activeZone) ||
          (graph.references || []).some(
            (r) =>
              r.dimId === activeDim &&
              r.nodeId === n.id &&
              r.zoneId === activeZone,
          )) &&
        (filter === "all" || n.type === filter) &&
        searchText(n).includes(lower),
    );
  $("#list-heading").textContent = query
    ? "SEARCH RESULTS"
    : activeZone
      ? areaName(get(activeDim), activeZone)
      : activeDim
        ? "IN THIS DIM"
        : "DOCUMENTS";
  $("#node-list").innerHTML = list.length
    ? list
        .map(
          (n) =>
            `<div class="doc-list-row ${multi.has(n.id) ? "checked" : ""}"><button class="select-check" data-toggle="${n.id}" aria-label="Select ${esc(n.title)}" aria-pressed="${multi.has(n.id)}">${multi.has(n.id) ? "✓" : "□"}</button><button data-open="${n.id}" class="doc-list-button" title="${esc(n.title)}">${dot(n)}<span><strong>${esc(n.title)}</strong><small>${n.dimId ? esc(get(n.dimId)?.title) + " · " + esc(areaName(get(n.dimId), n.zoneId, n.area)) : "Independent document"}</small></span></button></div>`,
        )
        .join("")
    : '<p class="nav-empty sidebar-label">No documents here yet.</p>';
  document
    .querySelectorAll("[data-scope]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.scope === scope && !activeDim),
    );
  $("#world").classList.toggle("dim-focused", !!activeDim);
  $("#world-title").textContent = activeDim
    ? get(activeDim).title
    : scope === "loose"
      ? "Independent documents"
      : "My world";
  $("#world-stats").textContent = activeDim
    ? (activeZone ? areaName(get(activeDim), activeZone) : "All areas") +
      " / " +
      entriesFor(graph, activeDim).filter(
        (e) => !activeZone || e.zoneId === activeZone,
      ).length +
      " documents"
    : `${allDims.length} Dims / ${allDocs.length} documents / ${graph.edges.length} connections`;
  $("#dim-focus").hidden = !activeDim;
  if (activeDim)
    $("#dim-focus").innerHTML = dimDock(
      get(activeDim),
      graph.nodes,
      activeZone,
      graph.references || [],
      (graph.contexts || []).find((c) => c.dimId === activeDim),
    );
  if (loaded && !graph.nodes.length && scene)
    notice(
      '<h2>Build a world around your ideas.</h2><p>Create a Dim with Desks and Storage, or start with an independent document.</p><button class="primary" data-new-dim>＋ Create a Dim</button><button class="secondary" data-create="note">New independent note</button>',
    );
  else if (scene) $("#world-notice").hidden = true;
  renderKnowledge();
  scene?.setPaused(!!draft || workspaceView !== "room");
  if (
    lastSpatialNodes !== graph.nodes ||
    lastSpatialReferences !== graph.references
  ) {
    spatialNodes = spatialPresentation(graph);
    lastSpatialNodes = graph.nodes;
    lastSpatialReferences = graph.references;
  }
  scene?.update(spatialNodes, graph.edges, [...multi], {
    dimId: activeDim,
    zoneId: activeZone,
    showAllLinks,
    scope,
  });
  renderSelection();
}
function notice(html) {
  $("#world-notice").innerHTML = html;
  $("#world-notice").hidden = false;
}
function renderKnowledge() {
  $("#world").classList.toggle("knowledge-view", workspaceView !== "room");
  $("#workspace-surface").hidden = workspaceView === "room";
  document
    .querySelectorAll("[data-workspace-view]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.workspaceView === workspaceView),
      ),
    );
  if (workspaceView === "room") return;
  const surface = $("#workspace-surface"),
    scroll = surface.scrollTop;
  surface.innerHTML = renderWorkspace({
    graph,
    dimId: activeDim,
    zoneId: activeZone,
    view: workspaceView,
    scope,
    options: workspaceOptions,
    multi,
    limit: workspaceLimit,
  });
  surface.scrollTop = scroll;
  $("#world-title").textContent = activeDim
    ? get(activeDim).title
    : { inbox: "Inbox", starred: "Favorites", loose: "Independent documents" }[
        scope
      ] || "My world";
  $("#workspace-search").oninput = (e) => {
    const start = e.target.selectionStart;
    workspaceOptions.query = e.target.value;
    workspaceLimit = 60;
    renderKnowledge();
    $("#workspace-search").focus();
    try {
      $("#workspace-search").setSelectionRange(start, start);
    } catch {}
  };
  for (const [id, key] of [
    ["workspace-type", "type"],
    ["workspace-tag", "tag"],
    ["workspace-sort", "sort"],
  ])
    $("#" + id).onchange = (e) => {
      workspaceOptions[key] = e.target.value;
      workspaceLimit = 60;
      renderKnowledge();
    };
}
function rememberContext(dimId, change) {
  if (!dimId || !get(dimId)) return Promise.resolve();
  const previous = (graph.contexts || []).find((c) => c.dimId === dimId);
  const context = {
    dimId,
    nodeId: null,
    zoneId: null,
    view: "board",
    scroll: 0,
    ...previous,
    ...change,
  };
  if (
    context.nodeId &&
    !entriesFor(graph, dimId).some((e) => e.node.id === context.nodeId)
  )
    context.nodeId = null;
  graph.contexts = [
    ...(graph.contexts || []).filter((c) => c.dimId !== dimId),
    context,
  ];
  const queued = (contextQueues.get(dimId) || Promise.resolve())
    .then(() =>
      api("/dims/" + dimId + "/context", { method: "PATCH", body: context }),
    )
    .catch((e) =>
      toast("Working context could not be saved. " + e.message, true),
    );
  contextQueues.set(dimId, queued);
  queued.finally(() => {
    if (contextQueues.get(dimId) === queued) contextQueues.delete(dimId);
  });
  return queued;
}
function rememberReading() {
  if (!draft || draft.type === "dim" || !activeDim) return Promise.resolve();
  return rememberContext(activeDim, {
    nodeId: draft.id,
    zoneId: activeZone,
    view: workspaceView,
    scroll: $("#editor-form").scrollTop,
  });
}
function updateWordCount() {
  if (!draft || !$("#note-word-count")) return;
  const words = draft.content.trim().split(/\s+/).filter(Boolean).length;
  $("#note-word-count").textContent =
    words + " words · " + draft.content.length.toLocaleString() + " characters";
}
function updateReadingView() {
  $("#editor").classList.toggle("reading-mode", editorReading);
  $("#reading-mode")?.setAttribute("aria-pressed", String(editorReading));
  if ($("#reading-mode"))
    $("#reading-mode").textContent = editorReading ? "Show details" : "Focus";
  const enabled = notePreview && ["note", "idea"].includes(draft?.type);
  $("#node-content").hidden = enabled;
  $("#markdown-preview").hidden = !enabled;
  if (enabled) $("#markdown-preview").innerHTML = markdown(draft.content);
  if ($("#note-preview-toggle")) {
    $("#note-preview-toggle").textContent = enabled ? "Write" : "Read preview";
    $("#note-preview-toggle").setAttribute("aria-pressed", String(enabled));
  }
  updateWordCount();
}
function formatNote(kind) {
  if (!draft) return;
  notePreview = false;
  updateReadingView();
  const input = $("#node-content"),
    a = input.selectionStart,
    b = input.selectionEnd,
    selected = input.value.slice(a, b);
  const text =
    kind === "bold"
      ? `**${selected || "bold text"}**`
      : kind === "heading"
        ? `\n## ${selected || "Heading"}\n`
        : kind === "bullet"
          ? `\n- ${selected || "List item"}\n`
          : `[${selected || "Link title"}](https://example.com)`;
  input.setRangeText(text, a, b, "select");
  draft.content = input.value;
  markDirty();
  updateWordCount();
  input.focus();
}
function commandSearch() {
  navigate(() => {
    modal(
      '<div class="dialog-heading"><h2>Jump to anything</h2><button data-close-dialog aria-label="Close search">×</button></div><input id="command-search" type="search" placeholder="Search documents, Dims, content, or tags…" aria-label="Search all content"><div id="command-results" class="trash-list"></div>',
    );
    const render = () => {
      $("#command-results").innerHTML =
        graph.nodes
          .filter((n) =>
            searchText(n).includes($("#command-search").value.toLowerCase()),
          )
          .slice(0, 50)
          .map(
            (n) =>
              `<button class="command-result" data-command-open="${n.id}">${dot(n)}<span><strong>${esc(n.title)}</strong><small>${n.type === "dim" ? "Dim" : n.inbox ? "Inbox" : get(n.dimId)?.title || "Independent"}</small><span>↗</span></span></button>`,
          )
          .join("") || '<p class="nav-empty">No results.</p>';
    };
    $("#command-search").oninput = render;
    $("#command-search").onkeydown = (e) => {
      if (e.key === "Enter") $("#command-results button")?.click();
    };
    render();
    $("#command-search").focus();
  });
}
function showRelated(id) {
  const n = get(id),
    links = graph.edges.filter((e) => e.source === id || e.target === id);
  modal(
    `<div class="dialog-heading"><h2>Connected to ${esc(n.title)}</h2><button data-close-dialog aria-label="Close connections">×</button></div><p>Follow a relationship to its document or Dim.</p><div class="trash-list">${
      links
        .map((e) => {
          const outgoing = e.source === id,
            other = get(outgoing ? e.target : e.source);
          return `<button class="command-result" data-command-open="${other.id}">${dot(other)}<span><small>${outgoing ? "OUTGOING →" : "INCOMING ←"} ${esc(e.label || "Connected")}</small><strong>${esc(other.title)}</strong></span></button>`;
        })
        .join("") ||
      '<p class="nav-empty">No connections yet. Open this document to add one.</p>'
    }</div><button class="secondary" data-command-open="${id}">Open document & manage connections</button>`,
  );
}
function setCollapsed(value) {
  $("#sidebar").classList.toggle("collapsed", value);
  $("#collapse").setAttribute(
    "aria-label",
    value ? "Expand sidebar" : "Collapse sidebar",
  );
  $("#collapse").title = value ? "Expand sidebar" : "Collapse sidebar";
  safeSet("dimention:sidebar", value ? "collapsed" : "open");
}
function setMode(next) {
  mode = next;
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
    b.setAttribute("aria-pressed", b.dataset.mode === mode);
  });
  scene?.setMode(mode, $("#move-axis").value, $("#snap").checked);
  $("#controls-hint").textContent =
    mode === "multi"
      ? "Click cards or checkboxes to select · Align, snap, or move them together"
      : mode === "move"
        ? "Drag a card or a selection · Movement saves automatically · Snap uses 50 units"
        : mode === "pan"
          ? "Drag to pan · Scroll to zoom"
          : "Drag to pan · Unlock angle to orbit · Scroll to zoom";
}
function toggle(id) {
  multi.has(id) ? multi.delete(id) : multi.add(id);
  renderWorld();
}
function renderSelection() {
  const el = $("#selection-bar");
  el.hidden = !multi.size;
  if (!multi.size) return;
  const onlyDocs = [...multi].every((id) => get(id)?.type !== "dim");
  el.innerHTML = `<div class="selection-title"><strong>${multi.size} selected</strong><button data-clear-selection aria-label="Clear selection">×</button></div><div class="selection-tools"><button data-snap-selection>Snap to grid</button><span>Align</span>${["x", "y", "z"].map((a) => `<button data-align="${a}">${a.toUpperCase()}</button>`).join("")}<button data-move-selection>Move together</button></div><div class="selection-offset">${["x", "y", "z"].map((a) => `<label>${a.toUpperCase()}<input type="number" id="offset-${a}" value="0" min="-10000" max="10000" aria-label="${a.toUpperCase()} offset"></label>`).join("")}<button data-offset-selection>Apply offset</button></div>${
    onlyDocs
      ? `<div class="selection-organize"><select id="batch-dim" aria-label="Move selected documents to Dim"><option value="">Independent</option>${dims()
          .map((n) => `<option value="${n.id}">${esc(n.title)}</option>`)
          .join(
            "",
          )}</select><select id="batch-area" aria-label="Selected document area" disabled><option value="">Choose a Dim first</option></select><button data-organize>Assign</button></div>`
      : ""
  }`;
}
async function movePositions(positions, { undo = true } = {}) {
  if (busy || saving) {
    renderWorld();
    return;
  }
  busy = true;
  const before = positions
    .map((p) => get(p.id))
    .filter(Boolean)
    .map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z }));
  try {
    graph = await api("/positions", { method: "PATCH", body: { positions } });
    renderWorld();
    toast(
      "Position saved.",
      false,
      undo
        ? {
            label: "Undo move",
            run: () => movePositions(before, { undo: false }),
          }
        : null,
    );
  } catch (e) {
    scene?.invalidate();
    renderWorld();
    toast(e.message, true);
  } finally {
    busy = false;
  }
}

function modal(html, { wide = false } = {}) {
  if ($("#dialog").open) $("#dialog").close();
  $("#dialog").classList.toggle("wide", wide);
  $("#dialog-content").innerHTML = html;
  $("#dialog").showModal();
}
async function choice(title, message, buttons) {
  modal(
    `<h2>${esc(title)}</h2><p>${esc(message)}</p><div class="dialog-actions">${buttons.map((b) => `<button data-answer="${b.value}" class="${b.primary ? "primary" : "secondary"}">${esc(b.label)}</button>`).join("")}</div>`,
  );
  return new Promise((resolve) => {
    const dialog = $("#dialog");
    const done = (v) => {
      dialog.removeEventListener("click", click);
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      resolve(v);
    };
    const click = (e) => {
      const b = e.target.closest("[data-answer]");
      if (b) done(b.dataset.answer);
    };
    const cancel = (e) => {
      e.preventDefault();
      done("cancel");
    };
    dialog.addEventListener("click", click);
    dialog.addEventListener("cancel", cancel);
  });
}
async function guard() {
  if (saving && !(await saving)) return false;
  if (!dirty) return true;
  const answer = await choice(
    "Keep your changes?",
    `“${draft.title || "Untitled"}” has unsaved edits.`,
    [
      { value: "cancel", label: "Keep editing" },
      { value: "discard", label: "Discard" },
      { value: "save", label: "Save & continue", primary: true },
    ],
  );
  if (answer === "save") return save();
  if (answer === "discard") {
    forget(draft.id);
    draft = clone(get(draft.id));
    dirty = false;
    saveError = "";
    renderEditor();
    renderWorld();
    return true;
  }
  return false;
}
async function navigate(action) {
  if (busy) return;
  busy = true;
  try {
    if (await guard()) {
      if ($("#editor-fields")) $("#editor-fields").disabled = true;
      await action();
    }
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy = false;
    if ($("#editor-fields")) $("#editor-fields").disabled = false;
  }
}
async function editorTransition(open, id) {
  const el = $("#editor");
  if (reduced()) return;
  if (workspaceView !== "room") {
    await el
      .animate(
        open
          ? [
              { opacity: 0, transform: "translateY(10px)" },
              { opacity: 1, transform: "none" },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        { duration: 140 },
      )
      .finished.catch(() => {});
    return;
  }
  const r = scene?.rect(id) || {
    x: innerWidth / 2 - 100,
    y: innerHeight / 2 - 60,
    width: 200,
    height: 120,
  };
  const x = Math.max(-100, Math.min(innerWidth - 80, r.x)),
    y = Math.max(0, Math.min(innerHeight - 60, r.y)),
    sx = Math.max(0.07, Math.min(0.8, r.width / innerWidth)),
    sy = Math.max(0.07, Math.min(0.8, r.height / innerHeight));
  const small = {
      transform: `translate(${x}px,${y}px) scale(${sx},${sy})`,
      opacity: 0.2,
      borderRadius: "30px",
    },
    large = {
      transform: "translate(0,0) scale(1,1)",
      opacity: 1,
      borderRadius: "0px",
    };
  await el
    .animate(open ? [small, large] : [large, small], {
      duration: open ? 380 : 300,
      easing: "cubic-bezier(.22,.8,.25,1)",
      fill: "none",
    })
    .finished.catch(() => {});
}
async function openNow(id, { follow = false } = {}) {
  const n = get(id);
  if (!n) return;
  const wasOpen = !!draft;
  if (wasOpen) await rememberReading();
  const reference = (graph.references || []).find(
    (r) => r.dimId === activeDim && r.nodeId === n.id,
  );
  const origin = {
    dimId: activeDim,
    zoneId: activeZone,
    scope,
    view: workspaceView,
  };
  if (
    activeDim !== (n.type === "dim" ? n.id : n.dimId) ||
    activeZone !== (n.type === "dim" ? null : n.zoneId)
  )
    focusAfterEdit = true;
  activeDim = reference ? reference.dimId : n.type === "dim" ? n.id : n.dimId;
  activeZone = reference
    ? reference.zoneId
    : n.type === "dim"
      ? null
      : n.zoneId;
  scope = activeDim
    ? "dim"
    : n.inbox
      ? "inbox"
      : origin.scope === "starred"
        ? "starred"
        : "all";
  editorHome = {
    dimId: activeDim,
    zoneId: origin.dimId === activeDim ? origin.zoneId : activeZone,
    scope,
    view: workspaceView,
  };
  if (n.type !== "dim" && activeDim)
    rememberContext(activeDim, {
      nodeId: n.id,
      zoneId: activeZone,
      view: workspaceView,
      scroll: 0,
    });
  if (follow && draft) trail.push(draft.id);
  else if (!wasOpen) trail = [];

  const recoveredDraft = recovered(n);
  draft = recoveredDraft || clone(n);
  dirty = !!recoveredDraft;
  saveError = "";
  renderEditor();
  renderWorld();
  $("#world").inert = true;
  $("#sidebar").inert = true;
  if (!wasOpen) await editorTransition(true, id);
  else if (!reduced())
    await $("#editor")
      .animate(
        [
          { opacity: 0.55, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 180 },
      )
      .finished.catch(() => {});
  $("#node-title").focus({ preventScroll: true });
  if (recoveredDraft)
    toast("Recovered your unsaved draft. Review it and save.");
}
function openNode(id, follow = false) {
  return navigate(() => openNow(id, { follow }));
}
async function closeNow() {
  if (!draft) return;
  const id = draft.id;
  await rememberReading();
  if (trail.length || focusAfterEdit)
    scene?.focus(activeDim || id, activeZone, false);
  await editorTransition(false, id);
  draft = null;
  if (editorHome) {
    activeDim = editorHome.dimId;
    activeZone = editorHome.zoneId;
    scope = editorHome.scope;
    workspaceView = editorHome.view;
  }
  editorHome = null;
  dirty = false;
  trail = [];
  focusAfterEdit = false;
  $("#editor").hidden = true;
  scene?.setPaused(false);
  $("#world").inert = false;
  $("#sidebar").inert = false;
  renderWorld();
  (workspaceView === "room"
    ? $("#canvas-container canvas")
    : $("#workspace-search")
  )?.focus({ preventScroll: true });
}

function renderEditor() {
  const n = draft;
  if (!n) return;
  $("#editor").hidden = false;
  $("#editor").innerHTML =
    `<header class="editor-header"><div class="editor-navigation"><button id="close-editor" class="back-world">← <span>Back to ${workspaceView === "room" ? "3D" : "workspace"}</span></button>${trail.length ? '<button id="previous-document" class="secondary">← Previous</button>' : ""}<span class="editor-breadcrumb">${n.type === "dim" ? "YOUR DIM" : activeDim && activeDim !== n.dimId ? esc(get(activeDim)?.title) + " / REFERENCE" : n.dimId ? esc(get(n.dimId)?.title) + " / " + esc(areaName(get(n.dimId), n.zoneId, n.area)) : n.inbox ? "INBOX" : "INDEPENDENT DOCUMENT"}</span></div><div class="editor-header-actions"><button type="button" id="reading-mode" class="secondary" aria-pressed="${editorReading}">${editorReading ? "Show details" : "Focus"}</button><span id="save-status" role="status"></span><button id="save-node" class="primary" type="submit" form="editor-form">Save changes <kbd>⌘ S</kbd></button></div></header>
<form id="editor-form"><fieldset id="editor-fields"><div class="editor-layout"><div class="editor-page">${n.type !== "dim" && activeDim && activeDim !== n.dimId ? `<div class="editor-reference-label">Reference in ${esc(get(activeDim)?.title)} · Editing the original in ${esc(get(n.dimId)?.title || "Independent documents")}. Changes appear everywhere.</div>` : ""}<div class="document-type">${dot(n)}<span>${typeNames[n.type]}</span></div><label for="node-title" class="sr-only">Title</label><input id="node-title" class="title-input" maxlength="160" required value="${esc(n.title)}" placeholder="Untitled ${n.type}"><label for="node-content" class="content-label">${n.type === "dim" ? "What belongs in this Dim?" : n.type === "note" || n.type === "idea" ? "Your thoughts" : "Description"}</label>${["note", "idea"].includes(n.type) ? `<div class="note-tools" aria-label="Note formatting"><button type="button" data-format="heading" title="Heading">H</button><button type="button" data-format="bold" title="Bold"><b>B</b></button><button type="button" data-format="bullet" title="Bulleted list">• List</button><button type="button" data-format="link" title="Web link">↗ Link</button><span></span><button type="button" id="note-preview-toggle" aria-pressed="${notePreview}">${notePreview ? "Write" : "Read preview"}</button></div>` : ""}<textarea id="node-content" maxlength="100000" class="content-input ${["note", "idea"].includes(n.type) ? "long-content" : ""}" placeholder="Start with a thought…">${esc(n.content)}</textarea>
<div id="markdown-preview" class="markdown-preview" hidden></div><div id="note-word-count" class="note-word-count"></div>
${n.type === "dim" ? dimOverview(n, graph.nodes, graph.references || []) : '<div id="structured-editor"></div>'}</div>
<aside class="document-details"><h2>${n.type === "dim" ? "Room details" : "Document details"}</h2>${
      n.type === "dim"
        ? `<label for="dim-goal">Project goal</label><textarea id="dim-goal" maxlength="400" rows="3">${esc(n.payload.goal || "")}</textarea><label for="dim-next">Next action</label><input id="dim-next" maxlength="400" value="${esc(n.payload.nextAction || "")}"><label for="dim-color">Room accent</label><input type="color" id="dim-color" value="${n.payload.color}"><p class="field-hint">A Dim and its contents move together.</p>`
        : `<label for="document-dim">Lives in</label><select id="document-dim"><option value="">Independent document</option>${dims()
            .map(
              (d) =>
                `<option value="${d.id}" ${d.id === n.dimId ? "selected" : ""}>${esc(d.title)}</option>`,
            )
            .join(
              "",
            )}</select><label for="document-zone">Desk or Storage</label><select id="document-zone" ${n.dimId ? "" : "disabled"}>${areaOptions(get(n.dimId), n.zoneId)}</select><button type="button" id="place-in-room" class="text-button" ${n.dimId ? "" : "disabled"}>Arrange in area ↗</button>`
    }
${n.type !== "dim" ? `<div class="document-tags"><label for="document-tags">Tags <span>comma separated</span></label><input id="document-tags" value="${esc((n.tags || []).join(", "))}" placeholder="research, launch"><label><input type="checkbox" id="document-star" ${n.starred ? "checked" : ""}> Favorite</label><button type="button" class="text-button" data-pin="${n.id}">Pin a reference to another Dim ↗</button></div>` : ""}<details class="position-details"><summary>Position in space</summary><div class="coordinates">${["x", "y", "z"].map((a) => `<label>${a.toUpperCase()}<input type="number" data-coordinate="${a}" aria-label="${a.toUpperCase()} coordinate" required min="-5000" max="5000" step="any" value="${n[a]}"></label>`).join("")}</div><button id="focus-on-return" type="button" class="text-button">Focus in 3D on return</button></details>
<section class="document-connections"><div class="details-heading"><h2>Connections</h2><span>${graph.edges.filter((e) => e.source === n.id || e.target === n.id).length}</span></div><div id="connection-list"></div><label for="connection-search">Find a destination</label><input id="connection-search" type="search" placeholder="Search Dims and documents…"><label for="connection-target" class="sr-only">Connection destination</label><select id="connection-target"><option value="">Choose a destination…</option>${graph.nodes
      .filter((d) => d.id !== n.id)
      .map(
        (d) =>
          `<option value="${d.id}">${d.type === "dim" ? "◇ " : ""}${esc(d.title)}</option>`,
      )
      .join(
        "",
      )}</select><label for="connection-label">Relationship <span>(optional)</span></label><input id="connection-label" maxlength="80" placeholder="e.g. inspires, depends on"><button type="button" id="add-connection" class="secondary full-width">＋ Connect</button><p class="field-hint">Links save immediately. Follow a card to open it.</p></section><div class="document-bottom"><span>Created ${esc(new Date(n.createdAt).toLocaleDateString())}</span><button type="button" id="trash-node" class="danger-text">Move ${n.type === "dim" ? "Dim" : "document"} to Trash</button></div></aside></div></fieldset></form>`;
  if (n.type !== "dim") renderPayload(draft, $("#structured-editor"));
  renderConnections();
  updateReadingView();
  $("#reading-mode").onclick = () => {
    editorReading = !editorReading;
    safeSet("dimention:focus", editorReading ? "1" : "0");
    updateReadingView();
  };
  if ($("#note-preview-toggle"))
    $("#note-preview-toggle").onclick = () => {
      notePreview = !notePreview;
      safeSet("dimention:preview", notePreview ? "1" : "0");
      updateReadingView();
    };
  saveStatus();
  $("#editor-form").onsubmit = (e) => {
    e.preventDefault();
    save();
  };
  $("#editor-form").onscroll = () => {
    clearTimeout(readingTimer);
    readingTimer = setTimeout(() => {
      if (!busy && draft) rememberReading();
    }, 450);
  };
  $("#editor-form").oninput = editorInput;
  $("#editor-form").onclick = editorAction;
  $("#close-editor").onclick = () => navigate(closeNow);
  if ($("#previous-document"))
    $("#previous-document").onclick = () =>
      navigate(() => openNow(trail.pop()));
  $("#trash-node").onclick = () => trashNode(n.id);
  $("#focus-on-return").onclick = () => {
    scene?.focus(n.id);
    toast("The 3D view is focused on this item.");
  };
  $("#connection-search").oninput = (e) => {
    const q = e.target.value.toLowerCase();
    $("#connection-target").innerHTML =
      '<option value="">Choose a destination…</option>' +
      graph.nodes
        .filter((d) => d.id !== n.id && d.title.toLowerCase().includes(q))
        .map(
          (d) =>
            `<option value="${d.id}">${d.type === "dim" ? "◇ " : ""}${esc(d.title)}</option>`,
        )
        .join("");
  };
}
function renderConnections() {
  if (!draft) return;
  const links = graph.edges.filter(
    (e) => e.source === draft.id || e.target === draft.id,
  );
  $("#connection-list").innerHTML = links.length
    ? links
        .map((e) => {
          const outgoing = e.source === draft.id,
            other = get(outgoing ? e.target : e.source);
          return `<div class="connection-card"><button type="button" data-follow="${other.id}"><small>${outgoing ? "OUTGOING ↗" : "INCOMING ↙"}${e.label ? " / " + esc(e.label) : ""}</small><strong>${dot(other)}${esc(other.title)}<span>→</span></strong><span>${typeNames[other.type]}${other.dimId ? " · " + esc(get(other.dimId)?.title) : ""}</span></button><button type="button" data-remove-edge="${e.id}" aria-label="Remove connection to ${esc(other.title)}">×</button></div>`;
        })
        .join("")
    : '<p class="connections-empty">What does this connect to?</p>';
}
function editorInput(e) {
  const el = e.target,
    d = el.dataset;
  if (el.id === "node-title") draft.title = el.value;
  else if (el.id === "node-content") draft.content = el.value;
  else if (el.id === "dim-goal") draft.payload.goal = el.value;
  else if (el.id === "dim-next") draft.payload.nextAction = el.value;
  else if (el.id === "document-tags")
    draft.tags = el.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  else if (el.id === "document-star") draft.starred = el.checked;
  else if (el.id === "dim-color") draft.payload.color = el.value;
  else if (el.id === "document-dim") {
    draft.dimId = el.value || null;
    $("#place-in-room").disabled = !draft.dimId;
    draft.zoneId = zoneOf(get(draft.dimId), null, draft.area)?.id || null;
    $("#document-zone").innerHTML = areaOptions(get(draft.dimId), draft.zoneId);
    $("#document-zone").disabled = !draft.dimId;
  } else if (el.id === "document-zone") {
    draft.zoneId = el.value;
    draft.area = zoneOf(get(draft.dimId), draft.zoneId).type;
  } else if (d.coordinate !== undefined) {
    if (!el.validity.valid || el.value === "") {
      dirty = true;
      saveStatus();
      return;
    }
    draft[d.coordinate] = Number(el.value);
  } else if (d.stepText !== undefined)
    draft.payload.steps[+d.stepText].text = el.value;
  else if (d.stepDone !== undefined) {
    draft.payload.steps[+d.stepDone].done = el.checked;
    el.parentElement
      .querySelector(".step-text")
      .classList.toggle("completed", el.checked);
    $("#step-progress").textContent =
      `${draft.payload.steps.filter((s) => s.done).length} / ${draft.payload.steps.length} complete`;
  } else if (d.column !== undefined)
    draft.payload.columns[+d.column] = el.value;
  else if (d.cell !== undefined) {
    const [r, c] = d.cell.split(",").map(Number);
    draft.payload.rows[r][c] = el.value;
  } else return;
  updateWordCount();
  markDirty();
}
async function editorAction(e) {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.follow || d.create || d.roomCreate || d.removeEdge) return;
  if (b.id === "add-connection") {
    const target = $("#connection-target").value;
    if (!target) {
      toast("Choose a destination first.");
      return;
    }
    const source = draft.id,
      label = $("#connection-label").value;
    b.disabled = true;
    try {
      const edge = await api("/connections", {
        method: "POST",
        body: { source, target, label },
      });
      graph.edges = [...graph.edges, edge];
      renderConnections();
      $("#connection-label").value = "";
      renderWorld();
      toast("Connected.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      b.disabled = false;
    }
    return;
  }
  if (b.id === "place-in-room") {
    Object.assign(draft, placement(draft.dimId, draft.area, draft.zoneId));
    markDirty();
    renderEditor();
    return;
  }
  if (b.id === "add-step") draft.payload.steps.push({ text: "", done: false });
  else if (d.removeStep !== undefined)
    draft.payload.steps.splice(+d.removeStep, 1);
  else if (b.id === "add-row")
    draft.payload.rows.push(draft.payload.columns.map(() => ""));
  else if (b.id === "add-column") {
    draft.payload.columns.push(`Column ${draft.payload.columns.length + 1}`);
    draft.payload.rows.forEach((r) => r.push(""));
  } else if (d.removeRow !== undefined)
    draft.payload.rows.splice(+d.removeRow, 1);
  else if (d.removeColumn !== undefined) {
    draft.payload.columns.splice(+d.removeColumn, 1);
    draft.payload.rows.forEach((r) => r.splice(+d.removeColumn, 1));
  } else return;
  markDirty();
  renderPayload(draft, $("#structured-editor"));
  if (b.id === "add-step")
    document.querySelector(".workflow-steps li:last-child .step-text")?.focus();
}
function save() {
  if (saving) return saving;
  if (!draft || !dirty) return Promise.resolve(true);
  if (!$("#editor-form").reportValidity()) return Promise.resolve(false);
  const snapshot = clone(draft);
  saveError = "";
  $("#editor-fields").disabled = true;
  saving = (async () => {
    try {
      const saved = await api("/nodes/" + snapshot.id, {
        method: "PATCH",
        body: snapshot,
      });
      const [next, bin] = await Promise.all([api("/workspace"), api("/trash")]);
      graph = next;
      trash = bin.nodes;
      draft = clone(saved);
      if (
        activeDim !== (saved.type === "dim" ? saved.id : saved.dimId) ||
        activeZone !== (saved.type === "dim" ? null : saved.zoneId)
      )
        focusAfterEdit = true;
      const ref = (graph.references || []).find(
        (r) => r.dimId === activeDim && r.nodeId === saved.id,
      );
      activeDim = ref
        ? ref.dimId
        : saved.type === "dim"
          ? saved.id
          : saved.dimId;
      activeZone = ref
        ? ref.zoneId
        : saved.type === "dim"
          ? null
          : saved.zoneId;
      if (editorHome && editorHome.dimId !== activeDim)
        editorHome = {
          dimId: activeDim,
          zoneId: activeZone,
          scope: activeDim ? "dim" : "all",
          view: workspaceView,
        };
      document.querySelector(".editor-breadcrumb").textContent =
        saved.type === "dim"
          ? "YOUR DIM"
          : ref
            ? get(activeDim).title + " / REFERENCE"
            : saved.dimId
              ? get(saved.dimId).title +
                " / " +
                areaName(get(saved.dimId), saved.zoneId, saved.area)
              : "INDEPENDENT DOCUMENT";
      document
        .querySelectorAll("[data-coordinate]")
        .forEach((el) => (el.value = saved[el.dataset.coordinate]));
      dirty = false;
      forget(saved.id);
      renderWorld();
      return true;
    } catch (e) {
      saveError = "Save failed · draft preserved";
      toast(e.message, true);
      return false;
    } finally {
      saving = null;
      if ($("#editor-fields")) $("#editor-fields").disabled = false;
      saveStatus();
    }
  })();
  saveStatus();
  return saving;
}
function placement(dimId, area, zoneId = null) {
  const parent = get(dimId);
  if (parent) {
    const zone = zoneOf(parent, zoneId, area),
      count = documents().filter(
        (n) => n.id !== draft?.id && n.dimId === dimId && n.zoneId === zone.id,
      ).length;
    return slotPosition(parent, zone.id, count);
  }
  const p = scene?.getTarget() || { x: 0, y: 0, z: 0 };
  return freePosition(
    { id: draft?.id, type: "note", dimId: null, ...p },
    graph.nodes,
  );
}
function createDocument(
  type,
  parent = activeDim,
  area = type === "workflow" ? "desk" : "storage",
  zoneId = activeZone,
) {
  return navigate(async () => {
    if ($("#dialog").open) $("#dialog").close();
    const payload =
      type === "workflow"
        ? { steps: [{ text: "Your first step", done: false }] }
        : type === "table"
          ? { columns: ["Name", "Details"], rows: [["", ""]] }
          : {};
    const n = await api("/nodes", {
      method: "POST",
      body: {
        type,
        title: `Untitled ${type}`,
        content: "",
        dimId: parent || null,
        zoneId: parent ? zoneId || zoneOf(get(parent), null, area)?.id : null,
        autoPlace: true,
        area,
        payload,
        ...placement(parent, area, zoneId),
      },
    });
    graph.nodes = [...graph.nodes, n];
    workspaceOptions = { ...workspaceOptions, query: "", tag: "", type: "all" };
    await openNow(n.id, { follow: !!draft });
    $("#node-title").select();
  });
}
function createMenu(parent = activeDim, zoneId = activeZone) {
  const zone = parent ? zoneOf(get(parent), zoneId) : null;
  modal(
    `<div class="dialog-heading"><div><span class="eyebrow">CAPTURE SOMETHING</span><h2>New document</h2></div><button data-close-dialog aria-label="Close">×</button></div><p>${parent ? esc(get(parent).title) + " / " + esc(zone.name) : "Independent in your world. Outside any Dim."}</p><div class="create-options">${["note", "idea", "workflow", "table"].map((t) => `<button type="button" data-create="${t}" ${parent ? `data-parent="${parent}" data-area="${zone.type}" data-zone-id="${zone.id}"` : ""}>${dot({ type: t })}<strong>${typeNames[t]}</strong><small>${{ note: "Write, collect, reflect", idea: "Give a spark a place", workflow: "Turn a plan into steps", table: "Structure your information" }[t]}</small><span>＋</span></button>`).join("")}</div>`,
  );
}
function newDim() {
  navigate(async () => {
    modal(
      `<div class="dialog-heading"><div><span class="eyebrow">A ROOM OF YOUR OWN</span><h2>Create a Dim</h2></div><button data-close-dialog aria-label="Close">×</button></div><p>A workspace for one topic. A Desk to execute, Storage to collect, and connections to the rest of your world.</p><form id="create-dim-form"><label for="new-dim-title">Name your Dim</label><input id="new-dim-title" maxlength="160" required placeholder="e.g. Design studio, Learning, Life"><label for="new-dim-description">A little context <span>(optional)</span></label><textarea id="new-dim-description" maxlength="100000" placeholder="What will happen in this room?"></textarea><label for="new-dim-color">Room color</label><input id="new-dim-color" type="color" value="#8580ff"><div class="dim-preview"><span>◇</span><div><strong>Your own corner of the world</strong><small>Desk / Execute  ·  Storage / Collect</small></div></div><button class="primary full-width" type="submit">Create Dim ↗</button></form>`,
    );
    $("#new-dim-title").focus();
    $("#create-dim-form").onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      const button = e.submitter;
      button.disabled = true;
      try {
        const i = dims().length,
          pos = {
            x: Math.min(4200, 1200 + (i % 3) * 1300),
            y: 0,
            z: Math.min(4200, Math.floor(i / 3) * 1100),
          };
        const n = await api("/nodes", {
          method: "POST",
          body: {
            type: "dim",
            autoPlace: true,
            title: $("#new-dim-title").value,
            content: $("#new-dim-description").value,
            payload: { color: $("#new-dim-color").value },
            ...pos,
          },
        });
        graph.nodes = [...graph.nodes, n];
        $("#dialog").close();
        if (draft) await closeNow();
        focusDim(n.id);
        toast("Dim created. Choose an area or add a new Desk or Storage.");
      } catch (err) {
        toast(err.message, true);
        button.disabled = false;
      } finally {
        busy = false;
      }
    };
  });
}
async function trashNode(id) {
  return navigate(async () => {
    const n = get(id);
    if (n.type === "dim") {
      const answer = await choice(
        "Move this Dim to Trash?",
        `${n.title} and its ${documents().filter((c) => c.dimId === id).length} documents can be restored together.`,
        [
          { value: "cancel", label: "Keep Dim" },
          { value: "trash", label: "Move to Trash", primary: true },
        ],
      );
      if (answer !== "trash") return;
    }
    await api("/nodes/" + id, { method: "DELETE" });
    forget(id);
    await closeNow();
    await refresh();
    toast("Moved to Trash. Its connections are preserved.", false, {
      label: "Undo",
      run: () => restoreNode(id),
    });
  });
}
async function restoreNode(id) {
  if (busy) return;
  busy = true;
  try {
    await api("/trash/" + id + "/restore", { method: "POST" });
    await refresh();
    if ($("#dialog").open) showTrash();
    toast("Restored with its available connections.");
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy = false;
  }
}
function showTrash() {
  modal(
    `<div class="dialog-heading"><div><span class="eyebrow">NOT LOST. JUST SET ASIDE.</span><h2>Trash <small>${trash.length}</small></h2></div><button data-close-dialog aria-label="Close Trash">×</button></div><p>Restore documents with their content, position, and connections. Restoring a Dim also brings back documents trashed with it.</p><div class="trash-list">${trash.length ? trash.map((n) => `<div class="trash-row">${dot(n)}<div><strong>${esc(n.title)}</strong><small>${typeNames[n.type]}${n.dimId ? " · belongs to a Dim" : ""}</small></div><button class="secondary" data-restore="${n.id}">Restore</button></div>`).join("") : '<div class="room-empty">Nothing in Trash.</div>'}</div>`,
  );
}
function browseConnections(highlight = null) {
  modal(
    `<div class="dialog-heading"><div><span class="eyebrow">FOLLOW THE THREAD</span><h2>Connections</h2></div><button data-close-dialog aria-label="Close connections">×</button></div><p>Jump directly between rooms and documents. Arrows run from source to destination.</p><input id="link-search" type="search" aria-label="Search connections" placeholder="Search titles or relationships…"><div id="all-connections"></div>`,
    { wide: true },
  );
  const render = () => {
    const q = $("#link-search").value.toLowerCase();
    $("#all-connections").innerHTML =
      graph.edges
        .filter((e) =>
          `${get(e.source)?.title} ${get(e.target)?.title} ${e.label}`
            .toLowerCase()
            .includes(q),
        )
        .map(
          (e) =>
            `<div class="route-row ${highlight === e.id ? "highlight" : ""}"><button data-route="${e.source}">${dot(get(e.source))}<strong>${esc(get(e.source).title)}</strong><small>${typeNames[get(e.source).type]}</small></button><div><span>${esc(e.label || "connects to")}</span><b>→</b></div><button data-route="${e.target}">${dot(get(e.target))}<strong>${esc(get(e.target).title)}</strong><small>${typeNames[get(e.target).type]}</small></button></div>`,
        )
        .join("") ||
      '<p class="nav-empty">No matching connections. Open any item to create one.</p>';
  };
  $("#link-search").oninput = render;
  render();
}
async function exportJSON() {
  navigate(async () => {
    const data = await api("/export"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `dimention-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Exported your world, including Trash.");
  });
}
$("#import-file").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  navigate(async () => {
    if (file.size > 32 * 1024 * 1024)
      throw new Error("Choose a JSON export smaller than 32 MiB.");
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error("This file is not valid JSON.");
    }
    const info = await api("/import", {
      method: "POST",
      body: { workspace: data, preview: true },
    });
    const answer = await choice(
      "Bring this world into yours?",
      `${info.items} items, including ${info.dims} Dims, ${info.connections} connections and ${info.trashed} items in Trash. Existing content stays intact; imported items receive new IDs.`,
      [
        { value: "cancel", label: "Cancel" },
        { value: "import", label: "Import items", primary: true },
      ],
    );
    if (answer !== "import") return;
    await api("/import", { method: "POST", body: { workspace: data } });
    await refresh();
    scene?.fit();
    toast("Import complete. Existing content is intact.");
  });
};

document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if ((busy || saving) && !d.answer) return;
  if (d.quickCapture !== undefined) return workspace.capture();
  if (d.projectPlan) return workspace.plan(d.projectPlan);
  if (d.pin) return workspace.reference({ nodeId: d.pin });
  if (d.addReference)
    return workspace.reference({ dimId: d.parent, zoneId: d.addReference });
  if (d.unpin)
    return navigate(async () => {
      await api("/references/" + d.unpin, { method: "DELETE" });
      await refresh();
      if (draft) renderEditor();
      toast("Reference removed. Original document kept.");
    });
  if (d.star || d.fileInbox)
    return mutateArea(async () => {
      const n = get(d.star || d.fileInbox);
      await api("/nodes/" + n.id, {
        method: "PATCH",
        body: d.star ? { starred: !n.starred } : { inbox: false },
      });
      await refresh();
    });
  if (d.workspaceView) {
    workspaceView = d.workspaceView;
    renderWorld();
    if (workspaceView === "room") {
      if (activeDim) scene?.focus(activeDim, activeZone);
      else scene?.fit();
    }
    if (activeDim) rememberContext(activeDim, { view: workspaceView });
    return;
  }
  if (d.boardZone !== undefined) {
    activeZone = d.boardZone || null;
    multi.clear();
    renderWorld();
    rememberContext(activeDim, { zoneId: activeZone });
    return;
  }
  if (d.tag) {
    workspaceOptions.tag = d.tag;
    workspaceLimit = 60;
    renderKnowledge();
    return;
  }
  if (d.clearFilters !== undefined) {
    workspaceOptions = { query: "", tag: "", type: "all", sort: "updated" };
    renderKnowledge();
    return;
  }
  if (d.moreDocuments !== undefined) {
    workspaceLimit += 60;
    renderKnowledge();
    return;
  }
  if (d.bulkMove !== undefined) return areas.moveDoc([...multi]);
  if (d.bulkStar !== undefined)
    return mutateArea(async () => {
      graph = await api("/favorites", {
        method: "PATCH",
        body: { ids: [...multi], starred: true },
      });
      renderWorld();
      toast("Selected documents added to Favorites.");
    });
  if (d.related) return showRelated(d.related);
  if (d.commandOpen) {
    $("#dialog").close();
    return get(d.commandOpen)?.type === "dim"
      ? navigate(async () => {
          if (draft) await closeNow();
          focusDim(d.commandOpen);
        })
      : openNode(d.commandOpen, !!draft);
  }
  if (d.format) return formatNote(d.format);
  if (d.resume)
    return navigate(async () => {
      const c = (graph.contexts || []).find((c) => c.dimId === d.resume);
      if (!c?.nodeId || !get(c.nodeId)) {
        toast("Choose a document to start this Dim.");
        return;
      }
      const scroll = c.scroll;
      activeDim = d.resume;
      activeZone = c.zoneId;
      workspaceView = c.view;
      await openNow(c.nodeId);
      $("#editor-form").scrollTop = scroll;
    });
  if (d.newDim !== undefined) return newDim();
  if (d.newZone) return areas.edit(d.parent, d.newZone);
  if (d.renameZone) return areas.edit(d.parent, null, d.renameZone);
  if (d.deleteZone) return areas.remove(d.parent, d.deleteZone);
  if (d.bring) return areas.bring(d.parent, d.bring);
  if (d.moveDoc) return areas.moveDoc(d.moveDoc);
  if (d.addToZone) return navigate(() => createMenu(d.parent, d.addToZone));
  if (d.zone)
    return navigate(async () => {
      if (draft) await closeNow();
      focusDim(d.parent, d.zone);
      if (d.spatial !== undefined) {
        workspaceView = "room";
        renderWorld();
        scene?.focus(d.parent, d.zone);
      }
    });
  if (d.allAreas) return focusDim(d.allAreas);
  if (d.create)
    return createDocument(
      d.create,
      d.parent || activeDim,
      d.area || (d.create === "workflow" ? "desk" : "storage"),
      d.zoneId || activeZone,
    );
  if (d.open)
    return mode === "multi" && !draft && workspaceView === "room"
      ? toggle(d.open)
      : openNode(d.open);
  if (d.follow) return openNode(d.follow, true);
  if (d.route) {
    $("#dialog").close();
    return openNode(d.route, !!draft);
  }
  if (d.toggle) return toggle(d.toggle);
  if (d.room)
    return navigate(async () => {
      if (draft) await closeNow();
      focusDim(d.room);
    });
  if (d.scope || d.showAll !== undefined) {
    activeDim = null;
    activeZone = null;
    multi.clear();
    scope = d.scope || "all";
    workspaceView = scope === "all" ? "room" : "list";
    workspaceOptions = { ...workspaceOptions, query: "", tag: "", type: "all" };
    renderWorld();
    scene?.fit();
    return;
  }
  if (d.mode) return setMode(d.mode);
  if (d.clearSelection !== undefined) {
    multi.clear();
    renderWorld();
    return;
  }
  if (d.closeDialog !== undefined) {
    if (busy || saving) return;
    $("#dialog").close();
    return;
  }
  if (d.roomCreate) return createMenu(d.roomCreate);
  if (d.restore) return restoreNode(d.restore);
  if (d.removeEdge) {
    b.disabled = true;
    try {
      await api("/connections/" + d.removeEdge, { method: "DELETE" });
      graph.edges = graph.edges.filter((x) => x.id !== d.removeEdge);
      renderConnections();
      renderWorld();
      toast("Connection removed.");
    } catch (err) {
      toast(err.message, true);
      b.disabled = false;
    }
    return;
  }
  if (d.moveSelection !== undefined) {
    setMode("move");
    return;
  }
  const chosen = graph.nodes.filter(
    (n) => multi.has(n.id) && !multi.has(n.dimId),
  );
  if (d.snapSelection !== undefined)
    return movePositions(
      chosen.map((n) => ({
        id: n.id,
        x: Math.round(n.x / 50) * 50,
        y: Math.round(n.y / 50) * 50,
        z: Math.round(n.z / 50) * 50,
      })),
    );
  if (d.align) {
    const a = d.align,
      mean = chosen.reduce((s, n) => s + n[a], 0) / chosen.length;
    return movePositions(
      chosen.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        z: n.z,
        [a]: Math.round(mean),
      })),
    );
  }
  if (d.offsetSelection !== undefined) {
    const offset = Object.fromEntries(
      ["x", "y", "z"].map((a) => [a, Number($("#offset-" + a).value)]),
    );
    return movePositions(
      chosen.map((n) => ({
        id: n.id,
        x: n.x + offset.x,
        y: n.y + offset.y,
        z: n.z + offset.z,
      })),
    );
  }
  if (d.organize !== undefined) {
    if (busy) return;
    busy = true;
    try {
      graph = await api("/organize", {
        method: "PATCH",
        body: {
          ids: [...multi],
          dimId: $("#batch-dim").value || null,
          zoneId: $("#batch-area").value || null,
        },
      });
      renderWorld();
      toast("Documents moved into their room.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      busy = false;
    }
  }
});
$("#collapse").onclick = () =>
  setCollapsed(!$("#sidebar").classList.contains("collapsed"));
setCollapsed(safeGet("dimention:sidebar") === "collapsed");
$("#home").onclick = () => {
  activeDim = null;
  activeZone = null;
  multi.clear();
  scope = "all";
  workspaceView = "room";
  query = "";
  $("#search").value = "";
  renderWorld();
  scene?.fit(true);
};
$("#search").oninput = (e) => {
  query = e.target.value;
  renderWorld();
};
$("#type-filter").onchange = (e) => {
  filter = e.target.value;
  renderWorld();
};
$("#move-axis").onchange = () => setMode(mode);
$("#snap").onchange = () => setMode(mode);
document.querySelectorAll("[data-view]").forEach((button) => {
  button.onclick = () => scene?.setView(button.dataset.view);
});
$("#camera-lock").onchange = (e) => scene?.setCameraLocked(e.target.checked);
$("#show-all-links").onchange = (e) => {
  showAllLinks = e.target.checked;
  renderWorld();
};
$("#fit").onclick = () => scene?.fit();
$("#reset").onclick = () => scene?.fit(true);
$("#new-document").onclick = () => navigate(() => createMenu());
$("#connections").onclick = () => browseConnections();
$("#trash").onclick = () =>
  navigate(async () => {
    trash = (await api("/trash")).nodes;
    showTrash();
  });
$("#export").onclick = exportJSON;
$("#import").onclick = () => $("#import-file").click();
$("#help").onclick = () =>
  modal(
    `<div class="dialog-heading"><h2>Your spatial notebook</h2><button data-close-dialog aria-label="Close guide">×</button></div><dl class="guide"><dt>Three ways to work</dt><dd>3D Space preserves every Dim and document’s position. Board brings active work and Storage into readable areas. List helps scan and sort. Switching views never moves your content.</dd><dt>Capture and find</dt><dd>Quick capture saves a note to Inbox. Ctrl/Cmd+Shift+N opens capture; Ctrl/Cmd+K searches all content. Tags and Favorites help you find it again.</dd><dt>Your next step</dt><dd>Set a goal and next action in each Dim. Resume this Dim restores your last document and reading position. View and area choices are saved locally in SQLite.</dd><dt>Organize</dt><dd>Create named Desks and Storage areas. Move documents, or add references to one original in several Dims. Select multiple cards to move or favorite them together.</dd><dt>Write and connect</dt><dd>Notes support Markdown text and a reading preview. Focus hides the details. Save or Ctrl/Cmd+S commits edits; drafts are recovered in this browser. Connections show labeled incoming and outgoing relationships.</dd><dt>Navigate space</dt><dd>The camera starts aligned. Drag to pan with Lock angle enabled; uncheck it to orbit. Scroll zooms, Move changes XYZ, and Fit all brings everything into view. Connections appear for selected items; All connections reveals the full graph.</dd><dt>Keep your work</dt><dd>Dim boundaries protect their space at every height. Trash is reversible. Export JSON includes all documents, references, working context and Trash; imports append with new IDs.</dd></dl><button data-close-dialog class="primary">Start working</button>`,
  );
document.addEventListener("input", (e) => {
  if (!draft || !["document-dim", "document-zone"].includes(e.target.id))
    return;
  {
    Object.assign(draft, placement(draft.dimId, draft.area, draft.zoneId));
    document.querySelectorAll("[data-coordinate]").forEach((input) => {
      input.value = draft[input.dataset.coordinate];
    });
  }
  $("#place-in-room").textContent = `Arrange in area ↗`;
  markDirty();
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (!$("#dialog").open) save();
  }
  if ($("#dialog").open) return;
  if (e.key === "Escape") {
    if (draft) {
      e.preventDefault();
      navigate(closeNow);
    } else {
      multi.clear();
      renderWorld();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
    e.preventDefault();
    workspace.capture();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    commandSearch();
  }
  if (e.key === "/" && !e.target.matches("input,textarea,select")) {
    e.preventDefault();
    if (!draft) {
      setCollapsed(false);
      $("#search").focus();
    }
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty || saving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function focusDim(id, zoneId = null) {
  activeDim = id;
  activeZone = zoneId;
  scope = "dim";
  workspaceView =
    (graph.contexts || []).find((c) => c.dimId === id)?.view || "board";
  workspaceOptions = { ...workspaceOptions, query: "", tag: "", type: "all" };
  workspaceLimit = 60;
  query = "";
  $("#search").value = "";
  multi.clear();
  renderWorld();
  scene?.focus(id, zoneId);
  rememberContext(id, { zoneId, view: workspaceView });
}
async function mutateArea(action) {
  if (busy || saving) return;
  busy = true;
  try {
    await action();
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy = false;
  }
}
function commitArea(next, { dimId, zoneId }) {
  graph = { ...graph, ...next };
  activeDim = dimId;
  activeZone = zoneId;
  scope = dimId ? "dim" : "all";
  multi.clear();
  $("#dialog").close();
  if (draft) {
    draft = clone(get(draft.id));
    dirty = false;
    forget(draft.id);
    renderEditor();
  }
  renderWorld();
  if (dimId) scene?.focus(dimId, zoneId);
  else scene?.fit();
  if (dimId) rememberContext(dimId, { zoneId, view: workspaceView });
  toast("Organization saved.");
}
const workspace = workspaceActions({
  getGraph: () => graph,
  get,
  modal,
  navigate,
  mutate: mutateArea,
  api,
  refresh,
  toast,
});
const areas = areaActions({
  getGraph: () => graph,
  get,
  navigate,
  modal,
  api,
  mutate: mutateArea,
  commit: commitArea,
});
document.addEventListener("change", (e) => {
  if (e.target.id === "batch-dim") {
    $("#batch-area").innerHTML = areaOptions(get(e.target.value));
    $("#batch-area").disabled = !e.target.value;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "focus-zone") focusDim(activeDim, e.target.value);
});
$("#dialog").addEventListener("cancel", (e) => {
  if ((busy || saving) && !$("#dialog").querySelector("[data-answer]"))
    e.preventDefault();
});

function unavailable() {
  const previous = scene;
  scene = null;
  try {
    previous?.dispose();
  } catch {}
  notice(
    "<h2>Your world is still here.</h2><p>WebGL is unavailable. Use the sidebar, Dims, and full-page editors. Enable browser hardware acceleration and reload to return to 3D.</p>",
  );
  document.querySelector(".view-toolbar").hidden = true;
  document.querySelector(".view-presets").hidden = true;
}
async function load() {
  try {
    const [next, bin] = await Promise.all([api("/workspace"), api("/trash")]);
    graph = next;
    trash = bin.nodes;
    loaded = true;
    try {
      scene = createWorkspaceScene($("#canvas-container"), {
        onSelect: (id) =>
          get(id)?.type === "dim" ? focusDim(id) : openNode(id),
        onReference: (dimId, nodeId) => {
          activeDim = dimId;
          openNode(nodeId);
        },
        onZone: ({ dimId, zoneId }) =>
          focusDim(
            dimId,
            activeDim === dimId &&
              activeZone === zoneId &&
              zoneOf(get(dimId), zoneId)?.type === "storage"
              ? null
              : zoneId,
          ),
        onBlocked: (message) => toast(message, true),
        onToggle: toggle,
        onEdge: browseConnections,
        canMove: () => !busy && !saving && !draft,
        onMove: movePositions,
        onUnavailable: unavailable,
        onViewChange: (style) =>
          document
            .querySelectorAll("[data-view]")
            .forEach((button) =>
              button.setAttribute(
                "aria-pressed",
                String(button.dataset.view === style),
              ),
            ),
      });
    } catch {
      unavailable();
    }
    renderWorld();
    scene?.fit(true);
    if (!scene) {
      workspaceView = "board";
      renderWorld();
    }
    const r = graph.nodes.find((n) => recovered(n));
    if (r) await openNow(r.id);
  } catch (e) {
    notice(
      `<h2>Couldn’t open your world.</h2><p>${esc(e.message)}</p><button id="retry" class="primary">Try again</button>`,
    );
    $("#retry").onclick = load;
  }
}
load();
