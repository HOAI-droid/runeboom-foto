import { CH, WR, bodenHoehe, eckeHoehe, fbm, seed, pfadRand, pfadMitte, WASSER_Y, LAVA_Y, type Spalte } from '@runeboom/core';
import { lin, srgbLin } from './voxel.ts';

/**
 * Glattes Gelände im „Foto-Look“: statt Blöcken ein Höhennetz mit weichen Hängen, Vertexfarben mit Flecken,
 * Fels an steilen Hängen und feuchtem Ufer. Wird im Hintergrund-Rechner gebaut (nur Zahlenfelder).
 * Höhen kommen aus `bodenHoehe()` (core/welt.ts), damit Bäume, Felsen und Figuren genau auf dem Boden stehen.
 */
export interface BodenNetz { p: Float32Array; n: Float32Array; c: Float32Array; i: Uint32Array; uv: Float32Array }

const klemme = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const glatt = (a: number, b: number, t: number) => { const u = klemme((t - a) / (b - a)); return u * u * (3 - 2 * u); };
const ERDWEG = lin('#a68a5c'), WEGDUNKEL = lin('#6a5638'), RANDERDE = lin('#4a3c26'), FELS = lin('#857d70'), FELS_DUNKEL = lin('#5a544b'), ERDE = lin('#6f5a3c'), SAND = lin('#8d8466'), SCHLAMM = lin('#4f4d35'), RAND = lin('#5d5750');

/** Normale des glatten Geländes (Mittelpunktsdifferenzen, über Kachelgrenzen hinweg gleich) */
export function bodenNormale(x: number, z: number, e = 0.5): [number, number, number] {
  const dx = bodenHoehe(x - e, z) - bodenHoehe(x + e, z), dz = bodenHoehe(x, z - e) - bodenHoehe(x, z + e), l = Math.hypot(dx, 2 * e, dz);
  return [dx / l, 2 * e / l, dz / l];
}

/**
 * Farbe an einer Stelle: Mittel der Spalten ringsum (an Spaltenecken vier, an Kanten zwei, in der Mitte eine),
 * dazu Flecken (groß: warm/kühl, klein: hell/dunkel), Fels an Steilhängen, Sand und Schlamm am Wasser.
 */
function farbeAn(wx: number, wz: number, hv: number, ny: number, S: (x: number, z: number) => Spalte | null, sd: number): number[] {
  const fx = wx - Math.floor(wx), fz = wz - Math.floor(wz);
  const xs = fx === 0 ? [wx - 1, wx] : [Math.floor(wx)], zs = fz === 0 ? [wz - 1, wz] : [Math.floor(wz)];
  let r = 0, g = 0, b = 0, n = 0, art = '';
  for (const x of xs) for (const z of zs) { const s = S(x, z); if (!s) continue; const c = lin(s.col); r += c[0]; g += c[1]; b += c[2]; n++; art = s.a; }
  if (!n) return RAND;
  r /= n; g /= n; b /= n;
  const m1 = fbm(wx, wz, 0.55, sd + 31), m2 = fbm(wx, wz, 0.06, sd + 32), m3 = fbm(wx, wz, 0.18, sd + 33);
  const grau = art === 'asche' || art === 'schnee' || art === 'l';
  if (art === 'gras') {
    { const l = r * 0.2126 + g * 0.7152 + b * 0.0722; r = (r + (l - r) * 0.3) * 0.9; g = (g + (l - g) * 0.3) * 0.88; b = (b + (l - b) * 0.3) * 0.8; } // etwas gedeckter und wärmer, wie echtes Gras
    const warm = (m2 - 0.5) * 2.2; // große Flecken: sonnengelbes Gras gegen dunkles, kühles
    r *= 1 + warm * 0.55; g *= 1 + warm * 0.16; b *= 1 - warm * 0.35;
    const erde = glatt(0.62, 0.78, m3); // kahle Stellen
    r += (ERDE[0] - r) * erde * 0.55; g += (ERDE[1] - g) * erde * 0.55; b += (ERDE[2] - b) * erde * 0.55;
  }
  const hell = (grau ? 0.88 : 0.8) + (grau ? 0.22 : 0.4) * m1;
  r *= hell; g *= hell; b *= hell;
  // Steilhänge zeigen Fels (nur dort, wo kein Schnee liegt)
  const steil = glatt(0.2, 0.46, 1 - ny) * (art === 'schnee' ? 0.25 : 1);
  if (steil > 0) { const k = FELS_DUNKEL, f = FELS, t = glatt(0.3, 0.7, m1); const fr = k[0] + (f[0] - k[0]) * t, fg = k[1] + (f[1] - k[1]) * t, fb = k[2] + (f[2] - k[2]) * t; r += (fr - r) * steil * 0.75; g += (fg - g) * steil * 0.75; b += (fb - b) * steil * 0.75; }
  // Ufer: Sand und feuchter Schlamm, wenn ein Becken in der Nähe ist
  if (hv < 6.98 && art !== 'l') {
    let wasser = false; for (let dx = -2; dx <= 2 && !wasser; dx++) for (let dz = -2; dz <= 2; dz++) { const s = S(Math.floor(wx) + dx, Math.floor(wz) + dz); if (s && s.a === 'w') { wasser = true; break; } }
    if (wasser) {
      const nass = glatt(6.9, 6.4, hv), sand = glatt(6.9, 6.7, hv) * (0.5 + 0.4 * m1) * glatt(0.3, 0.6, m3);
      r += (SAND[0] - r) * sand * 0.8; g += (SAND[1] - g) * sand * 0.8; b += (SAND[2] - b) * sand * 0.8;
      r += (SCHLAMM[0] - r) * nass * 0.6; g += (SCHLAMM[1] - g) * nass * 0.6; b += (SCHLAMM[2] - b) * nass * 0.6;
    }
  }
  return [r, g, b];
}


