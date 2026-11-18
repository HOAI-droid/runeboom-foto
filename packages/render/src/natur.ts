import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FABRIK } from './grafik.ts';

/**
 * Glatte Natur im „Foto-Look“ (Branch foto-look): Bäume, Büsche, Felsen, Gras und Blumen als echte Geometrie
 * mit Vertexfarben (Verlauf, Moos, Rinde), je Art ein InstancedMesh je Kachel. Maße in Blöcken, Fuß bei y = 0.
 * Der Kachelbauer (chunk.ts, läuft im Hintergrund-Rechner) liefert nur Zahlen; hier entsteht die Darstellung.
 */

/** Arten in der Instanzliste (Stufe je Instanz: 8 Werte) */
export const NAT = { laub: 0, tanne: 1, herbst: 2, leucht: 3, busch: 4, tot: 5, fels: 6, gras: 7, blume: 8, farn: 9, bluete: 10 } as const;
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
    return c.multiplyScalar(1.3);
  };
}
/** Ast oder Stamm: Kegelstumpf von (x0,y0,z0) nach (x1,y1,z1) */
function ast(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, rinde = ['#3e2b1c', '#6d4c30'], seg = 9): THREE.BufferGeometry {
  const v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = v.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, Math.max(2, Math.round(len * 1.2))); g.deleteAttribute('uv');
  { const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), w = 1 + 0.12 * wr(x * 7, y * 1.6, z * 7, 6); p.setXYZ(i, x * w, y, z * w); } } // knorrige Rinde
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize())); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return fertig(g, (px, py, pz) => lin(rinde[0], rinde[1], 0.4 + 0.6 * wr(px * 11, py * 2.2, pz * 11, 4) * 0.9));
}
/** Teile zu einem Netz; mit uv = true bekommen Teile ohne UV einen vollständig deckenden Punkt der Laubtextur (nur Vertexfarbe zählt) */
const vereint = (teile: THREE.BufferGeometry[], uv = false): THREE.BufferGeometry => {
  if (uv) for (const t of teile) if (!t.getAttribute('uv')) { const n = t.getAttribute('position').count, a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[2 * i] = 0.975; a[2 * i + 1] = 0.5; } t.setAttribute('uv', new THREE.BufferAttribute(a, 2)); }
  const g = mergeGeometries(teile, false)!; teile.forEach((t) => t.dispose()); return g;
};

// ---------- Laubtextur: ein Büschel aus vielen Blättern, Alpha-Schnitt, Grauwerte (die Farbe kommt aus den Vertexfarben) ----------
let LAUBTEX: THREE.CanvasTexture | null = null;
function laubTex(): THREE.CanvasTexture {
  if (LAUBTEX) return LAUBTEX;
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d')!;
  c.clearRect(0, 0, n, n);
  const blatt = (x: number, y: number, w: number, h: number, rot: number, v: number) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    const gr = c.createLinearGradient(0, h, 0, -h); gr.addColorStop(0, `rgb(${v * 0.5 | 0},${v * 0.52 | 0},${v * 0.46 | 0})`); gr.addColorStop(1, `rgb(${Math.min(255, v * 1.08) | 0},${v | 0},${v * 0.9 | 0})`);
    c.fillStyle = gr; c.beginPath(); c.moveTo(0, h); c.quadraticCurveTo(w * 1.2, h * 0.1, 0, -h); c.quadraticCurveTo(-w * 1.2, h * 0.1, 0, h); c.fill();
    c.strokeStyle = `rgba(0,0,0,0.22)`; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, h); c.lineTo(0, -h * 0.8); c.stroke(); c.restore();
  };
  const R = 112, mx = 120, my = 128;
  for (let pass = 0; pass < 2; pass++) {
    const zahl = pass === 0 ? 150 : 330;
    for (let i = 0; i < zahl; i++) {
      const a = rz(i, pass, 1, 31) * 6.2832, r = Math.sqrt(rz(i, pass, 2, 31)) * R * (pass === 0 ? 0.88 : 1) * (0.85 + 0.15 * Math.sin(a * 5 + 1.3)), x = mx + Math.cos(a) * r * 1.05, y = my + Math.sin(a) * r * 0.92 + (Math.sin(a) > 0.2 ? -4 : 0);
      const v = pass === 0 ? 105 + 70 * rz(i, pass, 3, 31) : 150 + 105 * Math.pow(rz(i, pass, 3, 31), 0.7);
      blatt(x, y, 5 + 4 * rz(i, pass, 4, 31), 12 + 11 * rz(i, pass, 5, 31), a + 1.57 + (rz(i, pass, 6, 31) - 0.5) * 1.6, v);
    }
  }
  c.fillStyle = '#ffffff'; c.fillRect(n - 16, 0, 16, n); // deckender Streifen für Stämme, Kerne und Steine
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; LAUBTEX = t; return t;
}
/**
 * Laubkarten: viele kleine Quadrate mit Blattbüschel-Textur, nach außen geneigt und beidseitig gezeichnet; die Normalen zeigen von der Krone
 * nach außen (weiche Kugelschattierung), die Farbe kommt je Ecke aus `farbe`. Pro Karte nur vier Ecken – daher sehr billig.
 */
