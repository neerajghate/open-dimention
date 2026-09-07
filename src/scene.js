import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  card,
  textSprite,
  surfaceLabel,
  dispose,
  preview,
} from "./scene-art.js";
import { ROOM, zonesOf, zoneCenter, layoutProblem } from "../shared/spatial.js";
export { palette, typeNames, preview } from "./scene-art.js";

const alignedDirection = () => new THREE.Vector3(0, 1, 1.35).normalize();
const topDirection = () => new THREE.Vector3(0, 1, 0.0001).normalize();
const FLOOR_Y = -110;

function room(dim) {
  const group = new THREE.Group(),
    color = dim.payload.color;
  const floorGeometry = new THREE.BoxGeometry(
    ROOM.halfWidth * 2,
    8,
    ROOM.halfDepth * 2,
  );
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshBasicMaterial({ color: "#1d263c" }),
  );
  floor.position.y = FLOOR_Y;
  group.add(floor);
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(floorGeometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 }),
  );
  border.position.y = FLOOR_Y;
  group.add(border);
  // A room-local 50-unit grid follows the same axes as every area and Snap.
  const gridPoints = [];
  for (let x = -ROOM.halfWidth; x <= ROOM.halfWidth; x += 50)
    gridPoints.push(
      x,
      FLOOR_Y + 4.5,
      -ROOM.halfDepth,
      x,
      FLOOR_Y + 4.5,
      ROOM.halfDepth,
    );
  for (let z = -ROOM.halfDepth; z <= ROOM.halfDepth; z += 50)
    gridPoints.push(
      -ROOM.halfWidth,
      FLOOR_Y + 4.5,
      z,
      ROOM.halfWidth,
      FLOOR_Y + 4.5,
      z,
    );
  group.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(gridPoints, 3),
      ),
      new THREE.LineBasicMaterial({
        color: "#56617c",
        transparent: true,
        opacity: 0.17,
      }),
    ),
  );
  // Continuous columns make the Desk/Storage alignment visible across the floor.
  for (const [x, laneColor] of [
    [-285, "#302f4c"],
    [285, "#233c4d"],
  ]) {
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(525, 960),
      new THREE.MeshBasicMaterial({ color: laneColor }),
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(x, FLOOR_Y + 5, 0);
    group.add(lane);
  }
  const hits = [];
  for (const zone of zonesOf(dim)) {
    const p = zoneCenter({ ...dim, x: 0, y: 0, z: 0 }, zone.id),
      tile = new THREE.Mesh(
        new THREE.BoxGeometry(525, 10, 204),
        new THREE.MeshBasicMaterial({
          color: zone.type === "desk" ? "#3b3864" : "#254d60",
        }),
      );
    tile.position.set(p.x, -98, p.z);
    tile.userData.zone = { dimId: dim.id, zoneId: zone.id };
    group.add(tile);
    hits.push(tile);
    const label = surfaceLabel(
      `${zone.type === "desk" ? "DESK" : "STORAGE"} / ${zone.name}`,
      zone.type === "desk" ? "#d0c8ff" : "#a5d9e9",
      430,
    );
    label.position.set(p.x, -92, p.z + 72);
    label.userData.zone = tile.userData.zone;
    group.add(label);
    hits.push(label);
  }
  group.position.set(dim.x, dim.y, dim.z);
  return { group, hits };
}

