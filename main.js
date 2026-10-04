(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('c');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    if (!window.THREE) throw new Error('three missing');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) { $('fallback').hidden = false; return; }

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const tableMat = new THREE.MeshStandardMaterial({ roughness: 0.95, envMapIntensity: 0.45 });
  function applyTheme() {
    const bg = new THREE.Color(css('--scene'));
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 9, 22);
    tableMat.color.set(css('--table'));
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  // lights
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.15);
  sun.position.set(3.2, 6.5, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -3.5; sun.shadow.camera.right = 3.5; sun.shadow.camera.top = 3.5; sun.shadow.camera.bottom = -3.5;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 16;
  sun.shadow.radius = 5; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x6f8d78, 0.15));

  // table + melamine plate with a green band
  const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), tableMat);
  table.rotation.x = -Math.PI / 2; table.position.y = -0.03; table.receiveShadow = true; scene.add(table);
  const prof = [];
  const PR = SIM.PLATE_R, RR = SIM.RIM_R, RH = SIM.RIM_H;
  prof.push(new THREE.Vector2(0, 0));
  prof.push(new THREE.Vector2(PR, 0));
  for (let i = 1; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(PR + (RR - PR) * t, RH * t * t)); }
  prof.push(new THREE.Vector2(RR + 0.06, RH + 0.01), new THREE.Vector2(RR + 0.09, RH - 0.03), new THREE.Vector2(RR - 0.15, -0.03), new THREE.Vector2(0, -0.03));
  const plate = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.MeshPhysicalMaterial({ color: 0xf6f1e6, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.6, envMapIntensity: 0.3 }));
  plate.receiveShadow = true; plate.castShadow = true; scene.add(plate);
  const band = new THREE.Mesh(new THREE.RingGeometry(PR + 0.18, PR + 0.24, 96), new THREE.MeshStandardMaterial({ color: 0x3f7a5a, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  band.rotation.x = -Math.PI / 2;
  band.position.y = RH * ((0.21) / (RR - PR)) ** 2 + 0.004; band.receiveShadow = true; scene.add(band);
  // a caramel puddle that ran off when it was turned out
  {
    const s = new THREE.Shape(), n = 64;
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, r = 1.22 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5 + 2) + 0.12 * Math.max(0, Math.sin(a - 0.6)) ** 6;
      const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    const puddle = new THREE.Mesh(new THREE.ShapeGeometry(s, 4), new THREE.MeshPhysicalMaterial({ color: 0x3a1203, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.94, envMapIntensity: 0.6 }));
    puddle.rotation.x = -Math.PI / 2; puddle.position.y = 0.003; puddle.receiveShadow = true; scene.add(puddle);
  }

  // pudding material
  const custardMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.3, transmission: 0.32, thickness: 0.9, ior: 1.36,
    attenuationColor: new THREE.Color(0xf0a63a), attenuationDistance: 1.1, clearcoat: 0.75, clearcoatRoughness: 0.18,
    envMapIntensity: 0.8
  });
  const CUSTARD = new THREE.Color(0xf4cc63).convertSRGBToLinear(), CARAMEL = new THREE.Color(0x6e2c06).convertSRGBToLinear();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2a1a10, transparent: true, opacity: 0.35 });

  // cherry
  const cherry = new THREE.Group();
  {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0x8a0819, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6 }));
    berry.scale.set(1, 0.92, 1); berry.position.y = 0.095; berry.castShadow = true; cherry.add(berry);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(0.03, 0.3, 0.01), new THREE.Vector3(0.11, 0.42, 0.02)]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 6), new THREE.MeshStandardMaterial({ color: 0x4a5a22, roughness: 0.7 }));
    stem.castShadow = true; cherry.add(stem);
  }
  scene.add(cherry);

  // knife
  const knife = new THREE.Group();
  const BLADE_L = 2.6;
  {
    const steel = new THREE.MeshPhysicalMaterial({ color: 0xdfe3e6, metalness: 1, roughness: 0.18, clearcoat: 0.3 });
    const bg = new THREE.BoxGeometry(BLADE_L, 0.5, 0.012); bg.translate(0, 0.25, 0);
    // taper the bottom edge thinner
    const pa = bg.attributes.position; for (let i = 0; i < pa.count; i++) if (pa.getY(i) < 0.01) pa.setZ(i, pa.getZ(i) * 0.15);
    bg.computeVertexNormals();
    const blade = new THREE.Mesh(bg, steel); blade.castShadow = true; knife.add(blade);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.07), new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.6 }));
    handle.position.set(BLADE_L / 2 + 0.43, 0.4, 0); handle.castShadow = true; knife.add(handle);
  }
  knife.visible = false; scene.add(knife);

  // ---------- sim + piece meshes ----------
  const world = new SIM.World();
  let pieceMeshes = [], edgeLines = null, cherryAnchor = -1;

  function rebuildMeshes() {
    for (const m of pieceMeshes) { scene.remove(m); m.geometry.dispose(); }
    pieceMeshes = world.pieces.map((pc, k) => {
      const m = pc.mesh, n = m.surfVerts.length;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const c = CUSTARD.clone().lerp(CARAMEL, m.surfCaramel[i]); col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(m.surfIndex, 1));
      const mesh = new THREE.Mesh(g, custardMat);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.piece = k; mesh.frustumCulled = false;
      scene.add(mesh); return mesh;
    });
    if (edgeLines) { scene.remove(edgeLines); edgeLines.geometry.dispose(); }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(world.edges.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    edgeLines = new THREE.LineSegments(eg, lineMat); edgeLines.frustumCulled = false; edgeLines.visible = showMesh; scene.add(edgeLines);
    custardMat.transparent = showMesh; custardMat.opacity = showMesh ? 0.55 : 1;
    $('sPieces').textContent = world.pieces.length;
  }
  function syncMeshes() {
    const x = world.pos;
    world.pieces.forEach((pc, k) => {
      const g = pieceMeshes[k].geometry, a = g.attributes.position.array, sv = pc.mesh.surfVerts, o = pc.pOff;
      for (let i = 0; i < sv.length; i++) { const q = 3 * (sv[i] + o); a[3 * i] = x[q]; a[3 * i + 1] = x[q + 1]; a[3 * i + 2] = x[q + 2]; }
      g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
    });
    if (showMesh) {
      const a = edgeLines.geometry.attributes.position.array, E = world.edges;
      for (let e = 0; e < E.length; e++) { const q = 3 * E[e]; a[3 * e] = x[q]; a[3 * e + 1] = x[q + 1]; a[3 * e + 2] = x[q + 2]; }
      edgeLines.geometry.attributes.position.needsUpdate = true;
    }
    if (cherryAnchor >= 0) {
      const q = 3 * cherryAnchor;
      cherry.position.set(x[q], x[q + 1] - 0.015, x[q + 2]);
    }
  }
  function findCherryAnchor(near) {
    let best = -1, bd = Infinity; const x = world.pos, r = world.rest;
    for (let i = 0; i < world.N; i++) {
      if (r[3 * i + 1] < SIM.H - 1e-4) continue; // top surface only
      const d = (x[3 * i] - near.x) ** 2 + (x[3 * i + 1] - near.y) ** 2 + (x[3 * i + 2] - near.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    cherryAnchor = best;
  }
  function startOver(drop) {
    world.reset(); grab = null; knifeAnim = null; knife.visible = false;
    if (drop) for (let i = 0; i < world.N; i++) world.pos[3 * i + 1] += 0.55;
    rebuildMeshes();
    findCherryAnchor(new THREE.Vector3(0, 2, 0));
    syncMeshes();
  }

  // ---------- UI state ----------
  let tool = 'hand', paused = false, slow = false, showMesh = false;
  const firmEl = $('firm'), dampEl = $('damp');
  const params = () => {
    const f = +firmEl.value, d = +dampEl.value;
    return { gravity: 25, edgeCompliance: Math.pow(10, -0.6 - 1.1 * f), volCompliance: 0, edgeDamp: 0.002 + 0.14 * d * d, friction: 0.6, collide: 0.06, grabCompliance: 6e-5 };
  };
  firmEl.oninput = () => $('firmOut').textContent = (+firmEl.value).toFixed(2);
  dampEl.oninput = () => $('dampOut').textContent = (+dampEl.value).toFixed(2);
  const hints = { hand: 'Drag the pudding to pull it. Drag the plate to look around.', knife: 'Draw a line across the pudding to slice it. Right-drag or use two fingers to look around.' };
  function setTool(t) {
    tool = t;
    $('toolHand').setAttribute('aria-pressed', t === 'hand'); $('toolKnife').setAttribute('aria-pressed', t === 'knife');
    canvas.dataset.cursor = t === 'knife' ? 'knife' : 'grab';
    $('hint').textContent = hints[t];
  }
  $('toolHand').onclick = () => setTool('hand');
  $('toolKnife').onclick = () => setTool('knife');
  const toggle = (id, fn) => { const b = $(id); b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); fn(on); }; };
  toggle('slow', on => slow = on);
  toggle('pause', on => paused = on);
  toggle('mesh', on => { showMesh = on; edgeLines.visible = on; custardMat.transparent = on; custardMat.opacity = on ? 0.55 : 1; custardMat.needsUpdate = true; });
  $('reset').onclick = () => { startOver(!reduceMotion); toast('Fresh pudding'); };
  function nudge() {
    const a = Math.random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    for (let i = 0; i < world.N; i++) { const y = world.pos[3 * i + 1]; world.vel[3 * i] += dx * 3.2 * y; world.vel[3 * i + 2] += dz * 3.2 * y; world.vel[3 * i + 1] += 1.2; }
  }
  $('nudge').onclick = nudge;
  $('more').onclick = () => { const c = $('card'), o = !c.classList.contains('open'); c.classList.toggle('open', o); $('more').setAttribute('aria-expanded', o); $('more').textContent = o ? 'Fewer controls' : 'More controls'; };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'h') setTool('hand'); else if (k === 'k') setTool('knife');
    else if (k === 'n') nudge(); else if (k === 'r') $('reset').click();
    else if (k === ' ' && e.target === canvas) { e.preventDefault(); $('pause').click(); }
  });
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1900); }

  // ---------- camera ----------
  const orbit = { theta: 0.55, phi: 1.02, radius: 6.2, target: new THREE.Vector3(0, 0.75, 0) };
  function placeCamera() {
    const { theta, phi, radius, target } = orbit;
    camera.position.set(target.x + radius * Math.sin(phi) * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // keep the pudding clear of the card on wide screens, centred on narrow ones
    const narrow = w <= 720;
    camera.setViewOffset(w, h, narrow ? 0 : Math.min(200, w * 0.15), narrow ? h * 0.13 : 0, w, h);
    orbit.radius = Math.max(orbit.radius, narrow ? 7.4 : 5.4);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function setRay(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
  function pick(cx, cy) { setRay(cx, cy); const h = ray.intersectObjects(pieceMeshes, false); return h[0] || null; }
  function rayToPlaneY(cx, cy, y) { setRay(cx, cy); const p = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null; }

  // ---------- pointer input ----------
  const pointers = new Map();
  let mode = null, grab = null, stroke = null, knifeAnim = null, last = null, pinch = 0;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { grab = null; endStroke(false); mode = 'orbit2'; const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); last = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; return; }
    if (pointers.size > 2) return;
    last = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || e.button === 2) { mode = 'orbit'; canvas.dataset.cursor = 'orbit'; return; }
    if (tool === 'knife') { if (knifeAnim) { toast('Wait for the knife'); mode = null; return; } mode = 'stroke'; stroke = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }; drawStroke(); return; }
    const hit = pick(e.clientX, e.clientY);
    if (hit) { startGrab(hit); mode = 'grab'; canvas.dataset.cursor = 'grabbing'; }
    else { mode = 'orbit'; canvas.dataset.cursor = 'orbit'; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) {
      if (tool === 'hand' && !mode && e.pointerType === 'mouse') canvas.dataset.cursor = pick(e.clientX, e.clientY) ? 'grab' : 'orbit';
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'orbit2') {
      const [a, b] = [...pointers.values()]; const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = Math.hypot(a.x - b.x, a.y - b.y);
      rotate(c.x - last.x, c.y - last.y); last = c;
      if (pinch > 0) orbit.radius = THREE.MathUtils.clamp(orbit.radius * pinch / d, 3.6, 11); pinch = d; return;
    }
    if (mode === 'orbit') { rotate(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; }
    else if (mode === 'grab' && grab) moveGrab(e.clientX, e.clientY);
    else if (mode === 'stroke') { stroke.x1 = e.clientX; stroke.y1 = e.clientY; drawStroke(); }
  });
  const up = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (mode === 'stroke') endStroke(true);
    if (pointers.size === 0) { mode = null; grab = null; canvas.dataset.cursor = tool === 'knife' ? 'knife' : 'grab'; }
    else if (mode === 'orbit2') { mode = 'orbit'; last = [...pointers.values()][0]; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); orbit.radius = THREE.MathUtils.clamp(orbit.radius * Math.exp(e.deltaY * 0.0012), 3.6, 11); }, { passive: false });
  function rotate(dx, dy) { orbit.theta -= dx * 0.006; orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * 0.005, 0.18, 1.42); }

  function startGrab(hit) {
    const k = hit.object.userData.piece, pc = world.pieces[k], P = hit.point, x = world.pos, R = 0.3;
    const ids = [], wts = [], off = [];
    let nearest = -1, nd = Infinity;
    for (let i = pc.pOff; i < pc.pOff + pc.mesh.N; i++) {
      const d = Math.hypot(x[3 * i] - P.x, x[3 * i + 1] - P.y, x[3 * i + 2] - P.z);
      if (d < nd) { nd = d; nearest = i; }
      if (d < R) { ids.push(i); wts.push(Math.max(0.15, 1 - d / R)); off.push(x[3 * i] - P.x, x[3 * i + 1] - P.y, x[3 * i + 2] - P.z); }
    }
    if (!ids.length) { ids.push(nearest); wts.push(1); off.push(x[3 * nearest] - P.x, x[3 * nearest + 1] - P.y, x[3 * nearest + 2] - P.z); }
    const n = new THREE.Vector3(); camera.getWorldDirection(n);
    grab = { ids, wts, off: Float32Array.from(off), target: [P.x, P.y, P.z], origin: P.clone(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, P) };
  }
  function moveGrab(cx, cy) {
    setRay(cx, cy); const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(grab.plane, p)) return;
    const d = p.clone().sub(grab.origin); if (d.length() > 2.3) d.setLength(2.3); p.copy(grab.origin).add(d);
    p.y = Math.max(p.y, 0.04);
    grab.target = [p.x, p.y, p.z];
  }

  // ---------- knife ----------
  const strokeLine = $('strokeLine');
  function drawStroke() {
    strokeLine.setAttribute('visibility', 'visible');
    strokeLine.setAttribute('x1', stroke.x0); strokeLine.setAttribute('y1', stroke.y0); strokeLine.setAttribute('x2', stroke.x1); strokeLine.setAttribute('y2', stroke.y1);
  }
  function endStroke(commit) {
    strokeLine.setAttribute('visibility', 'hidden');
    if (!stroke) return;
    const s = stroke; stroke = null;
    if (!commit) return;
    if (Math.hypot(s.x1 - s.x0, s.y1 - s.y0) < 24) { toast('Draw a longer line across the pudding'); return; }
    // read the stroke at the height of the custard it was drawn over
    let y = 0.55;
    for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) { const h = pick(s.x0 + (s.x1 - s.x0) * f, s.y0 + (s.y1 - s.y0) * f); if (h) { y = THREE.MathUtils.clamp(h.point.y - 0.05, 0.15, 0.85); break; } }
    const A = rayToPlaneY(s.x0, s.y0, y), B = rayToPlaneY(s.x1, s.y1, y);
    if (!A || !B) { toast('Draw across the pudding, not the sky'); return; }
    const t = new THREE.Vector3(B.x - A.x, 0, B.z - A.z); const len = t.length();
    if (len < 0.05) { toast('Draw a longer line across the pudding'); return; }
    t.divideScalar(len);
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const kn = { p: [A.x, y, A.z], n: [n.x, 0, n.z], t: [t.x, 0, t.z], tmin: -0.12, tmax: len + 0.12 };
    // anything under the blade?
    let topY = -1; const x = world.pos;
    for (let i = 0; i < world.N; i++) {
      const rx = x[3 * i] - A.x, rz = x[3 * i + 2] - A.z, d = rx * n.x + rz * n.z, al = rx * t.x + rz * t.z;
      if (Math.abs(d) < 0.2 && al > kn.tmin && al < kn.tmax) topY = Math.max(topY, x[3 * i + 1]);
    }
    if (topY < 0) { toast('Missed. Draw the line across the pudding.'); return; }
    grab = null;
    const mid = (kn.tmin + kn.tmax) / 2;
    knife.position.set(A.x + t.x * mid, 0, A.z + t.z * mid);
    knife.rotation.set(0, -Math.atan2(t.z, t.x), 0);
    // handle on the side nearer the viewer's right
    const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    if (camRight.dot(t) < 0) knife.rotation.y += Math.PI;
    knife.visible = true;
    knifeAnim = { kn: Object.assign(kn, { phase: 0, groove: 0.08, wedge: 0.035, edgeY: topY + 1.2 }), topY, state: 'down', hold: 0 };
  }
  function stepKnife(dt) {
    const a = knifeAnim; if (!a) return null;
    const kn = a.kn;
    if (a.state === 'down') {
      kn.edgeY -= (kn.edgeY > a.topY + 0.05 ? 5.5 : 1.6) * dt;
      if (kn.phase === 0 && kn.edgeY < a.topY - 0.13) {
        const res = world.cut(kn.p, kn.n, kn.t, kn.tmin, kn.tmax);
        if (res.cut) {
          kn.phase = 1; const keep = cherry.position.clone(); rebuildMeshes(); findCherryAnchor(keep);
        } else { a.state = 'up'; kn.phase = 2; toast(res.tipped ? 'That piece is on its side. Stand it up to slice it.' : 'Too thin a sliver to cut'); }
      }
      if (kn.phase === 1 && kn.edgeY <= 0.002) { kn.edgeY = 0.002; a.state = 'hold'; }
    } else if (a.state === 'hold') {
      a.hold += dt; if (a.hold > 0.22) a.state = 'up';
    } else {
      kn.edgeY += 4.5 * dt;
      if (kn.edgeY > a.topY + 0.15) kn.phase = 2;
      if (kn.edgeY > a.topY + 2.2) { knifeAnim = null; knife.visible = false; return null; }
    }
    knife.position.y = kn.edgeY;
    return kn.phase === 2 ? null : kn;
  }

  // ---------- loop ----------
  let acc = 0, lastT = performance.now(), frame = 0;
  const DT = 1 / 60, SUB = 8;
  function loop(now) {
    requestAnimationFrame(loop);
    let el = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!paused) {
      acc += el * (slow ? 0.25 : 1);
      let steps = 0;
      while (acc >= DT && steps < 2) {
        const prm = params();
        prm.knife = stepKnife(DT);
        if (grab) prm.grab = grab;
        world.step(DT, SUB, prm);
        acc -= DT; steps++;
      }
      if (steps === 2) acc = 0;
    }
    syncMeshes();
    placeCamera();
    renderer.render(scene, camera);
    if (++frame % 8 === 0) {
      const s = world.stats();
      $('sMass').textContent = Math.round(s.mass * 64 * 1.08) + ' g';
      $('sVol').textContent = (s.volFrac * 100).toFixed(1) + '%';
      $('sKe').textContent = (s.ke * 110).toFixed(s.ke * 110 < 10 ? 1 : 0) + ' µJ';
    }
  }

  resize();
  startOver(!reduceMotion);
  document.body.classList.add('ready');
  requestAnimationFrame(loop);
})();
