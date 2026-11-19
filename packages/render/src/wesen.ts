import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FABRIK, GLOW } from './grafik.ts';

/**
 * Glatte Wesen im „Foto-Look“ (statt Voxeln): Körper aus weich ausgebeulten Ellipsoiden, verjüngten Röhren, Kegeln und Flügelhäuten mit
 * Vertexfarben (Fell- und Hautflecken, Licht von oben), Augen und Risse leuchten über das GLOW-Material. Maße in Blöcken (≈ 1 m),
 * Blick nach +z, Füße bei y = 0. Beweglich: Glieder (Beine, Arme, Flügel, Schwanz) drehen um ihren Gelenkpunkt, wie bei den Voxel-Scharen.
 */
type GliedArt = 'bein' | 'knie' | 'arm' | 'ellbogen' | 'werkzeug' | 'fluegel' | 'fluegelHand' | 'schwanz';
/** eltern: übergeordnetes Gelenk (Knie hängt an der Hüfte, Ellbogen an der Schulter, Flügelhand am Flügelarm) */
export interface Glied { art: GliedArt; seite: number; p: [number, number, number]; eltern?: Glied }
export interface Regung { phase: number; gang: number; hieb?: number; flug?: number }
/** ein Teil eines Wesens: feste Körperteile (Rumpf) oder ein Glied mit Gelenkpunkt; koerper wird beleuchtet, glow leuchtet von selbst */
export interface Teil { koerper: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[]; glied?: Glied }
type V3 = [number, number, number];

const rz = (x: number, y: number, z: number, s: number): number => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.3) * 43758.5453; return v - Math.floor(v); };
const wr = (x: number, y: number, z: number, s: number): number => 0.62 * Math.sin(x * 2.3 + s) * Math.cos(z * 2.1 - s * 0.7 + y * 1.3) + 0.38 * Math.sin(x * 5.1 + y * 4.3 + z * 4.7 + s * 2.1);
type Farbe = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color;
const UP = new THREE.Vector3(0, 1, 0);

/** Farbe mit Flecken (grob und fein) und leichter Aufhellung nach oben; dunkel < 1 dunkelt das Ganze ab */
function fell(hex: string, streu = 0.18, s = 1, oben = 0.14, dunkel = 1): Farbe {
  const base = new THREE.Color(hex), c = new THREE.Color();
  return (x, y, z, _nx, ny) => { const n = wr(x * 3.1, y * 3.1, z * 3.1, s) * 0.5 + 0.5, m = wr(x * 13, y * 13, z * 13, s + 3) * 0.5 + 0.5; return c.copy(base).multiplyScalar(dunkel * (1 - streu + 2 * streu * (0.6 * n + 0.4 * m) + oben * ny)); };
}
const leuchtFarbe = (hex: string, st = 2.2): Farbe => { const c = new THREE.Color(hex).multiplyScalar(st); return () => c; };

