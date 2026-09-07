# Dimention

A small, local workspace for notes, ideas, workflows, and tables arranged in real 3D space. Built directly with JavaScript, Three.js, Vite, Node's HTTP server, and SQLite. No accounts, cloud services, external fonts, AI features, or deployment.

## Run

Requires Node.js 24 or newer (tested with 24.18.0). In PowerShell:

```powershell
cd Dimention
npm ci
npm run build
npm start
```

Open **http://localhost:3000**. The server binds only to `127.0.0.1`. If port 3000 is occupied, it tries the next available port, up to 3020; use the URL printed in the terminal. Stop a foreground server with **Ctrl+C**. For subsequent runs, `npm start` is enough unless you changed the source.

Development uses Vite middleware and its WebSocket on the same local HTTP server:

```powershell
npm run dev
```

Validation:

```powershell
npm run build
npm test
```

Tests use disposable databases in the operating system's temporary directory. They never use the workspace database. Build before tests because the HTTP tests also check the built frontend.

Optional configuration, set before starting:

```powershell
$env:PORT = '3100'
$env:DIMENTION_DB = 'C:\my-local-data\dimention.sqlite'
npm start
```

## Controls and editing

- **Select:** click a card to open its 2D editor. Drag empty space to orbit around the camera target. Dragging a card in Select mode does not move it.
- **Pan:** choose Pan and drag, or use right-drag / middle-drag in any mode. Scroll to zoom.
- **Move:** drag a card in the view plane. Choose X, Y, or **Z · depth** to constrain movement to one world axis. The editor also accepts exact X/Y/Z coordinates between −5000 and 5000. Click **Save changes** to persist a move.
- **Fit all** frames every node. **Reset view** also restores the default viewing angle. **Focus node** centers the selected card.
- Use the sidebar to search titles, note text, workflow steps, table columns, and table cells. Filters narrow the list by type; they do not hide the other cards in space. Press **/** to search when outside a text field.
- Notes and ideas have multiline plain text. Workflows have an ordered, editable checklist. Tables have editable column names and cells, plus row/column addition and removal.
- **Save changes** or **Ctrl/Cmd+S** saves the current node. Unsaved edits trigger a Save / Discard / Keep editing prompt when switching, closing, creating, or exporting. **Escape** closes the editor through the same guard.
- Save failures keep the draft editable. Draft recovery also uses this browser's local storage. Save to SQLite before clearing browser data or moving to another browser; browser draft recovery is a convenience, not a backup.
- Each connection points from the open node to its selected destination. Arrowheads show direction; the editor lists incoming and outgoing links with optional labels. Click a connection's title to follow it. Connections save immediately, separately from node edits. Opposite-direction links are allowed; duplicates in the same direction and self-links are rejected.
- Deleting a node removes its connections and asks for confirmation in the app. There is no undo.
- The export icon at the bottom of the sidebar downloads the saved graph as JSON, after resolving any current unsaved draft.

If WebGL cannot initialize, the sidebar and editors remain available with an explanation. Enable browser hardware acceleration and reload to restore 3D.

## Storage and backup

Default database:

```text
data\dimention.sqlite
```

The schema preserves the preliminary project's `nodes`, `edges`, and `metadata` tables. Workflows now store structured steps in `payload`; existing text-only workflows migrate on startup. Sample data is inserted only once, using a persistent initialization marker. Deleting all nodes keeps the workspace empty on restart.

SQLite uses WAL mode, so `dimention.sqlite-wal` and `dimention.sqlite-shm` can exist beside the database. **For a file backup, stop the server, then copy the entire `data` directory** to another local folder. Do not copy only the main database while the server is running. To restore, stop the server and replace its data directory with your backup. Preserve matching WAL files if present.

JSON export provides a portable, human-readable copy of nodes, payloads, coordinates, timestamps, and connections. JSON import is outside this MVP; restore the SQLite directory to resume a full workspace.

Generated frontend files, dependencies, logs, databases, and test artifacts are excluded from Git. A `data/browser-check.sqlite` database, if present, contains disposable browser-test data and is not used by `npm start`.

## API

All operations are on the same origin. Errors return `{ "error": "A useful message" }` without stack traces.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Local health check |
| GET | `/api/workspace` | `{ nodes, edges }` |
| GET | `/api/export` | Versioned JSON download |
| POST | `/api/nodes` | Create a node |
| PATCH | `/api/nodes/:id` | Update node fields |
| DELETE | `/api/nodes/:id` | Delete a node and its edges |
| POST | `/api/connections` | Create `{ source, target, label? }` |
| DELETE | `/api/connections/:id` | Delete a connection |

Node types: `note`, `idea`, `workflow`, `table`. Core fields: `title`, `content`, `payload`, `x`, `y`, `z`. The existing `starred` field is preserved, but has no separate UI in this MVP. The server supplies IDs and timestamps. Workflows use `payload.steps: [{ text, done }]`; tables use `payload: { columns: [string], rows: [[string]] }`.

Limits: title 160 characters; content 100,000; 200 workflow steps with 2,000 characters each; tables 1–12 columns and up to 200 rows; column names 80 characters; cells 2,000; connection labels 80; JSON requests 6 MiB. SQL statements are parameterized; foreign keys enforce connection cleanup. The server rejects nonlocal Host headers and cross-origin requests.

## Practical limits

This is a single-user desktop MVP aimed at roughly 100 nodes. Cards can overlap or appear small when zoomed far out; use the list, Focus, and position controls. There is no automatic layout or collision avoidance. Multi-tab concurrent editing is not coordinated: the last successful save wins. Keep one editing tab open.

The renderer draws on camera/input/data changes instead of running an idle animation loop, caps pixel density at 1.75, and disposes removed textures, geometries, and materials. Three.js accounts for most of the approximately 140 KiB compressed JavaScript. The production build may report its vendor chunk slightly above Vite's 500 kB uncompressed warning threshold.

This version intentionally omits collaboration, authentication, cloud sync, rich text, relational formulas, attachments, JSON import, and a packaged desktop executable.