export function createWorkspaceScene(container, callbacks) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "default",
  });
  renderer.setClearColor("#121724");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "3D world. Use the quick access sidebar to navigate Dims.",
  );
  container.append(canvas);
  const world = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(43, 1, 1, 40000),
    controls = new OrbitControls(camera, canvas);
  camera.position.copy(alignedDirection().multiplyScalar(2200));
  controls.enableDamping = false;
  controls.minDistance = 250;
  controls.maxDistance = 26000;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };
  const grid = new THREE.GridHelper(14000, 140, "#35425d", "#222d43");
  grid.position.y = FLOOR_Y - 4;
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  world.add(grid);
  const sprites = new Map(),
    rooms = new Map(),
    links = new Map();
  let nodes = [],
    edges = [],
    selected = new Set(),
    view = {},
    lastNodes,
    lastEdges,
    lastSelection = "",
    lastView = "",
    mode = "select",
    axis = "screen",
    snap = false,
    gesture = null,
    frame = 0,
    tween = null,
    paused = false,
    linksDirty = false,
    renderCount = 0,
    textureBuilds = 0,
    edgeBuilds = 0,
    viewStyle = "aligned",
    preferredView = "aligned";
  const isVisible = (n) =>
    !view.dimId ||
    n.id === view.dimId ||
    (n.dimId === view.dimId && (!view.zoneId || n.zoneId === view.zoneId));
  const visibleSprites = () => [...sprites.values()].filter((s) => s.visible);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function schedule() {
    if (!frame && !paused && !document.hidden)
      frame = requestAnimationFrame(draw);
  }
  function draw(now) {
    frame = 0;
    if (tween) {
      tween.frames++;
      tween.firstFrame ??= now;
      const p = Math.min(1, (now - tween.start) / tween.duration),
        t = 1 - (1 - p) ** 3;
      camera.position.lerpVectors(tween.from, tween.to, t);
      controls.target.lerpVectors(tween.targetFrom, tween.targetTo, t);
      controls.update();
      if (p === 1) {
        if (import.meta.env.DEV && tween.frames > 1)
          canvas.dataset.cameraFps = (
            ((tween.frames - 1) * 1000) /
            (now - tween.firstFrame)
          ).toFixed(1);
        tween = null;
      }
    }
    if (linksDirty) {
      updateLinks();
      linksDirty = false;
    }
    const cpuStart = performance.now();
    renderer.render(world, camera);
    renderCount++;
    if (import.meta.env.DEV) {
      canvas.dataset.renderMs = (performance.now() - cpuStart).toFixed(2);
      canvas.dataset.renderCount = renderCount;
      canvas.dataset.textureBuilds = textureBuilds;
      canvas.dataset.edgeBuilds = edgeBuilds;
      canvas.dataset.textures = renderer.info.memory.textures;
      canvas.dataset.geometries = renderer.info.memory.geometries;
      canvas.dataset.drawCalls = renderer.info.render.calls;
    }
    if (tween) schedule();
  }
  controls.addEventListener("change", () => {
    const direction = camera.position.clone().sub(controls.target).normalize();
    const next =
      direction.dot(topDirection()) > 0.9999
        ? "top"
        : direction.dot(alignedDirection()) > 0.9999
          ? "aligned"
          : "free";
    if (next !== viewStyle) {
      viewStyle = next;
      callbacks.onViewChange?.(next);
    }
    schedule();
  });
  controls.addEventListener("start", () => {
    tween = null;
  });
  const resize = () => {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    schedule();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  };
  document.addEventListener("visibilitychange", visibility);

  function updateLinks() {
    const ids = new Set(edges.map((e) => e.id)),
      pairs = new Set(edges.map((e) => `${e.source}:${e.target}`));
    for (const [id, link] of links)
      if (!ids.has(id)) {
        world.remove(link.group);
        dispose(link.group);
        links.delete(id);
      }
    for (const e of edges) {
      const a = sprites.get(e.source),
        b = sprites.get(e.target);
      if (!a || !b) continue;
      let link = links.get(e.id);
      if (!link) {
        const group = new THREE.Group(),
          line = new THREE.Line(
            new THREE.BufferGeometry().setAttribute(
              "position",
              new THREE.BufferAttribute(new Float32Array(33 * 3), 3),
            ),
            new THREE.LineBasicMaterial({ transparent: true }),
          );
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(8, 24, 8),
          new THREE.MeshBasicMaterial(),
        );
        group.add(line, arrow);
        world.add(group);
        line.userData.edge = e.id;
        link = {
          group,
          line,
          arrow,
          label: null,
          labelKey: "",
          positionKey: "",
          active: null,
        };
        links.set(e.id, link);
        edgeBuilds++;
      }
      link.group.visible = a.visible && b.visible;
      if (!link.group.visible) continue;
      const active = selected.has(e.source) || selected.has(e.target),
        color = active ? "#c9beff" : "#7889ad";
      if (link.active !== active) {
        link.line.material.color.set(color);
        link.line.material.opacity = active ? 0.95 : 0.55;
        link.arrow.material.color.set(color);
        link.active = active;
      }
      const labelKey = e.label || "Open connection";
      if (link.labelKey !== labelKey) {
        if (link.label) {
          link.group.remove(link.label);
          dispose(link.label);
        }
        link.label = textSprite(labelKey + " →", "#b9c6df", 170);
        link.label.userData.edge = e.id;
        link.group.add(link.label);
        link.labelKey = labelKey;
        textureBuilds++;
        link.positionKey = "";
      }
      const posKey = [
        ...a.position,
        ...b.position,
        pairs.has(`${e.target}:${e.source}`),
      ].join(",");
      if (link.positionKey === posKey) continue;
      link.positionKey = posKey;
      const delta = b.position.clone().sub(a.position),
        normal = new THREE.Vector3()
          .crossVectors(delta, new THREE.Vector3(0, 1, 0))
          .normalize();
      if (!normal.lengthSq()) normal.set(1, 0, 0);
      const mid = a.position
          .clone()
          .lerp(b.position, 0.5)
          .addScaledVector(
            normal,
            pairs.has(`${e.target}:${e.source}`) ? 110 : 35,
          ),
        curve = new THREE.QuadraticBezierCurve3(a.position, mid, b.position),
        attribute = link.line.geometry.attributes.position,
        p = new THREE.Vector3();
      for (let i = 0; i <= 32; i++) {
        curve.getPoint(i / 32, p);
        attribute.setXYZ(i, p.x, p.y, p.z);
      }
      attribute.needsUpdate = true;
      link.line.geometry.computeBoundingSphere();
      link.arrow.position.copy(curve.getPoint(0.72));
      link.arrow.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        curve.getTangent(0.72).normalize(),
      );
      link.label.position.copy(curve.getPoint(0.45));
      link.label.position.y += 20;
    }
  }
  function update(nextNodes, nextEdges, nextSelected = [], nextView = {}) {
    const selectionKey = [...nextSelected].sort().join(","),
      viewKey = JSON.stringify(nextView);
    if (
      lastNodes === nextNodes &&
      lastEdges === nextEdges &&
      lastSelection === selectionKey &&
      lastView === viewKey
    )
      return;
    lastNodes = nextNodes;
    lastEdges = nextEdges;
    lastSelection = selectionKey;
    lastView = viewKey;
    nodes = nextNodes;
    edges = nextEdges;
    selected = new Set(nextSelected);
    view = nextView;
    const ids = new Set(nodes.map((n) => n.id)),
      counts = new Map();
    for (const n of nodes)
      if (n.dimId) counts.set(n.dimId, (counts.get(n.dimId) || 0) + 1);
    for (const [id, s] of sprites)
      if (!ids.has(id)) {
        world.remove(s);
        dispose(s);
        sprites.delete(id);
      }
    for (const [id, r] of rooms)
      if (!ids.has(id)) {
        world.remove(r.group);
        dispose(r.group);
        rooms.delete(id);
      }
    for (const n of nodes) {
      let s = sprites.get(n.id);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
        s.userData.id = n.id;
        s.scale.set(
          n.type === "dim" ? 360 : 240,
          n.type === "dim" ? 190 : 127,
          1,
        );
        world.add(s);
        sprites.set(n.id, s);
      }
      const signature = [
        n.title,
        n.type,
        preview(n).slice(0, 360),
        n.area,
        n.dimId,
        n.payload.color,
        counts.get(n.id) || 0,
        selected.has(n.id),
      ].join("|");
      if (s.userData.signature !== signature) {
        s.material.map?.dispose();
        s.material.map = card(n, selected.has(n.id), counts.get(n.id) || 0);
        s.material.needsUpdate = true;
        s.userData.signature = signature;
        textureBuilds++;
      }
      s.visible = isVisible(n);
      s.position.set(
        n.x,
        n.y + (n.type === "dim" ? 255 : 0),
        n.z + (n.type === "dim" ? -515 : 0),
      );
      if (n.type === "dim") {
        const roomKey = JSON.stringify(n.payload);
        let r = rooms.get(n.id);
        if (!r || r.key !== roomKey) {
          if (r) {
            world.remove(r.group);
            dispose(r.group);
          }
          r = { ...room(n), key: roomKey };
          rooms.set(n.id, r);
          world.add(r.group);
          textureBuilds += zonesOf(n).length;
        }
        r.group.position.set(n.x, n.y, n.z);
        r.group.visible = !view.dimId || view.dimId === n.id;
      }
    }
    const focusedDim = nodes.find((n) => n.id === view.dimId);
    grid.position.set(
      focusedDim?.x || 0,
      (focusedDim?.y || 0) + FLOOR_Y - 4,
      focusedDim?.z || 0,
    );
    linksDirty = true;
    schedule();
  }
  function fly(target, position, animate = true) {
    if (!animate || reduced()) {
      tween = null;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      schedule();
      return;
    }
    tween = {
      from: camera.position.clone(),
      to: position,
      targetFrom: controls.target.clone(),
      targetTo: target,
      start: performance.now(),
      duration: 440,
      frames: 0,
    };
    schedule();
  }
  function pointsFor(items) {
    const points = [];
    for (const n of items) {
      const sprite = sprites.get(n.id);
      if (sprite) points.push(sprite.position.clone());
      if (n.type === "dim") {
        for (const x of [-ROOM.halfWidth, ROOM.halfWidth])
          for (const z of [-ROOM.halfDepth, ROOM.halfDepth])
            points.push(new THREE.Vector3(n.x + x, n.y + FLOOR_Y, n.z + z));
      }
    }
    return points;
  }
  function framePoints(points, direction, animate = true) {
    resize();
    if (!points.length)
      points = [
        new THREE.Vector3(-250, 0, -200),
        new THREE.Vector3(250, 200, 200),
      ];
    const center = new THREE.Box3()
      .setFromPoints(points)
      .getCenter(new THREE.Vector3());
    const right = new THREE.Vector3()
      .crossVectors(camera.up, direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const height = container.clientHeight;
    // Leave the header, view buttons and bottom toolbar clear of the room.
    const tanY =
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) *
        Math.max(0.35, 1 - (height < 400 ? 120 : 170) / height);
    const tanX =
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect * 0.88;
    let distance = 700;
    for (const p of points) {
      const d = p.clone().sub(center);
      distance = Math.max(
        distance,
        d.dot(direction) + (Math.abs(d.dot(right)) + 145) / tanX,
        d.dot(direction) + (Math.abs(d.dot(up)) + 100) / tanY,
      );
    }
    fly(
      center,
      center.clone().addScaledVector(direction, Math.min(26000, distance)),
      animate,
    );
  }
  function fit(reset = false) {
    if (reset) preferredView = "aligned";
    framePoints(
      pointsFor(nodes.filter(isVisible)),
      reset
        ? alignedDirection()
        : camera.position.clone().sub(controls.target).normalize(),
      !reset,
    );
  }
  function focus(id, zoneId = null, animate = true) {
    const n = nodes.find((n) => n.id === id);
    if (!n) return;
    let points;
    if (n.type === "dim" && zoneId) {
      const p = zoneCenter(n, zoneId);
      points = pointsFor(
        nodes.filter((d) => d.dimId === id && d.zoneId === zoneId),
      );
      for (const x of [-265, 265])
        for (const z of [-105, 105])
          points.push(new THREE.Vector3(p.x + x, p.y + FLOOR_Y, p.z + z));
    } else
      points = pointsFor(
        nodes.filter(
          (d) => d.id === id || (n.type === "dim" && d.dimId === id),
        ),
      );
    framePoints(
      points,
      preferredView === "top" ? topDirection() : alignedDirection(),
      animate,
    );
  }
  function setView(style) {
    preferredView = style;
    if (view.dimId) focus(view.dimId, view.zoneId);
    else
      framePoints(
        pointsFor(nodes.filter(isVisible)),
        style === "top" ? topDirection() : alignedDirection(),
      );
  }
  function rect(id) {
    const s = sprites.get(id),
      r = canvas.getBoundingClientRect();
    if (!s || !s.visible)
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
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  raycaster.params.Line.threshold = 10;
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
      tween = null;
      if (e.button !== 0 || mode === "pan") return;
      const caster = ray(e),
        hit = caster.intersectObjects(visibleSprites())[0];
      if (!hit) {
        const targets = [...links.values()]
          .filter((l) => l.group.visible)
          .flatMap((l) => [l.line, l.label].filter(Boolean));
        if (mode === "select")
          targets.push(
            ...[...rooms.values()]
              .filter((r) => r.group.visible)
              .flatMap((r) => r.hits),
          );
        const target = caster.intersectObjects(targets)[0];
        if (target) {
          e.stopImmediatePropagation();
          const data = target.object.userData;
          if (data.edge) callbacks.onEdge(data.edge);
          else if (data.zone) callbacks.onZone?.(data.zone);
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
        blocked: null,
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
        delta[key] = THREE.MathUtils.clamp(
          delta[key],
          Math.max(...gesture.affected.map((n) => -5000 - n[key])),
          Math.min(...gesture.affected.map((n) => 5000 - n[key])),
        );
      }
      const affected = new Set(gesture.affected.map((n) => n.id));
      const problem = layoutProblem(
        nodes.map((n) =>
          affected.has(n.id)
            ? { ...n, x: n.x + delta.x, y: n.y + delta.y, z: n.z + delta.z }
            : n,
        ),
      );
      gesture.blocked = problem;
      canvas.style.cursor = problem ? "not-allowed" : "grabbing";
      if (problem) return;
      gesture.delta.copy(delta);
      for (const n of gesture.affected) {
        sprites
          .get(n.id)
          ?.position.set(
            n.x + delta.x,
            n.y + delta.y + (n.type === "dim" ? 255 : 0),
            n.z + delta.z + (n.type === "dim" ? -515 : 0),
          );
        rooms
          .get(n.id)
          ?.group.position.set(n.x + delta.x, n.y + delta.y, n.z + delta.z);
      }
      linksDirty = true;
      schedule();
    },
    true,
  );
  function end(e, cancel = false) {
    if (!gesture) return;
    e.stopImmediatePropagation();
    const g = gesture;
    gesture = null;
    controls.enabled = true;
    canvas.style.cursor = mode === "move" ? "grab" : "default";
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (cancel) {
      lastNodes = null;
      update(nodes, edges, [...selected], view);
      return;
    }
    if (g.moved && mode === "move") {
      if (g.delta.lengthSq())
        callbacks.onMove(
          g.primary.map((n) => ({
            id: n.id,
            x: n.x + g.delta.x,
            y: n.y + g.delta.y,
            z: n.z + g.delta.z,
          })),
        );
      if (g.blocked) callbacks.onBlocked?.(g.blocked);
    } else if (!g.moved) callbacks.onSelect(g.id);
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
    setView,
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
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      if (paused) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else schedule();
    },
    getTarget() {
      return {
        x: Math.round(controls.target.x),
        y: Math.round(controls.target.y),
        z: Math.round(controls.target.z),
      };
    },
    invalidate() {
      lastNodes = null;
    },
    dispose() {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      controls.dispose();
      cancelAnimationFrame(frame);
      dispose(world);
      renderer.dispose();
      canvas.remove();
    },
  };
}
