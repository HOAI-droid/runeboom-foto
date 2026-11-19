import * as THREE from 'three';
import { FABRIK } from './grafik.ts';

/**
 * Glatte Modelle im „Foto-Look“ (Branch foto-look): statt Voxeln echte Geometrie mit Stein-, Holz- und Schindeltexturen.
 * Die Materialien sind normale Standardmaterialien (mit Lichtkarte über FABRIK.licht), laufen also bei WebGL und WebGPU.
 * Maße in Blöcken (1 Block ≈ 1 m), Mitte der Burg bei 0, Boden bei y = 0.
 */

export { GLATT } from './schalter.ts';

// ---------- Texturen aus Rauschen (einmal erzeugt) ----------
function rauschZahl(x: number, y: number, s: number): number { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
function leinwand(n: number, malen: (c: CanvasRenderingContext2D, n: number) => void, wiederholen = 1): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d')!; malen(c, n);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(wiederholen, wiederholen); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function koernung(c: CanvasRenderingContext2D, n: number, menge: number, stark: number, s: number): void {
  for (let i = 0; i < menge; i++) { const x = rauschZahl(i, 1, s) * n, y = rauschZahl(i, 2, s) * n, a = rauschZahl(i, 3, s); c.fillStyle = a > 0.5 ? `rgba(255,255,255,${stark * a})` : `rgba(0,0,0,${stark * (1 - a)})`; c.fillRect(x, y, 1 + a * 2, 1 + a * 2); }
}
const TEX: { stein?: THREE.Texture; holz?: THREE.Texture; schindel?: THREE.Texture; mat?: Record<string, THREE.Material> } = {};
function steinTex(): THREE.Texture {
  return TEX.stein ??= leinwand(512, (c, n) => {
    c.fillStyle = '#6f6a62'; c.fillRect(0, 0, n, n); // Fuge
    const reihen = 8, h = n / reihen;
    for (let r = 0; r < reihen; r++) { const breite = n / (3 + (r % 3)), versatz = (r % 2) * breite / 2;
      for (let x = -breite; x < n + breite; x += breite) { const f = 0.78 + rauschZahl(r, x, 5) * 0.2, g = Math.round(185 * f), w = x + versatz;
        c.fillStyle = `rgb(${g + 6},${g},${g - 8})`; c.fillRect(w + 2, r * h + 2, breite - 4, h - 4);
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(w + 2, r * h + 2, breite - 4, 3); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(w + 2, r * h + h - 5, breite - 4, 3); } }
    koernung(c, n, 9000, 0.12, 1);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(70,95,45,${0.05 + rauschZahl(i, 9, 2) * 0.12})`; c.beginPath(); c.arc(rauschZahl(i, 7, 2) * n, rauschZahl(i, 8, 2) * n, 6 + rauschZahl(i, 4, 2) * 22, 0, 6.3); c.fill(); } // Moos
  }, 1);
}
function holzTex(): THREE.Texture {
  return TEX.holz ??= leinwand(256, (c, n) => {
    c.fillStyle = '#6b4a2f'; c.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 2) { const f = 0.8 + rauschZahl(x, 0, 3) * 0.3; c.fillStyle = `rgba(${Math.round(120 * f)},${Math.round(80 * f)},${Math.round(48 * f)},0.9)`; c.fillRect(x, 0, 2, n); }
    for (let i = 0; i < 70; i++) { const x = rauschZahl(i, 1, 4) * n; c.fillStyle = 'rgba(30,18,8,0.25)'; c.fillRect(x, rauschZahl(i, 2, 4) * n, 1, 10 + rauschZahl(i, 3, 4) * 50); }
    for (let x = 0; x < n; x += 32) { c.fillStyle = 'rgba(20,12,6,0.55)'; c.fillRect(x, 0, 2, n); }
  });
}
function schindelTex(farbe: string): THREE.Texture {
  return leinwand(256, (c, n) => {
    c.fillStyle = '#20252f'; c.fillRect(0, 0, n, n); const reihen = 8, h = n / reihen, b = n / 6;
    for (let r = 0; r < reihen; r++) for (let x = -b; x < n + b; x += b) { const v = 0.75 + rauschZahl(r, x, 8) * 0.4, w = x + (r % 2) * b / 2;
      c.fillStyle = farbe; c.globalAlpha = Math.min(1, v); c.fillRect(w + 1, r * h, b - 2, h - 1); c.globalAlpha = 1;
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(w + 1, r * h + h - 4, b - 2, 3); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(w + 1, r * h, b - 2, 2); }
    koernung(c, n, 2500, 0.1, 6);
  });
}

// ---------- Materialien ----------
function stoff(name: string, bau: () => THREE.Material): THREE.Material { TEX.mat ??= {}; return (TEX.mat[name] ??= bau()); }
const stein = (wdh: number) => { const t = steinTex().clone(); t.repeat.set(wdh, wdh); t.needsUpdate = true; return FABRIK.licht({ map: t, roughness: 0.92, metalness: 0 }, 1.2); };
const matStein = () => stoff('stein', () => stein(1));
const matHolz = () => stoff('holz', () => FABRIK.licht({ map: holzTex(), roughness: 0.85, metalness: 0 }, 1.2));
const matDach = (farbe: string) => stoff('dach' + farbe, () => FABRIK.licht({ map: schindelTex(farbe), roughness: 0.7, metalness: 0.05 }, 1.2));
const matFenster = () => stoff('fenster', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc06a').multiplyScalar(1.4), toneMapped: false }));
const matGold = () => stoff('gold', () => new THREE.MeshStandardMaterial({ color: '#d4a640', roughness: 0.35, metalness: 0.9 }));
const matKristall = () => stoff('kristall', () => new THREE.MeshPhysicalMaterial({ color: '#bff7ff', emissive: '#4fe0ff', emissiveIntensity: 1.6, roughness: 0.08, metalness: 0, transmission: 0.2, transparent: true, opacity: 0.92 }));
const matFahne = () => stoff('fahne', () => new THREE.MeshStandardMaterial({ color: '#9c2f2f', roughness: 0.9, side: THREE.DoubleSide }));

/** UV so skalieren, dass die Textur nicht gedehnt wird (Wandflächen: 1 Texturkachel ≈ 4 Blöcke) */
function weltUV(geo: THREE.BufferGeometry, kachel = 4): THREE.BufferGeometry {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nor.getX(i)), nz = Math.abs(nor.getZ(i));
    uv[2 * i] = (nx > nz ? z : x) / kachel; uv[2 * i + 1] = y / kachel; if (Math.abs(nor.getY(i)) > 0.8) { uv[2 * i] = x / kachel; uv[2 * i + 1] = z / kachel; } }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
function teil(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, schatten = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = schatten; m.receiveShadow = true; g.add(m); return m;
}
const quader = (b: number, h: number, t: number) => weltUV(new THREE.BoxGeometry(b, h, t));
const zyl = (r: number, h: number) => weltUV(new THREE.CylinderGeometry(r, r * 1.04, h, 28, 1, false));
/** Dach als Kegel mit Schindeln; Vierkantdach als Pyramide */
const kegel = (r: number, h: number, seiten = 28) => { const g = new THREE.ConeGeometry(r, h, seiten, 1); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2); return g; };
const pyramide = (b: number, h: number) => { const g = new THREE.ConeGeometry(b / Math.SQRT2, h, 4, 1); g.rotateY(Math.PI / 4); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2); return g; };

/** Zinnenkranz auf einer Rechteckmauer */
function zinnen(g: THREE.Group, bx: number, bz: number, y: number, rand = 0.5): void {
  const n = Math.round(bx / 1.4), m = Math.round(bz / 1.4);
  for (let i = 0; i < n; i++) { const x = -bx / 2 + (i + 0.5) * bx / n; for (const s of [-1, 1]) teil(g, quader(0.7, 0.8, 0.6), matStein(), x, y + 0.4, s * (bz / 2 - rand / 2)); }
  for (let i = 1; i < m - 1; i++) { const z = -bz / 2 + (i + 0.5) * bz / m; for (const s of [-1, 1]) teil(g, quader(0.6, 0.8, 0.7), matStein(), s * (bx / 2 - rand / 2), y + 0.4, z); }
}
const matEisen = () => stoff('eisen', () => FABRIK.licht({ color: '#3a3a40', roughness: 0.6, metalness: 0.5 }, 1.2));
const matSchatten = () => stoff('schatten', () => new THREE.MeshBasicMaterial({ color: '#1a1410' }));
const hz = (a: number, b: number): number => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
/** Rundbogenform (Fuß bei y = 0, Scheitel bei y = h) */
function bogen(w: number, h: number): THREE.Shape { const r = w / 2, s = new THREE.Shape(); s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0); return s; }
/** Steinrahmen mit Bogenöffnung: Rechteck unten, Bogen oben, Öffnung ausgespart, mit Tiefe (die Laibung sieht man) */
function rahmen(w: number, h: number, rand: number, tiefe: number): THREE.BufferGeometry {
  const o = new THREE.Shape(), r = w / 2 + rand; o.moveTo(-r, -rand * 0.6); o.lineTo(r, -rand * 0.6); o.lineTo(r, h - w / 2); o.absarc(0, h - w / 2, r, 0, Math.PI, false); o.lineTo(-r, -rand * 0.6); o.holes.push(bogen(w, h));
  return weltUV(new THREE.ExtrudeGeometry(o, { depth: tiefe, bevelEnabled: false, curveSegments: 10 }), 2);
}
/** Eingelassenes Fenster: Steinrahmen mit tiefer Laibung, Glas dahinter, Sprossenkreuz, Sohlbank, auf Wunsch Läden; z zeigt nach außen (ry dreht) */
function fenster(g: THREE.Group, x: number, y: number, z: number, ry: number, w = 0.55, h = 1.3, laden = false): void {
  const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.y = ry; g.add(f);
  teil(f, rahmen(w, h, 0.17, 0.42), matStein(), 0, 0, -0.1);
  teil(f, new THREE.ShapeGeometry(bogen(w, h), 10), matFenster(), 0, 0, 0.1, false);
  teil(f, new THREE.BoxGeometry(0.05, h - w / 2, 0.05), matHolz(), 0, (h - w / 2) / 2, 0.15, false); teil(f, new THREE.BoxGeometry(w, 0.05, 0.05), matHolz(), 0, h * 0.45, 0.15, false);
  teil(f, new THREE.BoxGeometry(w + 0.55, 0.12, 0.5), matStein(), 0, -0.14, 0.13);
  if (laden) for (const s of [-1, 1]) { const l = teil(f, new THREE.BoxGeometry(w * 0.5, h * 0.95, 0.05), matHolz(), s * (w / 2 + 0.38), h * 0.48, 0.42); l.rotation.y = -s * 0.7; }
}
/** Schießscharte: schmaler Schlitz mit Laibung */
function scharte(g: THREE.Group, x: number, y: number, z: number, ry: number): void {
  const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.y = ry; g.add(f);
  teil(f, rahmen(0.16, 1.0, 0.13, 0.4), matStein(), 0, 0, -0.1); teil(f, new THREE.PlaneGeometry(0.16, 0.9), matSchatten(), 0, 0.5, 0.1, false);
}
/** Gurtgesims und Konsolenkranz (Zinnenkranz kragt über die Wand vor, darunter Konsolsteine) */
function gesims(g: THREE.Group, bx: number, bz: number, y: number, vor = 0.18, hoch = 0.28): void {
  teil(g, quader(bx + vor * 2, hoch, bz + vor * 2), matStein(), 0, y, 0);
}
function konsolen(g: THREE.Group, bx: number, bz: number, y: number): void {
  const n = Math.round(bx / 0.9);
  for (let i = 0; i < n; i++) { const x = -bx / 2 + (i + 0.5) * bx / n; for (const sg of [-1, 1]) { teil(g, quader(0.36, 0.5, 0.4), matStein(), x, y, sg * (bz / 2 + 0.12)); teil(g, quader(0.4, 0.5, 0.36), matStein(), sg * (bx / 2 + 0.12), y, x); } }
}
/** Pfeiler (Strebe) mit Anlauf */
function strebe(g: THREE.Group, x: number, z: number, h: number, ry: number): void {
  const p = new THREE.Group(); p.position.set(x, 0, z); p.rotation.y = ry; g.add(p);
  teil(p, quader(0.9, h, 0.7), matStein(), 0, h / 2, 0.25); teil(p, quader(1.1, 0.5, 0.9), matStein(), 0, 0.25, 0.3); teil(p, quader(0.9, 0.35, 0.8), matStein(), 0, h * 0.62, 0.3); teil(p, quader(1.05, 0.3, 0.9), matStein(), 0, h + 0.05, 0.3);
}
function rundturm(g: THREE.Group, x: number, z: number, h: number, r: number, dach: string, fenster2 = true): void {
  const t = new THREE.Group(); t.position.set(x, 0, z); g.add(t);
  teil(t, new THREE.CylinderGeometry(r * 1.14, r * 1.2, 0.8, 28), matStein(), 0, 0.4, 0); teil(t, zyl(r, h), matStein(), 0, h / 2, 0);
  for (const f of [0.34, 0.68]) teil(t, new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.22, 28), matStein(), 0, h * f, 0);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; teil(t, quader(0.34, 0.5, 0.36), matStein(), Math.cos(a) * (r * 1.1), h - 0.1, Math.sin(a) * (r * 1.1)).rotation.y = -a; }
  teil(t, new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.4, 28), matStein(), 0, h + 0.2, 0);
  teil(t, kegel(r * 1.38, r * 3.4), matDach(dach), 0, h + 0.4 + r * 1.7, 0); teil(t, new THREE.CylinderGeometry(r * 1.38, r * 1.38, 0.1, 28), matDach(dach), 0, h + 0.42, 0);
  teil(t, new THREE.SphereGeometry(0.25, 12, 8), matGold(), 0, h + 0.4 + r * 3.5, 0, false);
  if (fenster2) { for (const [i, a] of [0.7, 2.4, 4.0, 5.5].entries()) { const ry = Math.atan2(Math.cos(a), Math.sin(a)); fenster(t, Math.cos(a) * (r - 0.05), h * 0.7, Math.sin(a) * (r - 0.05), ry, 0.42, 1.0, i % 2 === 0); }
    for (const a of [1.5, 3.2, 4.8, 0.05]) scharte(t, Math.cos(a) * (r - 0.05), h * 0.38, Math.sin(a) * (r - 0.05), Math.atan2(Math.cos(a), Math.sin(a))); }
}
/** Torhaus: Steinblock mit tiefem Rundbogen, zurückgesetzte Torflügel mit Eisenbändern, Zinnen, Laternen */
function torhaus(g: THREE.Group, z0: number, volk = ''): void {
  const B = 3.8, H = 5.4, T = 1.8, ow = 1.9, oh = 3.0, t = new THREE.Group(); t.position.set(0, 0, z0); g.add(t);
  const o = new THREE.Shape(); o.moveTo(-B / 2, 0); o.lineTo(B / 2, 0); o.lineTo(B / 2, H); o.lineTo(-B / 2, H); o.lineTo(-B / 2, 0); o.holes.push(bogen(ow, oh));
  teil(t, weltUV(new THREE.ExtrudeGeometry(o, { depth: T, bevelEnabled: false, curveSegments: 12 }), 4), matStein(), 0, 0, -0.3);
  teil(t, rahmen(ow + 0.2, oh + 0.1, 0.22, 0.3), matStein(), 0, 0, T - 0.45); // Bogeneinfassung vorn
  teil(t, quader(B + 0.5, 0.3, T + 0.5), matStein(), 0, H, T / 2 - 0.3); const zg = new THREE.Group(); zg.position.set(0, H + 0.15, T / 2 - 0.3); g.add(zg); zg.position.add(new THREE.Vector3(0, 0, z0)); zinnen(zg, B + 0.5, T + 0.5, 0.0, 0.4);
  teil(t, quader(B + 0.4, 0.4, 0.5), matStein(), 0, 0.2, T - 0.2);
  // Torflügel
  const flg = bogen(ow, oh); flg.holes = [];
  teil(t, weltUV(new THREE.ExtrudeGeometry(flg, { depth: 0.24, bevelEnabled: false, curveSegments: 12 }), 2), matHolz(), 0, 0, 0.35);
  teil(t, quader(0.07, oh - ow / 2, 0.1), matSchatten(), 0, (oh - ow / 2) / 2, 0.62, false);
  for (const yy of [0.5, 1.5, 2.45]) { teil(t, quader(ow - 0.04, 0.13, 0.08), matEisen(), 0, yy, 0.62); for (const sg of [-1, 1]) teil(t, new THREE.SphereGeometry(0.075, 6, 5), matEisen(), sg * (ow / 2 - 0.2), yy + 0.07, 0.66, false); }
  for (const sg of [-1, 1]) { teil(t, new THREE.TorusGeometry(0.12, 0.025, 6, 12), matEisen(), sg * 0.22, 1.2, 0.64, false); teil(t, quader(0.18, 0.14, 0.04), matEisen(), sg * 0.5, 0.9, 0.62, false); }
  for (const sg of [-1, 1]) { teil(t, quader(0.05, 0.6, 0.05), matEisen(), sg * 2.35, 2.4, T - 0.1); teil(t, new THREE.BoxGeometry(0.2, 0.28, 0.2), matFenster(), sg * 2.35, 3.1, T - 0.1, false); teil(t, quader(0.3, 0.06, 0.3), matEisen(), sg * 2.35, 3.38, T - 0.1); }
  for (const sg of [-1, 1]) { const f = teil(t, new THREE.PlaneGeometry(0.9, 2.4), matFahne(), sg * 1.25, H - 1.6, T - 0.18, false); f.position.y = H - 1.6; teil(t, quader(1.0, 0.08, 0.08), matEisen(), sg * 1.25, H - 0.4, T - 0.18, false); }
  void volk;
}

/** Glatte Burg, Maße nach dem Voxelmodell (Halbvoxel = 0,5 Block); stufe 1–6 wie `burg()` in modelle.ts */
export function glatteBurg(stufe: number): THREE.Group {
  const g = new THREE.Group(), dach = stufe >= 5 ? '#b87333' : '#3f5675';
  teil(g, quader(12.0, 0.5, 12.0), matStein(), 0, 0.25, 0); teil(g, quader(10.6, 0.6, 10.6), matStein(), 0, 0.8, 0); // Stufen
  teil(g, quader(10.0, 1.4, 10.0), matStein(), 0, 1.1, 0); // Anlauf des Mauerfußes
  teil(g, quader(9.4, 6.4, 9.4), matStein(), 0, 1.1 + 4.1, 0); // Hauptbau
  for (const y of [4.4]) gesims(g, 9.4, 9.4, y, 0.16, 0.3);
  gesims(g, 9.4, 9.4, 7.45, 0.34, 0.28); konsolen(g, 8.6, 8.6, 7.1); gesims(g, 9.4, 9.4, 7.72, 0.34, 0.14);
  const zk = new THREE.Group(); zk.position.y = 0.2; g.add(zk); zinnen(zk, 9.8, 9.8, 7.8, 0.45);
  // Strebepfeiler an den Wänden
  for (const x of [-1.6, 1.6]) { strebe(g, x * 1.0, 4.7, 7.0, 0); strebe(g, x, -4.7, 7.0, Math.PI); strebe(g, 4.7, x, 7.0, Math.PI / 2); strebe(g, -4.7, x, 7.0, -Math.PI / 2); }
  // Fenster: eingelassen, mit Laibung und Sohlbank
  for (const [i, x] of [-2.6, 2.6].entries()) for (const y of [3.0, 5.8]) { fenster(g, x, y, 4.7, 0, 0.5, 1.2, (i + (y > 4 ? 1 : 0)) % 2 === 0); fenster(g, x, y, -4.7, Math.PI, 0.5, 1.2, i === 0); }
  for (const z of [-2.4, 0.0, 2.4]) for (const y of [3.0, 5.8]) { fenster(g, 4.7, y, z, Math.PI / 2, 0.5, 1.2, hz(z, y) > 0.5); fenster(g, -4.7, y, z, -Math.PI / 2, 0.5, 1.2, hz(y, z) > 0.5); }
  scharte(g, 0, 6.2, 4.72, 0); scharte(g, 0, 3.0, -4.72, Math.PI);
  torhaus(g, 4.7);
  // Ecktürme
  for (const [x, z] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) rundturm(g, x, z, 10.2, 1.5, dach);
  // Bergfried
  teil(g, quader(7, 3.8, 7), matStein(), 0, 7.7 + 1.9, 0); gesims(g, 7, 7, 8.2, 0.14, 0.26);
  for (const [x, z, ry] of [[0, 3.5, 0], [0, -3.5, Math.PI], [3.5, 0, Math.PI / 2], [-3.5, 0, -Math.PI / 2]] as [number, number, number][]) for (const o of [-1.6, 0, 1.6]) fenster(g, x === 0 ? o : x, 8.6, z === 0 ? o : z, ry, 0.5, 1.4, o === 0);
  gesims(g, 7, 7, 11.4, 0.5, 0.3); konsolen(g, 7.4, 7.4, 11.2);
  teil(g, pyramide(8.6, 4.4), matDach(dach), 0, 11.5 + 2.2, 0);
  for (const [x, z, ry] of [[0, 1.9, 0], [0, -1.9, Math.PI], [1.9, 0, Math.PI / 2], [-1.9, 0, -Math.PI / 2]] as [number, number, number][]) { const lk = new THREE.Group(); lk.position.set(x, 12.9, z); lk.rotation.y = ry; g.add(lk); teil(lk, new THREE.BoxGeometry(0.8, 0.8, 0.8), matStein(), 0, 0, 0.5); teil(lk, pyramide(1.2, 0.8), matDach(dach), 0, 0.8, 0.5); teil(lk, new THREE.BoxGeometry(0.35, 0.5, 0.06), matFenster(), 0, 0, 0.92, false); }
  if (stufe < 2) { teil(g, new THREE.CylinderGeometry(0.08, 0.08, 4, 8), matHolz(), 0, 16.5, 0, false); teil(g, new THREE.PlaneGeometry(1.8, 1), matFahne(), 0.9, 18, 0, false); }
  else { teil(g, new THREE.CylinderGeometry(0.12, 0.12, 4, 8), matGold(), 0, 16.5, 0, false); const k = teil(g, new THREE.OctahedronGeometry(1, 0), matKristall(), 0, 19.4, 0, false); k.scale.set(0.9, 1.7, 0.9); }
  if (stufe >= 3) for (const [x, z] of [[-4.5, 0], [4.5, 0]]) rundturm(g, x, z, 7.5, 1.1, dach);
  if (stufe >= 4) { // Ringmauer (±6,2 Blöcke) mit Zinnen, Tor in der Vorderseite und Eckwehrtürmen
    const R = 6.8, H = 2.8, seg: number[][] = [[2 * R, 0.9, 0, -R], [0.9, 2 * R, -R, 0], [0.9, 2 * R, R, 0], [R - 1.4, 0.9, -(R + 1.4) / 2, R], [R - 1.4, 0.9, (R + 1.4) / 2, R]];
    for (const [bx, bz, x, z] of seg) { teil(g, quader(bx, H, bz), matStein(), x, H / 2, z); const z2 = new THREE.Group(); zinnen(z2, bx, bz, H, 0.35); z2.position.set(x, 0, z); g.add(z2); }
    for (const [x, z] of [[-R, -R], [R, -R], [-R, R], [R, R]]) rundturm(g, x, z, 4.8, 1.0, dach, false);
  }
  if (stufe >= 6) for (const [x, z] of [[-4.5, -4.5], [4.5, 4.5]]) { const k = teil(g, new THREE.OctahedronGeometry(0.7, 0), matKristall(), x, 16.2, z, false); k.scale.y = 1.6; }
  return g;
}