/** Wand am Inselrand: Kante e0 → e1 (Eckpunktnummern in p), nach außen in Richtung (dx, dz), 24 Blöcke tief */
function randWand(p: Float32Array, e0: number, e1: number, dx: number, dz: number, skp: number[], skn: number[], skc: number[], ski: number[]): void {
  const base = skp.length / 3;
  for (const e of [e0, e1]) { skp.push(p[e * 3], p[e * 3 + 1], p[e * 3 + 2]); skn.push(dx, 0, dz); skc.push(RAND[0], RAND[1], RAND[2]); }
  for (const e of [e0, e1]) { skp.push(p[e * 3], p[e * 3 + 1] - 24, p[e * 3 + 2]); skn.push(dx, 0, dz); skc.push(RAND[0] * 0.5, RAND[1] * 0.5, RAND[2] * 0.5); }
  if (dx === 1 || dz === -1) ski.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); else ski.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

/** Boden einer Kachel. fein: 2 × 2 Eckpunkte je Block mit feinem Farbrauschen und leichten Unebenheiten, sonst 1 × 1. */
export function bodenNetz(cx: number, cz: number, fein: boolean, S: (x: number, z: number) => Spalte | null, quellen: number[] = []): BodenNetz {
  const ox = cx * CH, oz = cz * CH, R = fein ? 2 : 1, M = CH * R, V = M + 1, sd = seed();
  const p = new Float32Array(V * V * 3), nn = new Float32Array(V * V * 3), c = new Float32Array(V * V * 3), uvk = new Float32Array(V * V * 2);
  for (let a = 0; a < V; a++) for (let b = 0; b < V; b++) {
    const lx = a / R, lz = b / R, wx = ox + lx, wz = oz + lz;
    let h = bodenHoehe(wx, wz);
    const innen = a > 0 && a < M && b > 0 && b < M;
    if (fein && innen) h += (fbm(wx, wz, 0.9, sd + 41) - 0.5) * 0.16; // kleine Unebenheiten (nie am Kachelrand, dort muss alles passen)
    const nm = bodenNormale(wx, wz), o = (a * V + b) * 3;
    // eingebrannte Verdunkelung: unter Kronen und Felsen, in Mulden (Krümmung der Höhe)
    let occ = 0; for (let q = 0; q < quellen.length; q += 4) { const d = Math.hypot(wx - quellen[q], wz - quellen[q + 1]), r = quellen[q + 2]; if (d < r) { const t = 1 - d / r; occ += quellen[q + 3] * t * t; } }
    const mulde = Math.max(0, (bodenHoehe(wx - 1, wz) + bodenHoehe(wx + 1, wz) + bodenHoehe(wx, wz - 1) + bodenHoehe(wx, wz + 1)) / 4 - bodenHoehe(wx, wz));
    const streu = Math.min(0.7, occ * 1.1), schatten = (1 - Math.min(0.62, occ)) * (1 - Math.min(0.3, mulde * 0.9)), col = farbeAn(wx, wz, h, nm[1], S, sd).map((q, k) => (q + ([0.2, 0.12, 0.055][k] - q) * streu * 0.55) * 1.7 * schatten * (k === 2 ? 1.0 + (1 - schatten) * 0.25 : k === 0 ? 1 - (1 - schatten) * 0.1 : 1));
    uvk[(a * V + b) * 2] = wx / 6; uvk[(a * V + b) * 2 + 1] = wz / 6; p[o] = lx; p[o + 1] = h; p[o + 2] = lz; nn[o] = nm[0]; nn[o + 1] = nm[1]; nn[o + 2] = nm[2]; c[o] = col[0]; c[o + 1] = col[1]; c[o + 2] = col[2];
  }
  const idx: number[] = [], skp: number[] = [], skn: number[] = [], skc: number[] = [], ski: number[] = [];
  const hat = (x: number, z: number) => !!S(x, z);
  for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) {
    const gx = ox + Math.floor(a / R), gz = oz + Math.floor(b / R); if (!hat(gx, gz)) continue;
    const v00 = a * V + b, v10 = (a + 1) * V + b, v01 = a * V + b + 1, v11 = (a + 1) * V + b + 1;
    // Diagonale entlang des kleineren Höhenunterschieds: weniger Knicke an Kämmen
    if (Math.abs(p[v00 * 3 + 1] - p[v11 * 3 + 1]) <= Math.abs(p[v10 * 3 + 1] - p[v01 * 3 + 1])) idx.push(v00, v01, v11, v00, v11, v10); else idx.push(v00, v01, v10, v10, v01, v11);
    // Inselrand: Wand nach unten, damit man nicht unter die Welt sieht
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const au = (dx === 1 && (a + 1) % R === 0) || (dx === -1 && a % R === 0) || (dz === 1 && (b + 1) % R === 0) || (dz === -1 && b % R === 0);
      if (!au || hat(gx + dx, gz + dz)) continue;
      const e0 = dx === 1 ? v10 : dx === -1 ? v00 : dz === 1 ? v01 : v00, e1 = dx === 1 ? v11 : dx === -1 ? v01 : dz === 1 ? v11 : v10;
      randWand(p, e0, e1, dx, dz, skp, skn, skc, ski);
    }
  }
  const vo = V * V, pp = new Float32Array(p.length + skp.length), n2 = new Float32Array(nn.length + skn.length), cc = new Float32Array(c.length + skc.length), ii = new Uint32Array(idx.length + ski.length);
  pp.set(p); pp.set(skp, p.length); n2.set(nn); n2.set(skn, nn.length); cc.set(c); cc.set(skc, c.length); ii.set(idx); for (let k = 0; k < ski.length; k++) ii[idx.length + k] = ski[k] + vo;
  const uu = new Float32Array(uvk.length + (skp.length / 3) * 2); uu.set(uvk);
  return { p: pp, n: n2, c: cc, i: ii, uv: uu };
}

