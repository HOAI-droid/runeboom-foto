import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FABRIK, GLOW } from './grafik.ts';
import { felsTex, grasTex } from './texturen.ts';

/**
 * Glatte Natur im „Foto-Look“ (Branch foto-look): Bäume, Büsche, Felsen, Gras und Blumen als echte Geometrie
 * mit Vertexfarben (Verlauf, Moos, Rinde), je Art ein InstancedMesh je Kachel. Maße in Blöcken, Fuß bei y = 0.
 * Der Kachelbauer (chunk.ts, läuft im Hintergrund-Rechner) liefert nur Zahlen; hier entsteht die Darstellung.
 */

/** Arten in der Instanzliste (Stufe je Instanz: 8 Werte) */
export const NAT = { laub: 0, tanne: 1, herbst: 2, leucht: 3, busch: 4, tot: 5, fels: 6, gras: 7, blume: 8, farn: 9, bluete: 10, schilf: 11, kristall: 12 } as const;
/** Listenaufbau je Instanz: Art, x, y, z (Kachel-Koordinaten), Drehung, Größe, Variante, Tönung (0 normal, 1 Asche) */
export const NAT_SCHRITT = 8;

const rz = (x: number, y: number, z: number, s: number): number => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.3) * 43758.5453; return v - Math.floor(v); };
/** weiches Rauschen (zwei Oktaven aus Sinus), −1…1 */
const wr = (x: number, y: number, z: number, s: number): number => 0.62 * Math.sin(x * 2.3 + s) * Math.cos(z * 2.1 - s * 0.7 + y * 1.3) + 0.38 * Math.sin(x * 5.1 + y * 4.3 + z * 4.7 + s * 2.1);

type Farbe = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color;
/** Geometrie vorbereiten: ohne UV, mit Normalen und Farbe */
function fertig(geo: THREE.BufferGeometry, farbe: Farbe): THREE.BufferGeometry {
  geo.deleteAttribute('uv'); if (!geo.index) { geo.deleteAttribute('normal'); geo = mergeVertices(geo, 1e-4); } geo.computeVertexNormals();
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal'), c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = farbe(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[3 * i] = k.r; c[3 * i + 1] = k.g; c[3 * i + 2] = k.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
const lin = (a: string, b: string, t: number): THREE.Color => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));

/** Blattbüschel: kleine, unregelmäßig ausgebeulte Kugel; die Farbe kommt von der Krone insgesamt (siehe `kronenFarbe`) */
function buschel(sx: number, sy: number, sz: number, x: number, y: number, z: number, s: number, farbe: Farbe, detail = 1, beule = 0.32): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i), f = 1 + beule * wr(dx * 2.6, dy * 2.6, dz * 2.6, s) + 0.1 * wr(dx * 8, dy * 8, dz * 8, s + 3);
    p.setXYZ(i, dx * f * sx + x, dy * f * sy * (dy < 0 ? 0.8 : 1) + y, dz * f * sz + z);
  }
  return fertig(g, farbe);
}
/** Farbe im Kronenraum: unten und innen dunkel, oben und außen hell und sonnig, dazu Fleckenrauschen und Aufhellung nach oben gerichteter Flächen */
function kronenFarbe(cy: number, ry: number, rx: number, s: number, dunkel: string, mitte: string, hell: string): Farbe {
  const D = new THREE.Color(dunkel), M = new THREE.Color(mitte), H = new THREE.Color(hell), c = new THREE.Color();
  return (px, py, pz, _nx, ny) => {
    const h = Math.min(1, Math.max(0, (py - (cy - ry)) / (2 * ry))), rr = Math.min(1.2, Math.hypot(px / rx, (py - cy) / ry, pz / rx));
    const n = wr(px * 3.1, py * 3.1, pz * 3.1, s + 9) * 0.5 + 0.5, f = wr(px * 9, py * 9, pz * 9, s + 4) * 0.5 + 0.5;
    const t = h * 0.62 + rr * 0.34 + n * 0.34 + f * 0.1 + ny * 0.2 - 0.36;
    if (t < 0.5) c.copy(D).lerp(M, Math.max(0, t * 2)); else c.copy(M).lerp(H, Math.min(1, (t - 0.5) * 2));
    { const l = c.r * 0.299 + c.g * 0.587 + c.b * 0.114; c.setRGB(l + (c.r - l) * 0.72, l + (c.g - l) * 0.74, l + (c.b - l) * 0.72); } // gedeckter, natürlicher
    return c.multiplyScalar(1.5);
  };
}
/** Ast oder Stamm: Kegelstumpf von (x0,y0,z0) nach (x1,y1,z1) */
function ast(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, rinde = ['#3e2b1c', '#6d4c30'], seg = 9): THREE.BufferGeometry {
  const v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = v.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, Math.max(2, Math.round(len * 1.2))); g.deleteAttribute('uv');
  { const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), w = 1 + 0.12 * wr(x * 7, y * 1.6, z * 7, 6); p.setXYZ(i, x * w, y, z * w); } } // knorrige Rinde
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize())); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const geo = fertig(g, (px, py, pz) => lin(rinde[0], rinde[1], 0.4 + 0.6 * wr(px * 11, py * 2.2, pz * 11, 4) * 0.9));
  const Pp = geo.getAttribute('position'), uv = new Float32Array(Pp.count * 2); // Rindenstreifen im Laub-Atlas: Umfang → u, Länge → v
  for (let i = 0; i < Pp.count; i++) { uv[2 * i] = 0.885 + 0.08 * (Math.atan2(Pp.getZ(i) - (z0 + z1) / 2, Pp.getX(i) - (x0 + x1) / 2) / 6.2832 + 0.5); uv[2 * i + 1] = (Pp.getY(i) - Math.min(y0, y1)) * 0.12; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
/** Teile zu einem Netz; mit uv = true bekommen Teile ohne UV einen vollständig deckenden Punkt der Laubtextur (nur Vertexfarbe zählt) */
const vereint = (teile: THREE.BufferGeometry[], uv = false): THREE.BufferGeometry => {
  if (uv) for (const t of teile) if (!t.getAttribute('uv')) { const n = t.getAttribute('position').count, a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[2 * i] = 0.99; a[2 * i + 1] = 0.5; } t.setAttribute('uv', new THREE.BufferAttribute(a, 2)); }
  const g = mergeGeometries(teile, false)!; teile.forEach((t) => t.dispose()); return g;
};

