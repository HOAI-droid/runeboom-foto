import * as THREE from 'three';

/**
 * Prozedurale Texturen im „Foto-Look“, einmal auf der Seite gemalt (Leinwand) und nahtlos wiederholbar.
 * Alle sind Grauwerte mit viel feiner Struktur; die Farbe kommt aus den Vertexfarben, so bleiben Flecken, Jahreszeiten
 * und Völkerfarben erhalten und es braucht keine eigenen Shader (läuft bei WebGL und WebGPU gleich).
 */
const rz = (x: number, y: number, z: number, s: number): number => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.3) * 43758.5453; return v - Math.floor(v); };

function leinwand(n: number, h = n): [HTMLCanvasElement, CanvasRenderingContext2D] { const cv = document.createElement('canvas'); cv.width = n; cv.height = h; return [cv, cv.getContext('2d')!]; }
function textur(cv: HTMLCanvasElement, wiederholen: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (wiederholen) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
/** Etwas an der Stelle malen und, wenn es über den Rand ragt, auf der Gegenseite wiederholen (nahtlos) */
function nahtlos(n: number, x: number, y: number, r: number, malen: (dx: number, dy: number) => void): void {
  for (const ox of [-n, 0, n]) { if (x + ox < -r || x + ox > n + r) continue; for (const oy of [-n, 0, n]) { if (y + oy < -r || y + oy > n + r) continue; malen(ox, oy); } }
}

let BODEN: THREE.CanvasTexture | null = null;
/** Boden: Flecken in mehreren Größen, Halmstriche, Kiesel, feine Körnung (nahtlos, 512²) */
export function bodenTex(): THREE.CanvasTexture {
  if (BODEN) return BODEN;
  const n = 512, [cv, c] = leinwand(n);
  c.fillStyle = '#b4b4b0'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 1400; i++) { // weiche Flecken (groß und klein)
    const x = rz(i, 1, 0, 81) * n, y = rz(i, 2, 0, 81) * n, r = 5 + Math.pow(rz(i, 3, 0, 81), 2) * 46, hell = rz(i, 4, 0, 81) > 0.5, a = 0.04 + rz(i, 5, 0, 81) * 0.09;
    nahtlos(n, x, y, r, (dx, dy) => { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); const k = hell ? '255,255,250' : '40,40,32'; g.addColorStop(0, `rgba(${k},${a})`); g.addColorStop(1, `rgba(${k},0)`); c.fillStyle = g; c.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r); });
  }
  c.lineCap = 'round';
  for (let i = 0; i < 9000; i++) { // Halme und Wurzelfasern von oben gesehen: kurze, leicht gebogene Striche
    const x = rz(i, 1, 1, 81) * n, y = rz(i, 2, 1, 81) * n, a = rz(i, 3, 1, 81) * 6.283, l = 4 + rz(i, 4, 1, 81) * 12, hell = rz(i, 5, 1, 81) > 0.45, v = hell ? 200 + rz(i, 6, 1, 81) * 55 : 40 + rz(i, 6, 1, 81) * 70;
    nahtlos(n, x, y, l, (dx, dy) => { c.strokeStyle = `rgba(${v},${v},${v * 0.92},${0.18 + rz(i, 7, 1, 81) * 0.3})`; c.lineWidth = 0.7 + rz(i, 8, 1, 81) * 0.9; c.beginPath(); c.moveTo(x + dx, y + dy); c.quadraticCurveTo(x + dx + Math.cos(a + 0.5) * l * 0.5, y + dy + Math.sin(a + 0.5) * l * 0.5, x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); c.stroke(); });
  }
  for (let i = 0; i < 260; i++) { // Kiesel und Steinchen mit Licht und Schatten
    const x = rz(i, 1, 2, 81) * n, y = rz(i, 2, 2, 81) * n, r = 1.4 + rz(i, 3, 2, 81) * 4.2, a = rz(i, 4, 2, 81) * 3.14;
    nahtlos(n, x, y, r + 2, (dx, dy) => { c.fillStyle = 'rgba(20,20,16,0.35)'; c.beginPath(); c.ellipse(x + dx + 1, y + dy + 1.2, r * 1.1, r * 0.8, a, 0, 6.3); c.fill(); c.fillStyle = `rgba(${150 + rz(i, 5, 2, 81) * 90},${150 + rz(i, 5, 2, 81) * 85},${140 + rz(i, 5, 2, 81) * 80},0.85)`; c.beginPath(); c.ellipse(x + dx, y + dy, r, r * 0.75, a, 0, 6.3); c.fill(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x + dx - r * 0.25, y + dy - r * 0.25, r * 0.45, r * 0.3, a, 0, 6.3); c.fill(); });
  }
  const img = c.getImageData(0, 0, n, n), d = img.data; // feine Körnung
  for (let i = 0; i < d.length; i += 4) { const k = (rz(i, 9, 3, 81) - 0.5) * 26; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
  c.putImageData(img, 0, 0);
  return (BODEN = textur(cv, true));
}