/** Wasser- und Lavaflächen einer Kachel: jede Spalte mit Becken und ihre Nachbarn, damit der Spiegel am Ufer unter dem Boden verschwindet (natürliche Uferlinie) */
export function beckenZellen(cx: number, cz: number, S: (x: number, z: number) => Spalte | null): { wasser: number[]; lava: number[] } {
  const wasser: number[] = [], lava: number[] = [], ox = cx * CH, oz = cz * CH;
  for (let x = ox; x < ox + CH; x++) for (let z = oz; z < oz + CH; z++) {
    let w = false, l = false;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const s = S(x + dx, z + dz); if (!s) continue; if (s.a === 'w') w = true; else if (s.a === 'l') l = true; }
    if (w) wasser.push(x, WASSER_Y, z); if (l) lava.push(x, LAVA_Y, z);
  }
  return { wasser, lava };
}

// ---------- Übersicht der ganzen Welt ----------
/** Übersichtsnetz: Eckpunkte alle Z Blöcke, Höhe aus dem glatten Gelände, Farbe aus den Zellfarben mit Flecken */
export function uebersichtNetz(N: number, Z: number, farbe: Uint8Array, hoch: Float32Array, art: Uint8Array): BodenNetz {
  const V = N + 1, sd = seed(), p = new Float32Array(V * V * 3), nn = new Float32Array(V * V * 3), c = new Float32Array(V * V * 3), H = new Float32Array(V * V), uvk = new Float32Array(V * V * 2);
  const zelle = (i: number, j: number) => (i < 0 || j < 0 || i >= N || j >= N ? -1 : hoch[i * N + j] > -900 ? j * N + i : -1);
  const zf = new Float32Array(N * N * 3); for (let q = 0; q < N * N; q++) for (let k = 0; k < 3; k++) zf[q * 3 + k] = srgbLin(farbe[q * 3 + k] / 255);
  for (let i = 0; i < V; i++) for (let j = 0; j < V; j++) {
    const wx = -WR + i * Z, wz = -WR + j * Z; let h = eckeHoehe(wx, wz), w = 0, l = 0, k = 0;
    for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) { const q = zelle(a, b); if (q < 0) continue; k++; if (art[b * N + a] === 1) w++; else if (art[b * N + a] === 2) l++; }
    if (k && w === k) h = WASSER_Y; else if (k && l === k) h = LAVA_Y;
    H[i * V + j] = h;
  }
  for (let i = 0; i < V; i++) for (let j = 0; j < V; j++) {
    const o = (i * V + j) * 3, wx = -WR + i * Z, wz = -WR + j * Z;
    const h = (a: number, b: number) => H[Math.min(V - 1, Math.max(0, a)) * V + Math.min(V - 1, Math.max(0, b))];
    const dx = h(i - 1, j) - h(i + 1, j), dz = h(i, j - 1) - h(i, j + 1), len = Math.hypot(dx, 2 * Z, dz);
    uvk[(i * V + j) * 2] = wx / 6; uvk[(i * V + j) * 2 + 1] = wz / 6; p[o] = wx; p[o + 1] = H[i * V + j]; p[o + 2] = wz; nn[o] = dx / len; nn[o + 1] = 2 * Z / len; nn[o + 2] = dz / len;
    let r = 0, g = 0, b = 0, k = 0;
    for (const [a, bb] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) { const q = zelle(a, bb); if (q < 0) continue; r += zf[q * 3]; g += zf[q * 3 + 1]; b += zf[q * 3 + 2]; k++; }
    if (!k) { c[o] = RAND[0]; c[o + 1] = RAND[1]; c[o + 2] = RAND[2]; continue; }
    const m = 0.85 + 0.3 * fbm(wx, wz, 0.12, sd + 51), steil = glatt(0.25, 0.5, 1 - nn[o + 1]) * 0.5;
    r = (r / k) * m; g = (g / k) * m; b = (b / k) * m;
    c[o] = (r + (FELS[0] - r) * steil) * 1.7; c[o + 1] = (g + (FELS[1] - g) * steil) * 1.7; c[o + 2] = (b + (FELS[2] - b) * steil) * 1.7;
  }
  const idx: number[] = [], skp: number[] = [], skn: number[] = [], skc: number[] = [], ski: number[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (zelle(i, j) < 0) continue;
    const v00 = i * V + j, v10 = (i + 1) * V + j, v01 = i * V + j + 1, v11 = (i + 1) * V + j + 1;
    if (Math.abs(H[v00] - H[v11]) <= Math.abs(H[v10] - H[v01])) idx.push(v00, v01, v11, v00, v11, v10); else idx.push(v00, v01, v10, v10, v01, v11);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (zelle(i + dx, j + dz) >= 0) continue;
      const e0 = dx === 1 ? v10 : dx === -1 ? v00 : dz === 1 ? v01 : v00, e1 = dx === 1 ? v11 : dx === -1 ? v01 : dz === 1 ? v11 : v10;
      randWand(p, e0, e1, dx, dz, skp, skn, skc, ski);
    }
  }
  const vo = V * V, pp = new Float32Array(p.length + skp.length), n2 = new Float32Array(nn.length + skn.length), cc = new Float32Array(c.length + skc.length), ii = new Uint32Array(idx.length + ski.length);
  pp.set(p); pp.set(skp, p.length); n2.set(nn); n2.set(skn, nn.length); cc.set(c); cc.set(skc, c.length); ii.set(idx); for (let k = 0; k < ski.length; k++) ii[idx.length + k] = ski[k] + vo;
  const uu = new Float32Array(uvk.length + (skp.length / 3) * 2); uu.set(uvk);
  return { p: pp, n: n2, c: cc, i: ii, uv: uu };
}

