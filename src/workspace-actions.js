import { $, escape as esc, safeGet, safeSet } from "./ui.js";
import { areaOptions } from "./organizer.js";
import { searchText } from "./workspace.js";

export function workspaceActions({
  getGraph,
  get,
  modal,
  navigate,
  mutate,
  api,
  refresh,
  toast,
}) {
  const header = (title, help) =>
    `<div class="dialog-heading"><h2>${esc(title)}</h2><button data-close-dialog aria-label="Close">×</button></div><p>${esc(help)}</p>`;
  function submit(action) {
    $("#workspace-form").onsubmit = (e) => {
      e.preventDefault();
      mutate(async () => {
        const button = e.submitter;
        button.disabled = true;
        try {
          await action();
        } finally {
          if (button.isConnected) button.disabled = false;
        }
      });
    };
  }
  function capture() {
    return navigate(() => {
      let recovered = {};
      try {
        recovered = JSON.parse(safeGet("dimention:capture") || "{}") || {};
      } catch {}
      modal(
        header(
          "Quick capture",
          "Save to your Inbox. Organize it whenever you’re ready.",
        ) +
          `<form id="workspace-form"><label for="capture-title">Title <span>optional</span></label><input id="capture-title" maxlength="160" placeholder="What’s on your mind?" value="${esc(String(recovered.title || "").slice(0, 160))}"><label for="capture-content">Note</label><textarea id="capture-content" maxlength="100000" rows="9" required placeholder="Write a thought, paste research, or keep a link…">${esc(String(recovered.content || "").slice(0, 100000))}</textarea><div class="dialog-actions"><span class="field-hint" id="capture-status">Kept here until you save</span><button type="button" class="secondary" data-close-dialog>Later</button><button class="primary">Save to Inbox</button></div></form>`,
      );
      $("#capture-content").focus();
      $("#workspace-form").oninput = () => {
        const ok = safeSet(
          "dimention:capture",
          JSON.stringify({
            title: $("#capture-title").value,
            content: $("#capture-content").value,
          }),
        );
        $("#capture-status").textContent = ok
          ? "Draft kept on this browser"
          : "Draft recovery unavailable · save before closing";
      };
      submit(async () => {
        const content = $("#capture-content").value,
          title =
            $("#capture-title").value.trim() ||
            content.trim().split("\n")[0].slice(0, 160) ||
            "Quick note";
        await api("/nodes", {
          method: "POST",
          body: { type: "note", title, content, inbox: true, autoPlace: true },
        });
        safeSet("dimention:capture", null);
        $("#dialog").close();
        await refresh();
        toast("Saved to Inbox.");
      });
    });
  }
  function plan(id) {
    return navigate(() => {
      const d = get(id);
      modal(
        header("Project direction", d.title) +
          `<form id="workspace-form"><label for="project-goal">Goal</label><textarea id="project-goal" maxlength="400" rows="3" placeholder="What will success look like?">${esc(d.payload.goal || "")}</textarea><label for="project-next">Next action</label><input id="project-next" maxlength="400" placeholder="A concrete next step…" value="${esc(d.payload.nextAction || "")}"><div class="dialog-actions"><button type="button" data-close-dialog class="secondary">Cancel</button><button class="primary">Save direction</button></div></form>`,
      );
      submit(async () => {
        await api("/nodes/" + id, {
          method: "PATCH",
          body: {
            payload: {
              goal: $("#project-goal").value,
              nextAction: $("#project-next").value,
            },
          },
        });
        $("#dialog").close();
        await refresh();
        toast("Project direction saved.");
      });
    });
  }
  function reference({ nodeId = null, dimId = null, zoneId = null } = {}) {
    return navigate(() => {
      const graph = getGraph(),
        dims = graph.nodes.filter((n) => n.type === "dim");
      modal(
        header(
          "Add a reference",
          "Keep one original document. Edits appear everywhere it is referenced.",
        ) +
          `<form id="workspace-form"><label for="reference-search">Find a document</label><input type="search" id="reference-search" placeholder="Search titles and content…"><label for="reference-document">Document</label><select id="reference-document" required ${nodeId ? "disabled" : ""}></select><label for="reference-dim">Pin to Dim</label><select id="reference-dim" required ${dimId ? "disabled" : ""}>${dims.map((d) => `<option value="${d.id}" ${d.id === dimId ? "selected" : ""}>${esc(d.title)}</option>`).join("")}</select><label for="reference-zone">Desk or Storage</label><select id="reference-zone" required></select><p class="field-hint" id="reference-hint"></p><div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>Cancel</button><button id="reference-submit" class="primary">Add reference</button></div></form>`,
      );
      function options() {
        const target = $("#reference-dim").value,
          current = nodeId || $("#reference-document").value,
          q = $("#reference-search").value.toLowerCase();
        const eligible = graph.nodes.filter(
          (n) =>
            n.type !== "dim" &&
            n.dimId !== target &&
            !(graph.references || []).some(
              (r) => r.nodeId === n.id && r.dimId === target,
            ) &&
            (!nodeId || n.id === nodeId) &&
            (nodeId || searchText(n).includes(q)),
        );
        $("#reference-document").innerHTML = eligible
          .map(
            (n) =>
              `<option value="${n.id}" ${n.id === current ? "selected" : ""}>${esc(n.title)}</option>`,
          )
          .join("");
        $("#reference-submit").disabled = !target || !eligible.length;
        $("#reference-hint").textContent = !dims.length
          ? "Create a Dim first."
          : eligible.length
            ? "The original stays in its current location."
            : "No eligible documents. This Dim may already contain or reference the document.";
      }
      const zones = () => {
        $("#reference-zone").innerHTML = areaOptions(
          get($("#reference-dim").value),
          zoneId,
        );
        options();
      };
      $("#reference-dim").onchange = zones;
      $("#reference-search").oninput = options;
      zones();
      // For a fixed document, prefer a destination that can accept it.
      if (nodeId && !dimId) {
        const d = dims.find(
          (d) =>
            get(nodeId).dimId !== d.id &&
            !(graph.references || []).some(
              (r) => r.nodeId === nodeId && r.dimId === d.id,
            ),
        );
        if (d) {
          $("#reference-dim").value = d.id;
          zones();
        }
      }
      submit(async () => {
        await api("/references", {
          method: "POST",
          body: {
            nodeId: $("#reference-document").value,
            dimId: $("#reference-dim").value,
            zoneId: $("#reference-zone").value,
          },
        });
        $("#dialog").close();
        await refresh();
        toast("Reference added. The original stays in place.");
      });
    });
  }
  return { capture, plan, reference };
}