function faerben(g: THREE.BufferGeometry, farbe: Farbe): THREE.BufferGeometry {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), c = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const k = farbe(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i)); c[3 * i] = k.r; c[3 * i + 1] = k.g; c[3 * i + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
/** weich ausgebeulter Ellipsoid */
let DETAIL = 2; // Unterteilung der Ellipsoide; für Massenwesen (Moorwichte) niedriger
function blob(rx: number, ry: number, rz2: number, x: number, y: number, z: number, farbe: Farbe, beule = 0.1, detail = DETAIL, s = 0): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i), f = 1 + beule * wr(dx * 2.6, dy * 2.6, dz * 2.6, s) + beule * 0.4 * wr(dx * 7, dy * 7, dz * 7, s + 3); p.setXYZ(i, dx * f * rx + x, dy * f * ry + y, dz * f * rz2 + z); }
  g.computeVertexNormals(); return faerben(g, farbe);
}
/** verjüngte Röhre von a nach b (r0 bei a, r1 bei b) */
function roehre(a: V3, b: V3, r0: number, r1: number, farbe: Farbe, seg = 8): THREE.BufferGeometry {
  const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = Math.max(1e-3, v.length()), g = new THREE.CylinderGeometry(r1, r0, len, seg, 3); g.deleteAttribute('uv');
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, v.clone().normalize())); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return faerben(g, farbe);
}
/** Kegel vom Fuß zur Spitze (Hörner, Ohren, Zähne, Kristalle) */
function kegel(fuss: V3, spitze: V3, r: number, farbe: Farbe, seg = 7): THREE.BufferGeometry {
  const v = new THREE.Vector3(spitze[0] - fuss[0], spitze[1] - fuss[1], spitze[2] - fuss[2]), len = Math.max(1e-3, v.length()), g = new THREE.ConeGeometry(r, len, seg, 1); g.deleteAttribute('uv');
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, v.clone().normalize())); g.translate((fuss[0] + spitze[0]) / 2, (fuss[1] + spitze[1]) / 2, (fuss[2] + spitze[2]) / 2); return faerben(g, farbe);
}
const kugelGlow = (r: number, x: number, y: number, z: number, hex: string, st = 2.4): THREE.BufferGeometry => blob(r, r, r, x, y, z, leuchtFarbe(hex, st), 0, 1);
/** Flügelhaut (beidseitig, eigene Eckpunkte je Seite) aus Vorderkante P und Hinterkante T */
function haut(P: V3[], T: V3[], farbe: Farbe): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [], n = P.length;
  for (const seite of [0, 1]) { const b = pos.length / 3; for (const q of [...P, ...T]) pos.push(q[0], q[1], q[2]); for (let i = 0; i < n - 1; i++) { const a = b + i, c = b + i + 1, d = b + n + i + 1, e = b + n + i; if (seite === 0) idx.push(a, c, d, a, d, e); else idx.push(a, d, c, a, e, d); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return faerben(g, farbe);
}
const vereint = (t: THREE.BufferGeometry[]): THREE.BufferGeometry[] => (t.length ? [mergeGeometries(t, false)!] : []);
const teil = (koerper: THREE.BufferGeometry[], glow: THREE.BufferGeometry[] = [], glied?: Glied): Teil => ({ koerper: vereint(koerper), glow: vereint(glow), glied });

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/**
 * Gegliedertes Bein oder Arm: Oberschenkel/-arm (Gelenk Hüfte/Schulter) und Unterschenkel/-arm (Gelenk Knie/Ellbogen, hängt am oberen Teil),
 * mit Gelenkkugeln, Muskelwulst, Knöchel sowie Fuß mit Zehen bzw. Hand mit Fingern. h = Hüfte, k = Knie, e = Knöchel/Handgelenk, r = Radien oben/Knie/unten.
 */
function kette(art: 'bein' | 'arm', seite: number, h: V3, k: V3, e: V3, r: [number, number, number], farbe: Farbe, endF: Farbe, o: { oben?: THREE.BufferGeometry[]; unten?: THREE.BufferGeometry[]; glowU?: THREE.BufferGeometry[]; zehen?: number; kralle?: Farbe; seg?: number } = {}): Teil[] {
  const G1: Glied = { art, seite, p: [h[0], h[1], h[2]] }, G2: Glied = { art: art === 'bein' ? 'knie' : 'ellbogen', seite, p: [k[0], k[1], k[2]], eltern: G1 };
  const kl = DETAIL > 1 ? 1 : 0, seg = o.seg ?? 8, m = lerp3(h, k, 0.38), kugel = (rr: number, p: V3, f: Farbe, b = 0.08) => blob(rr, rr, rr, p[0], p[1], p[2], f, b, kl);
  const oben = [kugel(r[0] * 1.18, h, farbe), roehre(h, k, r[0] * 1.05, r[1], farbe, seg), kugel(r[0] * 1.1, m, farbe, 0.14), kugel(r[1] * 1.26, k, farbe), ...(o.oben ?? [])];
  const unten = [kugel(r[1] * 1.14, k, farbe), roehre(k, e, r[1], r[2], farbe, seg), kugel(r[2] * 1.3, e, endF), kugel(r[1] * 0.95, lerp3(k, e, 0.3), farbe, 0.16), ...(o.unten ?? [])];
  const fr = r[2], n = o.zehen ?? 3, kr = o.kralle ?? endF;
  if (art === 'bein') {
    unten.push(blob(fr * 1.5, fr * 0.85, fr * 2.3, e[0], fr * 0.85, e[2] + fr * 1.1, endF, 0.1, kl));
    for (let i = 0; i < n; i++) { const dx = (i - (n - 1) / 2) * fr * 0.95; unten.push(kegel([e[0] + dx, fr * 0.8, e[2] + fr * 2.9], [e[0] + dx * 1.3, fr * 0.3, e[2] + fr * 4.5], fr * 0.5, kr, 4)); }
  } else {
    unten.push(blob(fr * 1.45, fr * 1.7, fr * 1.3, e[0], e[1] - fr * 1.0, e[2] + fr * 0.2, endF, 0.1, kl));
    for (let i = 0; i < n; i++) { const dx = (i - (n - 1) / 2) * fr * 0.85; unten.push(kegel([e[0] + dx, e[1] - fr * 2.0, e[2] + fr * 0.3], [e[0] + dx * 1.25, e[1] - fr * 3.5, e[2] + fr * 0.9], fr * 0.42, kr, 4)); }
  }
  return [teil(oben, [], G1), teil(unten, o.glowU ?? [], G2)];
}

// ---------- die Wesen ----------
function moorwicht(): Teil[] {
  DETAIL = 1; try { return moorwichtBauen(); } finally { DETAIL = 2; }
}
function moorwichtBauen(): Teil[] {
  const moos = fell('#6f8a4a', 0.2, 2), torf = fell('#5a4630', 0.22, 1), holz = fell('#6b4a2f', 0.15, 3), stein = fell('#8c867f', 0.15, 4);
  const rumpf = teil([blob(0.44, 0.5, 0.34, 0, 1.12, 0, torf, 0.16), blob(0.36, 0.3, 0.2, 0, 1.0, 0.28, moos, 0.2), blob(0.34, 0.32, 0.32, 0, 1.78, 0.06, moos, 0.14), blob(0.1, 0.09, 0.1, 0, 1.68, 0.38, fell('#5d7a3e', 0.1, 5), 0.1, 1),
    ...[-0.2, -0.05, 0.1, 0.22].map((x, i) => kegel([x, 2.02, 0], [x * 1.5, 2.45 + 0.1 * (i % 2), -0.05], 0.07, moos, 5)), blob(0.3, 0.12, 0.3, 0, 1.45, -0.1, moos, 0.3)], [kugelGlow(0.06, -0.14, 1.8, 0.32, '#ffd34a'), kugelGlow(0.06, 0.14, 1.8, 0.32, '#ffd34a')]);
  const bein = (x: number, seite: number) => kette('bein', seite, [x, 0.84, 0], [x, 0.5, 0.1], [x, 0.14, 0.02], [0.115, 0.09, 0.07], fell('#4f6136', 0.15, 6), fell('#3f4f2a', 0.1, 7), { zehen: 3, kralle: holz });
  const armL = kette('arm', -1, [-0.46, 1.4, 0], [-0.6, 1.14, 0.06], [-0.7, 0.94, 0.2], [0.1, 0.08, 0.06], moos, fell('#5d7a3e', 0.1, 8), { zehen: 3 });
  const armR = kette('arm', 1, [0.46, 1.4, 0], [0.64, 1.14, 0.14], [0.8, 1.0, 0.3], [0.1, 0.08, 0.06], moos, fell('#5d7a3e', 0.1, 8), { zehen: 3, unten: [roehre([0.85, 0, 0.35], [0.85, 2.15, 0.35], 0.05, 0.04, holz, 6), blob(0.2, 0.22, 0.2, 0.85, 2.3, 0.35, stein, 0.25, 1, 2), ...[[0.05, 2.25, 0], [-0.03, 2.4, 0.1], [0.08, 2.1, 0.12]].map(([dx, dy, dz], i) => kegel([0.85 + dx, dy, 0.35 + dz], [0.85 + dx * 2.2, dy + 0.18, 0.35 + dz * 2.2], 0.05, stein, 4))] });
  return [rumpf, ...bein(-0.2, 1), ...bein(0.2, -1), ...armL, ...armR];
}

function wolf(dunkel: boolean): Teil[] {
  const d = dunkel ? 0.1 : 1, pelz = fell('#2f2a3d', 0.2, 11, 0.16, d), pelz2 = fell('#251f33', 0.2, 12, 0.16, d), pfote = fell('#3a3348', 0.15, 13, 0.1, d), horn = fell('#c8c0d8', 0.1, 14, 0.1, d);
  const k = [blob(0.78, 0.68, 1.5, 0, 1.55, 0, pelz, 0.14), blob(0.86, 0.6, 0.9, 0, 1.85, 0.8, pelz2, 0.16), blob(0.6, 0.58, 0.62, 0, 2.05, 1.65, pelz, 0.1), blob(0.28, 0.26, 0.6, 0, 1.78, 2.3, pelz2, 0.08), blob(0.1, 0.08, 0.1, 0, 1.9, 2.9, fell('#120f18', 0.05, 15, 0, 1), 0, 1),
    kegel([-0.4, 2.45, 1.4], [-0.5, 3.1, 1.2], 0.16, pelz, 5), kegel([0.4, 2.45, 1.4], [0.5, 3.1, 1.2], 0.16, pelz, 5), roehre([0, 1.7, 2.0], [0, 1.45, 2.8], 0.22, 0.12, pelz2, 6),
    kegel([-0.14, 1.62, 2.6], [-0.14, 1.28, 2.55], 0.04, horn, 4), kegel([0.14, 1.62, 2.6], [0.14, 1.28, 2.55], 0.04, horn, 4)];
  const g: THREE.BufferGeometry[] = [kugelGlow(0.075, -0.42, 2.2, 2.0, '#c98bff', 2.8), kugelGlow(0.075, 0.42, 2.2, 2.0, '#c98bff', 2.8)];
  if (!dunkel) for (let z = -1.2; z <= 1.6; z += 0.55) g.push(blob(0.07, 0.05, 0.14, 0, 2.25 - 0.05 * Math.abs(z), z, leuchtFarbe('#a070ff', 1.5), 0, 1));
  const bein = (x: number, z: number, seite: number, hinten: boolean) => kette('bein', seite, [x, 1.42, z], hinten ? [x, 0.85, z + 0.42] : [x, 0.88, z + 0.14], hinten ? [x, 0.3, z - 0.02] : [x, 0.28, z + 0.0], hinten ? [0.27, 0.15, 0.1] : [0.22, 0.14, 0.1], pelz2, pfote, { zehen: 4, kralle: horn });
  const schwanz = teil([roehre([0, 1.9, -1.45], [0, 2.1, -2.2], 0.2, 0.14, pelz, 7), roehre([0, 2.1, -2.2], [0, 2.5, -2.7], 0.14, 0.03, pelz2, 6)], [], { art: 'schwanz', seite: 1, p: [0, 1.9, -1.45] });
  return [teil(k, g), ...bein(-0.52, 1.0, 1, false), ...bein(0.52, 1.0, -1, false), ...bein(-0.52, -1.0, -1, true), ...bein(0.52, -1.0, 1, true), schwanz];
}

function troll(): Teil[] {
  const stein = fell('#6f7a5e', 0.2, 21), stein2 = fell('#5d664f', 0.2, 22), bauch = fell('#8a8f72', 0.15, 23), moos = fell('#4f7a3a', 0.25, 24), fels = fell('#8c867f', 0.2, 25), leder = fell('#5a3d24', 0.15, 26), holz = fell('#57402a', 0.2, 27), zahn = fell('#ece4cf', 0.08, 28);
  const rumpf = teil([blob(1.7, 1.45, 1.2, 0, 2.75, 0, stein, 0.12), blob(1.1, 0.9, 0.6, 0, 2.45, 0.85, bauch, 0.1), blob(2.0, 1.1, 1.3, 0, 4.0, -0.35, stein, 0.14), blob(1.3, 0.35, 0.9, 0, 4.7, -0.65, moos, 0.4), blob(1.4, 0.35, 1.2, 0, 1.75, 0, leder, 0.12),
    blob(0.78, 0.68, 0.82, 0, 4.15, 1.25, fell('#7d8868', 0.2, 29), 0.1), blob(0.7, 0.34, 0.6, 0, 3.7, 1.55, stein, 0.1), kegel([-0.4, 3.75, 1.95], [-0.42, 4.15, 2.3], 0.1, zahn, 5), kegel([0.4, 3.75, 1.95], [0.42, 4.15, 2.3], 0.1, zahn, 5),
    blob(0.22, 0.18, 0.3, 0, 4.0, 2.0, stein2, 0.1, 1), blob(0.2, 0.28, 0.14, -0.78, 4.3, 1.1, stein, 0.1, 1), blob(0.2, 0.28, 0.14, 0.78, 4.3, 1.1, stein, 0.1, 1),
    ...[[-0.9, 4.6, -1.2, 0.35], [0.8, 4.8, -1.0, 0.3], [0.1, 5.0, -1.6, 0.4]].map(([x, y, z, r], i) => blob(r, r * 0.8, r, x, y, z, fels, 0.25, 1, i))],
  [kugelGlow(0.09, -0.3, 4.35, 2.0, '#ffb347', 2.6), kugelGlow(0.09, 0.3, 4.35, 2.0, '#ffb347', 2.6)]);
  const fussF = fell('#4b5340', 0.2, 30), zehF = fell('#ece4cf', 0.1, 31);
  const bein = (x: number, seite: number) => kette('bein', seite, [x, 2.0, 0], [x, 1.1, 0.3], [x, 0.55, 0.05], [0.8, 0.62, 0.5], stein2, fussF, { zehen: 4, kralle: zehF, oben: [blob(0.5, 0.35, 0.4, x, 1.5, 0.55, moos, 0.4, 1, 3)] });
  const armL = kette('arm', -1, [-2.1, 3.9, 0], [-2.3, 2.6, 0.25], [-2.3, 1.5, 0.35], [0.8, 0.62, 0.5], stein, stein2, { zehen: 4, kralle: fels, oben: [blob(0.7, 0.5, 0.6, -2.4, 4.4, -0.1, fels, 0.3, 1, 5)] });
  const keule = [roehre([2.2, 1.2, 0.5], [2.3, 0.5, 3.0], 0.34, 0.5, holz, 8), blob(0.8, 0.8, 0.9, 2.3, 0.55, 3.5, holz, 0.2, 2, 4), ...[[2.9, 0.8, 3.5], [1.8, 0.7, 3.8], [2.3, 1.3, 3.6], [2.5, 0.2, 3.9]].map(([x, y, z], i) => blob(0.2, 0.2, 0.2, x, y, z, fels, 0.2, 1, i))];
  const armR = kette('arm', 1, [2.1, 3.9, 0], [2.3, 2.6, 0.25], [2.3, 1.5, 0.35], [0.8, 0.62, 0.5], stein, stein2, { zehen: 4, kralle: fels, oben: [blob(0.7, 0.5, 0.6, 2.4, 4.4, -0.1, fels, 0.3, 1, 6)], unten: keule });
  return [rumpf, ...bein(-0.95, 1), ...bein(0.95, -1), ...armL, ...armR];
}

/** Fledermausflügel mit zwei Gelenken: Flügelarm (Schulter) und Flügelhand (Handgelenk) mit Fingerknochen, Daumenkralle und gezackter Haut */
function drachenFluegel(s: number, x0: number, y0: number, z0: number, spann: number, tiefe: number, hautFarbe: Farbe, knochen: Farbe, kralle: Farbe): Teil[] {
  const P: V3[] = [[x0, y0, z0], [x0 + s * spann * 0.4, y0 + 0.9, z0 + 0.5], [x0 + s * spann * 0.76, y0 + 0.45, z0 - 0.3], [x0 + s * spann, y0 + 0.2, z0 - tiefe * 0.45]];
  const T: V3[] = [[x0, y0 - 0.5, z0 - tiefe * 0.7], [x0 + s * spann * 0.4, y0 + 0.1, z0 - tiefe * 1.05], [x0 + s * spann * 0.76, y0 + 0.05, z0 - tiefe * 0.95], [x0 + s * spann * 0.96, y0, z0 - tiefe * 0.8]];
  const G1: Glied = { art: 'fluegel', seite: s, p: [x0, y0, z0] }, G2: Glied = { art: 'fluegelHand', seite: s, p: [P[1][0], P[1][1], P[1][2]], eltern: G1 };
  const arm = [haut(P.slice(0, 2), T.slice(0, 2), hautFarbe), roehre(P[0], P[1], 0.24, 0.17, knochen, 7), blob(0.3, 0.3, 0.3, x0, y0, z0, knochen, 0.1, 1), blob(0.4, 0.4, 0.5, x0, y0 - 0.1, z0 - 0.1, hautFarbe, 0.1, 1)];
  const hand = [haut(P.slice(1), T.slice(1), hautFarbe), blob(0.24, 0.24, 0.24, P[1][0], P[1][1], P[1][2], knochen, 0.1, 1), kegel([P[1][0], P[1][1] + 0.1, P[1][2]], [P[1][0] + s * 0.1, P[1][1] + 0.9, P[1][2] + 0.5], 0.1, kralle, 5)];
  hand.push(roehre(P[1], P[2], 0.16, 0.11, knochen, 6), roehre(P[2], P[3], 0.11, 0.05, knochen, 6), blob(0.13, 0.13, 0.13, P[2][0], P[2][1], P[2][2], knochen, 0.1, 1));
  for (let i = 1; i < 4; i++) hand.push(roehre(P[1], T[i], 0.07, 0.03, knochen, 5));
  return [teil(arm, [], G1), teil(hand, [], G2)];
}

function drachling(): Teil[] {
  const rot = fell('#9e2b25', 0.2, 31), bauch = fell('#d9813a', 0.15, 32), rot2 = fell('#ad372d', 0.2, 33), horn = fell('#e8dcc0', 0.1, 34), membran = fell('#7a2420', 0.25, 35, 0.1), knochen = fell('#4a1414', 0.15, 36);
  const rumpf = teil([blob(1.2, 1.1, 2.3, 0, 0, 0, rot, 0.1), blob(0.95, 0.6, 1.9, 0, -0.55, 0.3, bauch, 0.08), roehre([0, 0.5, 1.6], [0, 1.0, 3.0], 0.62, 0.45, rot2, 9), blob(0.7, 0.62, 0.95, 0, 1.0, 3.5, rot2, 0.1), blob(0.5, 0.38, 0.75, 0, 0.7, 4.5, rot2, 0.1),
    kegel([-0.4, 1.4, 3.1], [-0.7, 2.1, 2.2], 0.13, horn, 5), kegel([0.4, 1.4, 3.1], [0.7, 2.1, 2.2], 0.13, horn, 5), kegel([-0.3, 0.45, 4.9], [-0.3, 0.1, 5.0], 0.06, horn, 4), kegel([0.3, 0.45, 4.9], [0.3, 0.1, 5.0], 0.06, horn, 4),
    ...[0, 1, 2, 3, 4].map((i) => kegel([0, 0.95 - i * 0.08, 1.8 - i * 0.7], [0, 1.45 - i * 0.1, 1.5 - i * 0.7], 0.12, horn, 4))],
  [kugelGlow(0.08, -0.45, 1.15, 4.2, '#ffe066', 2.6), kugelGlow(0.08, 0.45, 1.15, 4.2, '#ffe066', 2.6)]);
  const schwanz = teil([roehre([0, 0, -1.8], [0, -0.4, -3.6], 0.8, 0.45, rot, 9), roehre([0, -0.4, -3.6], [0, -0.9, -6.0], 0.45, 0.12, rot, 8), kegel([0, -0.9, -5.7], [0, -1.0, -6.8], 0.3, horn, 4)], [], { art: 'schwanz', seite: 1, p: [0, 0, -1.8] });
  const fl = (s: number) => drachenFluegel(s, s * 0.9, 0.8, 0.5, 4.8, 3.6, membran, knochen, horn);
  const klaue = (s: number) => kette('bein', s, [s * 0.75, -0.3, 0.9], [s * 0.85, -0.95, 1.5], [s * 0.85, -1.4, 1.1], [0.32, 0.22, 0.14], rot2, bauch, { zehen: 3, kralle: horn, seg: 7 });
  return [rumpf, schwanz, ...fl(-1), ...fl(1), ...klaue(-1), ...klaue(1)];
}

function rochen(): Teil[] {
  const oben = fell('#2c3b52', 0.18, 41, 0.12), unten = fell('#7a8ea6', 0.12, 42, 0.05), fleck = leuchtFarbe('#9fe7ff', 1.6);
  const rumpf = teil([blob(1.0, 0.5, 2.1, 0, 0.5, 0, oben, 0.08), blob(0.8, 0.28, 1.6, 0, 0.12, 0.1, unten, 0.06), blob(0.55, 0.4, 0.6, 0, 0.65, 2.0, oben, 0.08)], [kugelGlow(0.07, -0.45, 0.85, 2.45, '#d6f6ff', 2.6), kugelGlow(0.07, 0.45, 0.85, 2.45, '#d6f6ff', 2.6)]);
  const fl = (s: number): Teil[] => {
    const G1: Glied = { art: 'fluegel', seite: s, p: [s * 0.9, 0.4, 0] }, G2: Glied = { art: 'fluegelHand', seite: s, p: [s * 2.5, 0.3, -0.2], eltern: G1 };
    const innen = [blob(1.6, 0.2, 1.9, s * 1.7, 0.35, -0.2, oben, 0.06), blob(1.5, 0.1, 1.2, s * 1.7, 0.1, -0.2, unten, 0.05), roehre([s * 0.9, 0.45, 0.6], [s * 2.5, 0.35, 0.5], 0.14, 0.1, oben, 6), blob(0.22, 0.22, 0.22, s * 2.5, 0.35, 0.5, oben, 0.1, 1)];
    const aussen = [blob(1.5, 0.15, 1.6, s * 3.7, 0.22, -0.8, oben, 0.08), blob(1.3, 0.09, 1.2, s * 3.6, 0.1, -0.6, unten, 0.05), roehre([s * 2.5, 0.35, 0.5], [s * 5.0, 0.2, -0.4], 0.1, 0.03, oben, 5), kegel([s * 4.8, 0.2, -1.0], [s * 5.4, 0.15, -1.9], 0.07, oben, 4)];
    const gi: THREE.BufferGeometry[] = [], ga: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) { const ax = 1.2 + rz(i, 1, 2, 43) * 2.8, x = s * ax, z = -1.6 + rz(i, 2, 2, 43) * 2.4; (ax < 2.5 ? gi : ga).push(blob(0.1, 0.03, 0.1, x, 0.52 - ax * 0.05, z, fleck, 0, 1)); }
    return [teil(innen, gi, G1), teil(aussen, ga, G2)];
  };
  const schwanz = teil([roehre([0, 0.3, -1.9], [0, 0.35, -4.6], 0.18, 0.09, oben, 6), roehre([0, 0.35, -4.6], [0, 0.2, -7.2], 0.09, 0.03, oben, 5)], [kugelGlow(0.1, 0, 0.2, -7.2, '#9fe7ff', 2.4)], { art: 'schwanz', seite: 1, p: [0, 0.3, -1.9] });
  return [rumpf, ...fl(-1), ...fl(1), schwanz];
}

