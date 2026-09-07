# Verification — Dimention 0.4

September 7, 2026. Windows, Node.js 24.18.0, and the Codex in-app browser. Browser writes used `data/organizers-browser-check.sqlite` on port 3100. The 100-item rendering fixture used `data/organizers-perf.sqlite` on port 3101. Production remains on `data/dimention.sqlite`, port 3000.

## Build and automated checks

`npm run build` succeeds. Application JavaScript: 80.06 kB (27.86 kB gzip). CSS: 40.16 kB (9.38 kB gzip). The Three.js vendor chunk is 515.55 kB (129.38 kB gzip), producing Vite's usual size warning, not a build failure.

`npm test`: **27 passed, 0 failed**. The existing 24 tests cover document types, saved payloads, connections, persistence, seeding, validation, HTTP boundaries, named areas, reserved-space constraints, group movement, Trash/restore, version 1/2/3 import, and old-schema migration. Three new tests check:

- A Storage animation reaches its exact target and stops requesting frames.
- Reversing midway preserves its current position and finishes closed.
- Reduced-motion settling works immediately, including during an interrupted opening.

## Browser interaction checks

- Inspected the cutaway room at 1280 × 720: raised floor, low walls, aligned rugs, desks, chairs, lamps, and two-drawer cabinets have actual mesh geometry and directional shading.
- Clicked the cabinet in 3D to select Library. Saw its drawers slide out, folder blocks rise, and the note appear above the cabinet. The organizer showed the correct contents and Close Storage control.
- Closed Storage and confirmed its document tucked away. Reversed a closing animation by reopening the area midway; it settled open without snapping.
- Opened a stored note directly from the sidebar while its cabinet was closed. Its cabinet opened before the full-page editor appeared. The correct title loaded; Back to 3D returned to the open Storage.
- Used Move mode to expose stored documents. Dragged Untitled note along X in the test database: X changed from 1855 to 1761, while Y stayed 85 and Z stayed -280. This confirms the raised presentation is not added to saved coordinates. The change exists only in the test database.
- Checked Aligned 3D and Top alongside the new default Room view.
- Followed Route 7 from Room 1 document 6 to Performance room 2. The full-page Dim and Back to 3D return both showed the correct destination.
- Reloaded production only after verifying there was no open draft. Inspected the furnished Dim and opened its Storage in the app's 665 × 675 panel. No browser warning/error logs were reported during final checks.

## Rendering smoke test

The fixture contains **100 items: 4 Dims, 24 room documents, and 72 independent documents**, with **99 connections**. Development-only canvas attributes report rendering and allocation counters.

- The initial whole-world furnished scene used 487 draw calls.
- Opening one Storage used 48 draw calls in its focused view. One short camera sample measured about 89 frames/second on this browser; this is not a sustained benchmark or a guarantee for other machines.
- Initial reveals warm previously hidden document textures and connection labels. After warming, a complete close/open cycle kept **206 texture builds, 99 connection builds, 197 live textures, and 327 geometries** unchanged.
- Settled Storage reported progress 1.000 and animation false; closed Storage reported progress 0.000 and animation false. Searching left the render count unchanged at 192 in one observed idle check.
- A smaller-room sequence also retained 32 texture builds, 6 connection builds, 32 live textures, and 98 geometries across repeated opening, closing, editor navigation, and reversal.

Static furniture is merged by finish, folder blocks use instancing, and lighting uses no expensive real-time shadow maps. Soft contact shadows are generated locally. Animation shares the demand renderer and ends when settled. Full-page editing and hidden documents pause rendering. Instanced mesh buffers, owned geometries, materials, and textures are disposed when replaced; shared sprite geometry is retained.

## Data and launch

This release changes frontend rendering and presentation only. There is no database migration or live placement rewrite. Storage animation does not send position writes. The live workspace still showed one active Dim, eleven active documents, and six connections during the check; its existing Trash remained available. Production was not used for test writes.

The existing local server serves the new build at `http://localhost:3000`. The test servers on ports 3100 and 3101 were stopped after verification. The version 0.3 migration backup and preservation record remain in local `backups/` and ignored `data/` files. Earlier verification is available in Git commit `bfbc391`.

## Limits

Room furniture is a stylized cutaway representation. Cards rise above furniture for reading and return to Storage when it closes; numeric coordinates remain saved placement anchors. Closed cards and their 3D connection lines are tucked away, while the sidebar and global connection navigator retain access to the full graph. Each cabinet previews at most 24 folder blocks; the organizer lists all documents.

Reduced-motion behavior was tested at the motion-controller level, not through browser OS emulation. Broad mobile/touch testing and actual GPU failure were not performed. The smaller app panel was visually checked. Performance depends on hardware and scene density; there is no guarantee of zero lag at arbitrary scale. Reserved-space rules, local-only persistence, and the existing single-user scope remain in effect.
