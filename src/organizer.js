import { escape as esc, icons } from "./ui.js";
import { zonesOf, zoneOf } from "../shared/spatial.js";
import { typeNames } from "./scene-art.js";
const members = (nodes, dim, zone) =>
  nodes.filter((n) => n.dimId === dim.id && n.zoneId === zone.id);
const icon = (type) => (type === "desk" ? "▱" : "▥");
function withReferences(nodes, references) {
  const lookup = new Map(nodes.map((n) => [n.id, n]));
  return [
    ...nodes,
    ...references
      .filter((r) => lookup.has(r.nodeId))
      .map((r) => ({
        ...lookup.get(r.nodeId),
        dimId: r.dimId,
        zoneId: r.zoneId,
        viewReference: r,
      })),
  ];
}
export function areaName(dim, zoneId, area) {
  return zoneOf(dim, zoneId, area)?.name || "Unassigned";
}
export function areaOptions(dim, selected) {
  return dim
    ? zonesOf(dim)
        .map(
          (z) =>
            `<option value="${z.id}" ${z.id === selected ? "selected" : ""}>${z.type === "desk" ? "Desk" : "Storage"} · ${esc(z.name)}</option>`,
        )
        .join("")
    : '<option value="">No area · Independent</option>';
}
function areaButton(dim, zone, nodes, active) {
  const count = members(nodes, dim, zone).length;
  return `<button type="button" class="zone-tile ${active === zone.id ? "active" : ""} ${zone.type}" data-zone="${zone.id}" data-parent="${dim.id}" data-spatial aria-pressed="${active === zone.id}"><span class="zone-icon">${icon(zone.type)}</span><span><strong>${esc(zone.name)}</strong><small>${count} ${count === 1 ? "document" : "documents"}</small></span><span class="zone-arrow">↗</span></button>`;
}
function documentRows(nodes, dim, zone) {
  const docs = members(nodes, dim, zone);
  return docs.length
    ? docs
        .map(
          (n) =>
            `<div class="organizer-doc"><button type="button" data-follow="${n.id}"><span>${icons[n.type]}</span><span><strong>${esc(n.title)}</strong><small>${n.viewReference ? "↗ Reference · shared original" : n.type === "workflow" ? `${n.payload.steps.filter((s) => s.done).length}/${n.payload.steps.length} steps done` : typeNames[n.type]}</small></span><span>↗</span></button>${n.viewReference ? `<button type="button" data-unpin="${n.viewReference.id}" aria-label="Remove reference to ${esc(n.title)}">×</button>` : `<button type="button" data-move-doc="${n.id}" title="Move ${esc(n.title)} to another area" aria-label="Move ${esc(n.title)}">⇄</button>`}</div>`,
        )
        .join("")
    : `<div class="zone-empty"><span>${icon(zone.type)}</span><strong>${zone.type === "desk" ? "A clear desk for your next step." : "Everything worth keeping, together."}</strong><p>${zone.type === "desk" ? "Create a workflow, note, or table here." : "Collect reference notes, ideas, and data here."}</p></div>`;
}
export function dimDock(
  dim,
  nodes,
  activeZone,
  references = [],
  context = null,
) {
  nodes = withReferences(nodes, references);
  const zones = zonesOf(dim),
    selected = zones.find((z) => z.id === activeZone);
  return `<div class="organizer-header"><button data-show-all class="organizer-back">← My world</button><span class="protected-badge">◇ Reserved space</span><div class="organizer-room-name"><h2>${esc(dim.title)}</h2>${selected?.type === "storage" ? `<button class="storage-header-close" data-all-areas="${dim.id}">All areas</button>` : ""}</div><p>${esc(dim.payload.nextAction || dim.payload.goal || "Your work, organized by where it belongs.")}</p>${context?.nodeId ? `<button data-resume="${dim.id}" class="organizer-overview">Resume last document ↗</button>` : ""}<button data-workspace-view="board" class="primary" style="width:100%;margin-bottom:10px">Open document board ↗</button><button data-open="${dim.id}" class="organizer-overview">Edit project details ↗</button></div>
 <div class="organizer-scroll">${selected ? `<div class="zone-switcher"><label for="focus-zone">Jump to an area</label><select id="focus-zone">${areaOptions(dim, activeZone)}</select><div class="area-actions"><button data-new-zone="desk" data-parent="${dim.id}" ${zones.filter((z) => z.type === "desk").length >= 4 ? "disabled" : ""} aria-label="Create Desk in ${esc(dim.title)}">＋ Desk</button><button data-new-zone="storage" data-parent="${dim.id}" ${zones.filter((z) => z.type === "storage").length >= 4 ? "disabled" : ""} aria-label="Create Storage in ${esc(dim.title)}">＋ Storage</button><button data-all-areas="${dim.id}">All areas ↗</button></div></div>` : ""}<div class="area-groups" ${selected ? "hidden" : ""}>${[
   "desk",
   "storage",
 ]
   .map(
     (type) =>
       `<section><div class="area-group-title"><h3>${icon(type)} ${type === "desk" ? "Desks" : "Storage"}</h3><button data-new-zone="${type}" data-parent="${dim.id}" ${zones.filter((z) => z.type === type).length >= 4 ? "disabled" : ""} aria-label="Create ${type === "desk" ? "Desk" : "Storage"} in ${esc(dim.title)}">＋ New</button></div><p class="area-purpose">${type === "desk" ? "Plan and execute" : "Collect and reference"}</p>${zones
         .filter((z) => z.type === type)
         .map((z) => areaButton(dim, z, nodes, activeZone))
         .join("")}</section>`,
   )
   .join("")}</div>
 ${selected ? `<section class="zone-detail ${selected.type}"><div class="zone-detail-title"><div><small>${selected.type.toUpperCase()}</small><h3>${esc(selected.name)}</h3></div><button data-all-areas="${dim.id}" aria-label="Show all areas">×</button></div><div class="area-actions"><button class="primary" data-add-to-zone="${selected.id}" data-parent="${dim.id}">＋ New document</button><button class="secondary" data-bring="${selected.id}" data-parent="${dim.id}">⇄ Bring existing</button></div><div class="storage-state">${selected.type === "storage" ? "Reference documents" : "Active work"}</div><div class="organizer-docs">${documentRows(nodes, dim, selected)}</div>${selected.type === "storage" ? `<button class="close-storage" data-all-areas="${dim.id}">All areas ↙</button>` : ""}<div class="area-manage"><button data-rename-zone="${selected.id}" data-parent="${dim.id}">Rename</button><button data-delete-zone="${selected.id}" data-parent="${dim.id}" ${zones.filter((z) => z.type === selected.type).length === 1 ? 'disabled title="Keep at least one area of each type"' : ""}>Remove area…</button></div></section>` : `<div class="organizer-hint"><span>↖</span><p><strong>Pick a Desk or Storage.</strong><br>Choose an area on the plane, or use Board view to read and organize documents.</p></div>`}</div><div class="organizer-footer">Outside content stays outside this Dim.</div>`;
}
export function dimOverview(dim, nodes, references = []) {
  nodes = withReferences(nodes, references);
  return `<div class="dim-boards organized-boards">${["desk", "storage"]
    .map(
      (type) =>
        `<section class="overview-group ${type}"><div class="room-section-heading"><div><span class="eyebrow">${type === "desk" ? "PLAN & EXECUTE" : "COLLECT & REFERENCE"}</span><h2>${type === "desk" ? "Desks" : "Storage"}</h2></div><button type="button" class="secondary" data-new-zone="${type}" data-parent="${dim.id}" ${zonesOf(dim).filter((z) => z.type === type).length >= 4 ? "disabled" : ""}>＋ New ${type === "desk" ? "Desk" : "Storage"}</button></div>${zonesOf(
          dim,
        )
          .filter((z) => z.type === type)
          .map(
            (zone) =>
              `<div class="overview-area"><div class="overview-area-title"><span>${icon(type)}</span><h3>${esc(zone.name)}</h3><small>${members(nodes, dim, zone).length} documents</small><button type="button" data-zone="${zone.id}" data-parent="${dim.id}" data-spatial aria-label="Explore ${esc(zone.name)} in 3D">3D ↗</button></div><div class="area-actions"><button type="button" class="secondary" data-add-to-zone="${zone.id}" data-parent="${dim.id}">＋ New document</button><button type="button" class="text-button" data-bring="${zone.id}" data-parent="${dim.id}">Bring existing</button><button type="button" class="text-button" data-rename-zone="${zone.id}" data-parent="${dim.id}">Rename</button></div>${documentRows(nodes, dim, zone)}</div>`,
          )
          .join("")}</section>`,
    )
    .join("")}</div>`;
}