function aschegeist(): Teil[] {
  const rauch = (s: number) => { const c = new THREE.Color(); return (x: number, y: number, z: number) => c.set(wr(x * 4, y * 4, z * 4, s) > 0.2 ? '#5a5048' : '#34302e'); };
  const k: THREE.BufferGeometry[] = []; for (let i = 0; i < 9; i++) { const y = -0.9 + i * 0.4, r = (0.8 - Math.abs(i - 4) * 0.1) * (1 + 0.1 * Math.sin(i * 2)); k.push(blob(r, 0.35, r * 0.9, Math.sin(i) * 0.18, y, Math.cos(i) * 0.14, rauch(i), 0.3, 2, i)); }
  for (let i = 0; i < 5; i++) k.push(roehre([Math.sin(i * 1.7) * 0.4, -0.9, -0.1], [Math.sin(i * 1.7) * 0.7, -1.9 - i * 0.12, -0.8 - i * 0.2], 0.2, 0.03, rauch(20 + i), 6));
  for (const s of [-1, 1]) k.push(roehre([s * 0.75, 1.7, 0.1], [s * 1.25, 0.6, 0.5], 0.14, 0.05, rauch(40), 6));
  const g = [kugelGlow(0.09, -0.26, 2.0, 0.72, '#ffb347', 2.8), kugelGlow(0.09, 0.26, 2.0, 0.72, '#ffb347', 2.8)];
  for (let i = 0; i < 8; i++) g.push(blob(0.05, 0.05, 0.05, (rz(i, 1, 3, 44) - 0.5) * 1.5, rz(i, 2, 3, 44) * 2.6 - 0.5, (rz(i, 3, 3, 44) - 0.5) * 1.2, leuchtFarbe('#ff7a2a', 1.8), 0, 1));
  return [teil(k, g)];
}

