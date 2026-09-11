# Verification — Dimention 0.5

September 8, 2026. Windows, Node.js v24.18.0, Vite 7.3.6, and the Codex in-app browser.

## Automated checks

- Production build passes. Application JS is 97.83 kB (32.80 kB gzip), styles 52.98 kB (11.82 kB gzip), Three.js vendor 513.59 kB (128.96 kB gzip). Vite reports its standard vendor chunk size warning; the build succeeds.
- All **32 tests pass**. The three obsolete drawer-motion tests and their unused implementation were removed; eight notebook tests were added to the existing 24 API/store/spatial tests.
- Coverage includes four document types, persistence across server restarts, structured workflows/tables, validation errors, request limits, origin checks, parameterized SQL, Trash/restore, no reseeding, directed connections, and a 100-node graph.
- Spatial checks retain explicit ownership, reserved footprints at all heights, atomic room/group movement, safe restore/import placement, and named area migrations.
- New checks cover Inbox filing, tags/favorites, atomic bulk favorites, one-original references, duplicate/missing destinations, reference restoration, area removal, removal of redundant references on ownership transfer, and non-mutating spatial reference presentation.
- Version 4 export/import remaps reference and context IDs, includes trashed sources, validates before writing, and preserves tags. Working context and project direction survive SQLite restart without changing content timestamps or positions.
- Search covers full workflow text, table content and tags. Safe Markdown preview escapes executable HTML and rejects unsafe link schemes. Reference/context HTTP routes were exercised with valid and invalid requests.

## Browser checks

Writes used **data/notebook-browser-check.sqlite** at localhost:3100. No demo content was inserted into the production database.

- Entered Dims from Quick access; opened Board and List with Desk/Storage sections, readable previews, project direction and resume controls.
- Captured a note into Inbox, verified its count, and filed it into a Dim's Library. Its text remained intact and it left Inbox.
- Pinned that note into another Dim, edited its original through the reference, saved tags and favorite state, and returned to the reference's Dim. Both views displayed the updated content.
- Opened the reference directly from its derived 3D card; the editor identified the reference workspace and original location. Back returned to 3D.
- Verified search by tag content, clearing filters, and sorting by title. Selected two originals and moved both to a Desk; selection cleared after the completed operation.
- Created a named Desk through the new Board UI and verified its empty state and creation controls.
- Checked Markdown headings, bold and lists in reading preview, and checked Focus mode.
- A long note resumed at **scrollTop 1440** after closing, reloading the browser, entering its Dim and choosing Resume. Preview preference also survived reload.
- Attempted to save 13 tags. The UI displayed “Save failed · draft preserved” and the validation message. Back opened the unsaved-changes guard; Keep editing retained the draft, and correcting the tags allowed a successful save.
- Visually inspected desktop 1280×720 and compact 665×675 layouts. Corrected sidebar clipping and the compact project header. The temporary viewport override was reset.
- Visually inspected the aligned 3D platforms and used the Top camera preset. Furniture and drawer animation are absent.

## Performance observations

The separate **data/organizers-perf.sqlite** fixture at localhost:3101 contains 100 items: four Dims, 24 room documents, 72 independent documents, and 99 directed connections.

- World overview: 102 draw calls in the observed frame, 108 texture builds, and 99 edge geometry builds.
- Focused Dim: **14 draw calls**, 19 live geometries and 90 live textures in the observed frame. A camera transition reported 108.7 FPS in its short internal sample; this is not a sustained benchmark.
- After the camera settled at render count 109, switching to Board and searching left render count **109** and texture/geometry counters unchanged. The renderer was idle during document browsing.
- Board initially displayed 60 of the 96 documents. Show more displayed all 96. Searching for Floating document 72 found it even before the second page was shown.
- Performance-tab warning/error logs were empty. The notebook test's rejected tag save generated an expected HTTP 400; it was handled visibly without losing the draft.

These observations are limited to this machine and fixture. They do not establish zero lag at arbitrary scale. Mobile/touch interaction, physical GPU failure, long-duration memory stress, and concurrent multi-user editing were not comprehensively tested. The fallback path remains implemented; this release did not simulate a lost GPU in the browser.

## Existing data and live launch

- Created the consistent SQLite snapshot **backups/pre-v05-1788924602684.sqlite** before the schema change.
- Migrated a copy of that database and compared every original node field across all **13 records**, including Trash. All original values, text, payloads, timestamps, membership and XYZ coordinates matched.
- Launched the production build at **http://localhost:3000** using the project-local **data/dimention.sqlite** database. The workspace API returned the existing active items and connections, and Trash remained intact.
- Repeated the original-field comparison after production startup; all 13 records remained unchanged.
- Opened the existing sample Dim in the served production build. Its Desk and Library showed the existing documents. Production warning/error logs were empty. Navigating the Dim creates working-context metadata only.

## Practical scope

Explicit Save and draft recovery remain in place. Markdown supports a documented subset and does not load external images. Resume stores the reading page's scroll position, not textarea scroll or cursor selection. References have derived presentation positions and cannot be dragged independently. Dims and original documents retain stored XYZ and reserved-space rules. The app remains local, single-user, and without cloud, AI, attachments, or collaboration.
