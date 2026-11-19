import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FABRIK } from './grafik.ts';

/**
 * Glatte Bauwerke im „Foto-Look“: Baukasten aus Quadern, Dächern, Zylindern, Balken und Einzelteilen (Fenster mit Läden, Türen, Schornsteine,
 * Fachwerk, Eckquader, Efeu …), alles je Material zu einem Netz zusammengefasst (wenige Zeichenaufrufe je Gebäude). Texturen sind selbst gemalt,
 * mit Patina: Moos, Flechten, Regenstreifen, abgeplatzter Putz, Grünspan, verwittertes Holz. Je Volk und Variante (0–3) andere Baustoffe und Farben.
 * Maße in Blöcken (1 Block ≈ 1 m), Mitte des Grundrisses bei 0, Boden bei y = 0, Eingang nach +z.
 */

// ---------- Zufall und Malen ----------
const hz = (x: number, y: number, z: number): number => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
function zufall(seed: number): () => number { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function leinwand(n: number, malen: (c: CanvasRenderingContext2D, n: number, r: () => number) => void, seed: number, anis = 8): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d')!; malen(c, n, zufall(seed));
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anis; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}
/** weicher Fleck, über den Rand hinweg wiederholt (nahtlos) */
function fleck(c: CanvasRenderingContext2D, n: number, x: number, y: number, r: number, farbe: string, a: number): void {
  for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { const X = x + ox, Y = y + oy; if (X < -r || X > n + r || Y < -r || Y > n + r) continue; const g = c.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, `rgba(${farbe},${a})`); g.addColorStop(1, `rgba(${farbe},0)`); c.fillStyle = g; c.fillRect(X - r, Y - r, 2 * r, 2 * r); }
}
function koerner(c: CanvasRenderingContext2D, n: number, st: number): void {
  const img = c.getImageData(0, 0, n, n), d = img.data; for (let i = 0; i < d.length; i += 4) { const k = (hz(i, 3, 7) - 0.5) * st; d[i] += k; d[i + 1] += k; d[i + 2] += k; } c.putImageData(img, 0, 0);
}
/** Patina über eine fertige Fläche: Moosflecken, Flechten, dunkle Regenstreifen, Schmutz */
function patina(c: CanvasRenderingContext2D, n: number, r: () => number, moos: number, streifen: number, flechten = 0.5): void {
  for (let i = 0; i < 70 * moos; i++) { const x = r() * n, y = r() * n, rad = 6 + r() * 26; fleck(c, n, x, y, rad, r() > 0.5 ? '70,100,44' : '88,112,50', 0.1 + r() * 0.3); }
  for (let i = 0; i < 24 * streifen; i++) { const x = r() * n, y = r() * n * 0.8, l = 40 + r() * 180; const g = c.createLinearGradient(0, y, 0, y + l); g.addColorStop(0, 'rgba(20,16,12,0.0)'); g.addColorStop(0.2, `rgba(20,16,12,${0.1 + r() * 0.14})`); g.addColorStop(1, 'rgba(20,16,12,0)'); c.fillStyle = g; c.fillRect(x, y, 2 + r() * 6, l); }
  for (let i = 0; i < 60 * flechten; i++) { const x = r() * n, y = r() * n, rad = 2 + r() * 5; c.fillStyle = r() > 0.5 ? `rgba(210,190,90,${0.2 + r() * 0.3})` : `rgba(190,200,150,${0.2 + r() * 0.3})`; c.beginPath(); c.arc(x, y, rad, 0, 6.3); c.fill(); }
  for (let i = 0; i < 14; i++) fleck(c, n, r() * n, r() * n, 20 + r() * 50, '40,32,24', 0.08 + r() * 0.12);
}
function rissLinie(c: CanvasRenderingContext2D, n: number, r: () => number, anzahl: number): void {
  c.lineCap = 'round'; for (let i = 0; i < anzahl; i++) { let x = r() * n, y = r() * n, a = r() * 6.28; c.strokeStyle = `rgba(20,16,12,${0.35 + r() * 0.3})`; c.lineWidth = 0.8 + r() * 1.2; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 9; k++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 9; y += Math.sin(a) * 9; c.lineTo(x, y); } c.stroke(); }
}