function steinwerfer(): Teil[] {
  const haut2 = fell('#7a6e5e', 0.2, 51), haut3 = fell('#867a68', 0.2, 52), bein2 = fell('#5d5448', 0.2, 53), arm2 = fell('#6e6352', 0.2, 54), fels = fell('#8c867f', 0.25, 55), moos = fell('#5d7a3e', 0.25, 56);
  const rumpf = teil([blob(1.5, 1.3, 1.1, 0, 2.5, -0.3, haut2, 0.12), blob(0.72, 0.66, 0.72, 0, 3.7, 0.3, haut3, 0.1), blob(0.4, 0.2, 0.3, 0, 3.4, 0.9, haut2, 0.1, 1),
    roehre([-1.3, 3.2, 0], [-1.0, 5.4, 0.3], 0.46, 0.38, arm2, 8), roehre([1.3, 3.2, 0], [1.0, 5.4, 0.3], 0.46, 0.38, arm2, 8), blob(0.4, 0.35, 0.4, -1.0, 5.55, 0.3, haut2, 0.1, 1), blob(0.4, 0.35, 0.4, 1.0, 5.55, 0.3, haut2, 0.1, 1),
    blob(1.2, 1.0, 1.1, 0, 6.35, 0.3, fels, 0.3, 2, 7), blob(0.6, 0.3, 0.6, 0.2, 7.0, 0.2, moos, 0.4, 1), blob(1.0, 0.35, 0.8, 0, 1.4, 0.1, fell('#4a3a2a', 0.15, 57), 0.1, 1)], [kugelGlow(0.09, -0.3, 3.8, 0.95, '#ffcf5a', 2.4), kugelGlow(0.09, 0.3, 3.8, 0.95, '#ffcf5a', 2.4)]);
  const bein = (x: number, seite: number) => kette('bein', seite, [x, 1.6, 0], [x, 0.95, 0.25], [x, 0.4, 0.05], [0.6, 0.48, 0.4], bein2, fell('#4a3f34', 0.2, 58), { zehen: 3, kralle: fels });
  return [rumpf, ...bein(-0.95, 1), ...bein(0.95, -1)];
}