let FELS: THREE.CanvasTexture | null = null;
/** Fels: Körnung, Risse, Schichtlinien und Flechtenflecken (nahtlos, 256²) */
export function felsTex(): THREE.CanvasTexture {
  if (FELS) return FELS;
  const n = 256, [cv, c] = leinwand(n);
  c.fillStyle = '#b8b6b0'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 500; i++) { const x = rz(i, 1, 0, 82) * n, y = rz(i, 2, 0, 82) * n, r = 4 + rz(i, 3, 0, 82) * 24, hell = rz(i, 4, 0, 82) > 0.5, a = 0.05 + rz(i, 5, 0, 82) * 0.1;
    nahtlos(n, x, y, r, (dx, dy) => { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); const k = hell ? '255,255,250' : '30,28,26'; g.addColorStop(0, `rgba(${k},${a})`); g.addColorStop(1, `rgba(${k},0)`); c.fillStyle = g; c.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r); }); }
  c.lineCap = 'round';
  for (let i = 0; i < 26; i++) { // Risse: verzweigte dunkle Linien
    let x = rz(i, 1, 1, 82) * n, y = rz(i, 2, 1, 82) * n, a = rz(i, 3, 1, 82) * 6.283; const pts: [number, number][] = [[x, y]];
    for (let k = 0; k < 14; k++) { a += (rz(i, k, 4, 82) - 0.5) * 1.1; x += Math.cos(a) * 7; y += Math.sin(a) * 7; pts.push([x, y]); }
    nahtlos(n, pts[0][0], pts[0][1], 110, (dx, dy) => { c.strokeStyle = 'rgba(25,22,20,0.5)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(pts[0][0] + dx, pts[0][1] + dy); for (const [px, py] of pts) c.lineTo(px + dx, py + dy); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(pts[0][0] + dx + 1, pts[0][1] + dy + 1); for (const [px, py] of pts) c.lineTo(px + dx + 1, py + dy + 1); c.stroke(); });
  }
  for (let i = 0; i < 40; i++) { const y = rz(i, 1, 5, 82) * n; c.fillStyle = `rgba(${rz(i, 2, 5, 82) > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rz(i, 3, 5, 82) * 0.07})`; c.fillRect(0, y, n, 1 + rz(i, 4, 5, 82) * 3); } // Schichtung
  for (let i = 0; i < 90; i++) { const x = rz(i, 1, 6, 82) * n, y = rz(i, 2, 6, 82) * n, r = 2 + rz(i, 3, 6, 82) * 7; nahtlos(n, x, y, r, (dx, dy) => { c.fillStyle = `rgba(200,205,150,${0.12 + rz(i, 4, 6, 82) * 0.2})`; c.beginPath(); c.arc(x + dx, y + dy, r, 0, 6.3); c.fill(); }); } // Flechten
  const img = c.getImageData(0, 0, n, n), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = (rz(i, 9, 3, 82) - 0.5) * 34; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
  c.putImageData(img, 0, 0);
  return (FELS = textur(cv, true));
}

let GRAS: THREE.CanvasTexture | null = null;
/** Grasbüschel: viele gebogene, spitz zulaufende Halme mit Verlauf, Alpha-Schnitt; rechts ein deckender Streifen (für Blütenköpfe, Stiele) */
export function grasTex(): THREE.CanvasTexture {
  if (GRAS) return GRAS;
  const w = 128, h = 256, [cv, c] = leinwand(w, h);
  for (let i = 0; i < 46; i++) {
    const x0 = 56 + (rz(i, 1, 0, 83) - 0.5) * 70, len = 90 + rz(i, 2, 0, 83) * 150, bieg = (rz(i, 3, 0, 83) - 0.5) * 80, breit = 2.6 + rz(i, 4, 0, 83) * 3.4, v = 120 + rz(i, 5, 0, 83) * 135;
    const x1 = x0 + bieg, y1 = h - 4 - len, xm = x0 + bieg * 0.35, ym = h - 4 - len * 0.55;
    const g = c.createLinearGradient(0, h, 0, y1); g.addColorStop(0, `rgb(${v * 0.4 | 0},${v * 0.45 | 0},${v * 0.36 | 0})`); g.addColorStop(0.5, `rgb(${v * 0.85 | 0},${v * 0.9 | 0},${v * 0.7 | 0})`); g.addColorStop(1, `rgb(${Math.min(255, v * 1.12) | 0},${Math.min(255, v * 1.1) | 0},${v * 0.9 | 0})`);
    c.fillStyle = g; c.beginPath(); c.moveTo(x0 - breit, h); c.quadraticCurveTo(xm - breit * 0.7, ym, x1, y1); c.quadraticCurveTo(xm + breit * 0.7, ym, x0 + breit, h); c.fill();
  }
  c.fillStyle = '#ffffff'; c.fillRect(w - 10, 0, 10, h);
  return (GRAS = textur(cv, false));
}
