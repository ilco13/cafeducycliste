// Vue 3D de la cabine d'essayage : mannequin Three.js habillé par projection des packshots.
// Chaque vêtement est une coque autour du corps ; la photo de face est projetée de face
// (coordonnées en cm identiques à la vue 2D), la vue de dos à plat quand elle existe.
// La silhouette (manches, ourlet, col) vient de la transparence de la photo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const H = 180; // y 2D (cm depuis le sommet du crâne, vers le bas) -> Y 3D = H - y

// ---------- Géométrie du corps (cm)
// Torse : [y, demi-largeur, profondeur avant, profondeur arrière, décalage z]
const TORSO = [
  [16, 4.5, 4.9, 4.9, -0.8], [21, 4.8, 5.2, 5.2, -0.6], [24, 6.2, 5.8, 6.0, -0.4], [26, 9.6, 6.6, 7.4, -0.2],
  [27.8, 13.4, 7.6, 8.8, 0], [29.8, 17, 8.8, 9.9, 0], [31.8, 19.3, 9.9, 10.7, 0], [34.2, 20.3, 11.1, 11.1, 0.2],
  [38.5, 20.1, 12.2, 11.5, 0.4], [44, 19.0, 12.5, 11.3, 0.4], [50, 17.4, 11.7, 10.9, 0.3], [56, 16.3, 11.0, 10.5, 0.2],
  [63, 15.0, 10.6, 10.1, 0.2], [69, 14.6, 10.4, 9.9, 0.2], [75, 15.2, 10.3, 10.6, 0], [81, 16.3, 10.3, 11.8, -0.2],
  [86.5, 16.7, 10.2, 12.6, -0.4], [91, 15.3, 9.7, 11.9, -0.4], [94.5, 10.2, 7.2, 8.3, -0.4], [96, 5, 4, 4.5, -0.4],
];
// Jambe droite (x > 0) : [y, centre x, demi-largeur, profondeur avant, profondeur arrière]
const LEG = [
  [84, 8.5, 7.9, 8.1, 8.5], [93, 8.8, 7.8, 8.1, 8.3], [104, 8.9, 7.1, 7.6, 7.0], [114, 8.6, 6.2, 6.7, 5.9],
  [123, 8.1, 5.5, 5.9, 5.2], [132, 7.2, 4.6, 4.9, 4.6], [138, 7.4, 4.8, 4.4, 5.6], [145, 7.3, 4.6, 4.0, 5.9],
  [153, 6.5, 3.9, 3.6, 4.9], [161, 5.6, 3.0, 3.1, 3.4], [169, 4.7, 2.3, 2.6, 2.5], [174.5, 4.6, 2.3, 2.7, 2.7],
];
// Bras : abscisse curviligne depuis l'épaule [s, rayon]
const ARM_S = [[-3, 4.1], [0, 4.8], [6, 5.0], [14, 4.7], [22, 4.2], [29, 3.8], [33, 3.9], [40, 3.8], [48, 3.1], [56, 2.75], [59, 2.7]];
const SHOULDER = [19.4, 34.5], ARM_ANG = 10 * Math.PI / 180, UPPER = 31, FORE = 27;
const ELBOW_S = UPPER, HAND_S = UPPER + FORE + 8.2;
// L'avant-bras part légèrement vers l'avant (coude un peu fléchi)
const armZ = (s) => (s > ELBOW_S ? (s - ELBOW_S) * 0.13 : 0) + 0.3;

function armFrame(side) {
  const dx = Math.sin(ARM_ANG) * side, dy = Math.cos(ARM_ANG);
  return { o: [SHOULDER[0] * side, SHOULDER[1]], d: [dx, dy], u: [dy, -dx] };
}
const wristY = SHOULDER[1] + (UPPER + FORE) * Math.cos(ARM_ANG);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
const lerp = (a, b, t) => a + (b - a) * t;