function schamane(): Teil[] {
  const robe = fell('#556b3a', 0.2, 61), streifen = fell('#3d4a2a', 0.15, 62), maske = fell('#e8dcc0', 0.1, 63), kapuze = fell('#6f8a4a', 0.2, 64), holz = fell('#5a3d24', 0.2, 65), bein2 = fell('#4f6136', 0.15, 66), gold = fell('#c9a043', 0.15, 67);
  const lathe = new THREE.LatheGeometry([[0.95, 0.15], [0.9, 0.7], [0.72, 1.4], [0.5, 2.1], [0.42, 2.5], [0.18, 2.62]].map(([r, y]) => new THREE.Vector2(r, y)), 18); lathe.deleteAttribute('uv'); lathe.computeVertexNormals();
  const rumpf = teil([faerben(lathe, (x, y, z) => ((Math.floor(y * 4) % 2 ? robe : streifen)(x, y, z, 0, 1, 0))), blob(0.46, 0.5, 0.42, 0, 3.05, 0, kapuze, 0.1), blob(0.42, 0.48, 0.34, 0, 3.12, 0.25, maske, 0.06), kegel([0, 3.55, 0.05], [0, 4.0, -0.1], 0.14, kapuze, 5),
    ...[-1, 1].map((s) => roehre([s * 0.3, 3.5, 0], [s * 0.7, 4.4, -0.2], 0.05, 0.02, maske, 5)), roehre([0.5, 2.5, 0.05], [0.85, 2.0, 0.3], 0.12, 0.09, kapuze, 6), blob(0.11, 0.11, 0.11, 0.85, 2.0, 0.3, kapuze, 0.05, 1), roehre([0.85, 2.0, 0.3], [1.15, 1.55, 0.6], 0.09, 0.07, kapuze, 6), blob(0.1, 0.12, 0.09, 1.18, 1.5, 0.62, maske, 0.05, 1),
    roehre([1.2, 0, 0.6], [1.2, 4.0, 0.6], 0.07, 0.05, holz, 6), blob(0.3, 0.12, 0.3, 1.2, 4.0, 0.6, gold, 0.1, 1), ...[0.5, 1.1, 1.7, 2.3].map((y) => blob(0.54 - y * 0.05, 0.03, 0.54 - y * 0.05, 0, y, 0, gold, 0.02, 1))],
  [kugelGlow(0.07, -0.16, 3.2, 0.55, '#7dff6a', 2.6), kugelGlow(0.07, 0.16, 3.2, 0.55, '#7dff6a', 2.6), kugelGlow(0.34, 1.2, 4.45, 0.6, '#7dff6a', 2.2)]);
  const bein = (x: number, seite: number) => kette('bein', seite, [x, 0.75, 0], [x, 0.42, 0.08], [x, 0.14, 0.03], [0.1, 0.075, 0.06], bein2, fell('#3f4f2a', 0.1, 68), { zehen: 3, kralle: maske, seg: 6 });
  const armL = kette('arm', -1, [-0.5, 2.5, 0.05], [-0.85, 2.05, 0.15], [-1.1, 1.65, 0.45], [0.12, 0.09, 0.07], kapuze, maske, { zehen: 3, seg: 6 });
  return [rumpf, ...bein(-0.28, 1), ...bein(0.28, -1), ...armL];
}

