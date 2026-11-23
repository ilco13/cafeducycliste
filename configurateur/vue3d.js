// Vue 3D de la cabine d'essayage : mannequin Three.js habillé par projection des packshots.
// Chaque vêtement est une coque autour du corps ; la photo de face est projetée de face
// (coordonnées en cm identiques à la vue 2D), la vue de dos à plat quand elle existe.
// La silhouette (manches, ourlet, col) vient de la transparence de la photo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const H = 180; // y 2D (cm depuis le sommet du crâne, vers le bas) -> Y 3D = H - y
const SEG = 48;

// ---------- Géométrie du corps (cm) : anneaux elliptiques [y, demi-largeur, demi-profondeur, décalage z]
const TORSO = [
  [17, 4.6, 5.0, -0.6], [23, 5.0, 5.4, -0.4], [25.5, 8.2, 6.6, -0.2], [27.6, 13, 8.3, 0], [29.6, 16.8, 9.5, 0],
  [31.6, 19.2, 10.5, 0], [34, 20.3, 11.3, 0.2], [38.5, 20.1, 12, 0.5], [46, 18.6, 12.2, 0.8], [56, 16.3, 11.6, 0.6], [64, 14.9, 10.9, 0.4],
  [69, 14.5, 10.6, 0.3], [76, 15.9, 11, 0], [82, 17.2, 11.4, -0.4], [87, 17.6, 11.6, -0.6], [91.5, 15.6, 10.8, -0.6], [95, 9.5, 7.5, -0.4],
];
// Jambe droite (x > 0) : [y, centre x, demi-largeur]
const LEG = [
  [85, 8.9, 8.3], [93, 9.2, 8.2], [104, 9.3, 7.5], [114, 8.9, 6.4], [122, 8.2, 5.4], [132, 7.1, 4.3],
  [138, 7.4, 4.4], [146, 7.3, 4.1], [154, 6.4, 3.5], [162, 5.4, 2.8], [170, 4.6, 2.2], [174.5, 4.5, 2.25],
];
// Bras : abscisse curviligne depuis l'épaule [s, rayon]
const ARM_S = [[-3, 4.0], [0, 4.7], [6, 4.7], [16, 4.3], [29, 3.7], [33, 3.6], [44, 3.3], [56, 2.85], [59, 2.75]];
const SHOULDER = [19.4, 34.5], ARM_ANG = 14 * Math.PI / 180, UPPER = 31, FORE = 27;

function armFrame(side) {
  const dx = Math.sin(ARM_ANG) * side, dy = Math.cos(ARM_ANG);
  return { o: [SHOULDER[0] * side, SHOULDER[1]], d: [dx, dy], u: [dy, -dx] };
}
const wristY = SHOULDER[1] + (UPPER + FORE) * Math.cos(ARM_ANG);

