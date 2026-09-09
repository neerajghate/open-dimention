# Dimention 0.5

A local spatial notebook. **Dims** keep a project's active work, references, goal, and next action together. Switch between a real **3D Space**, a readable **Board**, and a sortable **List** without moving or duplicating the underlying documents.

Built with JavaScript, Three.js, Vite, Node HTTP, and SQLite. No accounts, Superdesign, cloud services, external AI, or deployment.

## Run

Node.js 24 or newer is required. In PowerShell:

```powershell
cd Dimention
npm ci
npm run build
npm start
```

Open [localhost:3000](http://localhost:3000). The server binds to 127.0.0.1 only. If 3000 is occupied it tries the next port, through 3020, and prints the actual URL. Stop a foreground server with Ctrl+C. After the initial build, use npm start; rebuild after source changes.

For development use npm run dev. Frontend changes reload; restart the server after backend changes.

```powershell
npm run build
npm test
```

Tests use temporary databases, never the normal workspace. PORT and DIMENTION_DB can override the local port and SQLite path. Clear those overrides before starting the normal workspace.

## Work in a Dim

- Use **＋ Dim** beside Quick access to create a project. Each begins with Main desk and Library. Each Dim supports one to four named Desks and one to four Storage areas.
- Select a Dim in the sidebar. Its saved view opens; new Dims start in Board view. In 3D Space, the camera frames its reserved plane.
- **Board** groups readable document cards by area. **List** presents the same documents and references in compact rows. Search all content, filter by type or tag, and sort by title, creation, last edit, or favorites. Lists render 60 documents initially; Show more reveals the rest, and search always covers all items.
- **Desk** holds active work. **Storage** is a searchable reference library. Every area accepts notes, ideas, workflows, and tables. New document, Move here, and Add reference are available within each area.
- Set a **goal** and **next action** using Project details or the next-action Edit button. **Resume this Dim** opens the last document, restores the reading-page scroll position, and uses the saved view. Reading position saves after scrolling settles and when leaving the editor. It does not save the internal scroll position of a text field or the cursor selection.
- Use area menus to rename an area or move its contents before removing it. At least one of each area type remains. Removing an area rehomes active and trashed originals, references, and the saved area context.

## Capture, write, and find

- **Quick capture** saves a plain-text note to **Inbox**, independently of your current Dim. A title is optional and can be derived from the first line. Unsubmitted capture drafts recover in the same browser. Move an Inbox note to an area or choose Keep independent to finish filing it.
- Notes and ideas have a Markdown text editor with heading, bold, list, and link helpers. **Read preview** renders headings, emphasis, lists, quotes, code, and HTTP(S) links. Raw HTML is escaped. This is a small Markdown subset, not a full rich-text or CommonMark editor.
- **Focus** hides the document details. Preview and Focus preferences are remembered in the current browser. Documents open full-page; Back returns to the originating view. Reduced-motion settings skip the 3D transition.
- Workflows retain ordered editable checklists. Tables retain editable columns, rows, and cells.
- Tags and Favorites are saved with documents. Search includes titles, full text, tags, workflow steps, table columns, and every cell.
- Select card checkboxes to move or favorite multiple originals together. Bulk movement and bulk favorite updates are atomic. Selecting a reference acts on its original document; the move dialog explains this.
- **Save changes** commits edits to SQLite. Unsaved-change guards offer Save & continue, Discard, or Keep editing. Failed saves keep the editable draft. Unsaved document drafts also recover in the same browser.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+Shift+N | Quick capture |
| Ctrl/Cmd+K | Search and jump to any Dim or document |
| / outside an editor | Focus sidebar search |
| Ctrl/Cmd+S | Save document |
| Escape | Close editor with an unsaved-change guard, or clear selection |

## Shared references and connections

**Pin to Dim** or **Add reference** makes a reference to one original document in another Dim. It does not duplicate content or change the original's coordinates. Changes to the original appear everywhere. References are labeled in Board, List, the area organizer, and the full-page editor. Returning from a reference keeps you in the Dim where you opened it.

Each Dim can reference a given original once. A document cannot also be a reference in its own Dim. Moving the original into a Dim where it was referenced removes that redundant pin; references in other Dims remain. Unpin removes the reference only. Trashing either endpoint hides the reference; restoring brings it back when both endpoints are available.

3D references appear as derived cards inside their assigned areas. They have no separately stored XYZ and cannot be dragged independently. Original documents and Dims remain movable. Editing or opening the derived card accesses the original.

Directed, labeled **Connections** express relationships between any documents or Dims. The editor shows incoming and outgoing links. A card's Connections button shows its related items; the sidebar navigator searches every route. In 3D, links appear for selected items and the focused Dim; **All connections** reveals the full graph. Previous retraces documents followed inside the editor.

## The 3D space

Dims use aligned raised planes with quiet area markers. Furniture, drawers, and their animations have been removed. Titles face the screen. The world overview emphasizes Dim summaries; nearby Dim documents become visible as the camera approaches. Entering a Dim makes all its documents accessible, and Board/List provide the same information without perspective.

The camera starts aligned with **Lock angle** on. Drag to pan, scroll to zoom, or turn Lock angle off to orbit. Perspective, Aligned 3D, and Top set predictable angles. Fit all frames the current scope; Reset restores aligned framing.

Use Move to drag original cards; X/Y/Z constrains an axis and Snap uses a 50-unit grid. Select items supports multi-selection, alignment, numeric offsets, and assignment. The editor's Position in space accepts exact coordinates from -5000 to 5000. Moves save immediately and offer Undo move for 12 seconds.

Every Dim reserves a 1200 × 1100 X/Z footprint at all heights. Outsiders cannot enter it. Assign a document to a Dim to bring it inside; releasing it places it outside the reserved footprints. Moving a Dim carries its originals and reference presentation, rejects collisions atomically, and never writes a coordinate record for a reference. Dims share a world and cannot nest. Independent documents can overlap one another; dense stacks can still require manual arrangement.

## Persistence, Trash, and backup

Default database:

```text
data\dimention.sqlite
```

SQLite stores documents, positions, tags, Inbox state, favorites, connections, references, and Dim working contexts. Browser storage holds unsaved drafts and display preferences. This is single-user local storage; another browser on the same server accesses the same saved documents, but not its unsaved drafts.

Trash is reversible. Trashing a Dim includes its active originals; restoring restores that group and available relationships. Documents already in Trash before their Dim was trashed keep their earlier Trash state. Restore finds available space if an old footprint has been occupied. There is no permanent-purge UI.

**Export JSON** writes version 4, including Trash, all references, and saved working context. Import accepts versions 1–4, validates and previews the whole file, and appends with new IDs. It remaps references and context pointers as well as connections and membership. It does not merge duplicates. Imports are limited to 32 MiB, 1000 items, and 5000 connections; the world supports 5000 references. The portable example in tests/fixtures/import-example.json remains compatible.

Version 0.5 adds Inbox and tags columns plus reference/context tables. It does not rewrite existing note content or spatial coordinates. A consistent pre-update snapshot is saved as **backups/pre-v05-1788924602684.sqlite**. Older schema migrations remain supported and initialization never reseeds an intentionally emptied world.

For a manual backup, **stop the server and copy the entire data directory** to another local folder. SQLite uses WAL mode; do not copy only the main database while it is running. Stop the server before restoring a backup. Databases, backups, logs, builds, and dependencies are excluded from Git.

## Development map

| File | Responsibility |
| --- | --- |
| server/store.mjs | Validation, SQLite, atomic operations, Trash, import/export, references and resume |
| server/server.mjs | Loopback HTTP/API, origin checks, request limits |
| shared/spatial.js | Reserved footprints, ownership, collision checks, placement |
| src/main.js | Navigation, saving, recovery, state and keyboard actions |
| src/workspace.js | Board/List markup, full-content search, derived spatial references |
| src/workspace-actions.js | Capture, project direction and reference dialogs |
| src/organizer.js / src/area-actions.js | Area views, creation and organization |
| src/scene.js / src/room-scene.js | Demand renderer, camera, dragging, aligned platforms |
| src/scene-art.js | Card textures, labels and resource disposal |
| src/markdown.js / src/structured.js | Safe reading preview and structured editors |
| src/workspace.css | Notebook layout and responsive styles |
| tests/*.test.mjs | Persistence, HTTP, spatial constraints, import and notebook checks |

New API routes are POST /api/references, DELETE /api/references/:id, PATCH /api/dims/:id/context, and PATCH /api/favorites. GET /api/workspace now includes nodes, edges, references, and contexts. Existing node, position, organization, area, connection, Trash, import, and export routes remain available.

Documents add boolean inbox and an array of tags (up to 12, 40 characters each). Dim payloads add goal and nextAction (400 characters each). References contain id, nodeId, dimId, zoneId, and createdAt. Working contexts contain dimId, nodeId, zoneId, view, scroll, and updatedAt. IDs are generated by the server. Use the shared store for persistence changes and verify migration against a database copy before release.

## Limits and verification

The renderer works on demand, caps pixel density at 1.5, and pauses during Board/List viewing, full-page editing, and hidden tabs. Board/List page their document cards. The 100-item fixture is checked in the browser; this is not a guarantee of zero lag at arbitrary scale. See [VERIFICATION.md](VERIFICATION.md) for actual observations.

Current bounds: 64 active Dims, one to four areas of each type per Dim, 160-character titles, 100000-character content, 200 workflow steps, 1–12 table columns, and 200 table rows. No cloud sync, collaboration, attachments, AI generation, rich-text block editor, formulas, or desktop installer. Concurrent edits use the last successful save. If WebGL is unavailable, Board/List and editors remain available. Touch/mobile navigation has not been comprehensively tested.