function schildwaechter(): Teil[] {
  const borke = (s: number) => fell('#5e4128', 0.25, s), dunkel = fell('#4d3522', 0.2, 72), blatt = fell('#4f8a3c', 0.25, 73), rand = fell('#3a2a1e', 0.15, 74), eisen = fell('#8c867f', 0.15, 75);
  const k = [blob(1.25, 1.5, 0.95, 0, 3.0, 0, borke(71), 0.18), blob(0.85, 0.72, 0.78, 0, 4.65, 0.05, borke(76), 0.14), blob(0.5, 0.3, 0.3, 0, 4.4, 0.7, dunkel, 0.1, 1), ...[0, 1, 2, 3, 4, 5].map((i) => blob(0.62, 0.34, 0.62, Math.sin(i * 2.1) * 0.8, 5.35 + (i % 3) * 0.12, Math.cos(i * 2.1) * 0.6, blatt, 0.2, 1, i)),
    blob(1.5, 1.95, 0.42, 0, 3.1, 1.55, borke(77), 0.12), blob(1.62, 2.05, 0.3, 0, 3.1, 1.3, rand, 0.08), blob(0.34, 0.34, 0.2, 0, 3.0, 2.0, eisen, 0.12, 1),
    ...[-1, 1].map((s) => roehre([s * 1.0, 4.0, 0.3], [s * 1.25, 3.2, 1.3], 0.34, 0.3, dunkel, 8)), ...[0, 1, 2].map((i) => kegel([-0.9 + i * 0.9, 5.0, -0.3], [-0.9 + i * 0.9, 5.5, -0.35], 0.1, dunkel, 4))];
  const bein = (x: number, seite: number) => kette('bein', seite, [x, 1.7, 0], [x, 0.98, 0.22], [x, 0.4, 0.05], [0.55, 0.45, 0.4], dunkel, fell('#3a2a1e', 0.15, 78), { zehen: 3, kralle: eisen, oben: [blob(0.3, 0.25, 0.25, x, 1.2, 0.45, blatt, 0.3, 1, 4)] });
  return [teil(k, [kugelGlow(0.09, -0.3, 4.8, 0.78, '#ffd34a', 2.4), kugelGlow(0.09, 0.3, 4.8, 0.78, '#ffd34a', 2.4)]), ...bein(-0.85, 1), ...bein(0.85, -1)];
}