// ---------- Laubtextur: Büschel aus sehr vielen feinen Blättern (Alpha-Schnitt, Grauwerte; die Farbe kommt aus den Vertexfarben).
// Atlas 256²: links (x < 224) das Büschel, x 224…248 Rinde (senkrechte Furchen, waagrechte Narben), x ≥ 248 deckend weiß ----------
let LAUBTEX: THREE.CanvasTexture | null = null;
/** weiches Wertrauschen mit per Zellen über die Textur (nicht kachelnd), 0…1 */
function vrausch(x: number, y: number, per: number, sd: number): number {
  const fx = x / 256 * per, fy = y / 256 * per, xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (i: number, j: number) => { let q = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(sd, 1442695041)) | 0; q = Math.imul(q ^ (q >>> 13), 1274126177); q = Math.imul(q ^ (q >>> 16), 2246822519); return ((q ^ (q >>> 15)) >>> 0) / 4294967296; };
  return h(xi, yi) * (1 - sx) * (1 - sy) + h(xi + 1, yi) * sx * (1 - sy) + h(xi, yi + 1) * (1 - sx) * sy + h(xi + 1, yi + 1) * sx * sy;
}
function laubTex(): THREE.CanvasTexture {
  if (LAUBTEX) return LAUBTEX;
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d')!;
  c.clearRect(0, 0, n, n);
  const blatt = (x: number, y: number, w: number, h: number, rot: number, v: number) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    const gr = c.createLinearGradient(0, h, 0, -h); gr.addColorStop(0, `rgb(${v * 0.45 | 0},${v * 0.5 | 0},${v * 0.42 | 0})`); gr.addColorStop(1, `rgb(${Math.min(255, v * 1.1) | 0},${v | 0},${v * 0.88 | 0})`);
    c.fillStyle = gr; c.beginPath(); c.moveTo(0, h); c.quadraticCurveTo(w * 1.3, h * 0.1, 0, -h); c.quadraticCurveTo(-w * 1.3, h * 0.1, 0, h); c.fill(); c.restore();
  };
  // Umriss aus Rauschen (Lappen, Buchten, Lücken) statt Kreis: Blätter werden nur dort gemalt, wo die Dichte reicht
  const dichte = (x: number, y: number) => { const dx = (x - 112) / 106, dy = (y - 128) / 118, rad = Math.hypot(dx, dy) * (0.72 + 0.6 * vrausch(x, y, 3, 7)) * (0.9 + 0.3 * vrausch(x, y, 7, 8)); return 0.55 * vrausch(x, y, 5, 1) + 0.3 * vrausch(x, y, 11, 2) + 0.35 * vrausch(x, y, 24, 3) - 0.95 * Math.max(0, rad - 0.3) ** 1.3 + 0.15; };
  let gemalt = 0, versuch = 0;
  while (gemalt < 1900 && versuch < 40000) {
    versuch++; const x = 6 + rz(versuch, 1, 0, 33) * 212, y = 4 + rz(versuch, 2, 0, 33) * 248, d = dichte(x, y);
    if (d < 0.4 + 0.25 * rz(versuch, 3, 0, 33)) continue; gemalt++;
    const pass = gemalt % 3, v = pass === 0 ? 70 + 60 * rz(versuch, 4, 0, 33) : pass === 1 ? 120 + 90 * rz(versuch, 4, 0, 33) : 190 + 65 * Math.pow(rz(versuch, 4, 0, 33), 0.6);
    blatt(x, y, 1.9 + 2.2 * rz(versuch, 5, 0, 33), 5 + 6 * rz(versuch, 6, 0, 33), rz(versuch, 7, 0, 33) * 6.2832, v * (0.8 + 0.4 * vrausch(x, y, 6, 9)));
  }
  // Rinde
  c.fillStyle = '#9a9a96'; c.fillRect(224, 0, 24, n);
  for (let i = 0; i < 90; i++) { const x = 224 + rz(i, 1, 0, 32) * 24, y = rz(i, 2, 0, 32) * n, l = 20 + rz(i, 3, 0, 32) * 90; c.fillStyle = `rgba(${rz(i, 4, 0, 32) > 0.4 ? '30,28,26' : '230,230,224'},${0.25 + rz(i, 5, 0, 32) * 0.4})`; c.fillRect(x, y, 1 + rz(i, 6, 0, 32) * 2.5, l); }
  for (let i = 0; i < 40; i++) { const y = rz(i, 1, 1, 32) * n; c.fillStyle = `rgba(20,18,16,${0.2 + rz(i, 2, 1, 32) * 0.3})`; c.fillRect(224 + rz(i, 3, 1, 32) * 12, y, 6 + rz(i, 4, 1, 32) * 14, 1.5); }
  c.fillStyle = '#ffffff'; c.fillRect(248, 0, 8, n);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; LAUBTEX = t; return t;
}
/**
 * Laubkarten: viele kleine Quadrate mit Blattbüschel-Textur, nach außen geneigt und beidseitig gezeichnet; die Normalen zeigen von der Krone
 * nach außen (weiche Kugelschattierung), die Farbe kommt je Ecke aus `farbe`. Pro Karte nur vier Ecken – daher sehr billig.
 */