// ---------- Texturen (einmal je Art und Variante) ----------
const TEXTUREN = new Map<string, THREE.CanvasTexture>();
function textur(art: string, v: number): THREE.CanvasTexture {
  const key = art + v; let t = TEXTUREN.get(key); if (t) return t;
  const s = 100 + v * 37 + art.length * 11;
  if (art === 'stein') t = leinwand(512, (c, n, r) => { // Quadermauerwerk mit unterschiedlichen Steinhöhen, Fugen, Absplitterungen, Rissen
    c.fillStyle = '#5e5a54'; c.fillRect(0, 0, n, n);
    let y = 0; while (y < n) { const h = [44, 58, 72, 50][Math.floor(r() * 4)] * (v === 1 ? 0.8 : 1); let x = -r() * 60; while (x < n) { const b = 60 + r() * 120, g = 0.8 + r() * 0.32, warm = (r() - 0.5) * 12; const gr = c.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, `rgb(${Math.round(196 * g + warm + 12)},${Math.round(192 * g)},${Math.round(184 * g - warm)})`); gr.addColorStop(1, `rgb(${Math.round(160 * g + warm)},${Math.round(156 * g)},${Math.round(150 * g - warm)})`); c.fillStyle = gr;
      c.beginPath(); const rd = 4 + r() * 5; c.roundRect(x + 2, y + 2, b - 4, h - 4, rd); c.fill(); if (r() > 0.7) fleck(c, n, x + b * r(), y + h * r(), 12 + r() * 16, '255,255,250', 0.14); x += b; } y += h; }
    koerner(c, n, 26); rissLinie(c, n, r, 10); patina(c, n, r, 0.7 + v * 0.4, 1.2, 0.8);
  }, s);
  else if (art === 'steinMoos') t = leinwand(512, (c, n, r) => { // untere Mauerlagen: feucht, bemoost, dunkler
    c.fillStyle = '#4a4640'; c.fillRect(0, 0, n, n);
    let y = 0; while (y < n) { const h = 60 + r() * 30; let x = -r() * 60; while (x < n) { const b = 80 + r() * 140, g = 0.55 + r() * 0.3; c.fillStyle = `rgb(${Math.round(150 * g)},${Math.round(148 * g)},${Math.round(138 * g)})`; c.beginPath(); c.roundRect(x + 2, y + 2, b - 4, h - 4, 7); c.fill(); x += b; } y += h; }
    koerner(c, n, 30); patina(c, n, r, 3.2, 1.0, 1.2); for (let i = 0; i < 60; i++) fleck(c, n, r() * n, n * (0.4 + r() * 0.6), 14 + r() * 28, '60,92,40', 0.3 + r() * 0.3);
  }, s + 3);
  else if (art === 'putz') t = leinwand(512, (c, n, r) => { // Kalkputz mit Flecken, Rissen und abgeplatzten Stellen (Ziegel darunter)
    c.fillStyle = v === 1 ? '#d9cdb4' : '#e0d6c0'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 90; i++) fleck(c, n, r() * n, r() * n, 20 + r() * 60, r() > 0.5 ? '120,100,70' : '150,150,140', 0.05 + r() * 0.12);
    for (let i = 0; i < 5; i++) { const x = r() * (n - 130), y = r() * (n - 100), w = 50 + r() * 80, h = 36 + r() * 56; c.fillStyle = '#b86a48'; c.beginPath(); c.roundRect(x, y, w, h, 12); c.fill(); for (let k = 0; k < 4; k++) { c.fillStyle = `rgba(${100 + r() * 60},${50 + r() * 30},${30},0.7)`; c.fillRect(x + (k % 2) * w / 2 + 2, y + Math.floor(k / 2) * h / 2 + 2, w / 2 - 4, h / 2 - 4); } c.strokeStyle = 'rgba(80,66,50,0.6)'; c.lineWidth = 2; c.stroke(); }
    koerner(c, n, 18); rissLinie(c, n, r, 12); patina(c, n, r, 0.8, 1.4, 0.3);
  }, s + 5);
  else if (art === 'holz') t = leinwand(512, (c, n, r) => { // senkrechte Bohlen mit Maserung, Ästen, Nägeln, Silbergrau der Witterung
    c.fillStyle = '#2a2018'; c.fillRect(0, 0, n, n);
    const pw = [64, 72, 56][v % 3]; for (let x = 0; x < n; x += pw) { const g = 0.62 + r() * 0.5, grau = r() * 0.5; const gr = c.createLinearGradient(x, 0, x + pw, 0); gr.addColorStop(0, `rgb(${Math.round((130 + 40 * grau) * g)},${Math.round((96 + 60 * grau) * g)},${Math.round((62 + 78 * grau) * g)})`); gr.addColorStop(1, `rgb(${Math.round((112 + 40 * grau) * g)},${Math.round((82 + 60 * grau) * g)},${Math.round((52 + 78 * grau) * g)})`);
      c.fillStyle = gr; c.fillRect(x + 2, 0, pw - 4, n); for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(30,18,8,${0.06 + r() * 0.16})`; c.lineWidth = 0.6 + r() * 1.2; const xx = x + 5 + r() * (pw - 10); c.beginPath(); c.moveTo(xx, 0); c.bezierCurveTo(xx + (r() - 0.5) * 8, n * 0.3, xx + (r() - 0.5) * 8, n * 0.6, xx + (r() - 0.5) * 6, n); c.stroke(); }
      if (r() > 0.4) { const ky = r() * n, kx = x + pw / 2; for (let k = 4; k > 0; k--) { c.strokeStyle = `rgba(30,16,6,${0.25})`; c.lineWidth = 1.4; c.beginPath(); c.ellipse(kx, ky, k * 3.5, k * 5.5, 0, 0, 6.3); c.stroke(); } }
      for (const ny of [28, n / 2, n - 28]) { c.fillStyle = 'rgba(30,24,20,0.7)'; c.beginPath(); c.arc(x + 9, ny, 2.2, 0, 6.3); c.arc(x + pw - 9, ny, 2.2, 0, 6.3); c.fill(); } }
    koerner(c, n, 22); patina(c, n, r, 0.8, 1.6, 0.2);
  }, s + 7);
  else if (art === 'schindel' || art === 'ziegel' || art === 'schiefer' || art === 'stroh') t = leinwand(512, (c, n, r) => { // Dachdeckung: Reihen überlappender Schindeln, Ziegel, Schiefer oder Strohbündel
    c.fillStyle = '#1e1a16'; c.fillRect(0, 0, n, n);
    if (art === 'stroh') { for (let i = 0; i < 2200; i++) { const x = r() * n, y = r() * n, l = 30 + r() * 70, g = 0.65 + r() * 0.5; c.strokeStyle = `rgb(${Math.round(190 * g)},${Math.round(158 * g)},${Math.round(92 * g)})`; c.lineWidth = 1 + r() * 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 8, y + l); c.stroke(); } for (let y = 0; y < n; y += 96) { c.fillStyle = 'rgba(40,28,14,0.35)'; c.fillRect(0, y, n, 4); } }
    else { const rows = art === 'schiefer' ? 14 : art === 'ziegel' ? 12 : 10, h = n / rows, b = art === 'schiefer' ? 48 : art === 'ziegel' ? 42 : 56;
      for (let row = rows; row >= 0; row--) for (let x = -b; x < n + b; x += b) { const w = x + (row % 2) * b / 2 + (art === 'schindel' ? (r() - 0.5) * 6 : 0), g = 0.65 + r() * 0.5, y = row * h;
        const base = art === 'ziegel' ? [190, 110, 78] : art === 'schiefer' ? [110, 118, 130] : [150, 124, 94]; c.fillStyle = `rgb(${Math.round(base[0] * g)},${Math.round(base[1] * g)},${Math.round(base[2] * g)})`;
        c.beginPath(); if (art === 'ziegel') { c.moveTo(w + 1, y); c.lineTo(w + b - 1, y); c.lineTo(w + b - 1, y + h * 0.7); c.quadraticCurveTo(w + b / 2, y + h * 1.25, w + 1, y + h * 0.7); } else if (art === 'schiefer') { c.rect(w + 1, y, b - 2, h * 1.2); } else { c.moveTo(w + 1, y); c.lineTo(w + b - 1, y); c.lineTo(w + b - 1, y + h * 0.85); c.quadraticCurveTo(w + b / 2, y + h * 1.15, w + 1, y + h * 0.85); } c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(w + 1, y + h * 0.78, b - 2, 4); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(w + 1, y, b - 2, 2); } }
    koerner(c, n, 24); patina(c, n, r, art === 'stroh' ? 1.4 : 1.6, 1.0, 0.6);
  }, s + 9);
  else if (art === 'kupfer') t = leinwand(256, (c, n, r) => { // Kupferblech mit Grünspan
    const gr = c.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, '#b8703c'); gr.addColorStop(1, '#8a4a28'); c.fillStyle = gr; c.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 42) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, 0, 2, n); c.fillStyle = 'rgba(255,220,180,0.15)'; c.fillRect(x + 2, 0, 1, n); }
    for (let i = 0; i < 40; i++) fleck(c, n, r() * n, r() * n, 10 + r() * 36, r() > 0.3 ? '90,170,140' : '120,190,160', 0.25 + r() * 0.4); koerner(c, n, 18);
  }, s + 11);
  else t = leinwand(256, (c, n, r) => { // Eisen: dunkel, rostige Flecken
    c.fillStyle = '#4a4a4e'; c.fillRect(0, 0, n, n); for (let i = 0; i < 30; i++) fleck(c, n, r() * n, r() * n, 8 + r() * 24, r() > 0.5 ? '130,70,36' : '30,30,34', 0.2 + r() * 0.4); koerner(c, n, 22);
  }, s + 13);
  TEXTUREN.set(key, t); return t;
}

// ---------- Materialien und Farbwahl je Volk ----------
const MATERIALIEN = new Map<string, THREE.Material>();
function material(art: string, v: number, farbe = '#ffffff', zweiseitig = false, rauh = 0.9): THREE.Material {
  const key = `${art}${v}${farbe}${zweiseitig}`; let m = MATERIALIEN.get(key);
  if (!m) { m = FABRIK.licht({ map: textur(art, v), color: farbe, roughness: rauh, metalness: art === 'kupfer' || art === 'eisen' ? 0.4 : 0, side: zweiseitig ? THREE.DoubleSide : THREE.FrontSide }, 1.2); MATERIALIEN.set(key, m); }
  return m;
}
const glatt = (name: string, bau: () => THREE.Material): THREE.Material => { let m = MATERIALIEN.get(name); if (!m) { m = bau(); MATERIALIEN.set(name, m); } return m; };
const GLAS = () => glatt('glas', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8a850').multiplyScalar(1.05), toneMapped: false }));
const GLUT = () => glatt('glut', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(1.8), toneMapped: false }));
const KRISTALL = () => glatt('kristallbau', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe9ff').multiplyScalar(1.6), toneMapped: false }));
const farbig = (hex: string, rauh = 0.85): THREE.Material => glatt('f' + hex + rauh, () => FABRIK.licht({ color: hex, roughness: rauh, metalness: 0, side: THREE.DoubleSide }, 1.2));
const MOOS = () => farbig('#4f6a30', 1);

interface Palette { stein: string; putz: string; holz: string; dach: [string, string][]; laden: string[]; akzent: string }
const PALETTEN: Record<string, Palette> = {
  '': { stein: '#d4cec4', putz: '#ffffff', holz: '#e8dccb', dach: [['schiefer', '#8f99ad'], ['ziegel', '#ffffff'], ['schindel', '#b0a090']], laden: ['#7a3a2a', '#3a5a7a', '#4a6a3a', '#8a6a2a'], akzent: '#c9a043' },
  glutborn: { stein: '#8e8a96', putz: '#c8b8a8', holz: '#9a7a62', dach: [['schiefer', '#7a7f94'], ['kupfer', '#ffffff'], ['ziegel', '#a86a4a']], laden: ['#8a3a22', '#4a3a3a', '#a85a1e'], akzent: '#d9803a' },
  hainmar: { stein: '#a6b296', putz: '#e0dabf', holz: '#d8c8a0', dach: [['stroh', '#e0d0a0'], ['schindel', '#8a8a5a'], ['ziegel', '#b07040']], laden: ['#3f6a3a', '#7a6a2a', '#5a7a4a'], akzent: '#7fb04a' },
  sturmweber: { stein: '#f2eee6', putz: '#fffdf6', holz: '#c8aa80', dach: [['schiefer', '#7a9ac8'], ['ziegel', '#d08a6a'], ['kupfer', '#ffffff']], laden: ['#3a5a9a', '#4a8aaa', '#c9a043'], akzent: '#c9a043' }
};

// ---------- Baukasten ----------
function weltUV(geo: THREE.BufferGeometry, kachel: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i)); let u: number, w: number;
    if (ny > nx && ny > nz) { u = x; w = z; } else if (nx > nz) { u = z; w = y; } else { u = x; w = y; } uv[2 * i] = u / kachel; uv[2 * i + 1] = w / kachel; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
const norm = (g: THREE.BufferGeometry): THREE.BufferGeometry => { if (g.index === null) { g = g.clone(); } if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)); return g; };
export class Kasten {
  private teile = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [];
  r: () => number;
  constructor(readonly seed: number, readonly pal: Palette, readonly v: number) { this.r = zufall(seed * 7919 + 13); }
  /** Eigenes Koordinatensystem für eine Gruppe von Teilen (Verschiebung und Drehung um Y) */
  an(x: number, y: number, z: number, ry: number, f: () => void): void { this.stack.push(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)); f(); this.stack.pop(); }
  add(mat: THREE.Material, geo: THREE.BufferGeometry): void {
    let g = norm(geo); for (let i = this.stack.length - 1; i >= 0; i--) g.applyMatrix4(this.stack[i]);
    (this.teile.get(mat) ?? this.teile.set(mat, []).get(mat)!).push(g);
  }
  quader(mat: THREE.Material, x: number, y0: number, z: number, w: number, h: number, d: number, ry = 0, kachel = 4): void {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); if (ry) g.rotateY(ry); g.translate(x, y0, z); weltUV(g, kachel); this.add(mat, g);
  }
  zyl(mat: THREE.Material, x: number, y0: number, z: number, rOben: number, rUnten: number, h: number, seg = 16, kachel = 4): void {
    const g = new THREE.CylinderGeometry(rOben, rUnten, h, seg, 1); g.translate(x, y0 + h / 2, z); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * Math.max(rOben, rUnten) / kachel, uv.getY(i) * h / kachel); this.add(mat, g);
  }
  kegel(mat: THREE.Material, x: number, y0: number, z: number, r: number, h: number, seg = 16): void {
    const g = new THREE.ConeGeometry(r, h, seg, 1, true); g.translate(x, y0 + h / 2, z); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 2.6 / 2, uv.getY(i) * Math.hypot(r, h) / 2); this.add(mat, g);
  }
  /** Balken von a nach b mit quadratischem Querschnitt */
  balken(mat: THREE.Material, a: [number, number, number], b: [number, number, number], dicke = 0.14): void {
    const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = v.length(), g = new THREE.BoxGeometry(dicke, len, dicke);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize())); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); weltUV(g, 2); this.add(mat, g);
  }
  /** Satteldach, First entlang z (ry dreht): Dachflächen + Giebeldreiecke in giebel */
  satteldach(dach: THREE.Material, giebel: THREE.Material, x: number, y0: number, z: number, w: number, d: number, h: number, ue = 0.35, ry = 0): void {
    this.an(x, y0, z, ry, () => {
      const hw = w / 2 + ue, hd = d / 2 + ue * 0.8, laenge = Math.hypot(hw, h), pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
      for (const s of [-1, 1]) { const n = new THREE.Vector3(s * h, hw, 0).normalize(), b = pos.length / 3; pos.push(s * hw, -0.1, -hd, s * hw, -0.1, hd, 0, h, hd, 0, h, -hd); for (let i = 0; i < 4; i++) nor.push(n.x, n.y, n.z); uv.push(0, 0, 2 * hd / 3, 0, 2 * hd / 3, laenge / 3, 0, laenge / 3); if (s > 0) idx.push(b, b + 2, b + 1, b, b + 3, b + 2); else idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); this.add(dach, g);
      const q = new THREE.BufferGeometry(), pp: number[] = [], nn: number[] = [], uu: number[] = [], ii: number[] = [];
      for (const s of [-1, 1]) { const b = pp.length / 3, zz = s * d / 2, hh = w / 2; pp.push(-hh, 0, zz, hh, 0, zz, 0, h * (hh / (hh + ue)), zz); for (let i = 0; i < 3; i++) nn.push(0, 0, s); uu.push(-hh / 4, 0, hh / 4, 0, 0, h / 4); if (s > 0) ii.push(b, b + 1, b + 2); else ii.push(b, b + 2, b + 1); }
      q.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2)); q.setIndex(ii); this.add(giebel, q);
      this.zyl(dach, 0, h - 0.1, 0, 0.13, 0.13, 1, 6); const f = new THREE.CylinderGeometry(0.13, 0.13, 2 * hd, 6); f.rotateX(Math.PI / 2); f.translate(0, h, 0); this.add(dach, f);
    });
  }
  /** vierseitiges Walmdach (Pyramide) */
  pyramide(dach: THREE.Material, x: number, y0: number, z: number, w: number, d: number, h: number, ue = 0.3): void {
    const hw = w / 2 + ue, hd = d / 2 + ue, pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    const ecken: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (let i = 0; i < 4; i++) { const a = ecken[i], b = ecken[(i + 1) % 4], base = pos.length / 3, v1 = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), v2 = new THREE.Vector3(-a[0], h, -a[1]), n = new THREE.Vector3().crossVectors(v1, v2).normalize();
      pos.push(a[0], 0, a[1], b[0], 0, b[1], 0, h, 0); for (let k = 0; k < 3; k++) nor.push(n.x, n.y, n.z); const l = v1.length(), hl = Math.hypot(h, Math.hypot(a[0] + (b[0] - a[0]) / 2, a[1] + (b[1] - a[1]) / 2)); uv.push(0, 0, l / 3, 0, l / 6, hl / 3); idx.push(base, base + 1, base + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.translate(x, y0, z); this.add(dach, g);
  }
  gruppe(): THREE.Group {
    const gr = new THREE.Group();
    for (const [mat, geos] of this.teile) { const g = mergeGeometries(geos, false); if (!g) continue; const m = new THREE.Mesh(g, mat); m.castShadow = mat !== GLAS() && mat !== GLUT(); m.receiveShadow = true; gr.add(m); }
    return gr;
  }
}

// ---------- Einzelteile ----------
function fenster(b: Kasten, x: number, y: number, z: number, ry: number, w = 0.7, h = 1.0, laden = true, blumen = false): void {
  const holz = material('holz', b.v, '#6a5a48'), stein = material('stein', b.v, b.pal.stein);
  b.an(x, y, z, ry, () => {
    b.quader(stein, 0, -0.08, 0.05, w + 0.34, 0.1, 0.3); b.quader(stein, 0, h, 0.04, w + 0.3, 0.1, 0.22); // Fensterbank und Sturz
    b.quader(holz, 0, 0, 0.02, w + 0.14, h, 0.1); b.quader(GLAS(), 0, 0.05, 0.075, w, h - 0.1, 0.03); b.quader(holz, 0, 0, 0.1, 0.07, h, 0.05); b.quader(holz, 0, h / 2, 0.1, w, 0.06, 0.05);
    if (laden) for (const s of [-1, 1]) b.an(s * (w / 2 + 0.1), 0, 0.08, -s * 0.5, () => b.quader(farbig(b.pal.laden[Math.floor(hz(x, z, 3) * b.pal.laden.length)]), s * w / 4, 0, 0, w / 2, h, 0.06));
    if (blumen) { b.quader(material('holz', b.v, '#7a6a52'), 0, -0.3, 0.3, w + 0.1, 0.22, 0.24); for (let i = 0; i < 5; i++) b.quader(farbig(['#c84a5a', '#e0c060', '#d070a8', '#f2f0ea'][i % 4]), (i - 2) * w / 5, -0.08, 0.3, 0.12, 0.16, 0.12); }
  });
}
function tuer(b: Kasten, x: number, y: number, z: number, ry: number, w = 1.1, h = 2.0, rund = true): void {
  const holz = material('holz', b.v, '#7a6048'), eisen = material('eisen', 0, '#ffffff'), stein = material('stein', b.v, b.pal.stein);
  b.an(x, y, z, ry, () => {
    b.quader(stein, 0, 0, 0.1, w + 0.5, 0.12, 0.7); // Stufe
    for (const s of [-1, 1]) b.quader(stein, s * (w / 2 + 0.12), 0, 0.05, 0.22, h + 0.2, 0.3); b.quader(stein, 0, h, 0.05, w + 0.6, 0.22, 0.3);
    b.quader(holz, 0, 0, 0.0, w, h, 0.12); if (rund) { const g = new THREE.CylinderGeometry(w / 2, w / 2, 0.12, 14, 1, false, 0, Math.PI); g.rotateX(Math.PI / 2); g.translate(0, h, 0.0); weltUV(g, 2); b.add(holz, g); }
    for (const yy of [0.35, h - 0.4]) b.quader(eisen, 0, yy, 0.08, w, 0.08, 0.04); b.quader(eisen, w * 0.32, h * 0.45, 0.1, 0.1, 0.1, 0.06);
  });
}
function schornstein(b: Kasten, x: number, y0: number, z: number, h = 2.2, w = 0.7): void {
  const st = material('stein', b.v, b.pal.stein);
  b.quader(st, x, y0, z, w, h, w); b.quader(st, x, y0 + h, z, w + 0.2, 0.18, w + 0.2); b.quader(farbig('#1a1612'), x, y0 + h + 0.18, z, w - 0.1, 0.04, w - 0.1);
  for (const dx of [-1, 1]) b.quader(st, x + dx * (w / 2 + 0.1), y0 + h + 0.18, z, 0.1, 0.2, w + 0.2);
}
/** Efeu und Moos: flache, ausgebeulte grüne Büschel an der Wand */
function efeu(b: Kasten, x: number, y: number, z: number, ry: number, groesse: number): void {
  b.an(x, y, z, ry, () => { for (let i = 0; i < 6; i++) { const g = new THREE.IcosahedronGeometry(1, 1); g.scale(groesse * (0.5 + b.r() * 0.7), groesse * (0.5 + b.r() * 0.8), 0.07); g.translate((b.r() - 0.5) * groesse * 1.6, b.r() * groesse * 2.2, 0.03); b.add(farbig(['#3f6a2e', '#4f7a32', '#34572a'][i % 3], 1), g); } });
}
function fass(b: Kasten, x: number, z: number, r = 0.4, h = 0.8): void { const holz = material('holz', b.v, '#8a6a4a'); b.zyl(holz, x, 0, z, r * 0.88, r * 0.88, h, 10); b.zyl(material('eisen', 0, '#ffffff'), x, 0.1, z, r * 0.92, r * 0.92, 0.07, 10); b.zyl(material('eisen', 0, '#ffffff'), x, h - 0.18, z, r * 0.92, r * 0.92, 0.07, 10); }
function kisten(b: Kasten, x: number, z: number, n = 2): void { const holz = material('holz', b.v, '#9a7a58'); for (let i = 0; i < n; i++) b.quader(holz, x + i * 0.2, i * 0.55, z + (i % 2) * 0.12, 0.6, 0.55, 0.6, i * 0.3); }
function holzstapel(b: Kasten, x: number, z: number, reihen = 3, laenge = 2): void { const holz = material('holz', (b.v + 1) % 3, '#a08060'); for (let r = 0; r < reihen; r++) for (let i = 0; i < reihen - r + 1; i++) { const g = new THREE.CylinderGeometry(0.16, 0.16, laenge, 8); g.rotateZ(Math.PI / 2); g.translate(x, 0.17 + r * 0.29, z + (i - (reihen - r) / 2) * 0.33); const uv = g.getAttribute('uv'); for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), uv.getY(k) * 2); b.add(holz, g); } }
function zaun(b: Kasten, x0: number, z0: number, x1: number, z1: number, h = 0.9): void { const holz = material('holz', b.v, '#8a6a4a'), n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.9)); for (let i = 0; i <= n; i++) b.quader(holz, x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, 0.12, h, 0.12); for (const yy of [0.3, 0.65]) b.balken(holz, [x0, yy, z0], [x1, yy, z1], 0.08); }
function laterne(b: Kasten, x: number, y: number, z: number): void { b.quader(material('eisen', 0, '#ffffff'), x, y, z, 0.05, 0.5, 0.05); b.quader(GLAS(), x, y + 0.5, z, 0.16, 0.2, 0.16); b.quader(material('eisen', 0, '#ffffff'), x, y + 0.7, z, 0.22, 0.06, 0.22); }
/** Eckquader: abwechselnd vorspringende Steine an den Hausecken */
function eckquader(b: Kasten, hw: number, hd: number, hoehe: number): void { const st = material('stein', (b.v + 1) % 3, b.pal.stein); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let i = 0; i * 0.55 < hoehe; i++) b.quader(st, sx * hw, 0.05 + i * 0.55, sz * hd, i % 2 ? 0.5 : 0.36, 0.5, i % 2 ? 0.36 : 0.5); }

function gebaeudeHaus(b: Kasten, stufe: number, breite = 3.6, tiefe = 3.4): void {
  const st = material('stein', b.v, b.pal.stein), sockel = material('steinMoos', b.v, b.pal.stein), putz = material('putz', b.v, b.pal.putz), holz = material('holz', b.v, b.pal.holz);
  const [dachArt, dachFarbe] = b.pal.dach[b.v % b.pal.dach.length], dach = material(dachArt, b.v, dachFarbe, true, 0.8);
  const hw = breite / 2, hd = tiefe / 2, hoehe = stufe >= 2 ? 4.4 : 2.8;
  b.quader(sockel, 0, 0, 0, breite + 0.3, 0.7, tiefe + 0.3); // bemooster Sockel
  if (stufe >= 2) { b.quader(st, 0, 0.7, 0, breite, 2.0, tiefe); b.quader(putz, 0, 2.7, 0, breite + 0.4, hoehe - 2.7, tiefe + 0.4); // Obergeschoss kragt vor
    for (let i = -1; i <= 1; i++) b.balken(holz, [i * hw * 0.7, 2.7, hd + 0.22], [i * hw * 0.7, hoehe, hd + 0.22], 0.14); b.balken(holz, [-hw - 0.2, 3.5, hd + 0.22], [hw + 0.2, 3.5, hd + 0.22], 0.14); b.balken(holz, [-hw, 2.75, hd + 0.22], [-hw * 0.3, hoehe - 0.1, hd + 0.22], 0.12); b.balken(holz, [hw, 2.75, hd + 0.22], [hw * 0.3, hoehe - 0.1, hd + 0.22], 0.12); }
  else { b.quader(putz, 0, 0.7, 0, breite, hoehe - 0.7, tiefe); for (let i = -1; i <= 1; i++) b.balken(holz, [i * hw * 0.8, 0.7, hd + 0.04], [i * hw * 0.8, hoehe, hd + 0.04], 0.14); b.balken(holz, [-hw, 1.8, hd + 0.04], [hw, 1.8, hd + 0.04], 0.12); b.balken(holz, [-hw * 0.8, 0.7, hd + 0.04], [0, 1.8, hd + 0.04], 0.1); }
  eckquader(b, hw, hd, hoehe);
  b.satteldach(dach, putz, 0, hoehe, 0, breite, tiefe, stufe >= 3 ? 2.6 : 2.0, 0.4, b.v % 2 ? 0 : Math.PI / 2 * 0 );
  tuer(b, -hw * 0.4, 0.7, hd + 0.02, 0); fenster(b, hw * 0.4, stufe >= 2 ? 1.2 : 1.3, hd + 0.02, 0, 0.7, 0.9, true, b.v % 2 === 0);
  fenster(b, -hw * 0.3, hoehe - 1.2, hd + 0.2, 0, 0.7, 0.9, true); fenster(b, hw * 0.4, hoehe - 1.2, hd + 0.2, 0, 0.7, 0.9, true, true);
  fenster(b, hw + 0.02, 1.4, 0, Math.PI / 2, 0.6, 0.8, true); fenster(b, -hw - 0.02, 1.4, 0, -Math.PI / 2, 0.6, 0.8, true);
  schornstein(b, hw * 0.6, hoehe + 1.1, -hd * 0.4, 1.6 + stufe * 0.3);
  efeu(b, -hw - 0.05, 0.8, hd * 0.2, -Math.PI / 2, 0.8); efeu(b, hw * 0.3, 0.8, hd + 0.05, 0, 0.6);
  fass(b, hw + 0.5, hd - 0.2); if (b.v % 2) kisten(b, -hw - 0.5, hd - 0.3); else holzstapel(b, -hw - 0.7, -hd * 0.3, 2, 1.4);
  if (stufe >= 3) { b.quader(st, hw + 0.6, 0, -hd * 0.3, 1.2, 2.4, 1.4); b.satteldach(dach, putz, hw + 0.6, 2.4, -hd * 0.3, 1.2, 1.4, 1.0, 0.25, Math.PI / 2); }
  laterne(b, -hw * 0.4 + 0.9, 1.4, hd + 0.15);
}

/** Welche Typen haben ein glattes Modell? */
export const GLATT_BAUTEN = new Set<string>(['haus']);
/** Glattes Gebäude für einen Typ (null: noch Voxel). volk '' = ohne Völkerfarben, variante 0–3 wählt Baustoffe und Details */
export function glatterBau(typ: string, o: { stufe?: number; volk?: string; variante?: number; schaden?: number; stahl?: boolean }): THREE.Group | null {
  if (!GLATT_BAUTEN.has(typ)) return null;
  const pal = PALETTEN[o.volk ?? ''] ?? PALETTEN[''], v = (o.variante ?? 0) % 3, b = new Kasten(typ.length * 31 + (o.stufe ?? 1) * 7 + v * 101, pal, v);
  if (typ === 'haus') gebaeudeHaus(b, o.stufe ?? 1);
  return b.gruppe();
}
