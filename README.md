# Dimention 0.2

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

The 15 tests use disposable databases, never your workspace database. Build first because the HTTP tests check the built frontend too. Details are in [VERIFICATION.md](VERIFICATION.md).

Optional settings, set before launching:

```powershell
$env:PORT = '3100'
$env:DIMENTION_DB = 'C:\my-local-data\dimention.sqlite'
npm start
```

## Make your first Dim

1. Click **New Dim**, give it a name and color, and create it.
2. Add a workflow to its **Desk**, or add a note, idea, workflow, or table to **Storage**.
3. Use **Back to 3D** to see the room and its documents in space.
4. Create more Dims for other topics. Use **My world → New document** to leave a document independent.
5. To organize existing documents, select their sidebar checkboxes, choose a Dim and Desk/Storage, then **Assign**. This moves them into the room physically as well as assigning membership.

In a document's details, **Lives in** and **Use it for** change its room and area. The proposed position updates to that area; **Save changes** commits it. **Place at Desk/Storage** places an existing member again after manual movement. Desk and Storage are organizational areas; either can contain any document type.

Click a Dim's name in the sidebar to focus its room and list its documents. Its **↗** button enters the full-page room overview. The sidebar collapses to an icon rail and remembers the preference in this browser.

## Read, edit, and connect

