import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
  return t;
}
function card(n, selected, count) {
  return texture(720, 380, (ctx) => {
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
        : preview(n) || "Room for a new thought.",
      630,
      2,
    ).forEach((s, i) =>
      ctx.fillText(s, 38, (title.length > 1 ? 213 : 182) + i * 37),
    );
    ctx.fillStyle = dim ? "#a4adcc" : "#969db1";
    ctx.font = "22px Segoe UI";
    ctx.fillText(
      dim
        ? "Enter Dim  ↗"
        : n.dimId
          ? `${n.area === "desk" ? "DESK" : "STORAGE"} · Click to open`
          : "INDEPENDENT · Click to open",
      38,
      336,
    );
  });
}
function textSprite(text, color = "#b5beda", scale = 220) {
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
function dispose(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
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
function room(n) {
  const g = new THREE.Group(),
    color = n.payload.color;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(960, 6, 670),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    }),
  );
  floor.position.y = -120;
  g.add(floor);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(960, 6, 670)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }),
  );
  outline.position.copy(floor.position);
  g.add(outline);
  g.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        [
          [-480, -116, -335],
          [-480, 160, -335],
          [480, 160, -335],
          [480, -116, -335],
        ].map((p) => new THREE.Vector3(...p)),
      ),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.24 }),
    ),
  );
  const divider = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -113, -300),
      new THREE.Vector3(0, -113, 300),
    ]),
    new THREE.LineDashedMaterial({
      color: "#9aa3c1",
      dashSize: 12,
      gapSize: 12,
      transparent: true,
      opacity: 0.35,
    }),
  );
  divider.computeLineDistances();
  g.add(divider);
  for (const [label, x] of [
    ["DESK / EXECUTE", -240],
    ["STORAGE / COLLECT", 240],
  ]) {
    const s = textSprite(label, color, 240);
    s.position.set(x, -105, 285);
    g.add(s);
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(260, 20, 145),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13 }),
    );
    desk.position.set(x, -103, 0);
    g.add(desk);
  }
  g.position.set(n.x, n.y, n.z);
  return g;
}
export function createWorkspaceScene(container, callbacks) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor("#121724");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "3D world. Use the sidebar for keyboard access to all items.",
  );
  container.append(canvas);
  const world = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(43, 1, 1, 40000);
  camera.position.set(650, 630, 1800);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minDistance = 180;
  controls.maxDistance = 26000;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };
  const grid = new THREE.GridHelper(14000, 140, "#313d59", "#232c40");
  grid.position.y = -340;
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  world.add(grid);
  let frame = 0,
    nodes = [],
    edges = [],
    selected = new Set(),
    mode = "select",
    axis = "screen",
    snap = false,
    gesture = null,
    linkGroup = new THREE.Group(),
    edgeHits = [];
  world.add(linkGroup);
  const sprites = new Map(),
    rooms = new Map();
  function render() {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderer.render(world, camera);
      });
  }
  controls.addEventListener("change", render);
  const resize = () => {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  function drawEdges() {
    world.remove(linkGroup);
    dispose(linkGroup);
    linkGroup = new THREE.Group();
    world.add(linkGroup);
    edgeHits = [];
    for (const e of edges) {
      const source = sprites.get(e.source),
        target = sprites.get(e.target);
      if (!source || !target) continue;
      const a = source.position,
        b = target.position,
        delta = b.clone().sub(a);
      if (delta.length() < 1) continue;
      const mid = a.clone().lerp(b, 0.5);
      let normal = new THREE.Vector3()
        .crossVectors(delta, new THREE.Vector3(0, 1, 0))
        .normalize();
      if (!normal.lengthSq()) normal.set(1, 0, 0);
      mid.addScaledVector(
        normal,
        edges.some((o) => o.source === e.target && o.target === e.source)
          ? 110
          : 30,
      );
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b),
        active = selected.has(e.source) || selected.has(e.target),
        color = active ? "#b2a3ff" : "#687796";
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: active ? 0.95 : 0.62,
        }),
      );
      line.userData.edge = e.id;
      linkGroup.add(line);
      edgeHits.push(line);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(active ? 10 : 8, 25, 10),
        new THREE.MeshBasicMaterial({ color }),
      );
      cone.position.copy(curve.getPoint(0.7));
      cone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        curve.getTangent(0.7).normalize(),
      );
      linkGroup.add(cone);
      const label = textSprite(
        `${e.label || "Open connection"}  →`,
        active ? "#dbd5ff" : "#9daac6",
        180,
      );
      label.position.copy(curve.getPoint(0.47));
      label.position.y += 18;
      label.userData.edge = e.id;
      linkGroup.add(label);
      edgeHits.push(label);
    }
    render();
  }
  function update(nextNodes, nextEdges, nextSelected = []) {
    nodes = nextNodes;
    edges = nextEdges;
    selected = new Set(
      Array.isArray(nextSelected) ? nextSelected : [nextSelected],
    );
    const ids = new Set(nodes.map((n) => n.id));
    for (const [id, s] of sprites)
      if (!ids.has(id)) {
        world.remove(s);
        dispose(s);
        sprites.delete(id);
      }
    for (const [id, r] of rooms)
      if (!ids.has(id)) {
        world.remove(r);
        dispose(r);
        rooms.delete(id);
      }
    for (const n of nodes) {
      let s = sprites.get(n.id);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
        s.userData.id = n.id;
        s.scale.set(
          n.type === "dim" ? 350 : 260,
          n.type === "dim" ? 185 : 137,
          1,
        );
        world.add(s);
        sprites.set(n.id, s);
      }
      const count = nodes.filter((c) => c.dimId === n.id).length,
        signature = JSON.stringify(n) + selected.has(n.id) + count;
      if (s.userData.signature !== signature) {
        s.material.map?.dispose();
        s.material.map = card(n, selected.has(n.id), count);
        s.material.needsUpdate = true;
        s.userData.signature = signature;
      }
      s.position.set(
        n.x,
        n.y + (n.type === "dim" ? 210 : 0),
        n.z + (n.type === "dim" ? -235 : 0),
      );
      if (n.type === "dim") {
        let r = rooms.get(n.id);
        if (!r || r.userData.color !== n.payload.color) {
          if (r) {
            world.remove(r);
            dispose(r);
          }
          r = room(n);
          r.userData.color = n.payload.color;
          rooms.set(n.id, r);
          world.add(r);
        }
        r.position.set(n.x, n.y, n.z);
      }
    }
    drawEdges();
  }
  function fit(reset = false) {
    const points = [];
    for (const n of nodes) {
      if (n.type === "dim") {
        for (const x of [-500, 500])
          for (const y of [-130, 320])
            for (const z of [-350, 350])
              points.push(new THREE.Vector3(n.x + x, n.y + y, n.z + z));
      } else points.push(new THREE.Vector3(n.x, n.y, n.z));
    }
    const bounds = new THREE.Box3().setFromPoints(points);
    if (bounds.isEmpty())
      bounds.setFromCenterAndSize(
        new THREE.Vector3(),
        new THREE.Vector3(500, 350, 300),
      );
    const center = bounds.getCenter(new THREE.Vector3()),
      direction = reset
        ? new THREE.Vector3(0.28, 0.25, 1).normalize()
        : camera.position.clone().sub(controls.target).normalize(),
      right = new THREE.Vector3()
        .crossVectors(camera.up, direction)
        .normalize(),
      up = new THREE.Vector3().crossVectors(direction, right).normalize(),
      tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2),
      tanX = tanY * camera.aspect;
    let distance = 700;
    for (const p of points) {
      const d = p.clone().sub(center);
      distance = Math.max(
        distance,
        d.dot(direction) + (Math.abs(d.dot(right)) + 155) / tanX,
        d.dot(direction) + (Math.abs(d.dot(up)) + 135) / tanY,
      );
    }
    distance = Math.min(26000, distance * 1.17);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
    render();
  }
  function focus(id) {
    const n = nodes.find((n) => n.id === id);
    if (!n) return;
    const target = new THREE.Vector3(n.x, n.y, n.z),
      direction = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(target);
    camera.position
      .copy(target)
      .addScaledVector(direction, n.type === "dim" ? 1400 : 850);
    controls.update();
    render();
  }
  function rect(id) {
    const s = sprites.get(id),
      r = canvas.getBoundingClientRect();
    if (!s)
      return {
        x: r.x + r.width / 2 - 80,
        y: r.y + r.height / 2 - 50,
        width: 160,
        height: 100,
      };
    const p = s.position.clone().project(camera),
      distance = camera.position.distanceTo(s.position),
      h =
        (s.scale.y * r.height) /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance),
      w = (h * s.scale.x) / s.scale.y;
    return {
      x: r.x + ((p.x + 1) * r.width) / 2 - w / 2,
      y: r.y + ((1 - p.y) * r.height) / 2 - h / 2,
      width: w,
      height: h,
    };
  }
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 12;
  const pointer = new THREE.Vector2();
  function ray(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster;
  }
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || mode === "pan") return;
      const caster = ray(e),
        hit = caster.intersectObjects([...sprites.values()])[0];
      if (!hit) {
        const edge = caster.intersectObjects(edgeHits)[0];
        if (edge) {
          e.stopImmediatePropagation();
          callbacks.onEdge(edge.object.userData.edge);
        }
        return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
      const id = hit.object.userData.id;
      if (e.shiftKey || mode === "multi") {
        callbacks.onToggle(id);
        return;
      }
      if (mode === "move" && !callbacks.canMove(id)) return;
      const origin = hit.object.position.clone(),
        plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          camera.getWorldDirection(new THREE.Vector3()),
          origin,
        ),
        ids = selected.has(id) ? new Set(selected) : new Set([id]);
      gesture = {
        id,
        x: e.clientX,
        y: e.clientY,
        origin,
        plane,
        point: raycaster.ray.intersectPlane(plane, new THREE.Vector3()),
        primary: nodes.filter((n) => ids.has(n.id) && !ids.has(n.dimId)),
        affected: nodes.filter((n) => ids.has(n.id) || ids.has(n.dimId)),
        moved: false,
        delta: new THREE.Vector3(),
      };
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    },
    true,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!gesture) return;
      e.stopImmediatePropagation();
      const dx = e.clientX - gesture.x,
        dy = e.clientY - gesture.y;
      if (Math.hypot(dx, dy) < 5 && !gesture.moved) return;
      gesture.moved = true;
      if (mode !== "move") return;
      const delta = new THREE.Vector3();
      if (axis === "screen") {
        const p = ray(e).ray.intersectPlane(gesture.plane, new THREE.Vector3());
        if (!p || !gesture.point) return;
        delta.copy(p.sub(gesture.point));
      } else {
        const v = new THREE.Vector3();
        v[axis] = 100;
        const a = gesture.origin.clone().project(camera),
          b = gesture.origin.clone().add(v).project(camera),
          r = canvas.getBoundingClientRect(),
          px = ((b.x - a.x) * r.width) / 2,
          py = (-(b.y - a.y) * r.height) / 2,
          norm = px * px + py * py;
        delta[axis] = norm > 4 ? ((dx * px + dy * py) / norm) * 100 : -dy * 2;
      }
      for (const key of ["x", "y", "z"]) {
        delta[key] = Math.round(delta[key] / (snap ? 50 : 1)) * (snap ? 50 : 1);
        const low = Math.max(...gesture.affected.map((n) => -5000 - n[key])),
          high = Math.min(...gesture.affected.map((n) => 5000 - n[key]));
        delta[key] = THREE.MathUtils.clamp(delta[key], low, high);
      }
      gesture.delta.copy(delta);
      for (const n of gesture.affected) {
        sprites
          .get(n.id)
          ?.position.set(
            n.x + delta.x,
            n.y + delta.y + (n.type === "dim" ? 210 : 0),
            n.z + delta.z + (n.type === "dim" ? -235 : 0),
          );
        rooms
          .get(n.id)
          ?.position.set(n.x + delta.x, n.y + delta.y, n.z + delta.z);
      }
      drawEdges();
    },
    true,
  );
  function end(e, cancel = false) {
    if (!gesture) return;
    e.stopImmediatePropagation();
    const g = gesture;
    gesture = null;
    controls.enabled = true;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (cancel) {
      update(nodes, edges, [...selected]);
      return;
    }
    if (g.moved && mode === "move")
      callbacks.onMove(
        g.primary.map((n) => ({
          id: n.id,
          x: n.x + g.delta.x,
          y: n.y + g.delta.y,
          z: n.z + g.delta.z,
        })),
      );
    else if (!g.moved) callbacks.onSelect(g.id);
  }
  canvas.addEventListener("pointerup", (e) => end(e), true);
  canvas.addEventListener("pointercancel", (e) => end(e, true), true);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    callbacks.onUnavailable?.();
  });
  return {
    update,
    fit,
    focus,
    rect,
    setMode(m, a = "screen", s = false) {
      mode = m;
      axis = a;
      snap = s;
      controls.mouseButtons.LEFT =
        m === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      canvas.style.cursor =
        m === "move" || m === "pan"
          ? "grab"
          : m === "multi"
            ? "crosshair"
            : "default";
    },
    getTarget() {
      return {
        x: Math.round(controls.target.x),
        y: Math.round(controls.target.y),
        z: Math.round(controls.target.z),
      };
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      cancelAnimationFrame(frame);
      dispose(world);
      renderer.dispose();
      canvas.remove();
    },
  };
}
