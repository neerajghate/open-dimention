import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const palette = { note: '#688679', idea: '#b38a50', workflow: '#7d80a6', table: '#628aa0' };
export const typeNames = { note: 'Note', idea: 'Idea', workflow: 'Workflow', table: 'Table' };
export function preview(node) {
  if (node.type === 'workflow') return (node.payload.steps || []).map(s => `${s.done ? '✓' : '○'} ${s.text}`).join('\n');
  if (node.type === 'table') return `${node.payload.columns.join('  ·  ')}\n${node.payload.rows.length} rows · ${node.payload.columns.length} columns\n${node.content}`;
  return node.content;
}
function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function wrap(ctx, text, width, maxLines) {
  const words = text.replace(/\n+/g, '  ').split(/\s+/); const lines = []; let line = '';
  for (const word of words) {
    if (ctx.measureText(line + word).width > width && line) { lines.push(line.trim()); line = ''; }
    line += word + ' ';
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, maxLines).map((s, i) => {
    if (i === maxLines - 1 && lines.length > maxLines) s += '…';
    while (ctx.measureText(s).width > width && s.length > 1) s = s.slice(0, -2) + '…';
    return s;
  });
}
function cardTexture(node, selected) {
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 390;
  const ctx = canvas.getContext('2d');
  ctx.shadowColor = '#25372c16'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  rounded(ctx, 14, 10, 692, 360, 22); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.lineWidth = selected ? 6 : 2; ctx.strokeStyle = selected ? '#3d6554' : '#d7ddd7'; ctx.stroke();
  ctx.fillStyle = palette[node.type]; rounded(ctx, 44, 42, 10, 27, 5); ctx.fill();
  ctx.font = '600 23px Segoe UI, sans-serif'; ctx.fillText(typeNames[node.type].toUpperCase(), 70, 65);
  ctx.fillStyle = '#a7afa8'; ctx.font = '25px Segoe UI'; ctx.fillText('⠿', 650, 66);
  ctx.fillStyle = '#263a31'; ctx.font = '600 40px Segoe UI, sans-serif';
  const title = wrap(ctx, node.title || 'Untitled', 610, 2); title.forEach((line, i) => ctx.fillText(line, 44, 123 + i * 43));
  ctx.fillStyle = '#768078'; ctx.font = '28px Segoe UI, sans-serif';
  const start = title.length > 1 ? 211 : 180;
  wrap(ctx, preview(node) || 'A little room for something new.', 610, 2).forEach((line, i) => ctx.fillText(line, 44, start + i * 36));
  ctx.strokeStyle = '#edf0eb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(44, 298); ctx.lineTo(660, 298); ctx.stroke();
  ctx.font = '21px Segoe UI, sans-serif'; ctx.fillStyle = '#8c968f'; ctx.fillText(selected ? 'Selected · open in editor' : 'Click to open', 44, 338);
  ctx.textAlign = 'right'; ctx.fillText(`${Math.round(node.x)} / ${Math.round(node.y)} / ${Math.round(node.z)}`, 661, 338);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function labelSprite(text) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 72;
  const ctx = canvas.getContext('2d'); ctx.font = '25px Segoe UI, sans-serif';
  let label = text; while (ctx.measureText(label).width > 480) label = label.slice(0, -2) + '…';
  const width = Math.min(510, ctx.measureText(label).width + 28);
  ctx.fillStyle = '#f4f6f0ec'; rounded(ctx, (512 - width) / 2, 7, width, 57, 13); ctx.fill();
  ctx.fillStyle = '#728178'; ctx.textAlign = 'center'; ctx.fillText(label, 256, 44);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(170, 24, 1); sprite.renderOrder = 1; return sprite;
}
function dispose(object) {
  object.traverse(o => { o.geometry?.dispose(); if (o.material) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.map?.dispose(); m.dispose(); } } });
}
export function createWorkspaceScene(container, callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); renderer.setClearColor('#f4f6f0');
  renderer.domElement.setAttribute('aria-label', '3D workspace. Use the sidebar to access every node with a keyboard.');
  renderer.domElement.tabIndex = 0; container.append(renderer.domElement);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(42, 1, 1, 30000);
  camera.position.set(520, 370, 1500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; controls.minDistance = 100; controls.maxDistance = 22000; controls.target.set(0, 0, 0);
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  controls.screenSpacePanning = true;
  const grid = new THREE.GridHelper(3600, 36, '#cbd4c6', '#e1e7db'); grid.position.y = -340; grid.material.transparent = true; grid.material.opacity = .65; scene.add(grid);
  const axes = new THREE.AxesHelper(95); axes.position.set(-650, -338, 200); scene.add(axes);
  const cards = new Map(); let edgeGroup = new THREE.Group(); scene.add(edgeGroup);
  let nodes = [], edges = [], selected = null, mode = 'select', axis = 'screen', frame = 0, gesture = null;
  function requestRender() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); }); }
  controls.addEventListener('change', requestRender);
  function resize() { const { width, height } = container.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); requestRender(); }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function drawEdges() {
    scene.remove(edgeGroup); dispose(edgeGroup); edgeGroup = new THREE.Group(); scene.add(edgeGroup);
    for (const edge of edges) {
      const source = cards.get(edge.source)?.position, target = cards.get(edge.target)?.position; if (!source || !target) continue;
      const delta = target.clone().sub(source); if (delta.length() < 1) continue;
      const middle = source.clone().lerp(target, .5);
      if (edges.some(other => other.source === edge.target && other.target === edge.source)) {
        let normal = new THREE.Vector3().crossVectors(delta, new THREE.Vector3(0, 1, 0)).normalize();
        if (!normal.lengthSq()) normal.set(1, 0, 0); middle.addScaledVector(normal, 70);
      }
      const curve = new THREE.QuadraticBezierCurve3(source, middle, target);
      const active = edge.source === selected || edge.target === selected;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)), new THREE.LineBasicMaterial({ color: active ? '#719482' : '#b8c4b5' }));
      edgeGroup.add(line);
      const t = .68, direction = curve.getTangent(t).normalize();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(5.5, 17, 8), new THREE.MeshBasicMaterial({ color: active ? '#567765' : '#8d9f87' }));
      cone.position.copy(curve.getPoint(t)); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction); edgeGroup.add(cone);
      if (edge.label) { const label = labelSprite(edge.label); label.position.copy(curve.getPoint(.45)); label.position.y += 17; edgeGroup.add(label); }
    }
  }
  function update(nextNodes, nextEdges, nextSelected) {
    nodes = nextNodes; edges = nextEdges; selected = nextSelected;
    for (const [id, sprite] of cards) if (!nodes.some(n => n.id === id)) { scene.remove(sprite); dispose(sprite); cards.delete(id); }
    for (const node of nodes) {
      let sprite = cards.get(node.id); const signature = JSON.stringify(node) + (node.id === selected);
      if (!sprite) { sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: true })); sprite.scale.set(260, 141, 1); sprite.userData.id = node.id; scene.add(sprite); cards.set(node.id, sprite); }
      if (sprite.userData.signature !== signature) { sprite.material.map?.dispose(); sprite.material.map = cardTexture(node, node.id === selected); sprite.material.needsUpdate = true; sprite.userData.signature = signature; }
      sprite.position.set(node.x, node.y, node.z);
    }
    drawEdges(); requestRender();
  }
  function fit(reset = false) {
    const bounds = new THREE.Box3(); for (const sprite of cards.values()) bounds.expandByPoint(sprite.position);
    if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(500, 350, 300));
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = reset ? new THREE.Vector3(.31, .22, 1).normalize() : camera.position.clone().sub(controls.target).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanX = tanY * camera.aspect;
    let distance = 650;
    for (const sprite of cards.values()) {
      const relative = sprite.position.clone().sub(center), depth = relative.dot(direction);
      distance = Math.max(distance, depth + (Math.abs(relative.dot(right)) + 150) / tanX, depth + (Math.abs(relative.dot(up)) + 130) / tanY);
    }
    distance = Math.min(controls.maxDistance, distance * 1.20);
    controls.target.copy(center); camera.position.copy(center).addScaledVector(direction, distance); controls.update(); requestRender();
  }
  function focus(id) {
    const sprite = cards.get(id); if (!sprite) return;
    const direction = camera.position.clone().sub(controls.target).normalize(); controls.target.copy(sprite.position);
    camera.position.copy(sprite.position).addScaledVector(direction, 780); controls.update(); requestRender();
  }
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
  function ray(event) { const r = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1); raycaster.setFromCamera(pointer, camera); return raycaster; }
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || mode === 'pan') return;
    const hit = ray(event).intersectObjects([...cards.values()])[0]; if (!hit) return;
    event.stopImmediatePropagation(); event.preventDefault();
    if (mode === 'move' && !callbacks.canMove(hit.object.userData.id)) return;
    const origin = hit.object.position.clone(); const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), origin);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    gesture = { sprite: hit.object, x: event.clientX, y: event.clientY, origin, plane, point, moved: false };
    controls.enabled = false; canvas.setPointerCapture(event.pointerId);
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (!gesture) return;
    event.stopImmediatePropagation(); const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) < 5 && !gesture.moved) return;
    gesture.moved = true; if (mode !== 'move') return;
    const position = gesture.origin.clone();
    if (axis === 'screen') {
      const point = ray(event).ray.intersectPlane(gesture.plane, new THREE.Vector3()); if (!point || !gesture.point) return;
      position.add(point.sub(gesture.point));
    } else {
      const vector = new THREE.Vector3(); vector[axis] = 100;
      const start = gesture.origin.clone().project(camera), end = gesture.origin.clone().add(vector).project(camera);
      const rect = canvas.getBoundingClientRect(); const px = (end.x - start.x) * rect.width / 2, py = -(end.y - start.y) * rect.height / 2;
      const norm = px * px + py * py;
      position[axis] += norm > 4 ? (dx * px + dy * py) / norm * 100 : -dy * 2;
    }
    for (const key of ['x', 'y', 'z']) position[key] = Math.round(THREE.MathUtils.clamp(position[key], -5000, 5000));
    gesture.sprite.position.copy(position); drawEdges(); requestRender();
    callbacks.onDrag?.(position);
  }, true);
  function end(event, cancelled = false) {
    if (!gesture) return; event.stopImmediatePropagation(); const g = gesture; gesture = null;
    controls.enabled = true; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (cancelled) { g.sprite.position.copy(g.origin); drawEdges(); requestRender(); return; }
    if (mode === 'move' && g.moved) callbacks.onMove(g.sprite.userData.id, { x: g.sprite.position.x, y: g.sprite.position.y, z: g.sprite.position.z });
    else if (!g.moved) callbacks.onSelect(g.sprite.userData.id);
  }
  canvas.addEventListener('pointerup', e => end(e), true); canvas.addEventListener('pointercancel', e => end(e, true), true);
  return { update, fit, focus, setMode(value, nextAxis) { mode = value; axis = nextAxis; controls.mouseButtons.LEFT = mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; canvas.style.cursor = mode === 'move' || mode === 'pan' ? 'grab' : 'default'; }, getTarget() { return { x: Math.round(controls.target.x), y: Math.round(controls.target.y), z: Math.round(controls.target.z) }; }, dispose() { observer.disconnect(); controls.dispose(); cancelAnimationFrame(frame); dispose(scene); renderer.dispose(); canvas.remove(); } };
}
