import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
const TEX: { stein?: THREE.Texture; holz?: THREE.Texture; schindel?: THREE.Texture; putz?: THREE.Texture; mat?: Record<string, THREE.Material> } = {};
/** Rauer Bruchstein: unregelmäßige, verschieden große Steine in grob versetzten Lagen, dunkler Mörtel, Schmutzstreifen, Moos, Flechten */
function steinTex(): THREE.Texture {
  return TEX.stein ??= leinwand(512, (c, n) => {
    c.fillStyle = '#26231f'; c.fillRect(0, 0, n, n);
    let y = 0, reihe = 0;
    while (y < n) {
      const h = 32 + rauschZahl(reihe, 1, 11) * 50; let x = -rauschZahl(reihe, 2, 11) * 70, i = 0;
      while (x < n) {
        const b = 40 + rauschZahl(reihe, i + 3, 12) * 90, g = 0.5 + rauschZahl(reihe, i, 13) * 0.6, w = (rauschZahl(reihe, i, 14) - 0.5) * 16, k = (rauschZahl(reihe, i, 15) - 0.5) * 22;
        const j = (a: number): number => (rauschZahl(reihe * 7 + i, a, 21) - 0.5) * 11;
        c.fillStyle = `rgb(${Math.round((122 + k) * g + w)},${Math.round(118 * g)},${Math.round((108 - k) * g - w)})`;
        c.beginPath(); c.moveTo(x + 3 + j(1), y + 3 + j(2)); c.lineTo(x + b * 0.5 + j(3), y + 1 + j(4)); c.lineTo(x + b - 3 + j(5), y + 3 + j(6)); c.lineTo(x + b - 1 + j(7), y + h * 0.5 + j(8));
        c.lineTo(x + b - 3 + j(9), y + h - 3 + j(10)); c.lineTo(x + b * 0.5 + j(11), y + h - 1 + j(12)); c.lineTo(x + 3 + j(13), y + h - 3 + j(14)); c.lineTo(x + 1 + j(15), y + h * 0.5 + j(16)); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,244,228,0.10)'; c.fillRect(x + 5, y + 4, b - 10, 3); c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + 5, y + h - 7, b - 10, 4);
        for (let m = 0; m < 6; m++) { c.fillStyle = `rgba(${rauschZahl(i, m, 16) > 0.5 ? '255,250,240' : '16,12,10'},${0.05 + rauschZahl(i, m, 17) * 0.12})`; c.beginPath(); c.arc(x + rauschZahl(i + reihe, m, 18) * b, y + rauschZahl(i, m + reihe, 19) * h, 4 + rauschZahl(i, m, 20) * 13, 0, 6.3); c.fill(); }
        x += b; i++;
      }
      y += h; reihe++;
    }
    koernung(c, n, 20000, 0.22, 1);
    for (let i = 0; i < 30; i++) { const x = rauschZahl(i, 1, 30) * n, y2 = rauschZahl(i, 2, 30) * n * 0.7, l = 60 + rauschZahl(i, 3, 30) * 200, gr = c.createLinearGradient(0, y2, 0, y2 + l); gr.addColorStop(0, 'rgba(12,10,8,0)'); gr.addColorStop(0.25, `rgba(12,10,8,${0.12 + rauschZahl(i, 4, 30) * 0.2})`); gr.addColorStop(1, 'rgba(12,10,8,0)'); c.fillStyle = gr; c.fillRect(x, y2, 3 + rauschZahl(i, 5, 30) * 12, l); }
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${rauschZahl(i, 6, 31) > 0.4 ? '66,92,40' : '90,110,52'},${0.12 + rauschZahl(i, 7, 31) * 0.3})`; c.beginPath(); c.arc(rauschZahl(i, 7, 32) * n, rauschZahl(i, 8, 32) * n, 5 + rauschZahl(i, 4, 32) * 24, 0, 6.3); c.fill(); }
    for (let i = 0; i < 90; i++) { c.fillStyle = rauschZahl(i, 1, 33) > 0.5 ? `rgba(200,190,100,${0.2 + rauschZahl(i, 2, 33) * 0.3})` : `rgba(180,190,150,${0.2 + rauschZahl(i, 2, 33) * 0.3})`; c.beginPath(); c.arc(rauschZahl(i, 3, 33) * n, rauschZahl(i, 4, 33) * n, 2 + rauschZahl(i, 5, 33) * 5, 0, 6.3); c.fill(); }
    for (let i = 0; i < 16; i++) { const x = rauschZahl(i, 1, 34) * n, y2 = rauschZahl(i, 2, 34) * n, r = 20 + rauschZahl(i, 3, 34) * 50, g = c.createRadialGradient(x, y2, 0, x, y2, r); g.addColorStop(0, 'rgba(30,24,18,0.22)'); g.addColorStop(1, 'rgba(30,24,18,0)'); c.fillStyle = g; c.fillRect(x - r, y2 - r, 2 * r, 2 * r); }
  }, 1);
}
/** Schmutziger Kalkputz für Fachwerkfelder */
function putzTex(): THREE.Texture {
  return TEX.putz ??= leinwand(512, (c, n) => {
    c.fillStyle = '#8c8372'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 90; i++) { const x = rauschZahl(i, 1, 40) * n, y = rauschZahl(i, 2, 40) * n, r = 18 + rauschZahl(i, 3, 40) * 60, g = c.createRadialGradient(x, y, 0, x, y, r), k = rauschZahl(i, 4, 40) > 0.5 ? '70,58,42' : '210,200,180'; g.addColorStop(0, `rgba(${k},${0.08 + rauschZahl(i, 5, 40) * 0.16})`); g.addColorStop(1, `rgba(${k},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let i = 0; i < 18; i++) { let x = rauschZahl(i, 1, 41) * n, y = rauschZahl(i, 2, 41) * n, a = rauschZahl(i, 3, 41) * 6.28; c.strokeStyle = 'rgba(30,24,18,0.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 8; k++) { a += (rauschZahl(i, k, 42) - 0.5) * 1.4; x += Math.cos(a) * 10; y += Math.sin(a) * 10; c.lineTo(x, y); } c.stroke(); }
    for (let i = 0; i < 4; i++) { const x = rauschZahl(i, 1, 43) * (n - 100), y = rauschZahl(i, 2, 43) * (n - 80); c.fillStyle = '#6c665c'; c.beginPath(); c.roundRect(x, y, 50 + rauschZahl(i, 3, 43) * 60, 36 + rauschZahl(i, 4, 43) * 40, 10); c.fill(); } // abgeplatzt: Bruchstein darunter
    koernung(c, n, 12000, 0.18, 4);
    for (let i = 0; i < 22; i++) { const x = rauschZahl(i, 1, 44) * n, y = rauschZahl(i, 2, 44) * n * 0.7, l = 60 + rauschZahl(i, 3, 44) * 180, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(25,20,14,0)'); gr.addColorStop(0.3, 'rgba(25,20,14,0.22)'); gr.addColorStop(1, 'rgba(25,20,14,0)'); c.fillStyle = gr; c.fillRect(x, y, 3 + rauschZahl(i, 4, 44) * 10, l); }
  });
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
    for (let r = 0; r < reihen; r++) for (let x = -b; x < n + b; x += b) { const v = 0.55 + rauschZahl(r, x, 8) * 0.6, w = x + (r % 2) * b / 2;
      c.fillStyle = farbe; c.globalAlpha = Math.min(1, v); c.fillRect(w + 1, r * h, b - 2, h - 1); c.globalAlpha = 1;
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(w + 1, r * h + h - 4, b - 2, 3); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(w + 1, r * h, b - 2, 2); }
    koernung(c, n, 2500, 0.1, 6);
    for (let i = 0; i < 50; i++) { c.fillStyle = `rgba(70,96,46,${0.08 + rauschZahl(i, 1, 9) * 0.22})`; c.beginPath(); c.arc(rauschZahl(i, 2, 9) * n, rauschZahl(i, 3, 9) * n, 3 + rauschZahl(i, 4, 9) * 14, 0, 6.3); c.fill(); }
    for (let i = 0; i < 24; i++) { const x = rauschZahl(i, 5, 9) * n, y = rauschZahl(i, 6, 9) * n * 0.6, gr = c.createLinearGradient(0, y, 0, y + 90); gr.addColorStop(0, 'rgba(8,8,10,0)'); gr.addColorStop(0.3, 'rgba(8,8,10,0.28)'); gr.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = gr; c.fillRect(x, y, 3 + rauschZahl(i, 7, 9) * 8, 90); }
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
  for (let i = 0; i < n; i++) { const x = -bx / 2 + (i + 0.5) * bx / n; for (const s of [-1, 1]) { const hh = 0.7 + hz(i, bx + s) * 0.35; teil(g, quader(0.6 + hz(i, s) * 0.2, hh, 0.6), matStein(), x + (hz(i, 5) - 0.5) * 0.2, y + hh / 2, s * (bz / 2 - rand / 2)); } }
  for (let i = 1; i < m - 1; i++) { const z = -bz / 2 + (i + 0.5) * bz / m; for (const s of [-1, 1]) { const hh = 0.7 + hz(i, bz + s) * 0.35; teil(g, quader(0.6, hh, 0.6 + hz(i, s + 2) * 0.2), matStein(), s * (bx / 2 - rand / 2), y + hh / 2, z + (hz(i, 6) - 0.5) * 0.2); } }
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

// ---------- Burg im Stil des Konzeptbilds: rauer Bruchstein, Fachwerk, steile Schieferdächer, Kristalle in den Mauern ----------
const matPutz = () => stoff('putz', () => FABRIK.licht({ map: putzTex(), roughness: 0.95, metalness: 0 }, 1.2));
const matHolzD = () => stoff('holzd', () => FABRIK.licht({ map: holzTex(), color: '#7d6a5a', roughness: 0.9, metalness: 0 }, 1.2));
const matSteinMoos = () => stoff('steinmoos', () => { const t = steinTex().clone(); t.needsUpdate = true; return FABRIK.licht({ map: t, color: '#8fa078', roughness: 0.97, metalness: 0 }, 1.2); });
const matSteinHell = () => stoff('steinhell', () => FABRIK.licht({ map: steinTex(), color: '#cfc6b8', roughness: 0.92, metalness: 0 }, 1.2));
function dachUV(geo: THREE.BufferGeometry): THREE.BufferGeometry { const p = geo.getAttribute('position'), uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) / 2.4; uv[2 * i + 1] = p.getZ(i) / 2.4; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; }
function kristall(g: THREE.Group, x: number, y: number, z: number, rx: number, rz: number, s: number): void {
  for (const [dx, dz, k, a, b] of [[0, 0, 1, 0, 0], [0.32 * s, 0.1 * s, 0.62, 0.35, -0.3], [-0.25 * s, -0.14 * s, 0.5, -0.4, 0.4]]) {
    const m = teil(g, new THREE.OctahedronGeometry(1, 0), matKristall(), x + dx, y, z + dz, false); m.scale.set(0.28 * s * k, 1.0 * s * k, 0.28 * s * k); m.rotation.set(rx + a, 0, rz + b); }
}
/** Satteldach: First entlang x (lokal), Spannweite span in z; ry dreht um y. Giebeldreiecke in Fachwerk an den Enden (nur wenn giebel) */
function satteldach(g: THREE.Group, x: number, y: number, z: number, len: number, span: number, h: number, ry: number, dach: string, giebel = true): THREE.Group {
  const r = new THREE.Group(); r.position.set(x, y, z); r.rotation.y = ry; g.add(r);
  const halb = span / 2 + 0.45, schraeg = Math.hypot(halb, h + 0.25), w = Math.atan2(h + 0.25, halb);
  for (const sg of [-1, 1]) { const m = teil(r, dachUV(new THREE.BoxGeometry(len + 0.9, 0.24, schraeg)), matDach(dach), 0, (h - 0.25) / 2 + 0.06, sg * halb / 2); m.rotation.x = sg * w; }
  teil(r, new THREE.BoxGeometry(len + 0.95, 0.22, 0.4), matDach(dach), 0, h + 0.1, 0);
  if (giebel) for (const sg of [-1, 1]) {
    const f = new THREE.Group(); f.position.set(sg * len / 2, 0, 0); f.rotation.y = sg * Math.PI / 2; r.add(f);
    const tri = new THREE.Shape(); tri.moveTo(-span / 2, 0); tri.lineTo(span / 2, 0); tri.lineTo(0, h); tri.lineTo(-span / 2, 0); teil(f, new THREE.ShapeGeometry(tri), matPutz(), 0, 0, 0.0, true);
    const bw = 0.17, dl = Math.hypot(span / 2, h);
    teil(f, new THREE.BoxGeometry(bw, h, 0.16), matHolzD(), 0, h / 2, 0.06); teil(f, new THREE.BoxGeometry(span, bw, 0.16), matHolzD(), 0, 0.1, 0.06); teil(f, new THREE.BoxGeometry(span * 0.62, bw, 0.16), matHolzD(), 0, h * 0.38, 0.06);
    for (const q of [-1, 1]) { const d = teil(f, new THREE.BoxGeometry(bw, dl - 0.2, 0.16), matHolzD(), q * span / 4 * 0.96, h / 2 - 0.05, 0.06); d.rotation.z = q * Math.atan2(span / 2, h); }
    for (const q of [-1, 1]) { const d = teil(f, new THREE.BoxGeometry(bw * 0.8, 0.9, 0.14), matHolzD(), q * span * 0.2, h * 0.22, 0.06); d.rotation.z = q * 0.6; }
    if (h > 2) { teil(f, new THREE.BoxGeometry(0.5, 0.8, 0.06), matFenster(), 0, h * 0.5, 0.09, false); teil(f, new THREE.BoxGeometry(0.62, 0.9, 0.1), matHolzD(), 0, h * 0.5, 0.04); teil(f, new THREE.BoxGeometry(0.5, 0.8, 0.06), matFenster(), 0, h * 0.5, 0.115, false); }
  }
  return r;
}
/** Fachwerkfeld (Wand im lokalen System, Blick +z): Putz, Pfosten, Riegel, Streben, Fenster in jedem zweiten Feld */
function fachwerk(f: THREE.Group, w: number, h: number, fensterY: number[] = [], zufall = 0): void {
  teil(f, new THREE.BoxGeometry(w, h, 0.08), matPutz(), 0, h / 2, 0, true);
  const nc = Math.max(1, Math.round(w / 2.1)), cw = w / nc, bw = 0.18;
  for (let i = 0; i <= nc; i++) teil(f, quader(bw, h, 0.17), matHolzD(), -w / 2 + i * cw, h / 2, 0.03);
  for (const yy of h > 3.2 ? [0.1, h / 2, h - 0.1] : [0.1, h - 0.1]) teil(f, quader(w, 0.2, 0.17), matHolzD(), 0, yy, 0.03);
  for (let c = 0; c < nc; c++) {
    const cx = -w / 2 + (c + 0.5) * cw;
    if (fensterY.length && (c + zufall) % 2 === 0) for (const yy of fensterY) {
      teil(f, new THREE.BoxGeometry(cw * 0.42, 1.0, 0.04), matFenster(), cx, yy, 0.1, false);
      for (const [bx, by, bw2, bh] of [[0, 0.52, cw * 0.48, 0.1], [0, -0.52, cw * 0.52, 0.12], [-cw * 0.23, 0, 0.1, 1.1], [cw * 0.23, 0, 0.1, 1.1], [0, 0, 0.05, 1.0], [0, 0.05, cw * 0.42, 0.05]] as number[][]) teil(f, quader(bw2, bh, 0.12), matHolzD(), cx + bx, yy + by, 0.1);
    } else { const len = Math.hypot(cw - bw, h - 0.4), d = teil(f, new THREE.BoxGeometry(0.15, len, 0.15), matHolzD(), cx, h / 2, 0.03); d.rotation.z = ((c + zufall) % 2 ? -1 : 1) * Math.atan2(cw - bw, h - 0.4); }
  }
}
/** Auskragendes Obergeschoss in Fachwerk (vier Wände, Unterzug und Konsolen) */
function obergeschoss(g: THREE.Group, x: number, y0: number, z: number, w: number, d: number, h: number, fensterY: number[] = []): void {
  teil(g, quader(w - 0.3, h, d - 0.3), matPutz(), x, y0 + h / 2, z);
  for (const [dx, dz, ry, bw, zu] of [[0, d / 2, 0, w, 0], [0, -d / 2, Math.PI, w, 1], [w / 2, 0, Math.PI / 2, d, 0], [-w / 2, 0, -Math.PI / 2, d, 1]] as number[][]) { const f = new THREE.Group(); f.position.set(x + dx, y0, z + dz); f.rotation.y = ry; g.add(f); fachwerk(f, bw, h, fensterY, zu); }
  teil(g, quader(w + 0.2, 0.3, d + 0.2), matHolzD(), x, y0 - 0.15, z);
  for (let i = 0; i < Math.round(w / 1.3); i++) { const px = x - w / 2 + (i + 0.5) * w / Math.round(w / 1.3); for (const sg of [-1, 1]) { teil(g, quader(0.28, 0.35, 0.7), matHolzD(), px, y0 - 0.5, z + sg * (d / 2 - 0.05)); } }
  for (let i = 0; i < Math.round(d / 1.3); i++) { const pz = z - d / 2 + (i + 0.5) * d / Math.round(d / 1.3); for (const sg of [-1, 1]) teil(g, quader(0.7, 0.35, 0.28), matHolzD(), x + sg * (w / 2 - 0.05), y0 - 0.5, pz); }
}
/** Mauerklotz aus rauem Stein mit bemoosem Fuß, helleren Eckquadern und unregelmäßig vorspringenden Steinen */
function bruchstein(g: THREE.Group, x: number, z: number, w: number, d: number, y0: number, h: number, seed = 0): void {
  teil(g, quader(w, h, d), matStein(), x, y0 + h / 2, z);
  teil(g, quader(w + 0.22, Math.min(1.1, h * 0.3), d + 0.22), matSteinMoos(), x, y0 + Math.min(1.1, h * 0.3) / 2, z);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let i = 0; i * 0.62 < h - 0.4; i++) { const l = i % 2 ? 0.62 : 0.4, t = i % 2 ? 0.4 : 0.62; teil(g, quader(l + hz(i, seed) * 0.15, 0.48 + hz(i, seed + 1) * 0.1, t + hz(sx, i + seed) * 0.15), matSteinHell(), x + sx * (w / 2 - 0.1), y0 + 0.4 + i * 0.62, z + sz * (d / 2 - 0.1)); }
  for (let i = 0; i < Math.round(w * d / 9 + h / 2); i++) { const face = Math.floor(hz(i, seed + 3) * 4), u = (hz(i, seed + 4) - 0.5) * (face % 2 ? d : w) * 0.8, yy = y0 + 0.7 + hz(i, seed + 5) * (h - 1.4); const bx = 0.4 + hz(i, seed + 6) * 0.4, by = 0.28 + hz(i, seed + 7) * 0.25;
    if (face === 0) teil(g, quader(bx, by, 0.2), matSteinHell(), x + u, yy, z + d / 2 + 0.02); else if (face === 1) teil(g, quader(bx, by, 0.2), matSteinHell(), x + u, yy, z - d / 2 - 0.02); else if (face === 2) teil(g, quader(0.2, by, bx), matSteinHell(), x + w / 2 + 0.02, yy, z + u); else teil(g, quader(0.2, by, bx), matSteinHell(), x - w / 2 - 0.02, yy, z + u); }
}
/** Alle Teile je Material (und Schattenwurf) zu wenigen Netzen verschmelzen: eine Burg = ein paar Zeichenaufrufe */
function verschmelzen(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const gruppen = new Map<string, { mat: THREE.Material; wirft: boolean; geos: THREE.BufferGeometry[] }>();
  g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; let geo = m.geometry.clone(); if (geo.index) geo = geo.toNonIndexed(); geo.applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2)); geo.clearGroups();
    const key = (m.material as THREE.Material).uuid + (m.castShadow ? 'a' : 'n'); const e = gruppen.get(key) ?? gruppen.set(key, { mat: m.material as THREE.Material, wirft: m.castShadow, geos: [] }).get(key)!; e.geos.push(geo); });
  const aus = new THREE.Group();
  for (const e of gruppen.values()) { const geo = mergeGeometries(e.geos, false); if (!geo) continue; const m = new THREE.Mesh(geo, e.mat); m.castShadow = e.wirft; m.receiveShadow = true; aus.add(m); }
  return aus;
}