// Anneau : { c:[x,y2d,z], u:[ux,uy] (axe horizontal de l'ellipse dans le plan xy), rx, rf (avant), rb (arrière), p (rondeur), s }
const KEYS = ['cx', 'cy', 'cz', 'ux', 'uy', 'rx', 'rf', 'rb', 'p', 's'];
const flat = (r) => [r.c[0], r.c[1], r.c[2], r.u[0], r.u[1], r.rx, r.rf, r.rb, r.p ?? 1, r.s ?? 0];
const unflat = (v) => ({ c: [v[0], v[1], v[2]], u: [v[3], v[4]], rx: v[5], rf: v[6], rb: v[7], p: v[8], s: v[9] });
// Interpolation Catmull-Rom entre les anneaux : silhouette lisse au lieu d'une ligne brisée.
function densify(rings, sub = 4) {
  const F = rings.map(flat), out = [];
  for (let i = 0; i < F.length - 1; i++) {
    const p0 = F[Math.max(0, i - 1)], p1 = F[i], p2 = F[i + 1], p3 = F[Math.min(F.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out.push(unflat(p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))));
    }
  }
  out.push(unflat(F[F.length - 1]));
  return out;
}
// Garde les anneaux dont la clé est dans [lo, hi], avec un anneau interpolé sur chaque borne.
function clip(rings, key, lo, hi) {
  const out = [];
  for (let i = 0; i < rings.length; i++) {
    const v = key(rings[i]);
    if (v >= lo && v <= hi) { out.push(rings[i]); continue; }
    for (const j of [i - 1, i + 1]) {
      const r2 = rings[j]; if (!r2) continue;
      const w = key(r2);
      if (w < lo || w > hi) continue;
      const lim = v < lo ? lo : hi, t = (lim - v) / (w - v);
      const a = flat(rings[i]), b = flat(r2);
      out.push(unflat(a.map((x, k) => lerp(x, b[k], t))));
    }
  }
  return out.sort((a, b) => key(a) - key(b));
}
const TORSO_R = densify(TORSO.map(([y, hw, f, b, z]) => ({ c: [0, y, z], u: [1, 0], rx: hw, rf: f, rb: b, p: 0.86, s: y })), 5);
const LEG_R = densify(LEG.map(([y, cx, hw, f, b]) => ({ c: [cx, y, 0.4], u: [1, 0], rx: hw, rf: f, rb: b, p: 1, s: y })), 5);
const ARM_R = densify(ARM_S.map(([s, r]) => ({ c: [0, 0, 0], u: [0, 0], rx: r * 0.97, rf: r, rb: r, p: 1, s })), 5);
function torsoRings(y0 = -1e9, y1 = 1e9) { return clip(TORSO_R, (r) => r.c[1], y0, y1); }
function legRings(side, y0 = -1e9, y1 = 1e9) {
  return clip(LEG_R, (r) => r.c[1], y0, y1).map((r) => ({ ...r, c: [side * r.c[0], r.c[1], r.c[2]] }));
}
function armRings(side, s0 = -1e9, s1 = 1e9) {
  const f = armFrame(side);
  return clip(ARM_R, (r) => r.s, s0, s1).map((r) => ({ ...r, c: [f.o[0] + f.d[0] * r.s, f.o[1] + f.d[1] * r.s, armZ(r.s)], u: f.u }));
}
// abscisse sur le bras correspondant à une hauteur y (2D)
const sAtY = (y) => (y - SHOULDER[1]) / Math.cos(ARM_ANG);

