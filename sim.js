// Purin soft-body core: tetrahedral XPBD + convex-outline cutting. No DOM, no three.js.
const SIM = (() => {
  const H = 0.9, R0 = 1.0, R1 = 0.8;
  const LEVELS = [0, 0.24, 0.48, 0.70, 0.88, 1.0];
  const radiusAt = y => { const t = y / H; return (R0 + (R1 - R0) * t) * (1 + 0.045 * Math.sin(Math.PI * t)); };
  const RM = radiusAt(H / 2);

  // ---------- 2D convex polygons (CCW); v[i].label names edge v[i] -> v[i+1] ----------
  function circlePoly(n = 48) {
    const p = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push({ x: Math.cos(a), y: Math.sin(a), label: 'C' }); }
    return p;
  }
  function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
  // keep side where (a*x + b*y - c) * sgn <= 0
  function clipPoly(poly, a, b, c, sgn, label) {
    const out = [], n = poly.length, f = q => (a * q.x + b * q.y - c) * sgn;
    for (let i = 0; i < n; i++) {
      const P = poly[i], Q = poly[(i + 1) % n], fp = f(P), fq = f(Q);
      const I = () => { const t = fp / (fp - fq); return { x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t }; };
      if (fp <= 0) {
        if (fq <= 0) out.push({ x: P.x, y: P.y, label: P.label });
        else { out.push({ x: P.x, y: P.y, label: P.label }); const q = I(); out.push({ x: q.x, y: q.y, label }); }
      } else if (fq <= 0) { const q = I(); out.push({ x: q.x, y: q.y, label: P.label }); }
    }
    // drop near-duplicate vertices (keep the later label: the zero-length edge vanishes)
    const res = [];
    for (const v of out) { const l = res[res.length - 1]; if (l && Math.hypot(l.x - v.x, l.y - v.y) < 1e-5) l.label = v.label; else res.push(v); }
    if (res.length > 2 && Math.hypot(res[0].x - res[res.length - 1].x, res[0].y - res[res.length - 1].y) < 1e-5) res.pop();
    return res;
  }

  // ---------- Delaunay (Bowyer–Watson) ----------
  function delaunay(pts) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of pts) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); }
    const d = Math.max(maxx - minx, maxy - miny) * 20, cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const P = pts.slice(); const n = pts.length;
    P.push([cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]);
    const circ = (a, b, c) => {
      const ax = P[a][0], ay = P[a][1], bx = P[b][0], by = P[b][1], cx2 = P[c][0], cy2 = P[c][1];
      const D = 2 * (ax * (by - cy2) + bx * (cy2 - ay) + cx2 * (ay - by));
      if (Math.abs(D) < 1e-14) return { a, b, c, x: 0, y: 0, r: Infinity };
      const ux = ((ax * ax + ay * ay) * (by - cy2) + (bx * bx + by * by) * (cy2 - ay) + (cx2 * cx2 + cy2 * cy2) * (ay - by)) / D;
      const uy = ((ax * ax + ay * ay) * (cx2 - bx) + (bx * bx + by * by) * (ax - cx2) + (cx2 * cx2 + cy2 * cy2) * (bx - ax)) / D;
      return { a, b, c, x: ux, y: uy, r: (ax - ux) ** 2 + (ay - uy) ** 2 };
    };
    let tris = [circ(n, n + 1, n + 2)];
    for (let i = 0; i < n; i++) {
      const px = P[i][0], py = P[i][1], bad = [], keep = [];
      for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r * (1 + 1e-10) ? bad : keep).push(t);
      const edges = new Map();
      for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const k = u < v ? u + ',' + v : v + ',' + u; edges.set(k, edges.has(k) ? null : [u, v]);
      }
      tris = keep;
      for (const e of edges.values()) if (e) tris.push(circ(e[0], e[1], i));
    }
    return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => [t.a, t.b, t.c]);
  }

  // ---------- mesh a convex outline into an extruded tetrahedral body ----------
  function meshPiece(poly, h0 = 0.2) {
    const area = polyArea(poly);
    const h = Math.min(h0, Math.sqrt(area) / 2.4);
    const m = poly.length, pts = [], onE = [];
    for (let i = 0; i < m; i++) {
      const P = poly[i], Q = poly[(i + 1) % m], len = Math.hypot(Q.x - P.x, Q.y - P.y);
      const k = Math.max(1, Math.round(len / h));
      for (let j = 0; j < k; j++) {
        const t = j / k; pts.push([P.x + (Q.x - P.x) * t, P.y + (Q.y - P.y) * t]);
        onE.push(j === 0 ? [(i + m - 1) % m, i] : [i]);
      }
    }
    const nb = pts.length;
    const inward = poly.map((P, i) => { const Q = poly[(i + 1) % m], L = Math.hypot(Q.x - P.x, Q.y - P.y); return { px: P.x, py: P.y, nx: -(Q.y - P.y) / L, ny: (Q.x - P.x) / L }; });
    const sd = (x, y) => { let d = Infinity; for (const e of inward) d = Math.min(d, (x - e.px) * e.nx + (y - e.py) * e.ny); return d; };
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of poly) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
    const dy = h * Math.sqrt(3) / 2;
    for (let r = 0, y = miny + dy * 0.5; y < maxy; y += dy, r++)
      for (let x = minx + (r % 2 ? h / 2 : 0) + h * 0.25; x < maxx; x += h)
        if (sd(x, y) > 0.5 * h) { pts.push([x, y]); onE.push([]); }
    let tris = delaunay(pts).filter(([a, b, c]) => {
      const ar = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
      if (Math.abs(ar) < 1e-9) return false;
      return sd((pts[a][0] + pts[b][0] + pts[c][0]) / 3, (pts[a][1] + pts[b][1] + pts[c][1]) / 3) > -1e-7;
    });
    // CCW in (u,v)
    tris = tris.map(([a, b, c]) => {
      const ar = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
      return ar > 0 ? [a, b, c] : [a, c, b];
    });
    const n2 = pts.length, NL = LEVELS.length, N = n2 * NL;
    const rest = new Float32Array(N * 3);
    for (let l = 0; l < NL; l++) {
      const y = LEVELS[l] * H, r = radiusAt(y);
      for (let i = 0; i < n2; i++) { const k = (l * n2 + i) * 3; rest[k] = pts[i][0] * r; rest[k + 1] = y; rest[k + 2] = pts[i][1] * r; }
    }
    const tets = [];
    for (const t of tris) {
      const [v0, v1, v2] = t.slice().sort((a, b) => a - b);
      for (let l = 0; l < NL - 1; l++) {
        const o = l * n2, u = (l + 1) * n2;
        tets.push([v0 + o, v1 + o, v2 + o, v2 + u], [v0 + o, v1 + o, v1 + u, v2 + u], [v0 + o, v0 + u, v1 + u, v2 + u]);
      }
    }
    const T = new Int32Array(tets.length * 4), restVol = new Float32Array(tets.length);
    const edgeSet = new Set(), edges = [];
    tets.forEach((t, i) => {
      let v = tetVol(rest, t[0], t[1], t[2], t[3]);
      if (v < 0) { const s = t[2]; t[2] = t[3]; t[3] = s; v = -v; }
      T.set(t, i * 4); restVol[i] = v;
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        const p = Math.min(t[a], t[b]), q = Math.max(t[a], t[b]), k = p * 100000 + q;
        if (!edgeSet.has(k)) { edgeSet.add(k); edges.push(p, q); }
      }
    });
    const E = new Int32Array(edges), restLen = new Float32Array(edges.length / 2);
    for (let e = 0; e < restLen.length; e++) restLen[e] = dist(rest, E[2 * e], E[2 * e + 1]);

    // ---- render surface: top, bottom, side walls grouped by outline edge label ----
    const sv = [], scar = [], sidx = [], keyMap = new Map();
    const vert = (p, g, car) => { const k = p + '|' + g; let i = keyMap.get(k); if (i === undefined) { i = sv.length; keyMap.set(k, i); sv.push(p); scar.push(car); } return i; };
    const top = (NL - 1) * n2;
    for (const [a, b, c] of tris) {
      sidx.push(vert(a + top, 'T', 1), vert(c + top, 'T', 1), vert(b + top, 'T', 1));
      sidx.push(vert(a, 'B', 0), vert(b, 'B', 0), vert(c, 'B', 0));
    }
    const ecount = new Map();
    for (const [a, b, c] of tris) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = Math.min(u, v) + ',' + Math.max(u, v); const e = ecount.get(k); if (e) e.n++; else ecount.set(k, { n: 1, u, v });
    }
    for (const { n, u, v } of ecount.values()) {
      if (n !== 1) continue; // boundary edge, (u -> v) runs CCW; winding below faces outward
      const common = onE[u].filter(e => onE[v].includes(e));
      const g = common.length ? 'S' + poly[common[0]].label : 'SX';
      for (let l = 0; l < NL - 1; l++) {
        const cl = l + 1 === NL - 1 ? 1 : 0;
        const a = vert(u + l * n2, g, 0), b = vert(v + l * n2, g, 0), c = vert(v + (l + 1) * n2, g, cl), d = vert(u + (l + 1) * n2, g, cl);
        sidx.push(a, c, b, a, d, c);
      }
    }
    return { poly, n2, N, rest, tets: T, restVol, edges: E, restLen, surfVerts: Int32Array.from(sv), surfCaramel: Float32Array.from(scar), surfIndex: Uint32Array.from(sidx), area };
  }

  function dist(x, i, j) { const a = 3 * i, b = 3 * j; return Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]); }
  function tetVol(x, a, b, c, d) {
    a *= 3; b *= 3; c *= 3; d *= 3;
    const e1x = x[b] - x[a], e1y = x[b + 1] - x[a + 1], e1z = x[b + 2] - x[a + 2];
    const e2x = x[c] - x[a], e2y = x[c + 1] - x[a + 1], e2z = x[c + 2] - x[a + 2];
    const e3x = x[d] - x[a], e3y = x[d + 1] - x[a + 1], e3z = x[d + 2] - x[a + 2];
    return ((e1y * e2z - e1z * e2y) * e3x + (e1z * e2x - e1x * e2z) * e3y + (e1x * e2y - e1y * e2x) * e3z) / 6;
  }

  // ---------- small 3x3 helpers (row-major arrays of 9) ----------
  const det3 = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  function inv3(m) {
    const d = det3(m); if (Math.abs(d) < 1e-14) return null; const i = 1 / d;
    return [(m[4] * m[8] - m[5] * m[7]) * i, (m[2] * m[7] - m[1] * m[8]) * i, (m[1] * m[5] - m[2] * m[4]) * i,
      (m[5] * m[6] - m[3] * m[8]) * i, (m[0] * m[8] - m[2] * m[6]) * i, (m[2] * m[3] - m[0] * m[5]) * i,
      (m[3] * m[7] - m[4] * m[6]) * i, (m[1] * m[6] - m[0] * m[7]) * i, (m[0] * m[4] - m[1] * m[3]) * i];
  }
  function polarR(A) {
    let R = A.slice();
    if (det3(R) <= 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let k = 0; k < 30; k++) {
      const I = inv3(R); if (!I) break;
      // R = 0.5 (R + I^T)
      const N = [0.5 * (R[0] + I[0]), 0.5 * (R[1] + I[3]), 0.5 * (R[2] + I[6]), 0.5 * (R[3] + I[1]), 0.5 * (R[4] + I[4]), 0.5 * (R[5] + I[7]), 0.5 * (R[6] + I[2]), 0.5 * (R[7] + I[5]), 0.5 * (R[8] + I[8])];
      let diff = 0; for (let j = 0; j < 9; j++) diff += Math.abs(N[j] - R[j]); R = N; if (diff < 1e-9) break;
    }
    return R;
  }

  // ---------- the world ----------
  class World {
    constructor() { this.cutCount = 0; this.reset(); }
    reset() {
      const mesh = meshPiece(circlePoly());
      this.build([{ mesh, pos: mesh.rest.slice(), vel: new Float32Array(mesh.N * 3) }]);
    }
    build(list) {
      let N = 0, NT = 0, NE = 0;
      for (const p of list) { N += p.mesh.N; NT += p.mesh.restVol.length; NE += p.mesh.restLen.length; }
      this.N = N;
      this.pos = new Float32Array(N * 3); this.prev = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
      this.rest = new Float32Array(N * 3); this.invMass = new Float32Array(N); this.pieceOf = new Int32Array(N);
      this.tets = new Int32Array(NT * 4); this.restVol = new Float32Array(NT); this.tetPiece = new Int32Array(NT);
      this.edges = new Int32Array(NE * 2); this.restLen = new Float32Array(NE);
      this.knifeSide = new Int8Array(N);
      this.pieces = [];
      let po = 0, to = 0, eo = 0;
      list.forEach((p, k) => {
        const m = p.mesh;
        this.pos.set(p.pos, po * 3); this.vel.set(p.vel, po * 3); this.rest.set(m.rest, po * 3);
        for (let i = 0; i < m.restVol.length; i++) { for (let j = 0; j < 4; j++) this.tets[(to + i) * 4 + j] = m.tets[i * 4 + j] + po; this.restVol[to + i] = m.restVol[i]; this.tetPiece[to + i] = k; }
        for (let i = 0; i < m.restLen.length; i++) { this.edges[(eo + i) * 2] = m.edges[i * 2] + po; this.edges[(eo + i) * 2 + 1] = m.edges[i * 2 + 1] + po; this.restLen[eo + i] = m.restLen[i]; }
        for (let i = 0; i < m.N; i++) { this.pieceOf[po + i] = k; this.knifeSide[po + i] = p.side || 0; }
        this.pieces.push({ mesh: m, pOff: po, tOff: to, nt: m.restVol.length, eOff: eo, ne: m.restLen.length, side: p.side || 0 });
        po += m.N; to += m.restVol.length; eo += m.restLen.length;
      });
      const mass = new Float32Array(N);
      for (let t = 0; t < NT; t++) for (let j = 0; j < 4; j++) mass[this.tets[t * 4 + j]] += this.restVol[t] / 4;
      for (let i = 0; i < N; i++) this.invMass[i] = mass[i] > 0 ? 1 / mass[i] : 0;
      this.mass = mass;
      this.totalRestVol = this.restVol.reduce((a, b) => a + b, 0);
      this.lambdaGrab = 0;
    }

    step(dt, sub, prm) {
      const sdt = dt / sub, N = this.N, x = this.pos, pv = this.prev, v = this.vel, w = this.invMass;
      const g = prm.gravity;
      for (let s = 0; s < sub; s++) {
        for (let i = 0; i < N; i++) {
          const k = 3 * i; v[k + 1] -= g * sdt;
          pv[k] = x[k]; pv[k + 1] = x[k + 1]; pv[k + 2] = x[k + 2];
          x[k] += v[k] * sdt; x[k + 1] += v[k + 1] * sdt; x[k + 2] += v[k + 2] * sdt;
        }
        this.solveEdges(prm.edgeCompliance / (sdt * sdt));
        this.solveVolumes(prm.volCompliance / (sdt * sdt));
        if (prm.grab) this.solveGrab(prm.grab, prm.grabCompliance / (sdt * sdt));
        if (prm.knife) this.solveKnife(prm.knife);
        if (this.pieces.length > 1) this.solveCollisions(prm.collide || 0.06);
        this.solveGround(prm.friction);
        const isdt = 1 / sdt;
        for (let i = 0; i < 3 * N; i++) v[i] = (x[i] - pv[i]) * isdt;
        this.dampEdges(prm.edgeDamp);
      }
    }
    solveEdges(at) {
      const x = this.pos, w = this.invMass, E = this.edges, L = this.restLen, ne = L.length;
      for (let e = 0; e < ne; e++) {
        const i = E[2 * e], j = E[2 * e + 1], a = 3 * i, b = 3 * j;
        const dx = x[a] - x[b], dy = x[a + 1] - x[b + 1], dz = x[a + 2] - x[b + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-9) continue;
        const ws = w[i] + w[j]; if (ws === 0) continue;
        const s = -(len - L[e]) / (ws + at) / len;
        x[a] += dx * s * w[i]; x[a + 1] += dy * s * w[i]; x[a + 2] += dz * s * w[i];
        x[b] -= dx * s * w[j]; x[b + 1] -= dy * s * w[j]; x[b + 2] -= dz * s * w[j];
      }
    }
    solveVolumes(at) {
      const x = this.pos, w = this.invMass, T = this.tets, V0 = this.restVol, nt = V0.length;
      const g = new Float64Array(12);
      for (let t = 0; t < nt; t++) {
        const id = [T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]];
        let ws = 0;
        // grad wrt vertex j = cross(x[o1]-x[o0], x[o2]-x[o0]) / 6
        for (let j = 0; j < 4; j++) {
          const o = ORDER[j], p0 = 3 * id[o[0]], p1 = 3 * id[o[1]], p2 = 3 * id[o[2]];
          const ax = x[p1] - x[p0], ay = x[p1 + 1] - x[p0 + 1], az = x[p1 + 2] - x[p0 + 2];
          const bx = x[p2] - x[p0], by = x[p2 + 1] - x[p0 + 1], bz = x[p2 + 2] - x[p0 + 2];
          const gx = (ay * bz - az * by) / 6, gy = (az * bx - ax * bz) / 6, gz = (ax * by - ay * bx) / 6;
          g[3 * j] = gx; g[3 * j + 1] = gy; g[3 * j + 2] = gz;
          ws += w[id[j]] * (gx * gx + gy * gy + gz * gz);
        }
        if (ws === 0) continue;
        const C = tetVol(x, id[0], id[1], id[2], id[3]) - V0[t];
        const s = -C / (ws + at);
        for (let j = 0; j < 4; j++) { const k = 3 * id[j], f = s * w[id[j]]; x[k] += g[3 * j] * f; x[k + 1] += g[3 * j + 1] * f; x[k + 2] += g[3 * j + 2] * f; }
      }
    }
    solveGrab(gr, at) {
      const x = this.pos, w = this.invMass;
      for (let n = 0; n < gr.ids.length; n++) {
        const i = gr.ids[n], k = 3 * i, wt = gr.wts[n];
        const tx = gr.target[0] + gr.off[3 * n], ty = gr.target[1] + gr.off[3 * n + 1], tz = gr.target[2] + gr.off[3 * n + 2];
        const f = w[i] / (w[i] + at / wt);
        x[k] += (tx - x[k]) * f; x[k + 1] += (ty - x[k + 1]) * f; x[k + 2] += (tz - x[k + 2]) * f;
      }
    }
    solveKnife(kn) {
      const x = this.pos, N = this.N, n = kn.n, p = kn.p, t = kn.t;
      for (let i = 0; i < N; i++) {
        const k = 3 * i, rx = x[k] - p[0], ry = x[k + 1] - p[1], rz = x[k + 2] - p[2];
        const along = rx * t[0] + rz * t[2];
        if (along < kn.tmin || along > kn.tmax) continue;
        const d = rx * n[0] + rz * n[2];
        if (kn.phase === 0) {
          if (Math.abs(d) < kn.groove && x[k + 1] > kn.edgeY) {
            const f = 1 - Math.abs(d) / kn.groove; x[k + 1] += (kn.edgeY - x[k + 1]) * f * f * 0.5;
          }
        } else {
          const side = this.knifeSide[i]; if (!side) continue;
          if (x[k + 1] > kn.edgeY - 0.01) {
            const want = kn.wedge * Math.min(1, (x[k + 1] - kn.edgeY + 0.08) / 0.3 + 0.35);
            const dd = d * side;
            if (dd < want) { const push = (want - dd) * side; x[k] += n[0] * push; x[k + 2] += n[2] * push; }
          }
        }
      }
    }
    solveCollisions(r) {
      const x = this.pos, w = this.invMass, N = this.N, po = this.pieceOf, cell = r, inv = 1 / cell;
      const map = new Map();
      const key = (a, b, c) => (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
      for (let i = 0; i < N; i++) {
        const k = key(Math.floor(x[3 * i] * inv), Math.floor(x[3 * i + 1] * inv), Math.floor(x[3 * i + 2] * inv));
        const l = map.get(k); if (l) l.push(i); else map.set(k, [i]);
      }
      const r2 = r * r;
      for (let i = 0; i < N; i++) {
        const cx = Math.floor(x[3 * i] * inv), cy = Math.floor(x[3 * i + 1] * inv), cz = Math.floor(x[3 * i + 2] * inv);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const l = map.get(key(cx + a, cy + b, cz + c)); if (!l) continue;
          for (const j of l) {
            if (j <= i || po[j] === po[i]) continue;
            const dx = x[3 * i] - x[3 * j], dy = x[3 * i + 1] - x[3 * j + 1], dz = x[3 * i + 2] - x[3 * j + 2];
            const d2 = dx * dx + dy * dy + dz * dz; if (d2 >= r2 || d2 < 1e-12) continue;
            const d = Math.sqrt(d2), ws = w[i] + w[j], s = (r - d) / d / ws;
            x[3 * i] += dx * s * w[i]; x[3 * i + 1] += dy * s * w[i]; x[3 * i + 2] += dz * s * w[i];
            x[3 * j] -= dx * s * w[j]; x[3 * j + 1] -= dy * s * w[j]; x[3 * j + 2] -= dz * s * w[j];
          }
        }
      }
    }
    solveGround(mu) {
      const x = this.pos, pv = this.prev, N = this.N;
      for (let i = 0; i < N; i++) {
        const k = 3 * i, h = plateHeight(x[k], x[k + 2]);
        if (x[k + 1] < h) {
          x[k + 1] = h;
          x[k] -= (x[k] - pv[k]) * mu; x[k + 2] -= (x[k + 2] - pv[k + 2]) * mu;
        }
      }
    }
    dampEdges(f) {
      if (f <= 0) return;
      const x = this.pos, v = this.vel, w = this.invMass, E = this.edges, ne = this.restLen.length;
      for (let e = 0; e < ne; e++) {
        const i = E[2 * e], j = E[2 * e + 1], a = 3 * i, b = 3 * j;
        let nx = x[b] - x[a], ny = x[b + 1] - x[a + 1], nz = x[b + 2] - x[a + 2];
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz); if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
        const rv = (v[b] - v[a]) * nx + (v[b + 1] - v[a + 1]) * ny + (v[b + 2] - v[a + 2]) * nz;
        const ws = w[i] + w[j]; if (ws === 0) continue;
        const c = rv * f / ws;
        v[a] += nx * c * w[i]; v[a + 1] += ny * c * w[i]; v[a + 2] += nz * c * w[i];
        v[b] -= nx * c * w[j]; v[b + 1] -= ny * c * w[j]; v[b + 2] -= nz * c * w[j];
      }
    }

    stats() {
      let vol = 0, ke = 0;
      for (let t = 0; t < this.restVol.length; t++) vol += tetVol(this.pos, this.tets[4 * t], this.tets[4 * t + 1], this.tets[4 * t + 2], this.tets[4 * t + 3]);
      for (let i = 0; i < this.N; i++) { const k = 3 * i; ke += 0.5 * this.mass[i] * (this.vel[k] ** 2 + this.vel[k + 1] ** 2 + this.vel[k + 2] ** 2); }
      return { volFrac: vol / this.totalRestVol, ke, mass: this.totalRestVol, pieces: this.pieces.length };
    }

    // best-fit rigid transform (rest -> current) of one piece
    pieceFrame(pc) {
      const x = this.pos, r = this.rest, m = this.mass, o = pc.pOff, n = pc.mesh.N;
      let M = 0; const c = [0, 0, 0], c0 = [0, 0, 0];
      for (let i = o; i < o + n; i++) { M += m[i]; for (let a = 0; a < 3; a++) { c[a] += m[i] * x[3 * i + a]; c0[a] += m[i] * r[3 * i + a]; } }
      for (let a = 0; a < 3; a++) { c[a] /= M; c0[a] /= M; }
      const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let i = o; i < o + n; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) A[3 * a + b] += m[i] * (x[3 * i + a] - c[a]) * (r[3 * i + b] - c0[b]);
      return { R: polarR(A), c, c0 };
    }

    // Cut every piece the vertical blade plane crosses. p: point, n: horizontal normal, segment along t in [tmin,tmax].
    // Returns { cut: number, skippedTipped: bool }
    cut(p, n, t, tmin, tmax) {
      const label = 'K' + (++this.cutCount);
      const out = []; let cutN = 0, tipped = false;
      this.pieces.forEach((pc, k) => {
        const o = pc.pOff, N = pc.mesh.N, x = this.pos;
        let neg = 0, posC = 0, inSeg = false;
        for (let i = o; i < o + N; i++) {
          const rx = x[3 * i] - p[0], rz = x[3 * i + 2] - p[2], d = rx * n[0] + rz * n[2];
          if (d < -0.03) neg++; else if (d > 0.03) posC++;
          const al = rx * t[0] + rz * t[2];
          if (Math.abs(d) < 0.15 && al > tmin && al < tmax) inSeg = true;
        }
        const keep = () => out.push({ mesh: pc.mesh, pos: x.slice(3 * o, 3 * (o + N)), vel: this.vel.slice(3 * o, 3 * (o + N)), side: 0 });
        if (!(neg > 2 && posC > 2 && inSeg)) return keep();
        const { R, c, c0 } = this.pieceFrame(pc);
        const nw = [n[0], 0, n[2]];
        const nr = [R[0] * nw[0] + R[3] * nw[1] + R[6] * nw[2], R[1] * nw[0] + R[4] * nw[1] + R[7] * nw[2], R[2] * nw[0] + R[5] * nw[1] + R[8] * nw[2]];
        const q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const pr = [R[0] * q[0] + R[3] * q[1] + R[6] * q[2] + c0[0], R[1] * q[0] + R[4] * q[1] + R[7] * q[2] + c0[1], R[2] * q[0] + R[5] * q[1] + R[8] * q[2] + c0[2]];
        if (Math.hypot(nr[0], nr[2]) < 0.6) { tipped = true; return keep(); }
        const dd = nr[0] * pr[0] + nr[1] * pr[1] + nr[2] * pr[2];
        let a = nr[0] * RM, b = nr[2] * RM, cc = dd - nr[1] * H / 2; const L = Math.hypot(a, b); a /= L; b /= L; cc /= L;
        const A1 = clipPoly(pc.mesh.poly, a, b, cc, 1, label), A2 = clipPoly(pc.mesh.poly, a, b, cc, -1, label);
        if (A1.length < 3 || A2.length < 3 || polyArea(A1) < 0.025 || polyArea(A2) < 0.025) return keep();
        cutN++;
        for (const [poly, s] of [[A1, -1], [A2, 1]]) {
          const mesh = meshPiece(poly);
          const pos = new Float32Array(mesh.N * 3), vel = new Float32Array(mesh.N * 3);
          this.transfer(pc, mesh.rest, pos, vel);
          out.push({ mesh, pos, vel, side: s });
        }
      });
      if (cutN) this.build(out);
      return { cut: cutN, tipped };
    }
    // map rest points into the current deformed state of piece pc
    transfer(pc, restPts, pos, vel) {
      const r = this.rest, x = this.pos, v = this.vel, T = this.tets;
      if (!pc.inv) {
        pc.inv = [];
        for (let t = pc.tOff; t < pc.tOff + pc.nt; t++) {
          const a = 3 * T[4 * t], b = 3 * T[4 * t + 1], c = 3 * T[4 * t + 2], d = 3 * T[4 * t + 3];
          const Dm = [r[b] - r[a], r[c] - r[a], r[d] - r[a], r[b + 1] - r[a + 1], r[c + 1] - r[a + 1], r[d + 1] - r[a + 1], r[b + 2] - r[a + 2], r[c + 2] - r[a + 2], r[d + 2] - r[a + 2]];
          let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
          for (const q of [a, b, c, d]) { mnx = Math.min(mnx, r[q]); mny = Math.min(mny, r[q + 1]); mnz = Math.min(mnz, r[q + 2]); mxx = Math.max(mxx, r[q]); mxy = Math.max(mxy, r[q + 1]); mxz = Math.max(mxz, r[q + 2]); }
          pc.inv.push({ t, I: inv3(Dm), box: [mnx, mny, mnz, mxx, mxy, mxz] });
        }
      }
      const M = restPts.length / 3;
      for (let i = 0; i < M; i++) {
        const px = restPts[3 * i], py = restPts[3 * i + 1], pz = restPts[3 * i + 2];
        let best = null, bestMin = -Infinity, bb = null;
        for (const e of pc.inv) {
          const bx = e.box, m = 0.02;
          if (bestMin > -0.05 && (px < bx[0] - m || px > bx[3] + m || py < bx[1] - m || py > bx[4] + m || pz < bx[2] - m || pz > bx[5] + m)) continue;
          if (!e.I) continue;
          const a = 3 * T[4 * e.t], qx = px - r[a], qy = py - r[a + 1], qz = pz - r[a + 2], I = e.I;
          const b1 = I[0] * qx + I[1] * qy + I[2] * qz, b2 = I[3] * qx + I[4] * qy + I[5] * qz, b3 = I[6] * qx + I[7] * qy + I[8] * qz, b0 = 1 - b1 - b2 - b3;
          const mn = Math.min(b0, b1, b2, b3);
          if (mn > bestMin) { bestMin = mn; best = e; bb = [b0, b1, b2, b3]; if (mn >= -1e-6) break; }
        }
        for (let a = 0; a < 3; a++) { pos[3 * i + a] = 0; vel[3 * i + a] = 0; }
        for (let j = 0; j < 4; j++) { const q = 3 * T[4 * best.t + j]; for (let a = 0; a < 3; a++) { pos[3 * i + a] += bb[j] * x[q + a]; vel[3 * i + a] += bb[j] * v[q + a]; } }
      }
    }
  }
  const ORDER = [[1, 3, 2], [0, 2, 3], [0, 3, 1], [0, 1, 2]];
  const PLATE_R = 2.35, RIM_R = 2.75, RIM_H = 0.16;
  function plateHeight(x, z) { const r = Math.hypot(x, z); if (r < PLATE_R) return 0; const t = Math.min(1, (r - PLATE_R) / (RIM_R - PLATE_R)); return RIM_H * t * t; }

  return { World, meshPiece, circlePoly, clipPoly, polyArea, H, R0, R1, radiusAt, plateHeight, PLATE_R, RIM_R, RIM_H, tetVol };
})();
if (typeof module !== 'undefined') module.exports = SIM;
