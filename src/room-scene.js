import * as THREE from "three";
import { zonesOf, zoneCenter } from "../shared/spatial.js";
import { textSprite } from "./scene-art.js";
export const FLOOR_Y = -110;
// Aligned area platforms preserve the original reserved X/Z footprint.
export function createRoom(dim, documents) {
  const group = new THREE.Group(),
    hits = [];
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(1200, 24, 1100),
    new THREE.MeshStandardMaterial({ color: "#303c54", roughness: 0.95 }),
  );
  slab.position.y = FLOOR_Y - 12;
  group.add(slab);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(slab.geometry),
    new THREE.LineBasicMaterial({
      color: dim.payload.color,
      transparent: true,
      opacity: 0.65,
    }),
  );
  outline.position.copy(slab.position);
  group.add(outline);
  for (const zone of zonesOf(dim)) {
    const p = zoneCenter(dim, zone.id),
      count = documents.filter((n) => n.zoneId === zone.id).length;
    const height = 210;
    const area = new THREE.Mesh(
      new THREE.BoxGeometry(520, 6, height - 20),
      new THREE.MeshStandardMaterial({
        color: zone.type === "desk" ? "#484563" : "#304d63",
        roughness: 1,
      }),
    );
    area.position.set(p.x - dim.x, FLOOR_Y + 5, p.z - dim.z);
    area.userData.zone = { dimId: dim.id, zoneId: zone.id };
    group.add(area);
    hits.push(area);
    const label = textSprite(zone.name + " · " + count, "#dce4f4", 360);
    label.position.set(
      p.x - dim.x,
      FLOOR_Y + 40,
      p.z - dim.z - height / 2 + 30,
    );
    label.userData.zone = area.userData.zone;
    group.add(label);
    hits.push(label);
  }
  return { group, hits };
}