function rissfuerst(): Teil[] {
  const hautF = fell('#2d2838', 0.22, 81, 0.12), hautH = fell('#3a3442', 0.2, 82), horn = fell('#e8dcc0', 0.12, 83), umhang = fell('#3f1f5a', 0.2, 84, 0.08), umhang2 = fell('#5a2a7a', 0.2, 85, 0.08), stab = fell('#3a3442', 0.15, 86);
  const hornKette = (s: number) => [roehre([s * 1.3, 11.4, 0.1], [s * 2.6, 13.0, -0.4], 0.38, 0.28, horn, 7), roehre([s * 2.6, 13.0, -0.4], [s * 3.4, 15.0, 0.0], 0.28, 0.1, horn, 7), roehre([s * 3.4, 15.0, 0.0], [s * 3.2, 15.8, 0.8], 0.1, 0.03, horn, 5)];
  const risse = [[-1.4, 6.8, 2.1, 0.9, 0.12, 0.4, 0.2], [1.2, 5.6, 2.15, 0.7, 0.1, 0.45, -0.3], [0.1, 7.6, 2.2, 0.5, 0.09, 0.7, 0.1], [-0.9, 4.6, 2.1, 0.8, 0.1, 0.5, 0.35], [1.8, 7.4, 1.9, 0.6, 0.09, 0.6, -0.2], [-2.4, 5.6, 1.6, 0.7, 0.09, 0.5, 0.5]];
  const rumpf = teil([blob(3.6, 3.5, 2.2, 0, 6.2, 0, hautF, 0.12), blob(2.2, 1.6, 1.0, 0, 4.4, 1.6, hautH, 0.1), blob(1.8, 1.55, 1.6, 0, 10.2, 0.6, hautF, 0.12), blob(1.0, 0.55, 0.9, 0, 9.5, 1.9, hautH, 0.08, 1), ...hornKette(-1), ...hornKette(1),
    blob(3.4, 4.8, 0.45, 0, 8.6, -2.7, umhang, 0.1), blob(2.2, 3.4, 0.35, 0, 8.4, -3.05, umhang2, 0.1), blob(1.2, 0.9, 0.4, 0, 3.0, -1.2, hautH, 0.1, 1),
    roehre([0, 7.4, 0], [0, 9.8, 0.4], 1.3, 1.0, hautH, 8)],
  [kugelGlow(0.3, -0.9, 10.8, 2.1, '#efe2ff', 2.8), kugelGlow(0.3, 0.9, 10.8, 2.1, '#efe2ff', 2.8), ...risse.map(([x, y, z, rx, ry, rz2, rot], i) => { const g = blob(rx, ry, rz2 * 0.5, x, y, z, leuchtFarbe('#b07cff', 2.0), 0, 1); void rot; void i; return g; }),
    ...[-2, -1, 0, 1, 2].map((i) => blob(0.12, 0.08, 0.1, i * 0.5, 9.0 + (i % 2) * 0.3, 2.1, leuchtFarbe('#c9a2ff', 1.8), 0, 1))]);
  const bein = (x: number, seite: number) => kette('bein', seite, [x, 3.5, 0], [x, 2.0, 0.55], [x, 0.9, 0.15], [1.1, 0.9, 0.7], hautF, hautH, { zehen: 4, kralle: horn, oben: [kegel([x + Math.sign(x) * 0.6, 2.3, 0.9], [x + Math.sign(x) * 0.8, 2.7, 1.5], 0.2, horn, 5)] });
  const armL = kette('arm', -1, [-4.0, 8.0, 0], [-4.6, 5.8, 0.5], [-5.0, 3.9, 0.9], [1.0, 0.8, 0.6], hautF, hautH, { zehen: 4, kralle: horn });
  const armR = kette('arm', 1, [4.0, 8.0, 0], [4.6, 5.8, 0.5], [5.0, 3.9, 0.9], [1.0, 0.8, 0.6], hautF, hautH, { zehen: 4, kralle: horn, unten: [roehre([5.0, 3.0, 1.0], [5.0, 13.6, 1.8], 0.2, 0.15, stab, 7), ...[0, 1, 2].map((i) => kegel([5.0 + (i - 1) * 0.35, 13.5, 1.8], [5.0 + (i - 1) * 0.55, 14.4, 1.8], 0.1, horn, 4))], glowU: [kugelGlow(0.85, 5.0, 14.6, 1.8, '#b07cff', 2.4)] });
  return [rumpf, ...bein(-2.0, 1), ...bein(2.0, -1), ...armL, ...armR];
}

/** Kristallpanzer später Trolle: leuchtende Splitter auf Schultern und Rücken (liegt über dem Trollmodell) */
function trollPanzer(): Teil[] {
  const spitzen: [V3, V3, number][] = [[[-2.0, 4.4, 0.3], [-2.5, 5.9, 0.1], 0.3], [[2.0, 4.4, 0.3], [2.5, 5.9, 0.1], 0.3], [[0, 5.0, -1.4], [0, 6.5, -1.9], 0.35], [[-1.0, 4.8, -1.2], [-1.5, 6.0, -1.5], 0.25], [[1.0, 4.8, -1.2], [1.5, 6.0, -1.5], 0.25], [[-2.5, 3.3, 0.4], [-3.0, 4.2, 0.5], 0.22], [[2.5, 3.3, 0.4], [3.0, 4.2, 0.5], 0.22]];
  return [teil([], spitzen.map(([a, b, r]) => kegel(a, b, r, (x, y) => new THREE.Color('#7fe9ff').lerp(new THREE.Color('#e8ffff'), Math.min(1, Math.max(0, (y - a[1]) / (b[1] - a[1])))).multiplyScalar(1.7), 6)))];
}
/** Feuerstoß des Drachlings (nur beim Angriff): flackernde Kegel von der Schnauze nach vorn */
function drachenFeuer(): Teil[] {
  const heiss = (x: number, y: number, z: number) => new THREE.Color('#ff7a2a').lerp(new THREE.Color('#ffe9a0'), Math.max(0, 1 - (z - 4.8) / 8)).multiplyScalar(1.8 + wr(x * 3, y * 3, z * 2, 5) * 0.3);
  return [teil([], [kegel([0, 0.7, 4.9], [0, 0.1, 13.5], 1.0, heiss, 9), kegel([0.2, 0.7, 4.9], [0.9, 0.3, 11], 0.5, heiss, 7), kegel([-0.2, 0.7, 4.9], [-0.9, 0.2, 10.5], 0.5, heiss, 7)])];
}