function karten(zentrum: [number, number, number], rx: number, ry: number, anzahl: number, groesse: number, s: number, farbe: Farbe, huelle = [0.55, 1.02], streu?: Streuung, punkte?: number[][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const n = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), sph = new THREE.Vector3(), q = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Color();
  for (let k = 0; k < anzahl; k++) {
    let cx: number, cy: number, cz: number;
    if (punkte) { [cx, cy, cz] = punkte[k]; } else {
      const t = (k + 0.5) / anzahl, yy = 0.96 - 1.9 * t + 0.12 * (rz(k, 1, s, 41) - 0.5), az = k * 2.399963 + s, rr = Math.sqrt(Math.max(0, 1 - yy * yy));
      const f = huelle[0] + (huelle[1] - huelle[0]) * Math.pow(rz(k, 2, s, 41), 0.6);
      cx = zentrum[0] + Math.cos(az) * rr * rx * f; cy = zentrum[1] + yy * ry * f; cz = zentrum[2] + Math.sin(az) * rr * rx * f;
    }
    n.set(cx - zentrum[0], (cy - zentrum[1]) * (rx / ry), cz - zentrum[2]).normalize();
    n.x += (rz(k, 3, s, 41) - 0.5) * 0.9; n.y += (rz(k, 4, s, 41) - 0.5) * 0.9 + 0.15; n.z += (rz(k, 5, s, 41) - 0.5) * 0.9; n.normalize();
    u.crossVectors(Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up, n).normalize(); w.crossVectors(n, u);
    const roll = rz(k, 6, s, 41) * 6.2832, cr = Math.cos(roll), sr = Math.sin(roll), a = groesse * (0.7 + 0.7 * rz(k, 7, s, 41)) * 0.5, asp = streu ? streu.form[0] + (streu.form[1] - streu.form[0]) * rz(k, 9, s, 41) : 1;
    const ecken = [[-1, -1, 0, 0], [1, -1, 0.86, 0], [1, 1, 0.86, 1], [-1, 1, 0, 1]], b0 = pos.length / 3, tup = 0.6 + 0.8 * rz(k, 8, s, 41);
    // Farbe je Karte: Streuung in Farbton, Sättigung und Helligkeit, dazu gelegentlich Ausreißer (gelbe, rote, dunkle Blätter) – ein Baum ist nie einfarbig
    let dh = 0, ds = 0, dl = 0, aus: THREE.Color | null = null, ap = 0;
    if (streu) { dh = (rz(k, 10, s, 41) - 0.5) * streu.h; ds = (rz(k, 11, s, 41) - 0.5) * streu.s; dl = (rz(k, 12, s, 41) - 0.5) * streu.l; if (rz(k, 13, s, 41) < streu.ausWahr) { aus = streu.aus[Math.floor(rz(k, 14, s, 41) * streu.aus.length) % streu.aus.length]; ap = 0.4 + 0.5 * rz(k, 15, s, 41); } }
    for (const [i, j, tu, tv] of ecken) {
      const lx = i * a, ly = j * a * asp, ex = lx * cr - ly * sr, ey = lx * sr + ly * cr;
      q.set(cx + u.x * ex + w.x * ey, cy + u.y * ex + w.y * ey, cz + u.z * ex + w.z * ey);
      sph.set(q.x - zentrum[0], (q.y - zentrum[1]) * (rx / ry), q.z - zentrum[2]).normalize().multiplyScalar(0.85).addScaledVector(n, 0.3).normalize();
      tmp.copy(farbe(q.x, q.y, q.z, sph.x, sph.y, sph.z)); if (streu) { tmp.offsetHSL(dh, ds, dl); if (aus) tmp.lerp(aus, ap * 0.5).multiplyScalar(0.9 + 0.2 * (tmp.r + tmp.g + tmp.b)); }
      pos.push(q.x, q.y, q.z); nor.push(sph.x, sph.y, sph.z); col.push(tmp.r * tup, tmp.g * tup, tmp.b * tup); uv.push(tu, tv);
    }
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3, b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
/** Farbstreuung und Kartenform innerhalb einer Krone: Farbton/Sättigung/Helligkeit ± , Seitenverhältnis, Ausreißerfarben mit Wahrscheinlichkeit */
interface Streuung { h: number; s: number; l: number; form: [number, number]; aus: THREE.Color[]; ausWahr: number }

/** Baumarten: Aufbau, Maße und Farben; jede Variante würfelt innerhalb dieser Spannen ihre eigenen Werte */
type Art = 'eiche' | 'birke' | 'ahorn' | 'leucht';
interface Preset { stamm: [number, number]; dicke: [number, number]; aeste: [number, number]; breite: [number, number]; hoehe: [number, number]; steil: [number, number]; blatt: [number, number]; dichte: [number, number]; farben: [string, string, string]; rinde: [string, string]; ausreisser: string[]; form: [number, number]; streuung: [number, number, number] }
const PRESETS: Record<Art, Preset> = {
  eiche: { stamm: [3.6, 5.0], dicke: [0.4, 0.6], aeste: [4, 6], breite: [1.0, 1.6], hoehe: [0.7, 1.05], steil: [0.35, 0.8], blatt: [0.9, 1.15], dichte: [0.85, 1.3], farben: ['#1c3020', '#3b5a2c', '#78904c'], rinde: ['#2c2118', '#5a4630'], ausreisser: ['#8c9040', '#2a4024', '#a88034'], form: [0.8, 1.3], streuung: [0.05, 0.22, 0.12] },
  birke: { stamm: [4.8, 6.6], dicke: [0.25, 0.36], aeste: [4, 6], breite: [0.6, 1.0], hoehe: [1.15, 1.6], steil: [0.7, 1.3], blatt: [0.65, 0.85], dichte: [0.8, 1.25], farben: ['#5e4a24', '#a58f3e', '#dccb86'], rinde: ['#4a443a', '#f1ecde'], ausreisser: ['#6c8a3c', '#c08a34', '#e8dca8'], form: [0.9, 1.5], streuung: [0.06, 0.2, 0.12] },
  ahorn: { stamm: [3.6, 5.0], dicke: [0.38, 0.56], aeste: [4, 6], breite: [1.1, 1.6], hoehe: [0.8, 1.15], steil: [0.4, 0.85], blatt: [1.0, 1.3], dichte: [0.85, 1.25], farben: ['#503020', '#a05c26', '#d4a458'], rinde: ['#3a2a1d', '#6a5038'], ausreisser: ['#903c28', '#d0b050', '#607a30'], form: [0.85, 1.25], streuung: [0.05, 0.24, 0.14] },
  leucht: { stamm: [3.6, 5.0], dicke: [0.36, 0.52], aeste: [4, 5], breite: [0.9, 1.4], hoehe: [0.8, 1.2], steil: [0.4, 0.9], blatt: [0.9, 1.15], dichte: [0.8, 1.2], farben: ['#2a2840', '#484468', '#8884ac'], rinde: ['#2c2418', '#5a4630'], ausreisser: ['#68507c', '#3c4670', '#a898c4'], form: [0.85, 1.3], streuung: [0.05, 0.2, 0.12] }
};
/** Wachstumsregeln je Art (Ebenen: 0 Stamm, 1 Äste, 2 Zweige, 3 Zweigspitzen mit Blättern), nach dem Vorbild rekursiver Baumgeneratoren */
const WACHSTUM: Record<Art, { laenge: [number, number, number]; kinder: [number, number, number]; winkel: [number, number, number]; kraft: [number, number, number]; knorrig: [number, number, number, number]; start: [number, number, number]; verjuengung: [number, number, number, number]; blaetter: number }> = {
  eiche: { laenge: [3.2, 2.1, 1.3], kinder: [5, 4, 5], winkel: [50, 46, 44], kraft: [0.0, 0.0, 0.0], knorrig: [0.05, 0.14, 0.22, 0.26], start: [0.72, 0.25, 0.1], verjuengung: [0.6, 0.7, 0.8, 0.9], blaetter: 16 },
  birke: { laenge: [2.6, 1.7, 1.1], kinder: [6, 4, 4], winkel: [28, 34, 40], kraft: [0.05, 0.02, 0.0], knorrig: [0.04, 0.09, 0.16, 0.2], start: [0.7, 0.2, 0.1], verjuengung: [0.55, 0.65, 0.8, 0.9], blaetter: 13 },
  ahorn: { laenge: [3.0, 2.0, 1.2], kinder: [5, 4, 5], winkel: [42, 44, 42], kraft: [0.02, 0.01, 0.0], knorrig: [0.05, 0.12, 0.2, 0.24], start: [0.7, 0.22, 0.1], verjuengung: [0.6, 0.7, 0.8, 0.9], blaetter: 14 },
  leucht: { laenge: [2.9, 1.9, 1.2], kinder: [5, 4, 4], winkel: [46, 44, 42], kraft: [0.01, 0.0, 0.0], knorrig: [0.06, 0.16, 0.24, 0.28], start: [0.7, 0.22, 0.1], verjuengung: [0.6, 0.7, 0.8, 0.9], blaetter: 13 }
};
/**
 * Laubbaum einer Art, prozedural je Variante, mit rekursiv wachsendem Gerüst: Stamm → Äste → Zweige → Zweigspitzen. Jede Ebene hat Länge, Dicke,
 * Verjüngung, Knorrigkeit (bei dünnen Ästen stärker), Wachstumskraft (zum Licht oder nach unten), Zahl und Startpunkt der Kinder und Abzweigwinkel.
 * Blätter sitzen als Karten an den Zweigspitzen; Farbe streut innerhalb der Krone (Ausreißerblätter, Ton, Helligkeit).
 */
function laubbaum(v: number, art: Art, beeren = false, fein = true): THREE.BufferGeometry {
  const P = PRESETS[art], Wz = WACHSTUM[art], R = (i: number) => rz(i, v, 3, 77), W = (r: [number, number], i: number) => r[0] + (r[1] - r[0]) * R(i), s = v * 7.3 + 1 + art.length * 3, t: THREE.BufferGeometry[] = [];
  let st = (Math.imul(v + 1, 9301) + art.length * 49297 + 17) >>> 0; const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const [d, m, h] = P.farben.map((c) => '#' + new THREE.Color(c).offsetHSL((R(7) - 0.5) * 0.07, (R(13) - 0.5) * 0.15, (R(8) - 0.5) * 0.1).getHexString()) as [string, string, string];
  const th = W(P.stamm, 1), neigung = (R(5) - 0.5) * (art === 'birke' ? 2.4 : 1.6), hoehe = W(P.hoehe, 3), breite = W(P.breite, 2), dicke = W(P.dicke, 6), dichte = W(P.dichte, 14), blatt = W(P.blatt, 15), steilV = 0.75 + 0.5 * R(4), knV = 0.7 + 0.7 * R(9);
  const laenge = [th, Wz.laenge[0] * breite * (0.85 + 0.3 * R(10)), Wz.laenge[1] * breite * (0.85 + 0.3 * R(11)), Wz.laenge[2] * breite], radius = [dicke, dicke * 0.42, dicke * 0.2, dicke * 0.09], sek = fein ? [6, 4, 3, 2] : [4, 3, 2, 2];
  const blattProZweig = Math.max(3, Math.round(Wz.blaetter * dichte * 0.95 * (fein ? 1 : 0.35))), punkte: number[][] = [], hoch = new THREE.Vector3(0, 1, 0), ref = new THREE.Vector3(1, 0, 0), a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), q = new THREE.Quaternion();
  const drehe = (vec: THREE.Vector3, achse: THREE.Vector3, w: number) => vec.applyQuaternion(q.setFromAxisAngle(achse, w));
  const wachse = (start: THREE.Vector3, richtung: THREE.Vector3, ebene: number, len: number, rad: number): void => {
    const pts: { p: THREE.Vector3; d: THREE.Vector3; r: number }[] = [], n = sek[ebene], sl = len / n, dir = richtung.clone().normalize(), pos = start.clone();
    for (let i = 0; i <= n; i++) {
      const r = Math.max(0.012, rad * (1 - Wz.verjuengung[ebene] * (i / n))); pts.push({ p: pos.clone(), d: dir.clone(), r });
      if (i < n) {
        const gn = Math.min(0.5, Wz.knorrig[ebene] * knV * Math.max(1, 0.35 / Math.sqrt(r))); a1.crossVectors(dir, Math.abs(dir.y) > 0.95 ? ref : hoch).normalize(); a2.crossVectors(dir, a1).normalize();
        drehe(dir, a1, (rnd() - 0.5) * 2 * gn); drehe(dir, a2, (rnd() - 0.5) * 2 * gn);
        if (ebene > 0) { const kr = Wz.kraft[ebene - 1]; dir.y += kr * 0.12 / Math.max(r, 0.05) * Math.sign(1); dir.normalize(); } else dir.lerp(hoch, 0.05).normalize();
        pos.addScaledVector(dir, sl);
      }
    }
    if (ebene <= 2) for (let i = 0; i < n; i++) t.push(ast(pts[i].p.x, pts[i].p.y, pts[i].p.z, pts[i + 1].p.x, pts[i + 1].p.y, pts[i + 1].p.z, pts[i].r, pts[i + 1].r, P.rinde, ebene === 0 ? (fein ? 10 : 6) : 5));
    if (ebene < 3) {
      const kinder = Math.round(Wz.kinder[ebene] * (ebene === 0 ? (P.aeste[0] + (P.aeste[1] - P.aeste[0]) * R(12)) / 5 : 1) * (0.85 + 0.3 * rnd())), versatz = rnd();
      for (let c = 0; c < kinder; c++) {
        const tt = Wz.start[ebene] + (1 - Wz.start[ebene]) * rnd(), ix = Math.min(n - 1, Math.floor(tt * n)), al = tt * n - ix, A = pts[ix], B = pts[ix + 1];
        const cp = new THREE.Vector3().lerpVectors(A.p, B.p, al), pd = new THREE.Vector3().lerpVectors(A.d, B.d, al).normalize(), pr = A.r + (B.r - A.r) * al;
        a1.crossVectors(pd, Math.abs(pd.y) > 0.95 ? ref : hoch).normalize(); drehe(a1, pd, 6.2832 * (versatz + c / kinder));
        const winkel = (Wz.winkel[ebene] * (ebene === 0 ? steilV : 1) * (0.8 + 0.4 * rnd())) * Math.PI / 180, cd = pd.clone(); drehe(cd, a1, winkel);
        wachse(cp, cd, ebene + 1, laenge[ebene + 1] * (0.8 + 0.4 * rnd()) * (1 - 0.3 * tt) * (ebene === 0 ? hoehe * 0.6 + 0.5 : 1), Math.min(radius[ebene + 1], pr * 0.62));
      }
    } else {
      for (let l = 0; l < blattProZweig; l++) { const tt = 0.12 + 0.88 * rnd(), ix = Math.min(n - 1, Math.floor(tt * n)), al = tt * n - ix, c = new THREE.Vector3().lerpVectors(pts[ix].p, pts[ix + 1].p, al); punkte.push([c.x + (rnd() - 0.5) * 0.5, Math.max(c.y + (rnd() - 0.5) * 0.5, th * 0.74 + rnd() * 0.4), c.z + (rnd() - 0.5) * 0.5]); } // freier Stamm: keine Blätter unterhalb der Kronenuntergrenze
    }
  };
  wachse(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(neigung * 0.05, 1, neigung * 0.02), 0, th + 0.3, radius[0]);
  let mx = 0, my = 0, mz = 0, hx = 0, ymin = 1e9, ymax = -1e9; for (const [x, y, z] of punkte) { mx += x; my += y; mz += z; ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  mx /= punkte.length; my /= punkte.length; mz /= punkte.length; for (const [x, , z] of punkte) hx = Math.max(hx, Math.hypot(x - mx, z - mz));
  const farbe = kronenFarbe(my, Math.max(1.5, (ymax - ymin) / 2), Math.max(1.5, hx), s, d, m, h);
  const streu: Streuung = { h: P.streuung[0], s: P.streuung[1], l: P.streuung[2], form: P.form, aus: P.ausreisser.map((c) => new THREE.Color(c)), ausWahr: 0.14 + 0.1 * R(16) };
  t.push(karten([mx, my, mz], Math.max(1.5, hx), Math.max(1.5, (ymax - ymin) / 2), punkte.length, (fein ? 1.1 : 1.7) * blatt, s, farbe, [0.35, 1.0], streu, punkte));
  { const kern = new THREE.Color(m).multiplyScalar(0.45); t.push(buschel(hx * 0.16, (ymax - ymin) * 0.1, hx * 0.16, mx, my - 0.2, mz, s, () => kern, 0, 0.3)); } // winziger dunkler Kern, damit kein glatter Blob durchscheint
  if (beeren) for (let i = 0; i < 8; i++) { const [x, y, z] = punkte[Math.floor(rz(i, 3, v, 5) * punkte.length)], aa = rz(i, 1, v, 5) * 6.28; t.push(fertig(new THREE.IcosahedronGeometry(0.16, 1).translate(x + Math.cos(aa) * 0.8, y + (rz(i, 2, v, 5) - 0.5), z + Math.sin(aa) * 0.8), () => new THREE.Color('#9be8ff').multiplyScalar(2.6))); }
  if (fein) for (let k = 0; k < 3 + Math.floor(R(10) * 3); k++) { const aa = k * 2.1 + R(11) * 6, dx = Math.cos(aa), dz = Math.sin(aa), l = 1.3 + R(12) * 0.8; t.push(ast(dx * 0.25, 0.15, dz * 0.25, dx * l, -0.3, dz * l, dicke * 0.45, dicke * 0.15, P.rinde, 5)); }
  return vereint(t, true);
}
// ---------- Nadeltextur: ein Zweigfächer mit vielen Nadeln (Grauwerte, Alpha-Schnitt); rechts ein deckender Streifen ----------
let NADELTEX: THREE.CanvasTexture | null = null;
function nadelTex(): THREE.CanvasTexture {
  if (NADELTEX) return NADELTEX;
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d')!; c.lineCap = 'round';
  const mx = 120, y0 = n - 6, y1 = 8;
  for (let pass = 0; pass < 2; pass++) {
    const schritte = pass === 0 ? 46 : 88;
    for (let i = 0; i < schritte; i++) {
      const t = i / schritte, y = y0 + (y1 - y0) * t, x = mx + Math.sin(t * 3 + 0.5) * 4, laenge = (Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.92 + 0.08) * (pass === 0 ? 112 : 96);
      for (const seite of [-1, 1]) {
        const w = (0.55 + 0.4 * rz(i, seite, pass, 33)) * (pass === 0 ? 1.15 : 0.85), ex = x + seite * laenge * Math.cos(w), ey = y - laenge * Math.sin(w) * 0.6 - 4;
        const v = pass === 0 ? 100 + 70 * rz(i, seite, 1, 33) : 150 + 100 * rz(i, seite, 2, 33), gr = c.createLinearGradient(x, y, ex, ey);
        gr.addColorStop(0, `rgb(${v * 0.45 | 0},${v * 0.5 | 0},${v * 0.42 | 0})`); gr.addColorStop(1, `rgb(${Math.min(255, v * 1.05) | 0},${v | 0},${v * 0.88 | 0})`);
        c.strokeStyle = gr; c.lineWidth = pass === 0 ? 3.4 : 2.2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + ex) / 2, (y + ey) / 2 - 8, ex, ey); c.stroke();
      }
    }
  }
  c.strokeStyle = 'rgb(70,50,40)'; c.lineWidth = 3; c.beginPath(); c.moveTo(mx, y0 + 4); c.lineTo(mx, y1 + 20); c.stroke(); // Zweig
  c.fillStyle = '#ffffff'; c.fillRect(n - 16, 0, 16, n);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; NADELTEX = t; return t;
}
/** Farn: Wedel als gebogene Streifen mit Nadeltextur (Fächer), flach ausladend */
function farn(v: number, fein = true): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [], c = new THREE.Color();
  const n = fein ? 9 : 5;
  for (let k = 0; k < n; k++) {
    const a = k * 2.399963 + v, len = 0.7 + 0.45 * rz(k, 1, v, 61), wd = 0.35 + 0.2 * rz(k, 2, v, 61), rise = 0.55 + 0.35 * rz(k, 3, v, 61), dx = Math.cos(a), dz = Math.sin(a), b0 = pos.length / 3;
    for (let r = 0; r < 4; r++) {
      const t = r / 3, px = dx * len * t, pz = dz * len * t, py = 0.12 + Math.sin(rise) * len * t * 1.1 - 0.9 * t * t * len * 0.5, w = wd * (0.35 + 0.65 * Math.sin(Math.PI * (0.15 + 0.7 * t)));
      for (const side of [-1, 1]) {
        c.set('#2c5a22').lerp(new THREE.Color('#8cc050'), 0.25 + 0.6 * t + 0.15 * rz(k, 4, v, 61)).multiplyScalar(1.25);
        pos.push(px - dz * side * w * 0.5, py, pz + dx * side * w * 0.5); nor.push(0, 1, 0); col.push(c.r, c.g, c.b); uv.push(side < 0 ? 0 : 0.93, t);
      }
    }
    for (let r = 0; r < 3; r++) { const i = b0 + r * 2; idx.push(i, i + 1, i + 3, i, i + 3, i + 2, i, i + 3, i + 1, i, i + 2, i + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
const BLUETEN = ['#8c6cb8', '#c8789c', '#e8e4d8', '#d8b858'];
/** Blühender Busch: grüner Busch mit vielen kleinen Blüten oben */
function bluetenbusch(v: number, fein = true): THREE.BufferGeometry {
  const t: THREE.BufferGeometry[] = [busch(v, fein)], f = new THREE.Color(BLUETEN[v % BLUETEN.length]);
  const n = fein ? 34 : 12; for (let k = 0; k < n; k++) { const a = k * 2.399963, yy = 0.15 + 0.8 * rz(k, 1, v, 62), r = Math.sqrt(1 - yy * yy) * (1.25 + 0.2 * rz(k, 2, v, 62)), sz = 0.14 + 0.1 * rz(k, 3, v, 62);
    t.push(fertig(new THREE.IcosahedronGeometry(sz, 0).translate(Math.cos(a) * r, 0.7 + yy * 0.95, Math.sin(a) * r), () => f.clone().multiplyScalar(0.85 + 0.5 * rz(k, 4, v, 62)))); }
  return vereint(t, true);
}
/** Tanne: Stamm, dunkler Kegelkern und viele hängende Zweigfächer in Stockwerken (Karten mit Nadeltextur) */
function tanne(v: number, fein = true): THREE.BufferGeometry {
  const s = v * 5.1 + 2, RV = (i: number) => rz(i, v, 5, 79), stufen = fein ? 7 + Math.floor(RV(1) * 4) : 5, t: THREE.BufferGeometry[] = [ast(0, -0.3, 0, 0, 4.0, 0, 0.5, 0.26, ['#3a2a1d', '#5e4630'], fein ? 8 : 5)];
  const D = new THREE.Color('#12281a'), M = new THREE.Color('#2c5a36'), H = new THREE.Color('#7da25c'), c = new THREE.Color(), abstand = (fein ? 1.15 : 1.75) * (0.85 + 0.35 * RV(2)), basis = 2.6 + 1.4 * RV(3), hoehe = 2.5 + (stufen - 1) * abstand + 2.2;
  // Kern
  { const g = new THREE.ConeGeometry(2.0, hoehe - 2.8, 9, 3, true); g.translate(0, 2.6 + (hoehe - 2.8) / 2, 0); t.push(fertig(g, (_x, py) => c.copy(D).multiplyScalar(0.9 + 0.5 * Math.min(1, py / hoehe)))); }
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < stufen; i++) {
    const f = i / (stufen - 1), r = basis - basis * 0.8 * f, y = 2.6 + i * abstand + 0.5, zahl = Math.round((fein ? 11 : 7) - 5 * f);
    for (let k = 0; k < zahl * (fein ? 2 : 1); k++) {
      const a = (k + (i % 2) * 0.5) * (6.2832 / zahl) + rz(k, i, s, 51) * 0.5, drop = 0.28 + 0.3 * rz(k, i, s, 52) + (fein && k >= zahl ? 0.25 : 0), len = r * 1.3 * (fein && k >= zahl ? 0.72 : 1) * (0.9 + 0.2 * rz(k, i, s, 53)), wd = (2.0 + 1.6 * (1 - f)) * (0.9 + 0.2 * rz(k, i, s, 54));
      const dx = Math.cos(a) * Math.cos(drop), dy = -Math.sin(drop), dz = Math.sin(a) * Math.cos(drop), wx = -Math.sin(a), wz = Math.cos(a), yy = y + (fein && k >= zahl ? -0.35 : 0);
      const b0 = pos.length / 3;
      for (const [along, side, tu, tv] of [[0.2, -1, 0, 0], [0.2, 1, 0.93, 0], [1, 1, 0.93, 1], [1, -1, 0, 1]]) {
        const px = dx * len * along + wx * side * wd * 0.5 * (along < 0.5 ? 0.6 : 1), py = yy + dy * len * along, pz = dz * len * along + wz * side * wd * 0.5 * (along < 0.5 ? 0.6 : 1);
        const hn = Math.hypot(px, pz) || 1, nx = (px / hn) * 0.62, ny = 0.7, nz = (pz / hn) * 0.62, nl = Math.hypot(nx, ny, nz);
        const q = 0.16 + 0.34 * (1 - f) * 0 + 0.36 * (py / hoehe) + 0.34 * Math.min(1, hn / r) + 0.22 * rz(k, i, s, 55) - 0.05; if (q < 0.5) c.copy(D).lerp(M, Math.max(0, q * 2)); else c.copy(M).lerp(H, Math.min(1, (q - 0.5) * 2));
        pos.push(px, py, pz); nor.push(nx / nl, ny / nl, nz / nl); col.push(c.r * 1.3, c.g * 1.3, c.b * 1.3); uv.push(tu, tv);
      }
      idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3, b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
    }
  }
  const karte = new THREE.BufferGeometry(); karte.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); karte.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); karte.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); karte.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); karte.setIndex(idx);
  t.push(karte, fertig(new THREE.ConeGeometry(0.28, 1.5, 6).translate(0, hoehe - 0.3, 0), () => new THREE.Color('#3a6b45')));
  const gr = vereint(t, true); gr.scale(0.75, 0.75, 0.75); return gr;
}
function busch(v: number, fein = true): THREE.BufferGeometry {
  const R = (i: number) => rz(i, v, 4, 80), s = v * 3.3 + 7, g = 0.75 + 0.6 * R(1), farbe = kronenFarbe(0.8, 0.9 * g, 1.5 * g, s, '#1f3d1f', '#3c6a2c', '#86a84a'), kern = new THREE.Color('#1f3d1f').multiplyScalar(0.6);
  const t = [buschel(1.1 * g, 0.75 * g, 1.0 * g, 0, 0.55, 0, s, () => kern, 1, 0.3), karten([0, 0.8 * g, 0], 1.7 * g, 0.95 * g * (0.8 + 0.5 * R(2)), fein ? 40 : 14, fein ? 1.2 : 1.8, s, farbe, [0.6, 1.05])];
  if (R(3) > 0.45) t.push(karten([1.1 * g, 0.55, 0.4], 0.9 * g, 0.6, fein ? 18 : 6, 1.0, s + 3, farbe, [0.6, 1.05]));
  return vereint(t, true);
}
function toterBaum(v: number): THREE.BufferGeometry {
  const s = v * 2.7, t: THREE.BufferGeometry[] = [ast(0, -0.2, 0, 0.2, 5.6, 0, 0.42, 0.12, ['#241d1a', '#4a3d35'])];
  for (let i = 0; i < 5; i++) { const a = rz(i, 1, v, 8) * 6.28, y = 2.2 + i * 0.7, l = 1.3 + rz(i, 2, v, 8); t.push(ast(0, y, 0, Math.cos(a) * l, y + 0.9 + rz(i, 3, v, 8), Math.sin(a) * l, 0.14, 0.04, ['#241d1a', '#4a3d35'])); }
  void s; return vereint(t, true);
}
/** Felsbrocken: Kugel, die an zufälligen Ebenen abgeschnitten wird (kantige Flächen mit leicht gerundeten Kanten), Schichtung, Moos auf den Oberseiten */
function felsbrocken(sx: number, sy: number, sz: number, x: number, y: number, z: number, s: number, detail: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position'), ebenen: [number, number, number, number][] = [];
  for (let k = 0; k < 9; k++) { const a = rz(k, 1, s, 21) * 6.283, b = (rz(k, 2, s, 21) - 0.35) * 2.2, l = Math.hypot(Math.cos(a), b, Math.sin(a)); ebenen.push([Math.cos(a) / l, b / l, Math.sin(a) / l, 0.6 + 0.28 * rz(k, 3, s, 21)]); }
  for (let i = 0; i < p.count; i++) {
    let dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i); const f = 1 + 0.1 * wr(dx * 2, dy * 2, dz * 2, s);
    dx *= f; dy *= f; dz *= f;
    for (const [nx, ny, nz, d] of ebenen) { const q = dx * nx + dy * ny + dz * nz; if (q > d) { dx -= (q - d) * nx; dy -= (q - d) * ny; dz -= (q - d) * nz; } }
    const r = 1 + 0.035 * wr(dx * 9, dy * 9, dz * 9, s + 2); // feine Rauheit
    p.setXYZ(i, dx * r * sx + x, Math.max(-0.45 * sy, dy * r * sy) + y, dz * r * sz + z);
  }
  const hell = new THREE.Color('#a39d92'), dunkel = new THREE.Color('#4b4741'), moos = new THREE.Color('#566f30'), moos2 = new THREE.Color('#7d8f3e'), c = new THREE.Color();
  const geo = fertig(g, (px, py, pz, _nx, ny) => {
    const n = wr(px * 4, py * 4, pz * 4, s) * 0.5 + 0.5, fein = wr(px * 14, py * 14, pz * 14, s + 5) * 0.5 + 0.5, band = Math.sin((py - y) * 6.5 / sy + wr(px, py, pz, s + 7) * 2.2) * 0.5 + 0.5;
    c.copy(dunkel).lerp(hell, 0.3 + 0.5 * n + 0.1 * fein); c.multiplyScalar(0.84 + 0.2 * band);
    const unten = Math.min(1, Math.max(0, ((py - y) / sy + 0.45) * 1.8)); c.multiplyScalar(0.62 + 0.38 * unten); // feuchter, dunkler Fuß
    const m = Math.min(1, Math.max(0, (ny - 0.32) * 2.2)) * (0.45 + 0.7 * n) + Math.max(0, 0.18 - (py - y) / sy) * 0.4; // Moos oben und im Fuß
    if (m > 0.05) c.lerp(fein > 0.55 ? moos2 : moos, Math.min(0.95, m));
    return c.multiplyScalar(1.7);
  });
  // UV: Würfelprojektion nach der Hauptachse der Normalen, damit die Gesteinstextur nicht gedehnt wird
  { const P = geo.getAttribute('position'), Nn = geo.getAttribute('normal'), uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { const ax = Math.abs(Nn.getX(i)), ay = Math.abs(Nn.getY(i)), az = Math.abs(Nn.getZ(i)); const [u, w] = ay >= ax && ay >= az ? [P.getX(i), P.getZ(i)] : ax >= az ? [P.getZ(i), P.getY(i)] : [P.getX(i), P.getY(i)]; uv[2 * i] = u * 0.45 + s; uv[2 * i + 1] = w * 0.45; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  return geo;
}
function fels(v: number, fein = true): THREE.BufferGeometry {
  const R = (i: number) => rz(i, v, 6, 84), s = v * 4.1 + 3, d = fein ? 2 : 1, a = 0.75 + 0.6 * R(1), h = 0.65 + 0.7 * R(2), b = 0.75 + 0.6 * R(3);
  const t = [felsbrocken(1.25 * a, 0.85 * h, 1.05 * b, 0, 0.4 * h, 0, s, d)];
  const n = 2 + Math.floor(R(4) * 3.9);
  for (let k = 0; k < n; k++) { const w = 0.4 + 0.5 * R(5 + k), an = k * 2.4 + R(9) * 6, r = 1.1 + 0.7 * R(10 + k); if (!fein && k > 1) break; t.push(felsbrocken(w, w * (0.55 + 0.3 * R(14 + k)), w * 0.9, Math.cos(an) * r, 0.05 + 0.1 * w, Math.sin(an) * r, s + 5 + k * 4, k < 2 ? d : 1)); }
  return vereint(t.map((g) => g), false);
}
const GRAS_FARBEN: [string, string][] = [['#456e26', '#9fbe55'], ['#587f2e', '#c4c964'], ['#3f6a2c', '#82b052'], ['#76863a', '#d2bf6e'], ['#3b6628', '#6fa04c'], ['#62862e', '#b2c65c']];
/** Halme: gekreuzte Karten mit Halmtextur, leicht gebogen, Farbe und Höhe nach Variante; extra = Zusatzteile (Blüten, Kolben) */
function halme(v: number, hoehe: number, breite: number, farben: [string, string], n = 3, extra: THREE.BufferGeometry[] = []): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [], c = new THREE.Color(), c0 = new THREE.Color(farben[0]), c1 = new THREE.Color(farben[1]);
  for (let q = 0; q < n; q++) {
    const a = q * Math.PI / n + rz(q, v, 1, 85) * 0.5, dx = Math.cos(a), dz = Math.sin(a), w = breite * (0.8 + 0.4 * rz(q, v, 2, 85)) * 0.5, hh = hoehe * (0.75 + 0.5 * rz(q, v, 3, 85)), bieg = (rz(q, v, 4, 85) - 0.5) * 0.5 * hh, bx = Math.cos(a + 1.57) * bieg, bz = Math.sin(a + 1.57) * bieg, jit = (rz(q, v, 5, 85) - 0.5) * 0.12;
    const b0 = pos.length / 3;
    for (let r = 0; r < 3; r++) {
      const t = r / 2; c.copy(c0).lerp(c1, 0.15 + 0.85 * t + jit).multiplyScalar(2.0 * (0.8 + 0.4 * t));
      for (const side of [-1, 1]) { pos.push(dx * side * w + bx * t * t, hh * t, dz * side * w + bz * t * t); nor.push(0, 1, 0); col.push(c.r, c.g, c.b); uv.push(side < 0 ? 0 : 0.93, t); }
    }
    for (let r = 0; r < 2; r++) { const i = b0 + r * 2; idx.push(i, i + 1, i + 3, i, i + 3, i + 2, i, i + 3, i + 1, i, i + 2, i + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return extra.length ? vereint([g, ...extra], true) : g;
}
function gras(v: number): THREE.BufferGeometry { return halme(v, 0.2 + 0.3 * rz(v, 1, 1, 86), 0.45 + 0.3 * rz(v, 2, 1, 86), GRAS_FARBEN[v % GRAS_FARBEN.length], 3 + (v % 2)); }
/** Wiesenblume: Halmbüschel mit einem bis drei Stielen und Blütenköpfen (Kugel mit Blütenblattkranz) */
function blume(v: number, farbe: string): THREE.BufferGeometry {
  const t: THREE.BufferGeometry[] = [], f = new THREE.Color(farbe), n = 1 + Math.floor(rz(v, 1, 2, 86) * 3);
  for (let k = 0; k < n; k++) { const h = 0.28 + 0.3 * rz(k, v, 3, 86), x = (rz(k, v, 4, 86) - 0.5) * 0.3, z = (rz(k, v, 5, 86) - 0.5) * 0.3; t.push(ast(x, 0, z, x + 0.03, h, z, 0.02, 0.014, ['#3d6a2c', '#5a8a3a'], 4));
    t.push(fertig(new THREE.IcosahedronGeometry(0.06, 0).translate(x + 0.03, h + 0.04, z), () => new THREE.Color('#e8c030')));
    for (let p = 0; p < 6; p++) { const a = p * 1.047, pg = new THREE.SphereGeometry(0.05, 5, 3); pg.scale(1.4, 0.35, 0.8); pg.rotateY(-a); pg.translate(x + 0.03 + Math.cos(a) * 0.075, h + 0.035, z + Math.sin(a) * 0.075); t.push(fertig(pg, () => f.clone().multiplyScalar(0.9 + 0.3 * rz(p, k, v, 87)))); } }
  return halme(v + 3, 0.28, 0.45, GRAS_FARBEN[v % GRAS_FARBEN.length], 3, t);
}
/** Schilf: hohe Halmbüschel mit braunen Kolben, wächst am Ufer */
function schilf(v: number, fein = true): THREE.BufferGeometry {
  const t: THREE.BufferGeometry[] = [];
  for (let k = 0; k < (fein ? 3 : 1); k++) { const h = 1.5 + 0.8 * rz(k, v, 1, 88), x = (rz(k, v, 2, 88) - 0.5) * 0.7, z = (rz(k, v, 3, 88) - 0.5) * 0.7; t.push(ast(x, 0, z, x + 0.05, h, z, 0.03, 0.02, ['#5a6a30', '#8a8a48'], 4)); t.push(fertig(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 6).translate(x + 0.05, h - 0.1, z), () => new THREE.Color('#5a3a22'))); }
  return halme(v + 7, 1.9, 0.9, ['#46662a', '#b4b86a'], 4, t);
}

/** Ein facettierter Kristall: Sechskantschaft mit Spitze, flach schattiert (Farbe je Fläche aus Licht und Höhe), geneigt; leuchtet über das GLOW-Material */
function kristallPrisma(h: number, r: number, spitze: number, neigung: number, az: number, dx: number, dz: number, seed: number): THREE.BufferGeometry {
  const schaft = new THREE.CylinderGeometry(r * 0.78, r, h, 6, 1, true); schaft.translate(0, h / 2, 0);
  const kopf = new THREE.ConeGeometry(r * 0.78, spitze, 6, 1, true); kopf.translate(0, h + spitze / 2, 0);
  schaft.deleteAttribute('uv'); kopf.deleteAttribute('uv');
  const g = mergeGeometries([schaft, kopf], false)!.toNonIndexed(), P = g.getAttribute('position'), ly = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) ly[i] = P.getY(i);
  g.rotateY(rz(seed, 1, 0, 130) * 6.283); g.rotateX(neigung); g.rotateY(az); g.translate(Math.cos(az) * dx, -0.05, Math.sin(az) * dx + dz * 0); g.computeVertexNormals();
  const N = g.getAttribute('normal'), col = new Float32Array(P.count * 3), L = new THREE.Vector3(-0.5, 0.8, 0.4).normalize(), c = new THREE.Color(), c0 = new THREE.Color('#1c6aa4'), c1 = new THREE.Color('#68dcff'), c2 = new THREE.Color('#effeff');
  for (let i = 0; i < P.count; i++) {
    const face = Math.floor(i / 3), licht = 0.5 + 0.5 * Math.max(0, N.getX(i) * L.x + N.getY(i) * L.y + N.getZ(i) * L.z), t = Math.min(1, ly[i] / (h + spitze));
    c.copy(c0).lerp(c1, Math.min(1, t * 1.4)); if (ly[i] > h) c.lerp(c2, 0.6 * (ly[i] - h) / spitze);
    c.multiplyScalar((0.5 + 0.75 * licht) * (0.88 + 0.24 * rz(face, seed, 2, 130)) * 1.45); col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('normal'); return g;
}
/** Kristallgruppe: ein hoher Hauptkristall und viele kleinere, unterschiedlich geneigt, dazu kleine Splitter */
function kristall(v: number): THREE.BufferGeometry {
  const R = (i: number) => rz(i, v, 7, 120), t: THREE.BufferGeometry[] = [], n = 8 + Math.floor(R(1) * 6);
  for (let k = 0; k < n; k++) {
    const haupt = k === 0, h = haupt ? 2.4 + 1.8 * R(2) : 0.5 + 1.9 * rz(k, v, 3, 120), r = haupt ? 0.34 + 0.12 * R(3) : 0.1 + 0.2 * rz(k, v, 4, 120);
    const az = k * 2.4 + R(5) * 6, d = haupt ? 0 : 0.3 + 0.95 * rz(k, v, 6, 120) * (1 + k * 0.06), neigung = haupt ? 0.04 + 0.1 * R(7) : 0.15 + 0.5 * rz(k, v, 8, 120);
    t.push(kristallPrisma(h, r, r * (1.2 + 0.9 * rz(k, v, 9, 120)), neigung, az, d, 0, k + v * 31));
  }
  return mergeGeometries(t, false)!;
}
const BLUMEN = ['#dcc878', '#c880a8', '#96b8d8', '#ece8e0'];
const NETZE: (Map<string, THREE.BufferGeometry> | null)[] = [null, null];
let MAT: { fest: THREE.Material; gras: THREE.Material; laub: THREE.Material; nadel: THREE.Material } | null = null;
/** Netze je Detailstufe (1 = nah, fein; 0 = mittlere Entfernung, wenige Dreiecke); einmal je Art, geteilt von allen Kacheln */
/** Zahl der Varianten je Art (prozedural erzeugt, Instanzen wählen eine aus) */
const NV: Record<number, number> = { [NAT.laub]: 16, [NAT.tanne]: 12, [NAT.herbst]: 16, [NAT.leucht]: 8, [NAT.busch]: 5, [NAT.tot]: 3, [NAT.fels]: 6, [NAT.gras]: 6, [NAT.blume]: 4, [NAT.farn]: 3, [NAT.bluete]: 4, [NAT.schilf]: 3, [NAT.kristall]: 6 };
/** Netz einer Art und Variante, erst beim ersten Bedarf gebaut (die Baumgerüste kosten etwas Rechenzeit) */
function netzFuer(fein: boolean, key: string): THREE.BufferGeometry | undefined {
  const L = fein ? 1 : 0, cache = (NETZE[L] ??= new Map<string, THREE.BufferGeometry>()); let g = cache.get(key); if (g) return g;
  const [art, v] = key.split('/').map(Number);
  switch (art) {
    case NAT.laub: g = laubbaum(v, 'eiche', false, fein); break;
    case NAT.herbst: g = laubbaum(v + 10, v % 2 === 0 ? 'birke' : 'ahorn', false, fein); break;
    case NAT.leucht: g = laubbaum(v + 20, 'leucht', true, fein); break;
    case NAT.tanne: g = tanne(v, fein); break;
    case NAT.busch: g = busch(v, fein); break;
    case NAT.tot: g = toterBaum(v); break;
    case NAT.fels: g = fels(v, fein); break;
    case NAT.farn: g = farn(v, fein); break;
    case NAT.schilf: g = schilf(v, fein); break;
    case NAT.kristall: g = kristall(v); break;
    case NAT.bluete: g = bluetenbusch(v, fein); break;
    case NAT.gras: g = gras(v); break;
    case NAT.blume: g = blume(v, BLUMEN[v % BLUMEN.length]); break;
  }
  if (g) cache.set(key, g); return g;
}
function material(): { fest: THREE.Material; gras: THREE.Material; laub: THREE.Material; nadel: THREE.Material } {
  return MAT ??= {
    fest: FABRIK.licht({ vertexColors: true, map: felsTex(), roughness: 0.9, metalness: 0 }, 1.2), gras: FABRIK.licht({ vertexColors: true, map: grasTex(), alphaTest: 0.4, alphaToCoverage: true, roughness: 0.85, metalness: 0 }, 1.2, undefined, 0.5, 0.7, [0.05, 2.0, 0.94]),
    laub: FABRIK.licht({ vertexColors: true, map: laubTex(), alphaTest: 0.5, alphaToCoverage: true, roughness: 0.85, metalness: 0 }, 1.2, undefined, 0.5, 1.1, [0.028, 0.04, 0.87]),
    nadel: FABRIK.licht({ vertexColors: true, map: nadelTex(), alphaTest: 0.45, alphaToCoverage: true, roughness: 0.85, metalness: 0 }, 1.2, undefined, 0.5, 0.8, [0.02, 0.04, 0.94])
  };
}

/** Instanzliste einer Kachel in Netze verwandeln; Rückgabe gehört der Kachel (`userData.geteilt`: Netze nicht freigeben) */
export function baueNatur(liste: Float32Array, schatten: boolean): THREE.Object3D[] {
  const M = material(), gruppen = new Map<string, number[]>();
  for (let i = 0; i < liste.length; i += NAT_SCHRITT) {
    const art = liste[i], v = liste[i + 6], key = `${art}/${v % (NV[art] ?? 2)}`; (gruppen.get(key) ?? gruppen.set(key, []).get(key)!).push(i);
  }
  const aus: THREE.Object3D[] = [], mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sk = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), farbe = new THREE.Color();
  for (const [key, idx] of gruppen) {
    const geo = netzFuer(schatten, key); if (!geo) continue; const art = +key.split('/')[0], klein = art === NAT.gras || art === NAT.blume || art === NAT.farn || art === NAT.schilf || art === NAT.kristall;
    const mesh = new THREE.InstancedMesh(geo, art === NAT.kristall ? GLOW : art === NAT.farn ? M.nadel : klein ? M.gras : art === NAT.fels ? M.fest : art === NAT.tanne ? M.nadel : M.laub, idx.length);
    idx.forEach((i, k) => {
      const X = liste[i + 1], Z = liste[i + 3], baum = art <= NAT.tot || art === NAT.leucht || art === NAT.busch;
      pos.set(X, liste[i + 2], Z); q.setFromAxisAngle(up, liste[i + 4]);
      if (baum) { q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rz(X, Z, 1, 4) - 0.5) * 0.09, 0, (rz(X, Z, 2, 4) - 0.5) * 0.09))); } // leichte Schieflage
      const g = liste[i + 5], br = 0.82 + 0.4 * rz(X, Z, 5, 4), ho = 0.88 + 0.28 * rz(X, Z, 6, 4); sk.set(g * br, g * ho, g * br * (0.9 + 0.2 * rz(X, Z, 7, 4))); mat4.compose(pos, q, sk); mesh.setMatrixAt(k, mat4);
      const hell = 0.86 + 0.28 * rz(X, Z, 0, 3); farbe.setRGB(hell * (0.93 + 0.14 * rz(X, Z, 8, 4)), hell * (0.95 + 0.1 * rz(X, Z, 9, 4)), hell * (0.9 + 0.16 * rz(X, Z, 10, 4))); if (liste[i + 7] === 1) farbe.multiplyScalar(0.55); mesh.setColorAt(k, farbe);
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = schatten && !klein; mesh.receiveShadow = true; mesh.userData.geteilt = true; aus.push(mesh);
  }
  return aus;
}
