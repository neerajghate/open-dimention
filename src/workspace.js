import { escape as esc, icons } from "./ui.js";
import { preview, typeNames } from "./scene-art.js";
import { zonesOf, slotPosition } from "../shared/spatial.js";

export function spatialPresentation(graph) {
  const lookup = new Map(graph.nodes.map((n) => [n.id, n])),
    counts = new Map();
  for (const n of graph.nodes)
    if (n.dimId) {
      const key = n.dimId + ":" + n.zoneId;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  const aliases = [];
  for (const r of graph.references || []) {
    const n = lookup.get(r.nodeId),
      dim = lookup.get(r.dimId),
      zone = zonesOf(dim).find((z) => z.id === r.zoneId);
    if (!n || !dim || !zone) continue;
    const key = dim.id + ":" + zone.id,
      count = counts.get(key) || 0;
    counts.set(key, count + 1);
    aliases.push({
      ...n,
      id: "reference:" + r.id,
      referenceNodeId: n.id,
      title: "↗ " + n.title,
      dimId: dim.id,
      zoneId: zone.id,
      area: zone.type,
      inbox: false,
      ...slotPosition(dim, zone.id, count),
    });
  }
  return [...graph.nodes, ...aliases];
}

export function searchText(n) {
  return [
    n.title,
    n.content,
    ...(n.tags || []),
    n.payload?.goal,
    n.payload?.nextAction,
    ...(n.payload?.steps || []).map((s) => s.text),
    ...(n.payload?.columns || []),
    ...(n.payload?.rows || []).flat(),
  ]
    .join(" ")
    .toLowerCase();
}
export function entriesFor(graph, dimId = null) {
  const owned = graph.nodes
    .filter((n) => n.type !== "dim" && (!dimId || n.dimId === dimId))
    .map((node) => ({ node, zoneId: node.zoneId, reference: null }));
  if (!dimId) return owned;
  const lookup = new Map(graph.nodes.map((n) => [n.id, n]));
  return [
    ...owned,
    ...(graph.references || [])
      .filter((r) => r.dimId === dimId && lookup.has(r.nodeId))
      .map((r) => ({
        node: lookup.get(r.nodeId),
        zoneId: r.zoneId,
        reference: r,
      })),
  ];
}
export function filteredEntries(
  entries,
  { query = "", type = "all", tag = "", sort = "updated" } = {},
) {
  const q = query.toLowerCase();
  return entries
    .filter(
      ({ node: n }) =>
        (!q || searchText(n).includes(q)) &&
        (type === "all" || n.type === type) &&
        (!tag || n.tags?.includes(tag)),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.node.title.localeCompare(b.node.title)
        : sort === "created"
          ? b.node.createdAt.localeCompare(a.node.createdAt)
          : sort === "starred"
            ? Number(b.node.starred) - Number(a.node.starred) ||
              b.node.updatedAt.localeCompare(a.node.updatedAt)
            : b.node.updatedAt.localeCompare(a.node.updatedAt),
    );
}
const date = (n) =>
  new Date(n.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
function entryCard(entry, state) {
  const { node: n, reference: r } = entry,
    owner = state.graph.nodes.find((d) => d.id === n.dimId);
  return `<article class="knowledge-card ${state.multi.has(n.id) ? "is-selected" : ""}" data-document="${n.id}">
    <div class="card-meta"><button class="card-check" data-toggle="${n.id}" aria-label="Select ${esc(n.title)}" aria-pressed="${state.multi.has(n.id)}">${state.multi.has(n.id) ? "☑" : "□"}</button><span>${icons[n.type]} ${typeNames[n.type]}</span><button data-star="${n.id}" aria-label="${n.starred ? "Unfavorite" : "Favorite"} ${esc(n.title)}" aria-pressed="${n.starred}">${n.starred ? "★" : "☆"}</button></div>
    <button class="knowledge-open" data-open="${n.id}"><strong>${esc(n.title)}</strong><p>${esc(preview(n).slice(0, 200) || "Open to start writing.")}</p></button>
    ${n.type === "workflow" ? `<div class="card-progress"><progress value="${n.payload.steps.filter((s) => s.done).length}" max="${n.payload.steps.length || 1}"></progress><span>${n.payload.steps.filter((s) => s.done).length}/${n.payload.steps.length}</span></div>` : ""}
    <div class="card-tags">${(n.tags || []).map((tag) => `<button data-tag="${esc(tag)}">#${esc(tag)}</button>`).join("")}</div>
    <div class="card-location">${r ? `↗ Reference · ${esc(owner?.title || "Independent original")}` : n.inbox ? "Inbox · ready to organize" : esc(owner?.title || "Independent")}<span>${date(n)}</span></div>
    <div class="card-actions"><button data-related="${n.id}">Connections</button>${r ? `<button data-unpin="${r.id}" aria-label="Remove reference to ${esc(n.title)}">Unpin</button>` : `<button data-move-doc="${n.id}">Move</button>`}<button data-pin="${n.id}">Pin to Dim</button>${n.inbox ? `<button data-file-inbox="${n.id}">Keep independent</button>` : ""}</div>
  </article>`;
}
function zonePanel(dim, zone, entries, state) {
  return `<section class="knowledge-area"><header><div><span class="area-kind">${zone.type === "desk" ? "DESK · ACTIVE WORK" : "STORAGE · LIBRARY"}</span><h2><button data-board-zone="${zone.id}">${esc(zone.name)}</button><small>${entries.length}</small></h2></div><details class="area-menu"><summary aria-label="Manage ${esc(zone.name)}">···</summary><div><button data-rename-zone="${zone.id}" data-parent="${dim.id}">Rename</button><button data-delete-zone="${zone.id}" data-parent="${dim.id}" ${zonesOf(dim).filter((z) => z.type === zone.type).length === 1 ? 'disabled title="Keep at least one area of each type"' : ""}>Remove area</button></div></details></header>
  <div class="area-quick-actions"><button data-add-to-zone="${zone.id}" data-parent="${dim.id}">＋ New document</button><button data-bring="${zone.id}" data-parent="${dim.id}">Move here</button><button data-add-reference="${zone.id}" data-parent="${dim.id}">Add reference</button></div>
  <div class="knowledge-cards">${entries.map((e) => entryCard(e, state)).join("") || '<div class="knowledge-empty">A clear space. Create a document or add a reference.</div>'}</div></section>`;
}
export function renderWorkspace(state) {
  const { graph, dimId, zoneId, view, scope, options, multi } = state;
  const dim = graph.nodes.find((n) => n.id === dimId),
    zones = zonesOf(dim);
  let entries = entriesFor(graph, dimId);
  if (!dim)
    entries = entries.filter(({ node: n }) =>
      scope === "inbox"
        ? n.inbox
        : scope === "starred"
          ? n.starred
          : scope === "loose"
            ? !n.dimId && !n.inbox
            : true,
    );
  const tags = [...new Set(entries.flatMap((e) => e.node.tags || []))].sort();
  if (zoneId) entries = entries.filter((e) => e.zoneId === zoneId);
  const filtered = filteredEntries(entries, options),
    shown = filtered.slice(0, state.limit);
  const context = (graph.contexts || []).find((c) => c.dimId === dimId),
    last = graph.nodes.find((n) => n.id === context?.nodeId);
  const title =
    dim?.title ||
    { inbox: "Inbox", starred: "Favorites", loose: "Independent documents" }[
      scope
    ] ||
    "My world";
  const subtitle = dim
    ? dim.payload.goal ||
      dim.content.split("\n")[0] ||
      "Give this project a goal and a next step."
    : scope === "inbox"
      ? "Capture now. Find a home when you’re ready."
      : scope === "starred"
        ? "The documents you want close at hand."
        : "Every project and document, within reach.";
  let html = `<div class="workspace-heading"><div><span class="workspace-eyebrow">${dim ? "YOUR DIM" : "YOUR WORKSPACE"}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="workspace-heading-actions">${dim ? `<button class="secondary" data-open="${dim.id}">Project details</button>` : ""}<button class="primary" ${dim ? `data-room-create="${dim.id}"` : "data-quick-capture"}>＋ ${dim ? "New document" : "Quick capture"}</button></div></div>`;
  if (dim)
    html += `<div class="project-context"><div><small>NEXT ACTION</small><strong>${esc(dim.payload.nextAction || "Choose a concrete next step")}</strong><button data-project-plan="${dim.id}">${dim.payload.nextAction ? "Edit" : "Set next action"}</button></div><div><small>WHERE YOU LEFT OFF</small><strong>${esc(last?.title || "Start with a document below")}</strong><button data-resume="${dim.id}" ${last ? "" : "disabled"}>Resume this Dim ↗</button></div></div>
  <div class="workspace-zones"><button data-board-zone="" class="${!zoneId ? "active" : ""}">All areas</button>${zones.map((z) => `<button data-board-zone="${z.id}" class="${zoneId === z.id ? "active" : ""}">${z.type === "desk" ? "▱" : "▥"} ${esc(z.name)}</button>`).join("")}<span></span><button data-new-zone="desk" data-parent="${dim.id}" ${zones.filter((z) => z.type === "desk").length >= 4 ? "disabled" : ""}>＋ Desk</button><button data-new-zone="storage" data-parent="${dim.id}" ${zones.filter((z) => z.type === "storage").length >= 4 ? "disabled" : ""}>＋ Storage</button></div>`;
  if (!dim && scope === "all" && view === "board")
    html += `<div class="dim-summaries">${graph.nodes
      .filter((n) => n.type === "dim")
      .map(
        (d) =>
          `<button data-room="${d.id}" style="--dim-accent:${d.payload.color}"><span>◇ DIM</span><strong>${esc(d.title)}</strong><p>${esc(d.payload.goal || d.content.slice(0, 120) || "A place for your next project.")}</p><small>${esc(d.payload.nextAction || "Open workspace")} ↗</small></button>`,
      )
      .join("")}</div>`;
  html += `<div class="workspace-tools"><label class="workspace-search"><span class="sr-only">Search this view</span><input id="workspace-search" type="search" placeholder="Search titles, text and tags…" value="${esc(options.query)}"></label><select id="workspace-type" aria-label="Filter this view by type"><option value="all">All types</option>${["note", "idea", "workflow", "table"].map((t) => `<option value="${t}" ${options.type === t ? "selected" : ""}>${typeNames[t]}s</option>`).join("")}</select><select id="workspace-tag" aria-label="Filter by tag"><option value="">All tags</option>${tags.map((t) => `<option ${options.tag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><select id="workspace-sort" aria-label="Sort documents">${[
    ["updated", "Last edited"],
    ["created", "Newest first"],
    ["title", "Title A–Z"],
    ["starred", "Favorites first"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${options.sort === v ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select><span class="result-count">${filtered.length} docs</span>${options.query || options.tag || options.type !== "all" ? "<button data-clear-filters>Clear filters</button>" : ""}</div>`;
  if (multi.size)
    html += `<div class="workspace-bulk" role="status"><strong>${multi.size} selected</strong><button data-bulk-move>Move selected</button><button data-bulk-star>Favorite selected</button><button data-clear-selection>Clear selection</button></div>`;
  if (view === "list")
    html += `<div class="knowledge-list">${shown.map((e) => entryCard(e, state)).join("")}</div>`;
  else if (dim)
    html += `<div class="knowledge-board">${zones
      .filter((z) => !zoneId || z.id === zoneId)
      .map((z) =>
        zonePanel(
          dim,
          z,
          shown.filter((e) => e.zoneId === z.id),
          state,
        ),
      )
      .join("")}</div>`;
  else
    html += `<div class="knowledge-grid">${shown.map((e) => entryCard(e, state)).join("")}</div>`;
  if (!filtered.length && (!dim || view === "list"))
    html += `<div class="workspace-empty"><span>▤</span><h2>${entries.length ? "No matching documents" : "Room for a new thought"}</h2><p>${entries.length ? "Try a different search or clear your filters." : "Capture a note, build a checklist, or organize your references."}</p><button class="primary" data-quick-capture>Quick capture</button></div>`;
  if (filtered.length > shown.length)
    html += `<button class="secondary load-more" data-more-documents>Show more (${filtered.length - shown.length} remaining)</button>`;
  return html;
}
