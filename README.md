# Dimention 0.4

A local world for notes, ideas, workflows, and tables arranged in real 3D space. A **Dim** is a room for a topic: a **Desk** for active work and **Storage** for reference. Multiple Dims and independent documents share the same world, and any of them can connect to one another.

Built directly with JavaScript, Three.js, Vite, Node's HTTP server, and SQLite. No Superdesign, accounts, external fonts, cloud services, or deployment.

## Run

Requires Node.js 24 or newer; tested with 24.18.0. In PowerShell:

```powershell
cd Dimention
npm ci
npm run build
npm start
```

Open [localhost:3000](http://localhost:3000). The server binds only to `127.0.0.1`. If that port is occupied, it tries the next available port, up to 3020; use the URL printed in the terminal. Stop a foreground server with **Ctrl+C**. Subsequent runs only need `npm start` unless the source changed.

For development, run `npm run dev`. Vite and the API share the same server. Frontend changes reload automatically; restart after backend changes.

```powershell
npm run build
npm test
```

The 27 tests use disposable databases, never your workspace database. Build first because the HTTP tests check the built frontend too. Details are in [VERIFICATION.md](VERIFICATION.md).

Optional settings, set before launching:

```powershell
$env:PORT = '3100'
$env:DIMENTION_DB = 'C:\my-local-data\dimention.sqlite'
npm start
```

## Make your first Dim

1. Click **New Dim**, give it a name and color, and create it. The camera opens its organizer immediately.
2. Click the Dim in **Quick access** to zoom to its reserved space at any time. The sidebar also works as a collapsed icon rail.
3. Use **+ New** beside Desks or Storage to create named areas such as Writing, This week, Research, or Assets. Each Dim starts with Main desk and Library and supports one to four of each type.
4. Select an area to zoom in and see its documents. **New document** creates a note, idea, workflow, or table there. Either area type accepts every document type.
5. **Bring existing** searches and moves existing documents into that area. The move button beside a document sends it to another area, another Dim, or independent space.
6. **Rename** keeps an area's identity and contents. **Remove area** requires a destination for its documents, including those in Trash. At least one Desk and one Storage remain.
7. Use **My world → New document** for independent content. Dims and independent documents share one world; focused views show only the selected Dim and its contents.

In a document's details, **Lives in** and **Desk or Storage** change its membership. **Save changes** commits that assignment and places it in the chosen area. **Arrange in area** proposes a fresh slot for an existing member. The Dim's **Open Dim overview** button shows all its named areas in a full-page view.

## Read, edit, and connect

- Click a 3D card or a document in the sidebar to animate it into a full-page editor. **Back to 3D** or **Escape** animates it back. System reduced-motion preferences are respected.
- **Save changes** or **Ctrl/Cmd+S** saves edits. Switching, closing, creating, and exporting guard unsaved changes with **Save & continue / Discard / Keep editing**.
- Save failures leave the draft editable. Browser local storage also recovers unsaved drafts after a reload. Save to SQLite before clearing browser data or switching browsers.
- Notes and ideas use multiline plain text. Workflows support adding, editing, completing, and removing steps. Tables support column names, cells, and adding/removing rows and columns.
- In **Connections**, search for a destination and optionally describe the relationship. Links save immediately. Follow the incoming or outgoing cards to navigate; **Previous** retraces the documents you followed.
- The sidebar's **Connections** view searches all routes by item title or relationship. Both ends of each route are clickable. Clicking a 3D line or its label opens the same navigator. Arrowheads indicate direction. Dims can connect to Dims or documents.
- Search finds titles, content, workflow steps, table columns, and table cells across rooms. Type filters narrow document results. Press **/** outside an editor to search.

## The furnished room

Dims are cutaway rooms with raised floors, low walls, rugs, wooden desks, chairs, desk lamps, and two-drawer cabinets. Directional and hemisphere lighting shade the geometry; soft contact shadows anchor the furniture.

Click a cabinet or choose its Storage area to slide out the drawers. Stored document cards rise into view as the folders lift. **Close Storage**, clicking the same cabinet again, or leaving the area tucks them away. Opening a stored note from the sidebar opens its cabinet before expanding the full-page editor. Returning from the editor leaves that Storage open. Motion can reverse midway and stops completely when settled; reduced-motion settings skip the movement.

**Move** and **Select items** expose stored cards for placement. Furniture follows its Dim. Document cards use a raised presentation above desks and cabinets; animation does not write to the database. Numeric coordinates remain the saved placement anchors, and dragging changes those anchors by the drag delta. The sidebar and global Connections navigator retain access to all documents and routes while cards are tucked away. Each cabinet previews up to 24 folder blocks; its organizer lists every document.

**Room view** is the default perspective and Reset view returns to it. **Aligned 3D** and **Top** are still available.

## Arrange the world

**Aligned 3D** centers the camera on the room axes, keeping Desk and Storage columns level. **Top** looks straight down at the X/Z plane; this view stays selected as you navigate between Dims and areas. The room grid has 50-unit spacing to match Snap, and surface labels sit on their planes. Drag to orbit freely; use Aligned 3D to straighten the view again. Camera framing includes the floor and visible documents with room for the toolbar.

| Control         | Behavior                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------- |
| Explore         | Click to open; drag empty space to orbit.                                                    |
| Pan             | Drag to pan. Right/middle drag also pans. Scroll zooms.                                      |
| Select items    | Click cards to toggle selection. Shift-click and sidebar checkboxes also select.             |
| Move            | Drag a card or selected group. X/Y/Z constrains the movement; View plane follows the screen. |
| Snap            | Movement uses a 50-unit grid. **Snap to grid** rounds selected items' existing positions.    |
| Selection tools | Align X/Y/Z, apply a numeric offset, or assign selected documents to a room.                 |
| Fit all / Reset | Frame everything; Reset also restores the default viewing angle.                             |

Moving a Dim carries its active documents by the same amount. Selecting both a room and its document does not move the document twice. Placement operations are atomic: exceeding coordinate bounds or crossing a Dim boundary rejects the entire operation. Canvas movement, alignment, snapping, and offsets save immediately and offer **Undo move** for 12 seconds. Membership assignment saves immediately; change the assignment again to reverse it.

Every Dim reserves a 1,200 × 1,100 footprint in the X/Z plane at all heights. Independent documents and other Dims cannot enter it. Membership is explicit: assign a document to an area to bring it inside; release it to independent space to place it outside. Moving a room stops before it covers an outside document or another room. New Dims find available space automatically. Independent cards can still overlap one another, and densely filled areas can need manual arrangement.

Exact coordinates in **Position in space** range from −5000 to 5000 and save with the document. **Focus on return** frames that item when you return to 3D.

## Trash, import, and backup

**Move to Trash** hides an item and its connections. Trashing a Dim includes its active documents. Restore it from **Trash** to recover those contents and connections. Documents already in Trash before the room was trashed remain there. Restoring a document whose room is trashed also restores the room and the documents trashed with it. Links reappear when both endpoints are active. If its old space is occupied, a restored room and its returning documents are placed in available space without moving existing content. There is no permanent-purge UI.

**Export JSON** downloads version 3, including active items, Trash, room membership, positions, payloads, timestamps, and connections. **Import JSON** accepts versions 1, 2, and 3, validates the full file, previews its counts, and appends with new IDs. Named areas and membership are retained. Preview checks that imported items can fit; appended items find available space without moving existing content. Existing content stays intact. Reimporting the same file creates another copy; import is not a merge or sync operation. Import supports up to 32 MiB per request, 1,000 items, and 5,000 connections. A small portable room is included at `tests/fixtures/import-example.json`.

Default database:

```text
data\dimention.sqlite
```

Startup migrates existing databases once, adding named areas and document zone IDs. Original content, relationships, and timestamps are preserved. Older Dims receive Main desk and Library. If older positions conflict with a reserved footprint, the migration relocates the room and its members or places a conflicting document safely; independent documents remain independent. The original text-only workflow migration remains supported. Samples are inserted only on first initialization, so an empty world stays empty after restart.

SQLite uses WAL mode. For a file backup, **stop the server and copy the entire `data` directory** to another local folder. Do not copy only the database file while the server is running. To restore, stop the server and replace the data directory with the backup, keeping matching WAL files if present. Consistent pre-update SQLite snapshots are in `backups/`.

Databases, backups, logs, generated builds, and dependencies are excluded from Git. Files named `data/*browser-check.sqlite` are separate test data and are not used by `npm start`.

## Extending the app

Add one complete feature at a time: define its saved data and expected behavior, implement validation and persistence, add the UI, and verify it using a separate database before using real data.

| File                                      | Responsibility                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `server/store.mjs`                        | Schema migration, validation, SQLite transactions, import/export, Trash and membership. |
| `server/server.mjs`                       | Local HTTP server, API routing, request limits and origin checks.                       |
| `src/main.js`                             | Navigation, editor state, draft recovery, dialogs and API actions.                      |
| `src/scene.js`                            | Demand rendering, cached scene objects, camera and movement.                            |
| `src/room-scene.js`, `src/motion.js`      | Furnished room geometry, drawer presentation, and reversible motion.                    |
| `src/scene-art.js`                        | Card textures, labels and resource disposal.                                            |
| `src/organizer.js`, `src/area-actions.js` | Named-area views and organization dialogs.                                              |
| `shared/spatial.js`                       | Shared reserved-space rules and placement planning.                                     |
| `src/structured.js`                       | Workflow and table editor markup.                                                       |
| `src/ui.js`                               | Escaping, icons and local-storage helpers.                                              |
| `src/style.css`, `src/organizer.css`      | Visual design, layouts and responsive rules.                                            |
| `tests/*.test.mjs`                        | Store and HTTP integration checks, including old-schema migration.                      |

Keep rendering separate from stored data, and add tests for persistence or migration changes. For UI additions, exercise the actual creation, save, reopen, and failure paths in the browser. Before another schema change, take a consistent backup and test against a copy of existing data.

## API

All requests use the same local origin. Errors return `{ "error": "A useful message" }`.

| Method | Route                         | Purpose                                                                          |
| ------ | ----------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/health`                 | Health check                                                                     |
| GET    | `/api/workspace`              | Active `{ nodes, edges }`                                                        |
| GET    | `/api/export`                 | Version 3 JSON, including Trash                                                  |
| POST   | `/api/import`                 | `{ workspace, preview? }`; validate and append                                   |
| GET    | `/api/trash`                  | Trashed `{ nodes }`                                                              |
| POST   | `/api/trash/:id/restore`      | Restore an item and its room group where applicable                              |
| POST   | `/api/nodes`                  | Create a document or Dim                                                         |
| PATCH  | `/api/nodes/:id`              | Update an item; room movement carries children                                   |
| DELETE | `/api/nodes/:id`              | Move to Trash                                                                    |
| PATCH  | `/api/positions`              | Atomic `{ positions: [{ id, x, y, z }] }`                                        |
| PATCH  | `/api/organize`               | `{ ids, dimId, zoneId }`; assign and place documents (legacy `area` is accepted) |
| POST   | `/api/dims/:id/zones`         | Create `{ type, name }` area                                                     |
| PATCH  | `/api/dims/:id/zones/:zoneId` | Rename with `{ name }`                                                           |
| DELETE | `/api/dims/:id/zones/:zoneId` | Remove with `{ replacementId }`, retaining documents                             |
| POST   | `/api/connections`            | Create `{ source, target, label? }`                                              |
| DELETE | `/api/connections/:id`        | Remove a connection                                                              |

Types: `dim`, `note`, `idea`, `workflow`, `table`. Core fields: `title`, `content`, `payload`, `x`, `y`, `z`, `dimId` (nullable), and `area` (`desk` or `storage`). Documents also have nullable `zoneId`. Dims have `payload.color` and `payload.zones: [{ id, name, type }]`, with zone IDs scoped to their Dim. Create requests accept `autoPlace: true` to find a safe position. Workflows use `payload.steps: [{ text, done }]`; tables use `{ columns: [string], rows: [[string]] }`. IDs and timestamps are supplied by the server. The existing `starred` value is preserved without a separate UI.

Limits: 64 active Dims; one to four areas of each type per Dim; 60-character area names; 160-character titles; 100,000-character content; 200 workflow steps of up to 2,000 characters; 1–12 table columns and up to 200 rows; 80-character column names and connection labels; 2,000-character cells; 6 MiB ordinary requests. SQL is parameterized. Nonlocal Host headers and cross-origin requests are rejected.

## Current scope

This is a single-user local app. Dims share one world and cannot nest inside other Dims. The renderer draws on demand, pauses during full-page editing and when hidden, caps pixel density at 1.5, reuses card textures and connection geometry, and disposes removed resources. Focused views omit unrelated objects and links.

Desktop browser checks use a disposable graph of 100 items with 99 connections. Room geometry is merged by finish, folder blocks are instanced, and drawer animation uses the same demand renderer. Repeated drawer cycles reuse their resources after the first reveal; searching leaves the 3D render count unchanged. Performance varies by GPU, window size, and scene density. There is no guarantee of zero lag at arbitrary scale. See VERIFICATION.md for observed results and limits.

For a disposable performance workspace:

```powershell
node tests/fixtures/seed-performance.mjs data/my-performance-check.sqlite
$env:DIMENTION_DB = 'data\my-performance-check.sqlite'
$env:PORT = '3101'
npm run dev
```

The fixture refuses existing files and the production database filename. Development canvases expose rendering counters as HTML data attributes; production builds omit them. Clear the two environment overrides before starting your normal workspace again.

There is no multi-user editing, cloud sync, rich text, attachments, table formulas, or desktop installer. Concurrent edits use the last successful save. If WebGL is unavailable, the sidebar and full-page editors remain usable. Enable hardware acceleration and reload to restore the 3D view. Desktop mouse and keyboard use is the primary target; touch and mobile navigation have not been comprehensively tested.
