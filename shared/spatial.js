// Shared by SQLite validation and the 3D interaction layer. X/Z footprints
// reserve a Dim's space at every height, so outsiders cannot float through it.
export const ROOM = Object.freeze({
  halfWidth: 600,
  halfDepth: 550,
  cardRadius: 135,
  gap: 55,
});
export const defaultZones = () => [
  { id: "desk", name: "Main desk", type: "desk" },
  { id: "storage", name: "Library", type: "storage" },
];
export const zonesOf = (dim) => dim?.payload?.zones ?? defaultZones();
export const zoneOf = (dim, id, area = "storage") =>
  zonesOf(dim).find((z) => z.id === id) ??
  zonesOf(dim).find((z) => z.type === area);
export function zoneCenter(dim, zoneId) {
  const zone = zoneOf(dim, zoneId);
  const siblings = zonesOf(dim).filter((z) => z.type === zone.type);
  return {
    x: dim.x + (zone.type === "desk" ? -285 : 285),
    y: dim.y,
    z: dim.z - 330 + siblings.findIndex((z) => z.id === zone.id) * 220,
  };
}
export function slotPosition(dim, zoneId, count = 0) {
  const p = zoneCenter(dim, zoneId);
  return {
    x: p.x + (count % 2 ? 120 : -120),
    y: Math.min(4800, p.y + 85 + Math.floor(count / 2) * 155),
    z: p.z,
  };
}
export function insideRoom(doc, dim, inset = -ROOM.cardRadius) {
  return (
    Math.abs(doc.x - dim.x) < ROOM.halfWidth + inset &&
    Math.abs(doc.z - dim.z) < ROOM.halfDepth + inset
  );
}
export function positionProblem(node, nodes) {
  if (
    ["x", "y", "z"].some(
      (k) => !Number.isFinite(node[k]) || Math.abs(node[k]) > 5000,
    )
  )
    return "Coordinates must stay between -5000 and 5000.";
  const rooms = nodes.filter(
    (n) => n.type === "dim" && !n.deletedAt && n.id !== node.id,
  );
  if (node.type === "dim") {
    if (
      rooms.some(
        (r) =>
          Math.abs(node.x - r.x) < ROOM.halfWidth * 2 + ROOM.gap &&
          Math.abs(node.z - r.z) < ROOM.halfDepth * 2 + ROOM.gap,
      )
    )
      return "Dims need their own space. Move this room farther from the other Dim.";
    if (
      nodes.some(
        (n) =>
          n.type !== "dim" &&
          !n.deletedAt &&
          n.dimId !== node.id &&
          insideRoom(n, node, ROOM.cardRadius),
      )
    )
      return "This Dim would cover unrelated content. Choose an open space first.";
  } else {
    if (node.dimId) {
      const parent = rooms.find((r) => r.id === node.dimId);
      if (!parent) return "Choose an available Dim.";
      if (!insideRoom(node, parent))
        return "Keep documents inside their Dim. Use Move to… to change their home.";
    }
    const other = rooms.find(
      (r) => r.id !== node.dimId && insideRoom(node, r, ROOM.cardRadius),
    );
    if (other)
      return `That space belongs to “${other.title}”. Assign the document to a Desk or Storage to bring it inside.`;
  }
  return null;
}
export function layoutProblem(nodes) {
  const active = nodes.filter((n) => !n.deletedAt);
  // Room-to-room overlap takes priority, then explain a document's ownership.
  const rooms = active.filter((n) => n.type === "dim");
  for (const n of rooms) {
    const error = positionProblem(n, rooms);
    if (error) return error;
  }
  for (const n of active.filter((n) => n.type !== "dim")) {
    const error = positionProblem(n, active);
    if (error) return error;
  }
  return null;
}
export function freePosition(node, nodes) {
  const base = {
    ...node,
    x: Math.max(-4900, Math.min(4900, node.x || 0)),
    y: Math.max(-4800, Math.min(4800, node.y || 0)),
    z: Math.max(-4900, Math.min(4900, node.z || 0)),
  };
  const candidates = [{ x: base.x, y: base.y, z: base.z }];
  for (const dim of nodes.filter(
    (n) => n.type === "dim" && n.id !== node.id && !n.deletedAt,
  )) {
    const dx =
      ROOM.halfWidth +
      (node.type === "dim" ? ROOM.halfWidth + ROOM.gap : ROOM.cardRadius + 5);
    const dz =
      ROOM.halfDepth +
      (node.type === "dim" ? ROOM.halfDepth + ROOM.gap : ROOM.cardRadius + 5);
    for (const x of [dim.x - dx, dim.x + dx])
      candidates.push({ x, y: base.y, z: base.z });
    for (const z of [dim.z - dz, dim.z + dz])
      candidates.push({ x: base.x, y: base.y, z });
  }
  for (let z = -4500; z <= 4500; z += 350)
    for (let x = -4500; x <= 4500; x += 350)
      candidates.push({ x, y: base.y, z });
  candidates.sort(
    (a, b) =>
      (a.x - base.x) ** 2 +
      (a.z - base.z) ** 2 -
      ((b.x - base.x) ** 2 + (b.z - base.z) ** 2),
  );
  const found = candidates.find(
    (p) => !positionProblem({ ...base, ...p }, nodes),
  );
  if (!found)
    throw new Error(
      "There is no clear room at this position. Move a Dim to make more space.",
    );
  return found;
}
export function planSpatialLayout(input, movableIds) {
  const nodes = input.filter((n) => !n.deletedAt).map((n) => ({ ...n })),
    movable = new Set(movableIds);
  if (nodes.filter((n) => n.type === "dim").length > 64)
    throw new Error(
      "This world supports up to 64 Dims. Import fewer rooms or keep their documents independent.",
    );
  for (const dim of nodes.filter(
    (n) => n.type === "dim" && movable.has(n.id),
  )) {
    if (!positionProblem(dim, nodes)) continue;
    const p = freePosition(dim, nodes),
      delta = { x: p.x - dim.x, y: p.y - dim.y, z: p.z - dim.z };
    Object.assign(dim, p);
    for (const child of nodes.filter((n) => n.dimId === dim.id))
      Object.assign(child, {
        x: child.x + delta.x,
        y: Math.max(-5000, Math.min(5000, child.y + delta.y)),
        z: child.z + delta.z,
      });
  }
  for (const n of nodes.filter((n) => n.type !== "dim" && movable.has(n.id))) {
    if (!positionProblem(n, nodes)) continue;
    const parent = nodes.find((p) => p.id === n.dimId),
      count = nodes
        .filter((p) => p.dimId === n.dimId && p.zoneId === n.zoneId)
        .indexOf(n);
    Object.assign(
      n,
      parent
        ? slotPosition(parent, n.zoneId, Math.max(0, count))
        : freePosition(n, nodes),
    );
  }
  const problem = layoutProblem(nodes);
  if (problem) throw new Error(problem);
  return nodes;
}