/** Burg im Stil des Konzeptbilds, stufe 1–6 wie `burg()` in modelle.ts: Torhalle, Bergfried mit Fachwerk-Obergeschoss und Kreuzdach, Holzturm, Wehrgang mit Rundturm, Kristalle in den Mauern */
export function glatteBurg(stufe: number): THREE.Group {
  const g = new THREE.Group(), dach = stufe >= 5 ? '#8a5a3a' : '#3a4660';
  teil(g, quader(13.2, 0.5, 12.6), matSteinMoos(), 0.1, 0.25, -0.1); teil(g, quader(11.0, 0.4, 11.8), matStein(), -0.4, 0.2, 0.2);
  // Torhalle (vorn links): Bruchsteinhalle, Satteldach, Torhaus mit Rundbogen
  bruchstein(g, -2.25, 1.5, 6.5, 6.0, 0.4, 4.7, 1); satteldach(g, -2.25, 5.1, 1.5, 6.5, 6.0, 3.3, 0, dach);
  for (const [x, ry] of [[-4.85, 0], [0.35, 0]] as number[][]) fenster(g, x, 2.5, 4.5, ry, 0.5, 1.2, hz(x, 1) > 0.4);
  for (const z of [0.4, 2.8]) fenster(g, -5.5, 2.6, z, -Math.PI / 2, 0.5, 1.2, z > 1);
  { const tg = new THREE.Group(); tg.position.set(-2.25, 0, 0); g.add(tg); torhaus(tg, 4.5); }
  // Dachgauben der Halle
  for (const x of [-4.2, -0.3]) { const zl = 1.5 + 1.3; teil(g, quader(1.5, 1.3, 1.1), matPutz(), x - 0, 5.1 + 1.3 * 0.9 + 0.35, zl + 0.2); teil(g, new THREE.BoxGeometry(0.6, 0.8, 0.06), matFenster(), x, 5.1 + 1.7, zl + 0.78, false); teil(g, new THREE.BoxGeometry(0.75, 0.95, 0.1), matHolzD(), x, 5.1 + 1.7, zl + 0.73);
    const r = satteldach(g, x, 5.1 + 2.5, zl + 0.2, 1.5, 1.5, 0.9, Math.PI / 2, dach, false); void r; }
  // Bergfried (hinten rechts): rauer Stein, Fachwerk-Obergeschoss, Kreuzdach, Eckspitzen, Schornstein
  bruchstein(g, 3.0, -1.5, 6.4, 6.4, 0.4, 7.9, 3);
  for (const x of [2.0, 4.7]) for (const y of [3.6, 6.3]) fenster(g, x, y, 1.7, 0, 0.5, 1.2, hz(x, y) > 0.5);
  for (const z of [-3.3, -0.6]) for (const y of [3.6, 6.3]) fenster(g, 6.2, y, z, Math.PI / 2, 0.5, 1.2, hz(z, y) > 0.5);
  for (const x of [1.0, 4.6]) fenster(g, x, 4.2, -4.7, Math.PI, 0.5, 1.2, true);
  scharte(g, 3.4, 5.6, 1.72, 0);
  obergeschoss(g, 3.0, 8.3, -1.5, 7.4, 7.4, 3.2, [1.8]);
  satteldach(g, 3.0, 11.5, -1.5, 7.4, 7.4, 4.8, 0, dach); satteldach(g, 3.0, 11.5, -1.5, 7.4, 7.4, 4.8, Math.PI / 2, dach);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = 3.0 + sx * 3.7, pz = -1.5 + sz * 3.7; teil(g, new THREE.CylinderGeometry(0.62, 0.7, 3.8, 14), matStein(), px, 8.3 + 1.7, pz); teil(g, kegel(0.95, 3.6, 14), matDach(dach), px, 8.3 + 3.6 + 1.8, pz); teil(g, new THREE.SphereGeometry(0.16, 8, 6), matGold(), px, 8.3 + 3.6 + 3.7, pz, false); }
  teil(g, quader(1.1, 5.2, 1.1), matStein(), 5.4, 11.6, -3.2); teil(g, quader(1.4, 0.3, 1.4), matStein(), 5.4, 16.6, -3.2); teil(g, quader(1.0, 0.05, 1.0), matSchatten(), 5.4, 16.92, -3.2, false);
  kristall(g, 6.3, 5.0, -1.5, 0, -1.15, 1.1); kristall(g, 1.2, 7.2, 1.75, 1.2, 0, 0.9); kristall(g, -0.15, 3.4, -2.6, 0, 1.1, 0.8); kristall(g, 3.0, 15.4, -1.5, 0, 0, 1.2); kristall(g, -1.2, 5.3, 4.2, 0.5, 0.3, 0.8);
  // Holzturm (hinten links): Bruchsteinfuß, hohes Fachwerk, auskragende Spitze mit steilem Pyramidendach
  bruchstein(g, -4.4, -3.2, 3.4, 3.4, 0.4, 2.1, 5); obergeschoss(g, -4.4, 2.5, -3.2, 3.2, 3.2, 5.8, [4.2]); obergeschoss(g, -4.4, 8.5, -3.2, 3.9, 3.9, 1.9, [9.4]);
  teil(g, pyramide(5.2, 4.2), matDach(dach), -4.4, 10.4 + 2.1, -3.2); teil(g, new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), matGold(), -4.4, 15.4, -3.2, false); kristall(g, -4.4, 15.7, -3.2, 0, 0, 0.55);
  // Wehrgang rechts vorn mit Rundturm
  bruchstein(g, 3.9, 4.0, 5.2, 1.3, 0.4, 3.3, 7); const zk = new THREE.Group(); zk.position.set(3.9, 3.7, 4.0); g.add(zk); zinnen(zk, 5.2, 1.3, 0, 0.45);
  fenster(g, 3.0, 2.5, 4.67, 0, 0.45, 1.0, false); scharte(g, 5.2, 2.2, 4.67, 0);
  rundturm(g, 6.2, 4.0, 6.4, 1.3, dach); kristall(g, 7.4, 1.1, 5.0, 0.2, -0.9, 0.9);
  if (stufe < 2) { teil(g, new THREE.CylinderGeometry(0.08, 0.08, 4, 8), matHolz(), 3.0, 17.9, -1.5, false); teil(g, new THREE.PlaneGeometry(1.8, 1), matFahne(), 3.9, 19.4, -1.5, false); }
  else { teil(g, new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), matGold(), 3.0, 17.2, -1.5, false); const k = teil(g, new THREE.OctahedronGeometry(1, 0), matKristall(), 3.0, 19.8, -1.5, false); k.scale.set(0.7, 1.7, 0.7); }
  if (stufe >= 3) { rundturm(g, -5.7, 4.6, 6.2, 1.05, dach); rundturm(g, 6.0, -4.6, 7.4, 1.2, dach); }
  if (stufe >= 4) { // Ringmauer mit Torlücke vor dem Torhaus, Eckwehrtürme
    const R = 7.0, H = 2.8, L = R - 3.45, Rr = R + 1.05, seg: number[][] = [[2 * R, 0.9, 0, -R], [0.9, 2 * R, -R, 0], [0.9, 2 * R, R, 0], [L, 0.9, -(R + 3.45) / 2, R], [Rr, 0.9, (R - 1.05) / 2, R]];
    for (const [bx, bz, x, z] of seg) { teil(g, quader(bx, H, bz), matStein(), x, H / 2, z); teil(g, quader(bx + 0.1, Math.min(0.9, H), bz + 0.1), matSteinMoos(), x, 0.45, z); const z2 = new THREE.Group(); zinnen(z2, bx, bz, H, 0.3); z2.position.set(x, 0, z); g.add(z2); }
    for (const [x, z] of [[-R, -R], [R, -R], [-R, R], [R, R]]) rundturm(g, x, z, 4.9, 1.0, dach, false);
  }
  if (stufe >= 6) for (const [x, z] of [[-4.4, -3.2], [6.2, 4.0]]) kristall(g, x, 8.6, z, 0, 0, 1.0);
  return verschmelzen(g);
}
