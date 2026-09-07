import * as THREE from "three";
export const palette = {
  note: "#699fff",
  idea: "#ecad62",
  workflow: "#a496ff",
  table: "#58b8c9",
  dim: "#8580ff",
};
export const typeNames = {
  note: "Note",
  idea: "Idea",
  workflow: "Workflow",
  table: "Table",
  dim: "Dim",
};
export function preview(n) {
  if (n.type === "workflow")
    return (n.payload.steps || [])
      .map((s) => `${s.done ? "✓" : "○"} ${s.text}`)
      .join("\n");
  if (n.type === "table")
    return `${n.payload.columns.join(" · ")}\n${n.payload.rows.length} rows · ${n.content}`;
  return n.content;
}
function lines(ctx, text, width, max) {
  const result = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if (ctx.measureText(line + word).width > width && line) {
      result.push(line.trim());
      line = "";
    }
    line += word + " ";
  }
  if (line.trim()) result.push(line.trim());
  return result.slice(0, max).map((s, i) => {
    if (i === max - 1 && result.length > max) s += "…";
    while (ctx.measureText(s).width > width && s.length > 1)
      s = s.slice(0, -2) + "…";
    return s;
  });
}
function texture(width, height, draw) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}
export function card(n, selected, count) {
  return texture(512, 270, (ctx) => {
    ctx.scale(512 / 720, 270 / 380);
    const dim = n.type === "dim",
      color = dim ? n.payload.color : palette[n.type];
    ctx.fillStyle = dim ? "#252b45" : "#f9faff";
    ctx.beginPath();
    ctx.roundRect(8, 8, 704, 360, 23);
    ctx.fill();
    ctx.lineWidth = selected ? 7 : 2;
    ctx.strokeStyle = selected ? "#a79fff" : dim ? color : "#d7dcec";
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(38, 38, 11, 25, 4);
    ctx.fill();
    ctx.font = "600 23px Segoe UI";
    ctx.fillText(
      dim ? "DIM / YOUR ROOM" : typeNames[n.type].toUpperCase(),
      65,
      60,
    );
    ctx.fillStyle = dim ? "#ffffff" : "#20273c";
    ctx.font = "600 42px Segoe UI";
    const title = lines(ctx, n.title, 630, 2);
    title.forEach((s, i) => ctx.fillText(s, 38, 119 + i * 46));
    ctx.fillStyle = dim ? "#b5bdd5" : "#737c95";
    ctx.font = "28px Segoe UI";
    lines(
      ctx,
      dim
        ? `${count} documents · Desk & Storage`
        : preview(n).slice(0, 360) || "Room for a new thought.",
      630,
      2,
    ).forEach((s, i) =>
      ctx.fillText(s, 38, (title.length > 1 ? 213 : 182) + i * 37),
    );
    ctx.fillStyle = dim ? "#a4adcc" : "#969db1";
    ctx.font = "22px Segoe UI";
    ctx.fillText(
      dim
        ? "Zoom to Dim  ↗"
        : n.dimId
          ? `${n.area === "desk" ? "DESK" : "STORAGE"} · Click to open`
          : "INDEPENDENT · Click to open",
      38,
      336,
    );
  });
}
export function textSprite(text, color = "#b5beda", scale = 220) {
  const t = texture(720, 96, (ctx) => {
    ctx.font = "600 36px Segoe UI";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(lines(ctx, text, 680, 1)[0] || "", 360, 61);
  });
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }),
  );
  s.scale.set(scale, (scale * 96) / 720, 1);
  return s;
}
export function surfaceLabel(text, color, width = 430) {
  const map = texture(720, 96, (ctx) => {
    ctx.font = "600 32px Segoe UI";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(lines(ctx, text, 680, 1)[0] || "", 360, 60);
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(width, (width * 96) / 720),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  label.rotation.x = -Math.PI / 2;
  return label;
}
export function dispose(obj) {
  obj.traverse((o) => {
    // Instanced folder meshes own GPU buffers beyond their geometry.
    if (o.isInstancedMesh) o.dispose();
    // Three.js sprites share one geometry; disposing it churns buffers used by
    // every surviving card and label. Mesh and line geometries are owned here.
    if (!o.isSprite) o.geometry?.dispose();
    for (const m of o.material
      ? Array.isArray(o.material)
        ? o.material
        : [o.material]
      : []) {
      m.map?.dispose();
      m.dispose();
    }
  });
}