- Click a 3D card or a document in the sidebar to animate it into a full-page editor. **Back to 3D** or **Escape** animates it back. System reduced-motion preferences are respected.
- **Save changes** or **Ctrl/Cmd+S** saves edits. Switching, closing, creating, and exporting guard unsaved changes with **Save & continue / Discard / Keep editing**.
- Save failures leave the draft editable. Browser local storage also recovers unsaved drafts after a reload. Save to SQLite before clearing browser data or switching browsers.
- Notes and ideas use multiline plain text. Workflows support adding, editing, completing, and removing steps. Tables support column names, cells, and adding/removing rows and columns.
- In **Connections**, search for a destination and optionally describe the relationship. Links save immediately. Follow the incoming or outgoing cards to navigate; **Previous** retraces the documents you followed.
- The sidebar's **Connections** view searches all routes by item title or relationship. Both ends of each route are clickable. Clicking a 3D line or its label opens the same navigator. Arrowheads indicate direction. Dims can connect to Dims or documents.
- Search finds titles, content, workflow steps, table columns, and table cells across rooms. Type filters narrow document results. Press **/** outside an editor to search.

## Arrange the world

| Control | Behavior |
| --- | --- |
| Explore | Click to open; drag empty space to orbit. |
| Pan | Drag to pan. Right/middle drag also pans. Scroll zooms. |
| Select items | Click cards to toggle selection. Shift-click and sidebar checkboxes also select. |
| Move | Drag a card or selected group. X/Y/Z constrains the movement; View plane follows the screen. |
| Snap | Movement uses a 50-unit grid. **Snap to grid** rounds selected items' existing positions. |
| Selection tools | Align X/Y/Z, apply a numeric offset, or assign selected documents to a room. |
| Fit all / Reset | Frame everything; Reset also restores the default viewing angle. |

Moving a Dim carries its active documents by the same amount. Selecting both a room and its document does not move the document twice. Placement operations are atomic: exceeding coordinate bounds rejects the entire operation. Canvas movement, alignment, snapping, and offsets save immediately and offer **Undo move** for 12 seconds. Membership assignment saves immediately; change the assignment again to reverse it.

Exact coordinates in **Position in space** range from −5000 to 5000 and save with the document. **Focus on return** frames that item when you return to 3D.

## Trash, import, and backup

**Move to Trash** hides an item and its connections. Trashing a Dim includes its active documents. Restore it from **Trash** to recover those contents and connections. Documents already in Trash before the room was trashed remain there. Restoring a document whose room is trashed also restores the room and the documents trashed with it. Links reappear when both endpoints are active. There is no permanent-purge UI.

**Export JSON** downloads version 2, including active items, Trash, room membership, positions, payloads, timestamps, and connections. **Import JSON** accepts versions 1 and 2, validates the full file, previews its counts, and appends with new IDs. Existing content stays intact. Reimporting the same file creates another copy; import is not a merge or sync operation. Import supports up to 32 MiB per request, 1,000 items, and 5,000 connections. A small portable room is included at `tests/fixtures/import-example.json`.

Default database:

```text
data\dimention.sqlite
```

Startup adds room membership and Trash columns to the existing database. It preserves existing content and positions; existing documents stay independent until you assign them to a Dim. The original text-only workflow migration remains supported. Samples are inserted only on first initialization, so an empty world stays empty after restart.

SQLite uses WAL mode. For a file backup, **stop the server and copy the entire `data` directory** to another local folder. Do not copy only the database file while the server is running. To restore, stop the server and replace the data directory with the backup, keeping matching WAL files if present. Consistent pre-update SQLite snapshots are in `backups/`.

Databases, backups, logs, generated builds, and dependencies are excluded from Git. Files named `data/*browser-check.sqlite` are separate test data and are not used by `npm start`.

## Extending the app

Add one complete feature at a time: define its saved data and expected behavior, implement validation and persistence, add the UI, and verify it using a separate database before using real data.

| File | Responsibility |
| --- | --- |
| `server/store.mjs` | Schema migration, validation, SQLite transactions, import/export, Trash and membership. |
| `server/server.mjs` | Local HTTP server, API routing, request limits and origin checks. |
| `src/main.js` | Navigation, editor state, draft recovery, dialogs and API actions. |
| `src/scene.js` | Three.js rooms, cards, connections, camera and movement. |
| `src/structured.js` | Workflow and table editor markup. |
| `src/ui.js` | Escaping, icons and local-storage helpers. |
| `src/style.css` | Visual design, layouts and responsive rules. |
| `tests/*.test.mjs` | Store and HTTP integration checks, including old-schema migration. |

Keep rendering separate from stored data, and add tests for persistence or migration changes. For UI additions, exercise the actual creation, save, reopen, and failure paths in the browser. Before another schema change, take a consistent backup and test against a copy of existing data.

## API

All requests use the same local origin. Errors return `{ "error": "A useful message" }`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/workspace` | Active `{ nodes, edges }` |
| GET | `/api/export` | Version 2 JSON, including Trash |
| POST | `/api/import` | `{ workspace, preview? }`; validate and append |
| GET | `/api/trash` | Trashed `{ nodes }` |
| POST | `/api/trash/:id/restore` | Restore an item and its room group where applicable |
| POST | `/api/nodes` | Create a document or Dim |
| PATCH | `/api/nodes/:id` | Update an item; room movement carries children |
| DELETE | `/api/nodes/:id` | Move to Trash |
| PATCH | `/api/positions` | Atomic `{ positions: [{ id, x, y, z }] }` |
| PATCH | `/api/organize` | `{ ids, dimId, area }`; assign and place documents |
| POST | `/api/connections` | Create `{ source, target, label? }` |
| DELETE | `/api/connections/:id` | Remove a connection |

Types: `dim`, `note`, `idea`, `workflow`, `table`. Core fields: `title`, `content`, `payload`, `x`, `y`, `z`, `dimId` (nullable), and `area` (`desk` or `storage`). Dims have `payload.color`. Workflows use `payload.steps: [{ text, done }]`; tables use `{ columns: [string], rows: [[string]] }`. IDs and timestamps are supplied by the server. The existing `starred` value is preserved without a separate UI.

Limits: 160-character titles; 100,000-character content; 200 workflow steps of up to 2,000 characters; 1–12 table columns and up to 200 rows; 80-character column names and connection labels; 2,000-character cells; 6 MiB ordinary requests. SQL is parameterized. Nonlocal Host headers and cross-origin requests are rejected.

## Current scope

This is a single-user local app. Dims share one world and cannot nest inside other Dims. The renderer draws on changes, caps pixel density at 1.75, and disposes removed resources. Dense scenes can overlap; use search, focus, and placement controls. There is no automatic collision layout, measured performance guarantee, multi-user editing, cloud sync, rich text, attachments, table formulas, or desktop installer. Concurrent edits use the last successful save.

If WebGL is unavailable, the sidebar and full-page editors remain usable. Enable hardware acceleration and reload to restore the 3D view. Desktop mouse and keyboard use is the primary target; touch navigation has not been comprehensively tested.