// Loft : anneaux -> maillage. wr(r, t) ajoute un relief (plis) à la coque.
const SEG = 64;
function loft(rings, off = 0, cap = false, wr = null) {
  const pos = [], idx = [];
  for (const r of rings) {
    for (let j = 0; j <= SEG; j++) {
      const t = (j / SEG) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t), p = r.p ?? 1;
      const o = off + (wr ? wr(r, t) : 0);
      const a = Math.sign(c) * Math.abs(c) ** p * (r.rx + o), b = Math.sign(sn) * Math.abs(sn) ** p * ((sn >= 0 ? r.rf : r.rb) + o);
      pos.push(r.c[0] + r.u[0] * a, H - (r.c[1] + r.u[1] * a), r.c[2] + b);
    }
  }
  const n = SEG + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (cap) {
    for (const [ri, flip] of [[0, true], [rings.length - 1, false]]) {
      const r = rings[ri], ci = pos.length / 3;
      pos.push(r.c[0], H - r.c[1], r.c[2]);
      for (let j = 0; j < SEG; j++) {
        const a = ri * n + j, b = a + 1;
        flip ? idx.push(ci, b, a) : idx.push(ci, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Plis : toujours positifs (le tissu ne rentre pas dans la couche du dessous)
const wave = (x) => 0.5 + 0.5 * Math.sin(x);
function sleeveFolds(amp, cutS) {
  return (r, t) => {
    const s = r.s;
    const env = 0.25 + 1.1 * gauss(s, ELBOW_S + 1, 5) + 1.3 * smooth(cutS - 10, cutS - 1, s) * (cutS > 40 ? 1 : 0.3);
    const fold = wave(s * 1.25 + 1.8 * Math.sin(t * 2 + s * 0.35)) * (0.55 + 0.45 * Math.cos(t + 1.2));
    return amp * env * fold * smooth(-3, 4, s);
  };
}
function torsoFolds(amp) {
  return (r, t) => {
    const y = r.c[1];
    const drape = smooth(48, 62, y) * (1 - smooth(86, 95, y)) * wave(t * 8 + Math.sin(y * 0.18) * 2) * 0.45;
    const waist = gauss(y, 72, 5) * wave(y * 1.4 + 2 * Math.sin(t * 3)) * 0.9;
    const pit = gauss(y, 40, 4) * gauss(Math.abs(Math.cos(t)), 1, 0.18) * wave(y * 2 + t * 3) * 1.2;
    return amp * (drape + waist + pit);
  };
}
function legFolds(amp) {
  return (r, t) => amp * (gauss(r.c[1], 132, 4) * wave(r.c[1] * 1.6 + 2 * Math.sin(t * 2)) + gauss(r.c[1], 94, 3) * wave(t * 5));
}

function ellipsoid(rx, ry, rz, seg = 32) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  g.scale(rx, ry, rz);
  return g;
}
// Chaussure : sections (largeur, hauteur) le long du pied, semelle plate. Repère local : x travers, y haut, z avant.
function shoeGeometry(high) {
  const prof = high
    ? [[-7.6, 3.4, 15.5], [-6.6, 4.1, 16], [-4, 4.4, 15], [0, 4.5, 10.5], [4, 4.6, 8], [9, 4.7, 6.2], [13, 4.4, 4.6], [16.5, 3.7, 3.2], [18.8, 2.6, 2.2], [20, 1.2, 1.2]]
    : [[-7.4, 3.3, 6.8], [-6.4, 4.0, 7.4], [-4, 4.3, 7.4], [0, 4.4, 6.9], [4, 4.6, 6.0], [9, 4.7, 5.0], [13, 4.4, 4.0], [16.5, 3.7, 2.9], [18.8, 2.6, 2.0], [20, 1.2, 1.1]];
  const rings = prof.map(([z, w, h]) => ({ z, w, h }));
  const dense = [];
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < 4; k++) {
    const t = k / 4, a = rings[i], b = rings[i + 1];
    dense.push({ z: lerp(a.z, b.z, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
  }
  dense.push(rings[rings.length - 1]);
  const pos = [], idx = [], N = 40;
  for (const r of dense) {
    for (let j = 0; j <= N; j++) {
      const t = (j / N) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      // dessus arrondi, dessous presque plat
      const y = sn >= 0 ? sn * r.h : sn * 0.6;
      pos.push(Math.sign(c) * Math.abs(c) ** 0.7 * r.w, y + 0.6, r.z);
    }
  }
  const n = N + 1;
  for (let i = 0; i < dense.length - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  for (const [ri, flip] of [[0, false], [dense.length - 1, true]]) {
    const ci = pos.length / 3, r = dense[ri];
    pos.push(0, r.h * 0.3, r.z);
    for (let j = 0; j < N; j++) { const a = ri * n + j, b = a + 1; flip ? idx.push(ci, a, b) : idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------- Matériau projeté
// uAxis 0 : projection de face (x, y) ; 1 : projection de côté (z, y) dans le repère local du maillage.
function garmentMaterial(opts) {
  const m = new THREE.MeshPhysicalMaterial({
    roughness: opts.roughness ?? 0.8, metalness: 0, side: THREE.DoubleSide,
    sheen: opts.sheen ?? 0.4, sheenRoughness: 0.65, sheenColor: new THREE.Color(0.55, 0.55, 0.55),
    clearcoat: opts.clearcoat ?? 0, clearcoatRoughness: 0.25,
  });
  const u = {
    uFront: { value: opts.front || null }, uBack: { value: opts.back || null },
    uRect: { value: new THREE.Vector4(...(opts.rect || [0, 0, 1, 1])) },
    uRectB: { value: new THREE.Vector4(...(opts.rectB || [0, 0, 1, 1])) },
    uBoxB: { value: new THREE.Vector4(...(opts.boxB || [0, 0, 1, 1])) },
    uCrop: { value: new THREE.Vector4(...(opts.crop || [0, 0, 1, 1])) },
    uBase: { value: new THREE.Color(opts.base || '#888') },
    uMode: { value: opts.mode ?? 0 }, // 0 couleur unie, 1 projeté + découpe alpha, 2 projeté sans découpe
    uAxis: { value: opts.axis ?? 0 },
    uFlip: { value: opts.flip ? 1 : 0 },
    uCut: { value: new THREE.Vector2(opts.cutTop ?? -1e4, opts.cutBottom ?? 1e4) },
    uHasBack: { value: opts.back ? 1 : 0 },
    uKeep: { value: opts.keepShoulders ? 1 : 0 },
    uVent: { value: new THREE.Vector2(opts.vents || 0, opts.ventGap || 3) },
    // manches (uAxis 2) : repère du bras 3D (origine, axe, normale) et segment épaule -> poignet de la manche sur la photo
    uArmO: { value: new THREE.Vector2(...(opts.arm?.o || [0, 0])) }, uArmD: { value: new THREE.Vector2(...(opts.arm?.d || [0, 1])) },
    uArmU: { value: new THREE.Vector2(...(opts.arm?.u || [1, 0])) }, uArmA: { value: new THREE.Vector2(...(opts.arm?.a || [0, 0])) },
    uArmB: { value: new THREE.Vector2(...(opts.arm?.b || [0, 1])) }, uArmK: { value: new THREE.Vector2(...(opts.arm?.k || [1, 1])) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vOP; varying vec3 vON;
uniform sampler2D uFront; uniform sampler2D uBack;
uniform vec4 uRect; uniform vec4 uRectB; uniform vec4 uBoxB; uniform vec4 uCrop; uniform vec3 uBase; uniform float uMode; uniform float uAxis; uniform float uFlip;
uniform vec2 uCut; uniform float uHasBack; uniform vec2 uVent; uniform float uKeep;
uniform vec2 uArmO; uniform vec2 uArmD; uniform vec2 uArmU; uniform vec2 uArmA; uniform vec2 uArmB; uniform vec2 uArmK;`)
      .replace('#include <map_fragment>', `
float y2d = ${H.toFixed(1)} - vOP.y;
if (y2d < uCut.x || y2d > uCut.y) discard;
vec3 col = uBase;
vec3 nO = normalize(vON);
if (uMode > 0.5) {
  vec2 P = vec2(vOP.x, y2d);
  if (uAxis > 1.5) {
    // point du bras exprimé le long de la manche de la photo
    vec2 d = P - uArmO; float sa = dot(d, uArmD), la = dot(d, uArmU);
    vec2 dir = normalize(uArmB - uArmA), perp = vec2(dir.y, -dir.x);
    P = uArmA + dir * sa * uArmK.x + perp * la * uArmK.y;
  }
  vec2 uv = (uAxis > 0.5 && uAxis < 1.5)
    ? vec2((vOP.z - uRect.x) / uRect.z, (uRect.y - vOP.y) / uRect.w)
    : vec2((P.x - uRect.x) / uRect.z, (P.y - uRect.y) / uRect.w);
  if (uFlip > 0.5) uv.x = 1.0 - uv.x;
  bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
  vec2 uvc = uCrop.xy + uv * uCrop.zw;
  vec4 t = inside ? texture2D(uFront, uvc) : vec4(0.0);
  // épaules : la photo de face tombe plus bas que la coque ; on garde le tissu (sauf l'encolure)
  bool keep = uKeep > 0.5 && y2d < 38.0 && abs(vOP.x) > 7.0;
  vec4 t0 = t;
  if (uMode < 1.5 && t.a < 0.5 && !keep) discard;
  float front = (uAxis > 0.5 && uAxis < 1.5) ? smoothstep(0.05, 0.5, abs(nO.x)) : smoothstep(-0.25, 0.35, nO.z);
  // sans vue de dos : couleurs de la face, très floutées (on garde les aplats, pas les logos ni le zip)
  vec4 tbl = inside ? texture2D(uFront, uvc, 6.0) : vec4(0.0);
  vec3 backCol = mix(uBase, tbl.rgb, 0.7 * smoothstep(0.75, 0.95, tbl.a));
  if (uHasBack > 0.5) {
    // vue de dos : boîte du vêtement de dos calée sur la boîte du vêtement de face, image miroir
    vec2 ub = vec2((P.x - uRectB.x) / uRectB.z, (P.y - uRectB.y) / uRectB.w);
    ub = vec2(uBoxB.x + (1.0 - ub.x) * uBoxB.z, uBoxB.y + ub.y * uBoxB.w);
    vec4 tb = texture2D(uBack, clamp(ub, 0.0, 1.0));
    if (tb.a > 0.5) backCol = tb.rgb;
  }
  vec3 frontCol = t.a > 0.5 ? t.rgb : backCol;
  col = mix(backCol, frontCol, front);
}
if (uVent.x > 0.5) {
  // aérations du casque : fentes longitudinales sombres sur le dessus
  float hw = (uVent.x - 1.0) * 0.5 * uVent.y;
  float k = abs(fract((vOP.x + hw) / uVent.y + 0.5) - 0.5) * uVent.y;
  float on = step(k, uVent.y * 0.22) * step(abs(vOP.x), hw + 0.05) * step(0.55, vOP.y) * step(vOP.z, 0.72) * step(-0.55, vOP.z);
  col = mix(col, vec3(0.03), on);
}
diffuseColor.rgb = col;`);
  };
  m.customProgramCacheKey = () => 'garment2';
  return m;
}

// ---------- Analyse d'image : couleur dominante, boîte opaque, texture dilatée
const imgCache = new Map();
function analyse(im) {
  if (imgCache.has(im)) return imgCache.get(im);
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
  const s = Math.min(1, 160 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, cw, ch);
  const d = x.getImageData(0, 0, cw, ch).data;
  const bins = new Map();
  let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 200) continue;
    const px = p % cw, py = (p / cw) | 0;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    const k = (d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5);
    const b = bins.get(k) || [0, 0, 0, 0]; b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++; bins.set(k, b);
  }
  const ranked = [...bins.values()].sort((a, b) => b[3] - a[3]).map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3], b[3]]);
  const base = ranked[0] || [136, 136, 136];
  const accent = ranked.find((r) => Math.hypot(r[0] - base[0], r[1] - base[1], r[2] - base[2]) > 70 && r[3] > ranked[0][3] * 0.04) || base;
  const hex = (r) => '#' + r.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const res = { base: hex(base), accent: hex(accent), box: x1 >= x0 ? [x0 / cw, y0 / ch, (x1 - x0 + 1) / cw, (y1 - y0 + 1) / ch] : [0, 0, 1, 1] };
  imgCache.set(im, res);
  return res;
}
const texCache = new Map();
function texture(im) {
  if (texCache.has(im)) return texCache.get(im);
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  // Dilatation des bords : évite les liserés transparents quand la coque déborde un peu de la photo.
  const r = Math.max(2, Math.round(Math.max(w, h) / 140));
  for (const k of [3, 2, 1]) for (let a = 0; a < 8; a++) x.drawImage(im, Math.cos(a * Math.PI / 4) * r * k, Math.sin(a * Math.PI / 4) * r * k);
  x.drawImage(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  texCache.set(im, t);
  return t;
}
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (texCache.has(src)) return texCache.get(src);
  const p = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  texCache.set(src, p);
  return p;
}

// ---------- Scène
export function createView(container, { isDark = () => false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.95; // couleurs fidèles aux packshots
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';

  const scene = new THREE.Scene();
  // Éclairage de studio : environnement diffus (reflets doux) + lumière principale qui porte les ombres
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(26, 1, 10, 3000);
  camera.position.set(170, 110, 440);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 89, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 90; controls.maxDistance = 700;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2 + 0.05;
  controls.enablePan = true; controls.screenSpacePanning = true;
  controls.autoRotateSpeed = 1.6;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 0.55));
  const key = new THREE.DirectionalLight(0xfff8f0, 2.3);
  key.position.set(120, 260, 200); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -70, right: 70, top: 200, bottom: -10, near: 50, far: 700 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.5; key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.2); rim.position.set(-180, 160, -220); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-200, 80, 150); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(42, 64), new THREE.ShadowMaterial({ opacity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.6; floor.receiveShadow = true; scene.add(floor);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(42, 44, 2.4, 96), new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.85 }));
  disc.position.y = -3.9; disc.receiveShadow = true; scene.add(disc);

  // Mannequin (blanc satiné)
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xeef0f2, roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const body = new THREE.Group(); scene.add(body);
  const add = (g, mat, parent = body) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  add(loft(torsoRings(), 0, true), skin);
  const head = add(ellipsoid(7.8, 11.2, 9.4, 48), skin); head.position.set(0, H - 11.6, 0.2);
  const jaw = add(ellipsoid(5.8, 6.2, 7.4, 32), skin); jaw.position.set(0, H - 16.4, 1.4);
  const handAt = (s) => { const f = armFrame(s); return [f.o[0] + f.d[0] * HAND_S, H - (f.o[1] + f.d[1] * HAND_S), armZ(HAND_S) + 0.3]; };
  function handMesh(s, mat, grow = 0, parent = body) {
    // main : paume (repère local : y vers le poignet, z vers le pouce)
    const g = new THREE.Group(); g.position.set(...handAt(s)); g.rotation.z = s * ARM_ANG; g.rotation.y = -s * 0.12; parent.add(g);
    const palm = new THREE.Mesh(ellipsoid(2.1 + grow, 8.6 + grow, 4.0 + grow, 32), mat); palm.castShadow = true; g.add(palm);
    const thumb = new THREE.Mesh(ellipsoid(1.25 + grow, 3.6 + grow, 1.35 + grow, 16), mat); thumb.castShadow = true;
    thumb.position.set(-s * 0.4, 1.6, 3.7); thumb.rotation.x = 0.45; g.add(thumb);
    return { g, palm, thumb };
  }
  for (const s of [-1, 1]) {
    add(loft(legRings(s), 0, true), skin);
    add(loft(armRings(s), 0, true), skin);
    const f = armFrame(s);
    const sh = add(ellipsoid(4.8, 4.6, 5.0), skin); sh.position.set(f.o[0], H - f.o[1], 0.3);
    handMesh(s, skin);
    const foot = add(ellipsoid(3.9, 3.3, 11.4), skin); foot.position.set(s * 5.4, H - 177.6, 4.4); foot.rotation.y = s * 0.12;
  }
  // Ligne de jointure discrète à la taille
  const jm = new THREE.MeshBasicMaterial({ color: 0xc9ced4 });
  const waist = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 96), jm); waist.scale.set(14.7, 10.5, 1); waist.rotation.x = Math.PI / 2; waist.position.set(0, H - 69, 0.2); body.add(waist);

  const dress = new THREE.Group(); scene.add(dress);
  const disposeGroup = (g) => { for (const o of [...g.children]) { g.remove(o); o.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); } };

  let w = 0, h = 0, raf = 0, running = false;
  function resize() {
    const r = container.getBoundingClientRect();
    if (r.width === w && r.height === h) return;
    w = r.width; h = r.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    resize();
    controls.update();
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(container);
  function theme() {
    disc.material.color.set(isDark() ? 0x2b3138 : 0xd9dde2);
    floor.material.opacity = isDark() ? 0.38 : 0.25;
  }

  // ---------- Habillage
  let seq = 0;
  async function update(outfit) {
    const my = ++seq;
    // outfit : { slot: { it, im, p } } (p = placement 2D en cm, déjà ajusté)
    const backs = {};
    await Promise.all(Object.entries(outfit).map(async ([s, o]) => { if (o && o.it.imgBack) backs[s] = await loadImage(o.it.imgBack); }));
    if (my !== seq) return;
    disposeGroup(dress);
    theme();
    const put = (g, mat, parent = dress) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const proj = (o, slot, extra = {}) => {
      const a = analyse(o.im);
      const p = o.p;
      const opts = { front: texture(o.im), rect: [p.x, p.y, p.w, p.h], base: a.base, mode: 1, ...extra };
      const bk = backs[slot];
      if (bk) {
        // boîte opaque de la vue de face (en cm) = boîte opaque de la vue de dos
        const b = a.box, bb = analyse(bk).box;
        opts.back = texture(bk);
        opts.rectB = [p.x + b[0] * p.w, p.y + b[1] * p.h, b[2] * p.w, b[3] * p.h];
        opts.boxB = bb;
      }
      return opts;
    };
    const sleeveCut = (o) => {
      // hauteur (y 2D) où s'arrête la manche
      const p = o.p, it = o.it;
      if (it.cat === 'gilet' || it.sleeves === 'none') return null;
      if (it.sleeveEnds) return Math.max(...it.sleeveEnds.map((e) => p.y + e[1] * p.h)) + 1.5;
      if (it.cuffs) return Math.min(wristY + 1, Math.max(...it.cuffs.map((e) => p.y + e[1] * p.h)));
      if (it.sleeves === 'short') return 50;
      return wristY;
    };
    // [couche, décalage torse, décalage bras, amplitude des plis]
    const LAYERS = [['sous', 0.3, 0.25, 0.1], ['haut', 0.85, 0.55, 0.3], ['couche', 1.8, 1.2, 0.6]];
    for (const [slot, offT, offA, amp] of LAYERS) {
      const o = outfit[slot]; if (!o) continue;
      const loose = o.it.cat === 'veste' || o.it.cat === 'veste_pluie' ? 1.4 : 1;
      put(loft(torsoRings(14, 97), offT, false, torsoFolds(amp * loose)), garmentMaterial(proj(o, slot, { keepShoulders: o.it.sleeves !== 'none', sheen: o.it.cat === 'veste_pluie' ? 0.15 : 0.55, roughness: o.it.cat === 'veste_pluie' ? 0.5 : 0.8 })));
      const cut = sleeveCut(o);
      if (cut != null) {
        const cs = sAtY(cut);
        for (const s of [-1, 1]) {
          // manche de la photo : de l'épaule du mannequin 2D (±21, 31) à l'extrémité (poignet ou ouverture de manche courte)
          const p = o.p, ends = o.it.cuffs || o.it.sleeveEnds;
          const e = ends ? ends[s < 0 ? 0 : 1] : null;
          const b = e ? [p.x + e[0] * p.w, p.y + e[1] * p.h] : [s * 35, cut];
          const a2 = [s * 21, 31], f = armFrame(s);
          const limg = Math.hypot(b[0] - a2[0], b[1] - a2[1]);
          const arm = { o: f.o, d: f.d, u: f.u, a: a2, b, k: [limg / Math.max(8, cs), 1.15] };
          const am = proj(o, slot, { mode: 2, axis: 2, arm, cutBottom: cut });
          put(loft(armRings(s, -4, cs + 2), offA, false, sleeveFolds(amp * 1.3 * loose, cs)), garmentMaterial(am));
          // épaule : recouvre la rotule du mannequin
          // (géométrie déplacée, pas le maillage : le shader lit des coordonnées du monde)
          const cg = ellipsoid(4.8 + offA * 0.6, 4.6 + offA * 0.6, 5.0 + offA * 0.6); cg.translate(f.o[0], H - f.o[1], 0.3);
          put(cg, garmentMaterial(am));
        }
      }
    }
    if (outfit.bas) {
      const o = outfit.bas;
      put(loft(torsoRings(28, 97), 0.6, false), garmentMaterial(proj(o, 'bas', { sheen: 0.12, roughness: 0.7 })));
      // Jambes : pas de découpe alpha (les côtés de la jambe sortent de la photo de face), on coupe à l'ourlet.
      const a = analyse(o.im), hem = o.p.y + (a.box[1] + a.box[3]) * o.p.h;
      for (const s of [-1, 1]) put(loft(legRings(s, 84, Math.min(175, hem)), 0.4, false, legFolds(o.it.kind === 'collant' ? 0.18 : 0.06)), garmentMaterial(proj(o, 'bas', { mode: 2, sheen: 0.12, roughness: 0.7 })));
    }
    // Pièces projetées de côté (photo de profil) sur le bas de jambe
    const sideLeg = (o, top, bottom, crop, off, folds = null) => {
      for (const s of [-1, 1]) {
        put(loft(legRings(s, top, bottom), off, false, folds), garmentMaterial({ front: texture(o.im), base: analyse(o.im).base, mode: 2, axis: 1, rect: [-5.2, H - top, 10.6, bottom - top], crop, roughness: 0.9 }));
      }
    };
    if (outfit.jambieres) {
      const o = outfit.jambieres, a = analyse(o.im), b = a.box;
      const olga = /olga/i.test(o.it.model);
      // la photo montre la paire côte à côte : on prend la jambière de gauche
      sideLeg(o, olga ? 112 : 106, olga ? 152 : 172, [b[0], b[1], b[2] * 0.48, b[3]], 0.22, legFolds(0.25));
    }
    if (outfit.chaussettes) {
      const o = outfit.chaussettes;
      const top = /primaloft|winter|merino/i.test(o.it.model) ? 146 : 150;
      // chaussette de devant, profil : tige seule (sans le pied)
      sideLeg(o, top, 175, [0, 0, 0.56, 0.62], 0.16);
    }
    if (outfit.gants) {
      const o = outfit.gants, a = analyse(o.im), b = a.box;
      const mitt = /mitt/i.test(o.it.model);
      for (const s of [-1, 1]) {
        // gant : photo du dos de la main projetée de côté ; doigts vers le bas
        const mat = garmentMaterial({ front: texture(o.im), base: a.base, mode: mitt ? 1 : 2, axis: 1, rect: [-4.4, -9.2 + (mitt ? 0 : 0), 8.8, mitt ? -16 : -21], crop: b, flip: s > 0, roughness: 0.75, sheen: 0.4 });
        const hd = handMesh(s, mat, 0.35, dress);
        hd.palm.scale.y = 1; if (mitt) hd.thumb.material = mat;
        put(loft(armRings(s, UPPER + FORE - (mitt ? 1 : 5), UPPER + FORE + 1.5), mitt ? 0.35 : 1.9, false), garmentMaterial({ base: a.base, mode: 0, roughness: 0.75 }));
      }
    }
    if (outfit.casque) helmet(outfit.casque, put);
    if (outfit.chaussures) shoes(outfit.chaussures, put);
  }

  function helmet(o, put) {
    const a = analyse(o.im);
    const prevail = /prevail|propero|search/i.test(o.it.model);
    // Coque : demi-ellipsoïde allongé, photo (vue de 3/4) projetée de côté, aérations dans le matériau
    const g = new THREE.SphereGeometry(1, 72, 44, 0, Math.PI * 2, 0, Math.PI * 0.56);
    // la photo montre l'avant du casque à gauche : z = +1 (avant) -> u = 0
    const b = a.box, crop = [b[0], b[1], b[2], b[3] * 0.62];
    const shell = put(g, garmentMaterial({ front: texture(o.im), base: a.base, mode: 2, axis: 1, rect: [-1.05, 1.0, 2.1, 1.05], flip: true, crop,
      roughness: 0.3, sheen: 0, clearcoat: 0.6, vents: prevail ? 7 : 3, ventGap: prevail ? 0.24 : 0.34 }));
    shell.scale.set(10.6, 10.2, 14.2);
    shell.position.set(0, H - 9.3, -1.2); shell.rotation.x = -0.16;
    // Sangles
    const strap = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 });
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 6), strap);
      t.position.set(s * 7.7, H - 15.5, 1.6); t.rotation.z = s * 0.1; t.rotation.x = 0.18; dress.add(t);
    }
    const chin = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.3, 6, 24, Math.PI), strap);
    chin.position.set(0, H - 22.2, 2.8); chin.rotation.z = Math.PI; dress.add(chin);
    const band = put(new THREE.TorusGeometry(1, 0.05, 8, 96), garmentMaterial({ base: a.accent, mode: 0, roughness: 0.4, sheen: 0 }));
    band.scale.set(10.5, 14, 10); band.rotation.x = Math.PI / 2; band.position.set(0, H - 9.7, -1.2);
  }

  function shoes(o, put) {
    const a = analyse(o.im), b = a.box;
    const nw = /northwave/i.test(o.it.brand || '') || /extreme/i.test(o.it.model);
    // photo de profil, pointe à droite : z avant -> u = 1 ; pour une paire, on garde la chaussure de devant
    const crop = o.it.single ? b : [b[0], b[1] + b[3] * 0.08, b[2], b[3] * 0.92];
    const top = nw ? 16.4 : 7.6;
    const upper = garmentMaterial({ front: texture(o.im), base: a.base, mode: 2, axis: 1, rect: [-7.8, top, 28.0, top + 1.0], crop, roughness: nw ? 0.55 : 0.32, sheen: nw ? 0.3 : 0, clearcoat: nw ? 0 : 0.4 });
    for (const s of [-1, 1]) {
      const foot = new THREE.Group(); foot.position.set(s * 5.4, H - 181.3, 0.4); foot.rotation.y = s * 0.12; dress.add(foot);
      put(shoeGeometry(nw), upper, foot);
    }
  }

  return {
    update,
    start() { if (running) return; running = true; resize(); frame(); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setAutoRotate(v) { controls.autoRotate = v; },
    view(name) {
      const d = camera.position.distanceTo(controls.target);
      const ang = { face: 0, dos: Math.PI, profil: Math.PI / 2, '3/4': Math.PI / 5 }[name] ?? 0;
      camera.position.set(Math.sin(ang) * d, controls.target.y + 12, Math.cos(ang) * d);
      controls.update();
    },
    // caméra libre (comparaison avec une photo) : angle en degrés, hauteur de visée, distance
    camera(deg, ty = 89, dist = 440, fov = 26) {
      controls.maxDistance = Math.max(700, dist * 1.2);
      camera.fov = fov; camera.updateProjectionMatrix();
      controls.target.set(0, ty, 0);
      const r = deg * Math.PI / 180;
      camera.position.set(Math.sin(r) * dist, ty + 6, Math.cos(r) * dist);
      controls.update();
    },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
  };
}