/** Verdunkelnde Dinge um eine Kachel (Bäume, Büsche, Felsen, auch aus dem Rand ringsum): je 4 Werte x, z, Radius, Stärke */
export function okkluder(cx: number, cz: number, S: (x: number, z: number) => Spalte | null, deko: (x: number, z: number, s: Spalte | null) => { art: string; typ?: string } | null, h3: (x: number, y: number, z: number) => number): number[] {
  const ox = cx * CH, oz = cz * CH, aus: number[] = [];
  for (let x = ox - 5; x < ox + CH + 5; x++) for (let z = oz - 5; z < oz + CH + 5; z++) {
    if (h3(x, 9, z) > 0.07 && h3(x, 11, z) > 0.05) continue;
    const s = S(x, z); if (!s) continue; const d = deko(x, z, s); if (!d || d.art === 'gras') continue;
    if (d.art === 'fels') aus.push(x + 0.5, z + 0.5, 2.1, 0.45); else if (d.typ === 'tanne') aus.push(x + 0.5, z + 0.5, 3.4, 0.7); else if (d.typ === 'busch') aus.push(x + 0.5, z + 0.5, 1.9, 0.4); else if (d.typ === 'tot') aus.push(x + 0.5, z + 0.5, 1.5, 0.2); else aus.push(x + 0.5, z + 0.5, 4.3, 0.62);
  }
  return aus;
}