export type WesenArt = 'moorwicht' | 'wolf' | 'wolfDunkel' | 'troll' | 'drachling' | 'rochen' | 'aschegeist' | 'steinwerfer' | 'schamane' | 'schildwaechter' | 'rissfuerst' | 'trollPanzer' | 'drachenFeuer';
export function glatteWesen(art: WesenArt): Teil[] {
  switch (art) {
    case 'moorwicht': return moorwicht(); case 'wolf': return wolf(false); case 'wolfDunkel': return wolf(true); case 'troll': return troll(); case 'drachling': return drachling(); case 'rochen': return rochen();
    case 'aschegeist': return aschegeist(); case 'steinwerfer': return steinwerfer(); case 'schamane': return schamane(); case 'schildwaechter': return schildwaechter(); case 'rissfuerst': return rissfuerst();
    case 'trollPanzer': return trollPanzer(); case 'drachenFeuer': return drachenFeuer();
  }
}

// ---------- Schar glatter Wesen: viele gleiche Wesen als Instanzen, Glieder beweglich (gleiche Schnittstelle wie Schar in objekte.ts) ----------
const X_ACHSE = new THREE.Vector3(1, 0, 0), Y_ACHSE = new THREE.Vector3(0, 1, 0), Z_ACHSE = new THREE.Vector3(0, 0, 1);
let KOERPER: THREE.Material | null = null;
export class GlattSchar {
  private teile: { glied: Glied | undefined; meshes: THREE.InstancedMesh[] }[] = [];
  n = 0;
  constructor(teile: Teil[], readonly max: number, scene: THREE.Scene, schatten = true) {
    KOERPER ??= FABRIK.licht({ vertexColors: true, roughness: 0.8, metalness: 0 }, 1.1);
    for (const t of teile) {
      const meshes: THREE.InstancedMesh[] = [];
      for (const [geos, mat, wirft] of [[t.koerper, KOERPER, schatten], [t.glow, GLOW, false]] as [THREE.BufferGeometry[], THREE.Material, boolean][]) for (const geo of geos) {
        geo.computeBoundingSphere(); const m = new THREE.InstancedMesh(geo, mat, max); m.castShadow = wirft; m.receiveShadow = mat === KOERPER; m.frustumCulled = false; m.count = 0; m.visible = false; meshes.push(m); scene.add(m);
      }
      this.teile.push({ glied: t.glied, meshes });
    }
  }
  private mat = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3(); private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private lok = new THREE.Matrix4(); private dreh = new THREE.Matrix4(); private hin = new THREE.Matrix4(); private ges = new THREE.Matrix4();
  /** Drehachse und Winkel eines Gelenks: Hüfte/Schulter schwingen, Knie knickt beim Vorschwingen ein, Ellbogen hängt leicht angewinkelt (Hieb: Schlag nach oben) */
  private winkel(G: Glied, r: Regung): [THREE.Vector3, number] {
    const ph = r.phase, sw = Math.sin(ph), cs = Math.cos(ph), gang = r.gang, hieb = r.hieb ?? 0;
    switch (G.art) {
      case 'bein': return [X_ACHSE, G.seite * sw * 0.6 * gang];
      case 'knie': return [X_ACHSE, Math.max(0, G.seite * cs) * 0.95 * gang];
      case 'arm': return [X_ACHSE, G.seite * sw * 0.5 * gang - (G.seite > 0 ? hieb * 1.3 : 0)];
      case 'ellbogen': return [X_ACHSE, -(0.22 + 0.3 * gang + Math.max(0, -G.seite * sw) * 0.35 * gang) - (G.seite > 0 ? hieb * 0.9 : 0)];
      case 'werkzeug': return [X_ACHSE, hieb ? -hieb * 1.7 : G.seite * sw * 0.5 * gang];
      case 'fluegel': return [Z_ACHSE, G.seite * (Math.sin(ph) * 0.75 + 0.15) * (r.flug ?? 1)];
      case 'fluegelHand': return [Z_ACHSE, G.seite * (Math.sin(ph - 1.0) * 0.55 - 0.12) * (r.flug ?? 1)];
      case 'schwanz': return [Y_ACHSE, Math.sin(ph * 0.5) * 0.35];
    }
  }
  beginn(): void { this.n = 0; }
  setze(x: number, y: number, z: number, ry: number, rz2 = 0, rx = 0, groesse = 1, r?: Regung): void {
    if (this.n >= this.max) return;
    this.e.set(rx, ry, rz2); this.q.setFromEuler(this.e); this.s.setScalar(groesse); this.p.set(x, y, z); this.mat.compose(this.p, this.q, this.s);
    for (const t of this.teile) {
      let M = this.mat;
      if (t.glied && r) {
        this.ges.copy(this.mat); let geaendert = false;
        for (const G of t.glied.eltern ? [t.glied.eltern, t.glied] : [t.glied]) {
          const [achse, w] = this.winkel(G, r);
          if (w) { this.hin.makeTranslation(G.p[0], G.p[1], G.p[2]); this.dreh.makeRotationAxis(achse, w); this.lok.multiplyMatrices(this.hin, this.dreh); this.hin.makeTranslation(-G.p[0], -G.p[1], -G.p[2]); this.lok.multiply(this.hin); this.ges.multiply(this.lok); geaendert = true; }
        }
        if (geaendert) M = this.ges;
      }
      for (const m of t.meshes) m.setMatrixAt(this.n, M);
    }
    this.n++;
  }
  ende(): void { for (const t of this.teile) for (const m of t.meshes) { m.count = this.n; m.visible = this.n > 0; m.instanceMatrix.needsUpdate = true; } }
}