function karten(zentrum: [number, number, number], rx: number, ry: number, anzahl: number, groesse: number, s: number, farbe: Farbe, huelle = [0.55, 1.02]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const n = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), sph = new THREE.Vector3(), q = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < anzahl; k++) {
    const t = (k + 0.5) / anzahl, yy = 0.96 - 1.9 * t + 0.12 * (rz(k, 1, s, 41) - 0.5), az = k * 2.399963 + s, rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const f = huelle[0] + (huelle[1] - huelle[0]) * Math.pow(rz(k, 2, s, 41), 0.6);
    const cx = zentrum[0] + Math.cos(az) * rr * rx * f, cy = zentrum[1] + yy * ry * f, cz = zentrum[2] + Math.sin(az) * rr * rx * f;
    n.set(cx - zentrum[0], (cy - zentrum[1]) * (rx / ry), cz - zentrum[2]).normalize();
    n.x += (rz(k, 3, s, 41) - 0.5) * 0.9; n.y += (rz(k, 4, s, 41) - 0.5) * 0.9 + 0.15; n.z += (rz(k, 5, s, 41) - 0.5) * 0.9; n.normalize();
    u.crossVectors(Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up, n).normalize(); w.crossVectors(n, u);
    const roll = rz(k, 6, s, 41) * 6.2832, cr = Math.cos(roll), sr = Math.sin(roll), a = groesse * (0.8 + 0.5 * rz(k, 7, s, 41)) * 0.5;
    const ecken = [[-1, -1, 0, 0], [1, -1, 0.93, 0], [1, 1, 0.93, 1], [-1, 1, 0, 1]], b0 = pos.length / 3;
    for (const [i, j, tu, tv] of ecken) {
      const ex = (i * cr - j * sr) * a, ey = (i * sr + j * cr) * a;
      q.set(cx + u.x * ex + w.x * ey, cy + u.y * ex + w.y * ey, cz + u.z * ex + w.z * ey);
      sph.set(q.x - zentrum[0], (q.y - zentrum[1]) * (rx / ry), q.z - zentrum[2]).normalize().multiplyScalar(0.85).addScaledVector(n, 0.3).normalize();
      const c = farbe(q.x, q.y, q.z, sph.x, sph.y, sph.z); pos.push(q.x, q.y, q.z); nor.push(sph.x, sph.y, sph.z); col.push(c.r, c.g, c.b); uv.push(tu, tv);
    }
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3, b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

/** Laubbaum: Stamm mit Wurzelanläufen und Ästen, dunkler Kern, Krone aus vielen Laubkarten (fein) bzw. weniger (mittlere Entfernung) */
function laubbaum(v: number, farben: [string, string, string], beeren = false, fein = true, birke = false): THREE.BufferGeometry {
  const s = v * 7.3 + 1, [d, m, h] = farben, t: THREE.BufferGeometry[] = [], RI = birke ? ['#4a443a', '#f1ecde'] : ['#3a2a1d', '#6a5038'];
  const th = 3.9 + 0.7 * v, rx = 3.4 + 0.4 * v, ry = 2.8 + 0.3 * v, cy = th + ry * 0.85, farbe = kronenFarbe(cy, ry, rx, s, d, m, h);
  t.push(ast(0, -0.3, 0, 0.1, th + 0.3, 0, birke ? 0.45 : 0.62, 0.2, RI, fein ? 10 : 6));
  const kern = new THREE.Color(m).multiplyScalar(0.55), kf: Farbe = (_x, py) => kern.clone().multiplyScalar(0.6 + 0.5 * Math.min(1, Math.max(0, (py - cy + ry) / (2 * ry))));
  const innen: [number, number, number][] = [];
  for (let k = 0; k < (fein ? 7 : 4); k++) { const a = k * 2.4 + v, r = k === 0 ? 0 : 1.0 + 0.4 * rz(k, 1, v, 7), y = cy + (k === 0 ? -0.2 : (rz(k, 2, v, 7) - 0.5) * ry * 0.8), sr = k === 0 ? 1.55 : 1.0 + 0.3 * rz(k, 3, v, 7); t.push(buschel(sr, sr * 0.8, sr, Math.cos(a) * r, y, Math.sin(a) * r, s + k, kf, 1, 0.3)); if (k > 0) innen.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
  t.push(karten([0, cy, 0], rx, ry, fein ? 210 : 52, fein ? 2.5 : 3.5, s, farbe, [0.62, 1.05]));
  for (const [x, y, z] of innen.slice(0, fein ? 5 : 2)) t.push(ast(0.05, th - 0.9, 0, x * 0.8, y * 0.85, z * 0.8, 0.2, 0.06, RI, 6));
  if (fein) for (const [dx, dz] of [[0.6, 0.1], [-0.45, 0.45], [0.05, -0.6], [-0.3, -0.5]]) t.push(ast(dx * 0.5, 0.15, dz * 0.5, dx * 1.7, -0.3, dz * 1.7, 0.24, 0.08, ['#3a2a1d', '#6a5038'], 5)); // Wurzelanläufe
  if (beeren) for (let i = 0; i < 9; i++) { const a = rz(i, 1, v, 5) * 6.28, y = cy - 1 + rz(i, 2, v, 5) * 3.4, r = rx * 0.78 + rz(i, 3, v, 5) * 0.7; t.push(fertig(new THREE.IcosahedronGeometry(0.16, 1).translate(Math.cos(a) * r, y, Math.sin(a) * r), () => new THREE.Color('#9be8ff').multiplyScalar(2.6))); }
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
    const a = k * 2.399963 + v, len = 1.1 + 0.7 * rz(k, 1, v, 61), wd = 0.55 + 0.3 * rz(k, 2, v, 61), rise = 0.55 + 0.35 * rz(k, 3, v, 61), dx = Math.cos(a), dz = Math.sin(a), b0 = pos.length / 3;
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
const BLUETEN = ['#9a64d8', '#e070b0', '#efeae0', '#f0c040'];
/** Blühender Busch: grüner Busch mit vielen kleinen Blüten oben */
function bluetenbusch(v: number, fein = true): THREE.BufferGeometry {
  const t: THREE.BufferGeometry[] = [busch(v, fein)], f = new THREE.Color(BLUETEN[v % BLUETEN.length]);
  const n = fein ? 34 : 12; for (let k = 0; k < n; k++) { const a = k * 2.399963, yy = 0.15 + 0.8 * rz(k, 1, v, 62), r = Math.sqrt(1 - yy * yy) * (1.25 + 0.2 * rz(k, 2, v, 62)), sz = 0.14 + 0.1 * rz(k, 3, v, 62);
    t.push(fertig(new THREE.IcosahedronGeometry(sz, 0).translate(Math.cos(a) * r, 0.7 + yy * 0.95, Math.sin(a) * r), () => f.clone().multiplyScalar(0.85 + 0.5 * rz(k, 4, v, 62)))); }
  return vereint(t, true);
}
/** Tanne: Stamm, dunkler Kegelkern und viele hängende Zweigfächer in Stockwerken (Karten mit Nadeltextur) */
function tanne(v: number, fein = true): THREE.BufferGeometry {
  const s = v * 5.1 + 2, stufen = fein ? 9 : 5, t: THREE.BufferGeometry[] = [ast(0, -0.3, 0, 0, 2.8, 0, 0.5, 0.26, ['#3a2a1d', '#5e4630'], fein ? 8 : 5)];
  const D = new THREE.Color('#12281a'), M = new THREE.Color('#2c5a36'), H = new THREE.Color('#7da25c'), c = new THREE.Color(), hoehe = 1.3 + (stufen - 1) * (fein ? 1.15 : 1.75) + 2.2;
  // Kern
  { const g = new THREE.ConeGeometry(2.0, hoehe - 1.6, 9, 3, true); g.translate(0, 1.4 + (hoehe - 1.6) / 2, 0); t.push(fertig(g, (_x, py) => c.copy(D).multiplyScalar(0.9 + 0.5 * Math.min(1, py / hoehe)))); }
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < stufen; i++) {
    const f = i / (stufen - 1), r = 3.4 - 2.7 * f + 0.15 * v, y = 1.4 + i * (fein ? 1.15 : 1.75) + 0.5, zahl = Math.round((fein ? 11 : 7) - 5 * f);
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
  return vereint(t, true);
}
function busch(v: number, fein = true): THREE.BufferGeometry {
  const s = v * 3.3 + 7, farbe = kronenFarbe(0.8, 0.9, 1.5, s, '#1f3d1f', '#3c6a2c', '#86a84a'), kern = new THREE.Color('#1f3d1f').multiplyScalar(0.6);
  return vereint([buschel(1.1, 0.75, 1.0, 0, 0.55, 0, s, () => kern, 1, 0.3), karten([0, 0.8, 0], 1.7, 0.95, fein ? 40 : 14, fein ? 1.2 : 1.8, s, farbe, [0.6, 1.05])], true);
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
  return fertig(g, (px, py, pz, _nx, ny) => {
    const n = wr(px * 4, py * 4, pz * 4, s) * 0.5 + 0.5, fein = wr(px * 14, py * 14, pz * 14, s + 5) * 0.5 + 0.5, band = Math.sin((py - y) * 6.5 / sy + wr(px, py, pz, s + 7) * 2.2) * 0.5 + 0.5;
    c.copy(dunkel).lerp(hell, 0.3 + 0.5 * n + 0.1 * fein); c.multiplyScalar(0.84 + 0.2 * band);
    const unten = Math.min(1, Math.max(0, ((py - y) / sy + 0.45) * 1.8)); c.multiplyScalar(0.62 + 0.38 * unten); // feuchter, dunkler Fuß
    const m = Math.min(1, Math.max(0, (ny - 0.32) * 2.2)) * (0.45 + 0.7 * n) + Math.max(0, 0.18 - (py - y) / sy) * 0.4; // Moos oben und im Fuß
    if (m > 0.05) c.lerp(fein > 0.55 ? moos2 : moos, Math.min(0.95, m));
    return c;
  });
}
function fels(v: number, fein = true): THREE.BufferGeometry {
  const s = v * 4.1 + 3, d = fein ? 2 : 1;
  const t = [felsbrocken(1.25, 0.85, 1.05, 0, 0.4, 0, s, d), felsbrocken(0.7, 0.5, 0.62, 1.2, 0.14, 0.55, s + 5, d), felsbrocken(0.45, 0.34, 0.4, -1.0, 0.06, -0.7, s + 9, d)];
  if (fein) t.push(felsbrocken(0.5, 0.36, 0.45, -0.5, 0.08, 1.0, s + 13, 1), felsbrocken(0.3, 0.22, 0.28, 1.7, 0.03, -0.5, s + 17, 1));
  return vereint(t);
}
/** Grasbüschel aus 7 gebogenen Halmen */
function gras(v: number, blume?: string): THREE.BufferGeometry {
  const t: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rz(i, 1, v, 11) * 6.28, r = 0.05 + rz(i, 2, v, 11) * 0.12, h = 0.45 + rz(i, 3, v, 11) * 0.5, bieg = 0.15 + rz(i, 4, v, 11) * 0.3;
    const g = new THREE.BufferGeometry(), dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.045, pz = dx * 0.045;
    g.setAttribute('position', new THREE.Float32BufferAttribute([r * dx - px, 0, r * dz - pz, r * dx + px, 0, r * dz + pz, r * dx + dx * bieg * 0.5, h * 0.55, r * dz + dz * bieg * 0.5, r * dx + dx * bieg, h, r * dz + dz * bieg], 3));
    g.setIndex([0, 1, 2, 1, 3, 2]); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    t.push(fertig(g, (_x, y) => lin('#2f5a26', '#9cc95a', y / 0.9 + 0.1)));
  }
  if (blume) { const h = 0.6 + rz(1, 1, v, 12) * 0.3; t.push(ast(0, 0, 0, 0.05, h, 0.02, 0.025, 0.018, ['#3d6a2c', '#4f8a3a']), fertig(new THREE.IcosahedronGeometry(0.11, 1).translate(0.05, h + 0.05, 0.02), () => new THREE.Color(blume))); }
  return vereint(t);
}

// ---------- Netze und Material (einmal je Art, geteilt von allen Kacheln) ----------
const BLUMEN = ['#e8d06a', '#d86aa8', '#8fd0ff', '#f2f0ea'];
const NETZE: (Map<string, THREE.BufferGeometry> | null)[] = [null, null];
let MAT: { fest: THREE.Material; gras: THREE.Material; laub: THREE.Material; nadel: THREE.Material } | null = null;
/** Netze je Detailstufe (1 = nah, fein; 0 = mittlere Entfernung, wenige Dreiecke); einmal je Art, geteilt von allen Kacheln */
function netze(fein: boolean): Map<string, THREE.BufferGeometry> {
  const L = fein ? 1 : 0; if (NETZE[L]) return NETZE[L]!; const m = new Map<string, THREE.BufferGeometry>();
  for (let v = 0; v < 2; v++) {
    m.set(`${NAT.laub}/${v}`, laubbaum(v, ['#1c3b1c', '#3f6c2e', '#86ab50'], false, fein)); m.set(`${NAT.herbst}/${v}`, laubbaum(v, ['#6a3012', '#d07a26', '#ffcf5a'], false, fein, v === 0));
    m.set(`${NAT.leucht}/${v}`, laubbaum(v, ['#262048', '#4f4580', '#9a8fd2'], true, fein));
    m.set(`${NAT.tanne}/${v}`, tanne(v, fein)); m.set(`${NAT.busch}/${v}`, busch(v, fein)); m.set(`${NAT.tot}/${v}`, toterBaum(v)); m.set(`${NAT.fels}/${v}`, fels(v, fein));
  }
  for (let v = 0; v < 2; v++) m.set(`${NAT.farn}/${v}`, farn(v, fein));
  for (let v = 0; v < BLUETEN.length; v++) m.set(`${NAT.bluete}/${v}`, bluetenbusch(v, fein));
  for (let v = 0; v < 3; v++) m.set(`${NAT.gras}/${v}`, gras(v));
  for (let v = 0; v < BLUMEN.length; v++) m.set(`${NAT.blume}/${v}`, gras(v + 5, BLUMEN[v]));
  return (NETZE[L] = m);
}
function material(): { fest: THREE.Material; gras: THREE.Material; laub: THREE.Material; nadel: THREE.Material } {
  return MAT ??= {
    fest: FABRIK.licht({ vertexColors: true, roughness: 0.88, metalness: 0 }, 1.2), gras: FABRIK.licht({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }, 1.2),
    laub: FABRIK.licht({ vertexColors: true, map: laubTex(), alphaTest: 0.5, roughness: 0.85, metalness: 0 }, 1.2),
    nadel: FABRIK.licht({ vertexColors: true, map: nadelTex(), alphaTest: 0.45, roughness: 0.85, metalness: 0 }, 1.2)
  };
}

/** Instanzliste einer Kachel in Netze verwandeln; Rückgabe gehört der Kachel (`userData.geteilt`: Netze nicht freigeben) */
export function baueNatur(liste: Float32Array, schatten: boolean): THREE.Object3D[] {
  const N = netze(schatten), M = material(), gruppen = new Map<string, number[]>();
  for (let i = 0; i < liste.length; i += NAT_SCHRITT) {
    const art = liste[i], v = liste[i + 6], key = `${art}/${art === NAT.gras ? v % 3 : art === NAT.blume ? v % BLUMEN.length : art === NAT.bluete ? v % BLUETEN.length : v % 2}`; (gruppen.get(key) ?? gruppen.set(key, []).get(key)!).push(i);
  }
  const aus: THREE.Object3D[] = [], mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sk = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), farbe = new THREE.Color();
  for (const [key, idx] of gruppen) {
    const geo = N.get(key); if (!geo) continue; const art = +key.split('/')[0], klein = art === NAT.gras || art === NAT.blume || art === NAT.farn;
    const mesh = new THREE.InstancedMesh(geo, art === NAT.farn ? M.nadel : klein ? M.gras : art === NAT.fels ? M.fest : art === NAT.tanne ? M.nadel : M.laub, idx.length);
    idx.forEach((i, k) => {
      pos.set(liste[i + 1], liste[i + 2], liste[i + 3]); q.setFromAxisAngle(up, liste[i + 4]); const g = liste[i + 5]; sk.set(g, g, g); mat4.compose(pos, q, sk); mesh.setMatrixAt(k, mat4);
      const hell = 0.86 + 0.28 * rz(liste[i + 1], liste[i + 3], 0, 3); farbe.setRGB(hell, hell, hell); if (liste[i + 7] === 1) farbe.multiplyScalar(0.55); mesh.setColorAt(k, farbe);
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = schatten && !klein; mesh.receiveShadow = true; mesh.userData.geteilt = true; aus.push(mesh);
  }
  return aus;
}