// Loft : suite d'anneaux { c:[x,y2d,z], u:[ux,uy] (axe horizontal de l'ellipse, dans le plan xy), rx, rz }
function loft(rings, off = 0, cap = false) {
  const pos = [], idx = [];
  for (const r of rings) {
    for (let j = 0; j <= SEG; j++) {
      const t = (j / SEG) * Math.PI * 2;
      const a = Math.cos(t) * (r.rx + off), b = Math.sin(t) * (r.rz + off);
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
const lerp = (a, b, t) => a + (b - a) * t;
function torsoRings(y0 = -1e9, y1 = 1e9) {
  const out = [];
  for (let i = 0; i < TORSO.length; i++) {
    const [y, hw, hd, z] = TORSO[i];
    if (y < y0 || y > y1) {
      // anneau interpolé sur la borne, pour couper la coque proprement
      const j = y < y0 ? i + 1 : i - 1;
      const lim = y < y0 ? y0 : y1;
      if (TORSO[j] && (y < y0 ? TORSO[j][0] > y0 : TORSO[j][0] < y1)) {
        const t = (lim - y) / (TORSO[j][0] - y);
        const r = TORSO[i].map((v, k) => lerp(v, TORSO[j][k], t));
        out[y < y0 ? 'push' : 'push']({ c: [0, r[0], r[3]], u: [1, 0], rx: r[1], rz: r[2] });
      }
      continue;
    }
    out.push({ c: [0, y, z], u: [1, 0], rx: hw, rz: hd });
  }
  return out.sort((a, b) => a.c[1] - b.c[1]);
}
function legRings(side, y0 = -1e9, y1 = 1e9) {
  const out = [];
  for (let i = 0; i < LEG.length; i++) {
    const [y, cx, hw] = LEG[i];
    const clip = (lim) => {
      const j = y < lim ? i + 1 : i - 1;
      if (!LEG[j]) return;
      const t = (lim - y) / (LEG[j][0] - y);
      if (t < 0 || t > 1) return;
      const r = LEG[i].map((v, k) => lerp(v, LEG[j][k], t));
      out.push({ c: [side * r[1], r[0], 0.3], u: [1, 0], rx: r[2], rz: r[2] * 1.04 });
    };
    if (y < y0) { clip(y0); continue; }
    if (y > y1) { clip(y1); continue; }
    out.push({ c: [side * cx, y, y < 130 ? 0.3 : 0.6], u: [1, 0], rx: hw, rz: hw * (y < 130 ? 1.04 : 1.12) });
  }
  return out.sort((a, b) => a.c[1] - b.c[1]);
}
function armRings(side, s0 = -1e9, s1 = 1e9) {
  const f = armFrame(side), out = [];
  const ring = (s, r) => ({ c: [f.o[0] + f.d[0] * s, f.o[1] + f.d[1] * s, 0], u: f.u, rx: r * 0.98, rz: r });
  for (let i = 0; i < ARM_S.length; i++) {
    const [s, r] = ARM_S[i];
    if (s < s0 || s > s1) {
      const lim = s < s0 ? s0 : s1, j = s < s0 ? i + 1 : i - 1;
      if (ARM_S[j]) { const t = (lim - s) / (ARM_S[j][0] - s); if (t >= 0 && t <= 1) out.push(ring(lim, lerp(r, ARM_S[j][1], t))); }
      continue;
    }
    out.push(ring(s, r));
  }
  return out.sort((a, b) => a.c[1] - b.c[1]);
}
// abscisse sur le bras correspondant à une hauteur y (2D)
const sAtY = (y) => (y - SHOULDER[1]) / Math.cos(ARM_ANG);

function ellipsoid(rx, ry, rz, seg = 32) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  g.scale(rx, ry, rz);
  return g;
}

// ---------- Matériau projeté
function garmentMaterial(opts) {
  const m = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.78, metalness: 0, side: THREE.DoubleSide });
  const u = {
    uFront: { value: opts.front || null }, uBack: { value: opts.back || null },
    uRect: { value: new THREE.Vector4(...(opts.rect || [0, 0, 1, 1])) },
    uRectB: { value: new THREE.Vector4(...(opts.rectB || [0, 0, 1, 1])) },
    uBoxB: { value: new THREE.Vector4(...(opts.boxB || [0, 0, 1, 1])) },
    uBase: { value: new THREE.Color(opts.base || '#888') },
    uMode: { value: opts.mode ?? 0 }, // 0 couleur unie, 1 projeté + découpe alpha, 2 projeté sans découpe
    uCut: { value: new THREE.Vector2(opts.cutTop ?? -1e4, opts.cutBottom ?? 1e4) },
    uHasBack: { value: opts.back ? 1 : 0 },
    uKeep: { value: opts.keepShoulders ? 1 : 0 },
    uVent: { value: new THREE.Vector2(opts.vents || 0, opts.ventGap || 3) },
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
uniform vec4 uRect; uniform vec4 uRectB; uniform vec4 uBoxB; uniform vec3 uBase; uniform float uMode; uniform vec2 uCut; uniform float uHasBack; uniform vec2 uVent; uniform float uKeep;`)
      .replace('#include <map_fragment>', `
float y2d = ${H.toFixed(1)} - vOP.y;
if (y2d < uCut.x || y2d > uCut.y) discard;
vec3 col = uBase;
if (uMode > 0.5) {
  vec2 uv = vec2((vOP.x - uRect.x) / uRect.z, (y2d - uRect.y) / uRect.w);
  vec4 t = vec4(0.0);
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) t = texture2D(uFront, uv);
  // épaules : la photo de face tombe plus bas que la coque ; on garde le tissu (sauf l'encolure)
  bool keep = uKeep > 0.5 && y2d < 38.0 && abs(vOP.x) > 7.0;
  if (uMode < 1.5 && t.a < 0.5 && !keep) discard;
  float nz = normalize(vON).z;
  float front = smoothstep(-0.25, 0.35, nz);
  // sans vue de dos : couleurs de la face, très floutées (on garde les aplats, pas les logos ni le zip)
  vec4 tbl = texture2D(uFront, uv, 6.0);
  vec3 backCol = tbl.a > 0.3 ? mix(uBase, tbl.rgb / max(tbl.a, 0.001), 0.7) : uBase;
  if (uHasBack > 0.5) {
    // vue de dos : boîte du vêtement de dos calée sur la boîte du vêtement de face, image miroir
    vec2 ub = vec2((vOP.x - uRectB.x) / uRectB.z, (y2d - uRectB.y) / uRectB.w);
    ub = vec2(uBoxB.x + (1.0 - ub.x) * uBoxB.z, uBoxB.y + ub.y * uBoxB.w);
    vec4 tb = texture2D(uBack, clamp(ub, 0.0, 1.0));
    if (tb.a > 0.5) backCol = tb.rgb;
  }
  vec3 frontCol = t.a > 0.5 ? t.rgb : uBase;
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
  m.customProgramCacheKey = () => 'garment';
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 10, 3000);
  camera.position.set(170, 110, 440);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 89, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 120; controls.maxDistance = 700;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2 + 0.05;
  controls.enablePan = true; controls.screenSpacePanning = true;
  controls.autoRotateSpeed = 1.6;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(120, 260, 200); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -70, right: 70, top: 200, bottom: -10, near: 50, far: 700 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.1); rim.position.set(-180, 160, -220); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-200, 80, 150); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(42, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.6; floor.receiveShadow = true; scene.add(floor);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(42, 44, 2.4, 64), new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.9 }));
  disc.position.y = -3.9; disc.receiveShadow = true; scene.add(disc);

  // Mannequin
  const skin = new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.42, metalness: 0.02 });
  const body = new THREE.Group(); scene.add(body);
  const add = (g, mat, parent = body) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  add(loft(torsoRings(), 0, true), skin);
  const head = add(ellipsoid(8, 11.3, 9.6), skin); head.position.set(0, H - 12, 0.4);
  for (const s of [-1, 1]) {
    add(loft(legRings(s), 0, true), skin);
    add(loft(armRings(s), 0, true), skin);
    const f = armFrame(s);
    const sh = add(ellipsoid(4.8, 4.6, 5.0), skin); sh.position.set(f.o[0], H - f.o[1], 0);
    const hand = add(ellipsoid(2.2, 8.4, 3.9), skin);
    const hs = UPPER + FORE + 8.2;
    hand.position.set(f.o[0] + f.d[0] * hs, H - (f.o[1] + f.d[1] * hs), 0.6); hand.rotation.z = s * ARM_ANG;
    const foot = add(ellipsoid(4.0, 3.4, 12.2), skin); foot.position.set(s * 5.4, H - 177.6, 5.2); foot.rotation.y = s * 0.12;
  }
  // Lignes de jointure discrètes
  const jm = new THREE.MeshBasicMaterial({ color: 0xc9ced4 });
  const waist = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 64), jm); waist.scale.set(14.6, 10.7, 1); waist.rotation.x = Math.PI / 2; waist.position.y = H - 69; body.add(waist);

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
    floor.material.opacity = isDark() ? 0.35 : 0.22;
  }

  // ---------- Habillage
  let seq = 0;
  async function update(outfit) {
    const my = ++seq;
    // outfit : { slot: { it, im, p } } (p = placement 2D en cm, déjà ajusté), + hidden
    const backs = {};
    await Promise.all(Object.entries(outfit).map(async ([s, o]) => { if (o && o.it.imgBack) backs[s] = await loadImage(o.it.imgBack); }));
    if (my !== seq) return;
    disposeGroup(dress);
    theme();
    const put = (g, mat) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; dress.add(m); return m; };
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
    // Bras du mannequin : masqués sous des manches longues
    const sleeveCut = (o, cuffsKey = 'cuffs') => {
      // hauteur (y 2D) où s'arrête la manche
      const p = o.p, it = o.it;
      if (it.cat === 'gilet' || it.sleeves === 'none') return null;
      if (it.sleeveEnds) return Math.max(...it.sleeveEnds.map((e) => p.y + e[1] * p.h)) + 1.5;
      if (it[cuffsKey]) return Math.min(wristY + 1, Math.max(...it[cuffsKey].map((e) => p.y + e[1] * p.h)));
      if (it.sleeves === 'short') return 50;
      return wristY;
    };
    const LAYERS = [['sous', 0.3, 0.25], ['haut', 1.0, 0.6], ['couche', 1.9, 1.25]];
    for (const [slot, offT, offA] of LAYERS) {
      const o = outfit[slot]; if (!o) continue;
      const mat = () => garmentMaterial(proj(o, slot, { keepShoulders: o.it.sleeves !== 'none' }));
      put(loft(torsoRings(14, 97), offT, false), mat());
      const cut = sleeveCut(o);
      if (cut != null) {
        for (const s of [-1, 1]) {
          const m = garmentMaterial(proj(o, slot, { mode: 2, cutBottom: cut }));
          put(loft(armRings(s, -4, sAtY(cut) + 2), offA, false), m);
        }
      }
    }
    if (outfit.bas) {
      const o = outfit.bas;
      put(loft(torsoRings(28, 97), 0.6, false), garmentMaterial(proj(o, 'bas')));
      // Jambes : pas de découpe alpha (les côtés de la jambe sortent de la photo de face), on coupe à l'ourlet.
      const a = analyse(o.im), hem = o.p.y + (a.box[1] + a.box[3]) * o.p.h;
      for (const s of [-1, 1]) put(loft(legRings(s, 84, Math.min(175, hem)), 0.4, false), garmentMaterial(proj(o, 'bas', { mode: 2 })));
    }
    if (outfit.jambieres) {
      const o = outfit.jambieres, a = analyse(o.im);
      const olga = /olga/i.test(o.it.model);
      for (const s of [-1, 1]) put(loft(legRings(s, olga ? 112 : 106, olga ? 152 : 172), 0.22, false), garmentMaterial({ base: a.base, mode: 0, roughness: 0.85 }));
    }
    if (outfit.chaussettes) {
      const a = analyse(outfit.chaussettes.im);
      const top = /primaloft|winter/i.test(outfit.chaussettes.it.model) ? 146 : 150;
      for (const s of [-1, 1]) {
        put(loft(legRings(s, top + 3, 175), 0.16, false), garmentMaterial({ base: a.base, mode: 0, roughness: 0.9 }));
        put(loft(legRings(s, top, top + 3.2), 0.2, false), garmentMaterial({ base: a.accent, mode: 0, roughness: 0.9 }));
      }
    }
    if (outfit.gants) {
      const a = analyse(outfit.gants.im);
      const mitt = /mitt/i.test(outfit.gants.it.model);
      const mat = garmentMaterial({ base: a.base, mode: 0, roughness: 0.7 });
      for (const s of [-1, 1]) {
        const f = armFrame(s), hs = UPPER + FORE + 8.2;
        const hand = put(ellipsoid(2.6, 8.8, 4.3), mat);
        hand.position.set(f.o[0] + f.d[0] * hs, H - (f.o[1] + f.d[1] * hs), 0.6); hand.rotation.z = s * ARM_ANG;
        if (mitt) { hand.scale.y = 0.62; hand.position.y += 3.2; }
        put(loft(armRings(s, UPPER + FORE - (mitt ? 1 : 5), UPPER + FORE + 1.5), mitt ? 0.35 : 2.0, false), garmentMaterial({ base: a.accent, mode: 0, roughness: 0.7 }));
      }
    }
    if (outfit.casque) helmet(outfit.casque, put);
    if (outfit.chaussures) shoes(outfit.chaussures, put);
  }

  function helmet(o, put) {
    const a = analyse(o.im);
    const prevail = /prevail|propero|search/i.test(o.it.model);
    // Coque : demi-ellipsoïde allongé ; aérations dessinées dans le matériau (géométrie unitaire, puis mise à l'échelle)
    const g = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const shell = put(g, garmentMaterial({ base: a.base, mode: 0, roughness: 0.35, vents: prevail ? 7 : 3, ventGap: prevail ? 0.24 : 0.34 }));
    shell.scale.set(10.6, 10.2, 14.2);
    shell.position.set(0, H - 9.5, -1.2); shell.rotation.x = -0.16;
    // Sangles
    const strap = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 });
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 6), strap);
      t.position.set(s * 7.6, H - 15.5, 1.5); t.rotation.z = s * 0.12; t.rotation.x = 0.15; dress.add(t);
    }
    const chin = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.35, 6, 24, Math.PI), strap);
    chin.position.set(0, H - 22, 2.3); chin.rotation.z = Math.PI; dress.add(chin);
    // Accent (bandeau inférieur)
    const band = put(new THREE.TorusGeometry(1, 0.06, 8, 64), garmentMaterial({ base: a.accent, mode: 0, roughness: 0.4 }));
    band.scale.set(10.5, 14, 10); band.rotation.x = Math.PI / 2; band.position.set(0, H - 9.9, -1.2);
  }

  function shoes(o, put) {
    const a = analyse(o.im);
    const nw = /northwave/i.test(o.it.brand || '') || /extreme/i.test(o.it.model);
    const upper = garmentMaterial({ base: a.base, mode: 0, roughness: nw ? 0.55 : 0.3 });
    const soleMat = new THREE.MeshStandardMaterial({ color: nw ? 0x1a1b1d : 0x2b2b2e, roughness: 0.5 });
    const dial = new THREE.MeshStandardMaterial({ color: nw ? 0x222428 : 0xc9ccd1, roughness: 0.25, metalness: nw ? 0.2 : 0.85 });
    for (const s of [-1, 1]) {
      const foot = new THREE.Group(); foot.position.set(s * 5.4, 0, 5.2); foot.rotation.y = s * 0.12; dress.add(foot);
      const sh = new THREE.Mesh(ellipsoid(4.5, nw ? 5.2 : 4.3, 13.4), upper); sh.castShadow = true;
      sh.position.set(0, H - 176.8, 0.2); foot.add(sh);
      if (nw) {
        const collar = put(loft(legRings(s, 165, 174), 0.55, false), upper);
        collar.castShadow = true;
      }
      const sole = new THREE.Mesh(ellipsoid(4.4, 0.9, 13.6), soleMat);
      sole.position.set(0, H - 180.6, 0.2); sole.castShadow = true; foot.add(sole);
      // molette BOA sur le dessus du pied
      for (const [dz, dy] of nw ? [[-1, -172.6], [4.5, -174.3]] : [[0.5, -173.2]]) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 24), dial);
        d.position.set(s * 2.6, H + dy, dz); d.rotation.z = s * 0.9; foot.add(d);
      }
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
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
  };
}
