# Verification — Dimention 0.2

September 7, 2026. Windows, Node.js 24.18.0, and the Codex in-app browser at 1280 × 720. Browser writes used a separate copy of the original database at `data/dims-browser-check.sqlite` on port 3100. The delivered app uses `data/dimention.sqlite` on port 3000.

## Build and automated checks

`npm run build` succeeds. Vite reports the Three.js vendor chunk at 508.49 kB (127.78 kB gzip), slightly above its default size warning threshold. The application chunk is 49.79 kB (17.53 kB gzip). This is a size warning, not a failed build.

`npm test`: **15 passed, 0 failed**. The suite covers:

- All four document types, structured data, positions, export, and persistence across server restart.
- Directed links, duplicate/self/missing-endpoint rejection, link removal, and hiding links to trashed nodes.
- One-time seeding, preservation of an empty world, and legacy workflow migration.
- Invalid payload rejection, parameterized SQL, bounded requests, origins, Host headers, source-path protection, and serving the built frontend.
- A persistent graph of 100 nodes and 99 connections. This checks data integrity, not rendering frame rate.
- Dims with Desk and Storage membership, independent documents, and links between rooms/documents.
- Room movement carrying children, selection without double translation, and atomic rollback at coordinate bounds.
- Trash and restore across restart, including prior independent trash, room membership, positions, payloads, and connection visibility.
- Version 1/2 import preview without writes, append with remapped IDs, preserved timestamps, invalid-graph rejection without partial writes, and restoration of imported Trash.
- Migration of an actual old-schema SQLite file without changing original content, positions, or timestamps.
- HTTP routes for organization, multi-item positioning, Trash, restore, and import.

## Browser checks on the new interface

- Created **Design studio** and **Research room** Dims in the same world. Inspected the room geometry, Desk/Storage platforms, cards, and connections visually.
- Added **Launch checklist** to a Desk, edited its first step and completion state, and saved. Added **Design references** to Storage and saved its text.
- Opened documents into the full-page editor and returned to 3D. Inspected the transition and finished editor layout; reduced-motion handling is implemented but was not separately emulated.
- Created and followed the labeled connection from the reference document to the workflow. Confirmed its incoming direction and Previous navigation.
- Connected the two Dims, searched the global connection navigator by relationship, and followed a room from that route.
- Trashed Design studio with its two documents, then restored the room from Trash. All three items and their connections returned.
- Selected both documents, snapped to the grid, aligned X, and applied a numeric Z offset. Verified their saved coordinates through the API.
- Assigned the two documents to Research room's Desk. Verified both their membership and physical placement, and reopened the room overview showing Desk 2 / Storage 0.
- Dragged Research room along Z in the canvas: the room and both documents moved by +88 while X/Y stayed unchanged. Invoked Undo move.
- Imported the supplied JSON fixture through the file chooser. Its preview showed two items, one Dim, and one connection. Confirmed the additional room and document appeared while all existing test items remained.
- Exercised Keep editing and Discard on a changed note when returning to 3D.
- Added/removed table rows and columns, changed a column name and cell value, saved, reloaded, and verified the saved cell and column in the UI.
- Stopped the test server during an idea save. The UI reported “Save failed · draft preserved” and remained editable. After restart, the same draft saved successfully and survived reload.
- Collapsed the sidebar, reloaded, and verified its collapsed preference persisted.
- Checked the final editor and production world visually. The final browser console reported no warnings or errors.

## Actual data preservation and launch

A consistent SQLite backup was taken with Node's native backup API before the live migration:

```text
backups/pre-v02-1788803138255.sqlite
```

After restarting with version 0.2, a comparison checked **all original fields of all 9 documents**, all **6 connections**, and the metadata table against the snapshot. Everything matched, including titles, content, structured payloads, coordinates, IDs, and timestamps. New membership fields default to independent documents and active status. Browser test rooms were not inserted into this database.

The delivered server listens on `127.0.0.1:3000`. Health, version 2 export, the new browser interface, and existing content were verified after launch.

## Limits of verification

The primary target is desktop mouse and keyboard. Touch, mobile layouts, reduced-motion emulation, and actual GPU context failure were not comprehensively tested in this update. The WebGL fallback keeps the list and editors available; its code path was reviewed. The initial MVP's simulated WebGL-failure check is not a claim of testing hardware failure in this version.

Dense scenes can overlap and distant titles can be small. There is no automatic collision layout or measured frame-rate guarantee. Dims share one world without nesting. Multiple editors are not coordinated; the last successful save wins.
