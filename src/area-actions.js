import { $, escape as esc } from "./ui.js";
import { zonesOf, zoneOf } from "../shared/spatial.js";
import { areaOptions } from "./organizer.js";

export function areaActions({
  getGraph,
  get,
  navigate,
  modal,
  api,
  mutate,
  commit,
}) {
  const heading = (title, subtitle) =>
    `<div class="dialog-heading"><div><span class="eyebrow">ORGANIZE YOUR DIM</span><h2>${esc(title)}</h2></div><button type="button" data-close-dialog aria-label="Close">×</button></div><p>${esc(subtitle)}</p>`;
  function formAction(action) {
    $("#area-form").onsubmit = (e) => {
      e.preventDefault();
      mutate(async () => {
        e.submitter.disabled = true;
        try {
          await action();
        } finally {
          if (e.submitter.isConnected) e.submitter.disabled = false;
        }
      });
    };
  }
  function edit(dimId, type, zoneId = null) {
    return navigate(() => {
      const dim = get(dimId),
        zone = zoneId ? zonesOf(dim).find((z) => z.id === zoneId) : null,
        label = (zone?.type || type) === "desk" ? "Desk" : "Storage";
      modal(
        heading(
          zone ? "Rename " + label : "Create " + label,
          `Inside ${dim.title}. ${label === "Desk" ? "A place to plan and execute." : "A place to collect and reference."}`,
        ) +
          `<form id="area-form"><label for="area-name">${label} name</label><input id="area-name" value="${esc(zone?.name || "")}" required maxlength="60" placeholder="${label === "Desk" ? "e.g. This week, Writing, Launch" : "e.g. Research, Assets, Reading"}"><div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>Cancel</button><button class="primary">${zone ? "Save name" : "Create " + label}</button></div></form>`,
      );
      $("#area-name").focus();
      formAction(async () => {
        const next = await api(
          `/dims/${dimId}/zones${zone ? "/" + zone.id : ""}`,
          {
            method: zone ? "PATCH" : "POST",
            body: { type, name: $("#area-name").value },
          },
        );
        commit(next, { dimId, zoneId: zoneId || next.zone.id });
      });
    });
  }
  function remove(dimId, zoneId) {
    return navigate(() => {
      const dim = get(dimId),
        zone = zonesOf(dim).find((z) => z.id === zoneId),
        dest = zonesOf(dim).filter((z) => z.id !== zoneId);
      modal(
        heading(
          `Remove ${zone.name}?`,
          "All documents, including those in Trash, keep their content and move to the area you choose.",
        ) +
          `<form id="area-form"><label for="replacement-area">Move contents to</label><select id="replacement-area">${dest.map((z) => `<option value="${z.id}">${z.type === "desk" ? "Desk" : "Storage"} · ${esc(z.name)}</option>`).join("")}</select><div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>Keep area</button><button class="primary">Move contents & remove area</button></div></form>`,
      );
      formAction(async () => {
        const replacementId = $("#replacement-area").value;
        const next = await api(`/dims/${dimId}/zones/${zoneId}`, {
          method: "DELETE",
          body: { replacementId },
        });
        commit(next, { dimId, zoneId: replacementId });
      });
    });
  }
  function bring(dimId, zoneId) {
    return navigate(() => {
      const dim = get(dimId),
        zone = zoneOf(dim, zoneId),
        docs = getGraph().nodes.filter(
          (n) => n.type !== "dim" && (n.dimId !== dimId || n.zoneId !== zoneId),
        );
      modal(
        heading(
          `Bring documents to ${zone.name}`,
          `Choose existing documents to move into ${dim.title}. Connections stay with them.`,
        ) +
          `<form id="area-form"><label for="bring-search">Find a document</label><input type="search" id="bring-search" placeholder="Search titles…"><div class="bring-list">${docs.map((n) => `<label class="bring-row" data-search-title="${esc(n.title.toLowerCase())}"><input type="checkbox" name="bring-id" value="${n.id}"><span><strong>${esc(n.title)}</strong><small>${n.dimId ? esc(get(n.dimId)?.title) + " / " + esc(zoneOf(get(n.dimId), n.zoneId, n.area)?.name) : "Independent document"}</small></span></label>`).join("") || "<p>Everything is already in this area. Create a new document to get started.</p>"}</div><p id="bring-count" class="field-hint">0 selected</p><div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>Cancel</button><button class="primary" id="bring-submit" disabled>Move into area</button></div></form>`,
      );
      $("#bring-search").oninput = (e) =>
        document
          .querySelectorAll(".bring-row")
          .forEach(
            (row) =>
              (row.hidden = !row.dataset.searchTitle.includes(
                e.target.value.toLowerCase(),
              )),
          );
      $("#area-form").onchange = () => {
        const count = document.querySelectorAll(
          '[name="bring-id"]:checked',
        ).length;
        $("#bring-submit").disabled = !count;
        $("#bring-count").textContent = count + " selected";
      };
      formAction(async () => {
        const ids = [
          ...document.querySelectorAll('[name="bring-id"]:checked'),
        ].map((el) => el.value);
        const next = await api("/organize", {
          method: "PATCH",
          body: { ids, dimId, zoneId },
        });
        commit(next, { dimId, zoneId });
      });
    });
  }
  function moveDoc(id) {
    return navigate(() => {
      const ids = Array.isArray(id) ? id : [id];
      const n = get(ids[0]),
        dims = getGraph().nodes.filter((n) => n.type === "dim");
      modal(
        heading(
          ids.length > 1 ? "Move selected documents" : "Move document",
          ids.length > 1
            ? `${ids.length} original documents will move. References continue to point to them.`
            : n.title,
        ) +
          `<form id="area-form"><label for="move-home">Dim</label><select id="move-home"><option value="">Independent document</option>${dims.map((d) => `<option value="${d.id}" ${d.id === n.dimId ? "selected" : ""}>${esc(d.title)}</option>`).join("")}</select><label for="move-zone">Desk or Storage</label><select id="move-zone" ${n.dimId ? "" : "disabled"}>${areaOptions(get(n.dimId), n.zoneId)}</select><div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>Cancel</button><button class="primary">Move document</button></div></form>`,
      );
      $("#move-home").onchange = (e) => {
        $("#move-zone").innerHTML = areaOptions(get(e.target.value));
        $("#move-zone").disabled = !e.target.value;
      };
      formAction(async () => {
        const dimId = $("#move-home").value || null,
          zoneId = $("#move-zone").value || null;
        const next = await api("/organize", {
          method: "PATCH",
          body: { ids, dimId, zoneId },
        });
        commit(next, { dimId, zoneId });
      });
    });
  }
  return { edit, remove, bring, moveDoc };
}
