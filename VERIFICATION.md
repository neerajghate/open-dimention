# Verification — Dimention 0.3

## Plane alignment follow-up

The Dim camera now uses an axis-aligned direction with room-aware framing. Desk and Storage share continuous floor columns, a 50-unit grid, and labels oriented on the surface. Added Aligned 3D and Top camera presets. This is a frontend change; saved positions and database content are not migrated.

The live app was also inspected in its narrower 665 × 675 panel. Adjusted the split between canvas and organizer, compacted the toolbar onto one row, and reduced camera padding for short canvases. The final floor stays fully visible above the toolbar in that panel. Broader mobile and touch testing remains outside this check.

Browser checks used the existing separate test database: inspected the aligned room and Top view, navigated from sample to Planning while keeping Top selected, focused Main desk, opened Test Note, and returned to 3D. Checked free orbit, returning to Aligned 3D, and the updated production view. Production build and the 24 existing regression tests passed. No browser console errors were reported. These checks do not repeat the earlier 100-item performance measurement below.

September 7, 2026. Windows, Node.js 24.18.0, and the Codex in-app browser at 1280 × 720. Browser writes used `data/organizers-browser-check.sqlite` on port 3100 and `data/organizers-perf.sqlite` on port 3101. The delivered app uses `data/dimention.sqlite` on port 3000.

## Build and automated checks

`npm run build` succeeds. The application JavaScript is 66.80 kB (23.15 kB gzip); CSS is 38.92 kB (9.07 kB gzip). Vite reports its usual size warning for the Three.js vendor chunk: 508.23 kB (127.72 kB gzip). This is not a failed build.

`npm test`: **24 passed, 0 failed**. Coverage includes:

- All four document types, structured content, positions, export, and persistence across server restart.
- Directed connections, invalid and duplicate endpoints, removal, and visibility through Trash/restore.
- One-time seeding, empty-world preservation, old-schema and legacy workflow migration.
- Invalid payloads, bounded requests, SQL-like content, origins, Host headers, source-path protection, and built frontend delivery.
- A persisted graph of 100 nodes and 99 connections.
- Named Desk/Storage creation, renaming with stable identity, limits, ownership validation, and removal that relocates active and trashed contents without losing relationships.
- Dim membership, explicit assignment into rooms, independent release, numeric and batch positioning, and atomic rollback on invalid boundaries.
- Outsider exclusion at all heights, room-to-room exclusion, and room movement translating its children exactly once.
- Trash/restore across restart, including restoring into occupied space without shifting existing content.
- Version 1/2/3 import preview without writes, append with remapped item IDs, named-area preservation, safe incoming placement, invalid-graph rollback, and imported Trash restoration.
- One-time organizer migration with old Dim payloads and conflicting positions, preserving document content and timestamps.
- HTTP routes for named areas, organization, positions, Trash, restore, and import.

## Browser checks in this update

- Clicked `sample` in Quick access and inspected the isolated Dim view, separate Desk/Storage sections, document counts, and controls.
- Created Desk **This week** and Storage **Research** within that Dim. Selected each through the organizer and inspected the focused area view.
- Searched for **Test Note** in Bring existing and moved it into Research. Renamed Research to **Sources**; its document remained associated with that same area.
- Created and saved workflow **Weekly priorities** in Sources, with a first step **Review the collected sources**. Moved it to This week and verified membership and position through the API.
- Removed Sources and selected Library as the destination. Its documents remained available in Library.
- Created Dim **Planning** and confirmed creation landed directly in its 3D organizer with Main desk and Library.
- Attempted a duplicate Desk name. The server error appeared inside the dialog, the form stayed open, and Cancel remained usable.
- Collapsed the sidebar and clicked the `sample` quick-access icon successfully. Checked the expanded sidebar with four Dims and adjusted its scrolling so search and the document list remain accessible.
- Changed Test Note's **Lives in** to Planning and **Desk or Storage** to Main desk in the full-page editor. Saved successfully; its breadcrumb and Back to 3D view followed the new membership.
- Attempted to save an independent document at coordinates inside Performance room 4. The save was blocked with an ownership explanation, the UI displayed **Save failed · draft preserved**, and Discard returned safely to 3D.
- Followed an outgoing connection from Room 4 document 6 to an independent document, then used Previous and Back to 3D. The breadcrumbs and return view tracked the correct context.
- Clicked a visible 3D route label above a Dim floor and confirmed it opened the connection navigator.
- Inspected the final production organizer and full-page overview. Checked browser console warnings/errors after final launch.

The previous release's detailed table editing, import file chooser, server-offline save recovery, Trash, and placement browser checks are recorded in the version 0.2 verification file in Git commit `c64f24f`. Those are historical checks; current persistence and route regressions are covered by the 24 tests above.

## Rendering smoke test

The disposable fixture contains **100 items: 4 Dims, 24 room documents, and 72 independent documents**, connected by **99 directed links**. Development-only canvas counters expose render calls and resource allocations.

- Initial whole-world counts: 207 textures built, 99 connection objects built, 207 live textures, 216 geometries, and 422 draw calls.
- Repeated zooms through all four Dims reused the same textures and connection objects. A focused room used 32 draw calls.
- Dragging Performance room 4 along X saved its movement without increasing texture or connection build counts.
- After that drag, the render count was 65. Searching and editing an independent document left it at 65 while the 3D scene stayed unchanged/paused.
- Observed camera animation samples were roughly 102–118 frames/second on this browser. These short samples are not a sustained benchmark or a guarantee for other machines. The recorded renderer CPU durations are last-frame snapshots, not averages or GPU timings.

The renderer also skips its idle loop, pauses when the document is hidden, caps device pixel density, caches card content separately from coordinates, updates connection buffers at most once per animation frame during drag, and disposes removed resources. Sprite disposal preserves Three.js's shared sprite geometry.

## Live data preservation and launch

A fresh consistent SQLite backup was taken after stopping the old server and before the production migration:

```text
backups/pre-v03-1788807642253.sqlite
```

The comparison verified **all 11 documents, 1 Dim, and 6 connections**. Original IDs, titles, content, structured document payloads, timestamps, membership, deletion state, and existing metadata matched. The Dim retained its chosen pink color and gained the default named areas. Independent documents remained independent and kept their coordinates.

To avoid covering an existing independent card with the larger reserved footprint, `sample` moved from `(1200, 0, 0)` to `(1450, 0, 50)`. Its Test Desk and Untitled note moved by the same `(250, 0, 50)` delta. No other positions changed. The final layout passed the shared boundary validator. No browser test rooms or documents were inserted into production.

The delivered server listens only on `127.0.0.1:3000`. Health, version 3 export, Trash loading, preserved content, and the final browser interface were verified after launch. Test servers on ports 3100 and 3101 were stopped.

## Limits

Desktop mouse and keyboard are the primary target. Touch, mobile layouts, reduced-motion emulation, and actual GPU context failure were not comprehensively tested in this update. Reduced-motion and WebGL fallback code paths remain implemented.

Independent cards can overlap one another, and densely populated areas may need arrangement. Dim footprints are reserved at all heights; explicit membership is required to enter. There is no nesting, multi-user edit coordination, or guarantee of zero lag at arbitrary scale. Concurrent edits use the last successful save.
