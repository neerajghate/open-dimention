import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ROOM, zonesOf, zoneCenter } from "../shared/spatial.js";
import { surfaceLabel, textSprite, palette } from "./scene-art.js";
import { Motion } from "./motion.js";

export const FLOOR_Y = -110;

// Merge stationary furniture by finish: many solid pieces, few draw calls.
function builder(group) {
  const batches = new Map();
  return {
    box(size, position, color, rotation = 0) {
      const geometry = new THREE.BoxGeometry(...size);
      geometry.rotateY(rotation);
      geometry.translate(...position);
      if (!batches.has(color)) batches.set(color, []);
      batches.get(color).push(geometry);
    },
    finish() {
      for (const [color, parts] of batches) {
        const geometry = mergeGeometries(parts);
        parts.forEach((part) => part.dispose());
        group.add(
          new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              color,
              roughness: 0.78,
              metalness: 0.07,
            }),
          ),
        );
      }
    },
  };
}
function box(size, position, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.12 }),
  );
  mesh.position.set(...position);
  return mesh;
}
function contactShadow(width, depth) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d"),
    gradient = ctx.createRadialGradient(32, 32, 9, 32, 32, 32);
  gradient.addColorStop(0, "rgba(6,10,20,.4)");
  gradient.addColorStop(1, "rgba(6,10,20,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

export function createRoom(dim, documents) {
  const group = new THREE.Group(),
    staticParts = builder(group),
    hits = [],
    storage = new Map();
  const wood = "#c5a98b",
    metal = "#313e54",
    wall = "#728094",
    floor = "#b3b6c0",
    accent = dim.payload.color;
  staticParts.box([1200, 34, 1100], [0, FLOOR_Y - 17, 0], "#424f65");
  staticParts.box([1188, 8, 1088], [0, FLOOR_Y + 4, 0], floor);
  // Low side walls and an open front preserve navigation into the room.
  staticParts.box([1200, 215, 20], [0, FLOOR_Y + 108, -540], wall);
  staticParts.box([20, 115, 1100], [-590, FLOOR_Y + 58, 0], wall);
  staticParts.box([20, 65, 1100], [590, FLOOR_Y + 33, 0], "#647287");
  staticParts.box([1160, 6, 6], [0, FLOOR_Y + 17, -522], accent);
  staticParts.box([1160, 8, 22], [0, FLOOR_Y + 4, 535], "#e1d3bd");
  // A pair of soft rugs defines the same aligned Desk and Storage lanes.
  staticParts.box([520, 3, 970], [-285, FLOOR_Y + 9, 0], "#8886a2");
  staticParts.box([520, 3, 970], [285, FLOOR_Y + 9, 0], "#698d9b");
  const gridPoints = [];
  for (let x = -550; x <= 550; x += 50)
    gridPoints.push(x, FLOOR_Y + 9, -500, x, FLOOR_Y + 9, 500);
  for (let z = -500; z <= 500; z += 50)
    gridPoints.push(-550, FLOOR_Y + 9, z, 550, FLOOR_Y + 9, z);
  group.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(gridPoints, 3),
      ),
      new THREE.LineBasicMaterial({
        color: "#475267",
        transparent: true,
        opacity: 0.2,
      }),
    ),
  );

  for (const zone of zonesOf(dim)) {
    const p = zoneCenter({ ...dim, x: 0, y: 0, z: 0 }, zone.id),
      zoneData = { dimId: dim.id, zoneId: zone.id };
    const members = documents.filter((n) => n.zoneId === zone.id);
    const shadow = contactShadow(520, 235);
    shadow.position.set(p.x, FLOOR_Y + 11, p.z + 10);
    group.add(shadow);
    const furniture = new THREE.Group();
    furniture.position.set(p.x, 0, p.z);
    group.add(furniture);
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(465, zone.type === "storage" ? 255 : 165, 185),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(0, zone.type === "storage" ? 18 : -22, 0);
    hit.userData.zone = zoneData;
    furniture.add(hit);
    hits.push(hit);
    if (zone.type === "desk") {
      const desk = builder(furniture);
      desk.box([450, 16, 166], [0, 40, 0], wood);
      for (const x of [-199, 199])
        for (const z of [-60, 60]) desk.box([12, 135, 12], [x, -36, z], metal);
      desk.box([380, 10, 8], [0, -35, -61], metal);
      desk.box([118, 7, 72], [45, 52, -13], "#38465c");
      desk.box([75, 4, 22], [45, 58, 39], "#d7dce4");
      desk.box([8, 65, 9], [-153, 80, -53], metal);
      desk.box([77, 7, 30], [-124, 113, -53], "#ecd7ad");
      desk.box([52, 4, 40], [-156, 51, -53], metal);
      desk.box([54, 8, 68], [-62, 54, 13], "#e4dce6");
      // Seat and its support make the desk readable in perspective.
      desk.box([76, 12, 65], [0, -27, 123], "#424964");
      desk.box([76, 58, 10], [0, 3, 157], "#424964");
      for (const x of [-26, 26])
        for (const z of [100, 143]) desk.box([7, 68, 7], [x, -64, z], metal);
      desk.finish();
    } else {
      const cabinet = builder(furniture);
      cabinet.box([440, 14, 178], [0, -94, 0], metal);
      cabinet.box([440, 16, 178], [0, 142, 0], wood);
      cabinet.box([16, 230, 178], [-212, 24, 0], metal);
      cabinet.box([16, 230, 178], [212, 24, 0], metal);
      cabinet.box([416, 230, 12], [0, 24, -83], "#202d43");
      cabinet.box([420, 8, 150], [0, 23, 0], metal);
      cabinet.finish();
      const drawers = [];
      for (let level = 0; level < 2; level++) {
        const drawer = new THREE.Group();
        drawer.position.y = -79 + level * 114;
        const tray = builder(drawer);
        tray.box([401, 8, 143], [0, 0, 0], "#71879c");
        tray.box([401, 94, 13], [0, 44, 78], "#abc0cc");
        tray.box([401, 49, 8], [0, 23, -68], "#637f92");
        for (const x of [-196, 196])
          tray.box([9, 49, 139], [x, 23, 0], "#637f92");
        tray.box([87, 9, 12], [0, 47, 91], "#d4b37e");
        tray.box([47, 18, 2], [0, 72, 86], "#e9eced");
        tray.finish();
        furniture.add(drawer);
        const folders = new THREE.Group();
        drawer.add(folders);
        const drawerMembers = members.filter((_, index) => index % 2 === level);
        const amount = Math.min(12, drawerMembers.length);
        if (amount) {
          const books = new THREE.InstancedMesh(
            new THREE.BoxGeometry(26, 66, 84),
            new THREE.MeshStandardMaterial({ roughness: 0.82 }),
            amount,
          );
          const matrix = new THREE.Matrix4();
          for (let i = 0; i < amount; i++) {
            matrix.makeTranslation((i - (amount - 1) / 2) * 31, 38, -3);
            books.setMatrixAt(i, matrix);
            books.setColorAt(
              i,
              new THREE.Color(palette[drawerMembers[i].type]),
            );
          }
          folders.add(books);
        }
        drawers.push({ group: drawer, folders });
      }
      const glow = box([396, 4, 7], [0, 132, 80], "#94d6d7");
      glow.material.emissive.set("#538d97");
      glow.material.emissiveIntensity = 0.12;
      furniture.add(glow);
      storage.set(zone.id, { motion: new Motion(), drawers, glow });
    }
    const label = surfaceLabel(
      `${zone.type === "desk" ? "DESK" : "STORAGE"} / ${zone.name}`,
      zone.type === "desk" ? "#eeeaf5" : "#e1f1f4",
      420,
    );
    label.position.set(p.x, FLOOR_Y + 13, p.z + 189);
    label.userData.zone = zoneData;
    group.add(label);
    hits.push(label);
  }
  // An architectural room nameplate replaces the impression of a loose plane.
  const name = textSprite(dim.title, "#f0e6d6", 340);
  name.position.set(0, 64, -523);
  group.add(name);
  staticParts.finish();
  group.position.set(dim.x, dim.y, dim.z);
  return {
    group,
    hits,
    storage,
    setOpen(zoneId, force, instant = false) {
      const now = performance.now();
      for (const [id, cabinet] of storage)
        cabinet.motion.set(force || id === zoneId ? 1 : 0, now, instant);
    },
    advance(now, instant = false) {
      let moving = false;
      for (const cabinet of storage.values()) {
        if (instant) cabinet.motion.set(cabinet.motion.target, now, true);
        moving = cabinet.motion.tick(now) || moving;
        const p = cabinet.motion.value;
        cabinet.drawers.forEach((drawer, index) => {
          const stagger = index === 0 ? p : Math.max(0, (p - 0.12) / 0.88);
          drawer.group.position.z = stagger * (index === 0 ? 99 : 77);
          drawer.folders.position.y = stagger * 20;
          drawer.folders.rotation.x = -stagger * 0.08;
        });
        cabinet.glow.material.emissiveIntensity = 0.12 + p * 0.8;
      }
      return moving;
    },
    progress(zoneId) {
      return storage.get(zoneId)?.motion.value ?? 1;
    },
  };
}
