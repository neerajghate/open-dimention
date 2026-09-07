# Verification — September 7, 2026

Run on Windows with Node.js 24.18.0, using the Codex in-app browser at a 1280 × 720 viewport. All browser writes used separate test databases, leaving the delivered sample workspace clean.

## Automated

`npm run build` succeeds. `npm test` passes all eight integration tests:

1. Four node types: create/update, full content and coordinate persistence through server restart, and JSON export equality.
2. Directed connections: duplicate/self/missing-node rejection, reverse directions, removal, and cascading node deletion.
3. First-run seeding, restart without duplicate seeds, and an empty workspace remaining empty after deletion and restart.
4. Invalid node, workflow, and table data returns controlled errors without writes.
5. SQL-like content is safely stored, and partial coordinate updates preserve structured content.
6. Request-size limits, malformed JSON, content types, cross-origin requests, Host validation, private source paths, and built frontend serving.
7. Migration of the preliminary text-only workflow payload to structured steps.
8. A 100-node, 99-connection workspace persists; deleting its middle node removes both affected edges.

## Browser interactions exercised

- Created, edited, saved, reopened, and deleted notes, ideas, workflows, and tables.
- Added/edited/completed/removed workflow steps; added/removed table rows and columns; changed names and cell values.
- Clicked a rendered 3D card to open the editor; orbited, panned, zoomed, and used fit/focus controls.
- Dragged a card along Z: depth changed from −30 to 190 while X/Y remained unchanged. Saved coordinates survived refresh and server restart.
- Searched note text and table cells; filtered by type; opened matching nodes.
- Created and followed a labeled connection, viewed its incoming direction, rejected a duplicate, and removed the connection.
- Exercised unsaved-change guarding with Save & continue and Discard. Export after Discard restored the saved editor text.
- Stopped the local server during a save. The draft remained editable, recovered in a fresh browser page, saved after restart, and persisted through refresh.
- Triggered JSON export through the UI; the API tests verify its graph contents.
- Loaded and interacted with a 100-node scene. No console warnings or errors were reported during that check. This is a smoke test, not a measured frame-rate benchmark.
- Started the development command and verified an empty workspace.
- Temporarily simulated a WebGL constructor failure in the development source, verified the explanation and usable list/editor, and saved a note through the fallback. Removed the simulation afterward. Actual hardware failure was not induced.

Two issues found during verification were fixed: the previous editor briefly accepting input while a new node was being created, and the editor not reverting discarded text when exporting. Camera framing was also tightened after visual inspection.

The 3D view deliberately has no collision avoidance or automatic layout. Dense graphs can overlap, and distant titles become small; the searchable list and focus controls remain available. Mobile/touch interaction was not comprehensively tested. Concurrent multi-tab editing is outside the MVP.
