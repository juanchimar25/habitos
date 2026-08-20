/* ============================================================
   Íconos de la PWA — se generan, no se dibujan a mano
   ------------------------------------------------------------
     node tools/generar-iconos.mjs

   El logo vive como SVG inline en el `<link rel="icon">` de
   `index.html`, pero un manifest necesita PNG: los launchers de
   Android no aceptan SVG de forma confiable. En vez de arrastrar
   una dependencia de imágenes —la app no tiene ninguna y el
   `.npmrc` bloquea los scripts de instalación—, el PNG se
   codifica acá: `zlib` viene en Node y el formato es simple.

   Los archivos resultantes SE VERSIONAN. Este script existe para
   poder rehacerlos si el logo cambia, no para correr en cada
   build: la app sigue sin tener build.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- el logo, en el mismo lienzo de 100×100 que el SVG del favicon --------

const ROMBO_ARRIBA = [[50, 2], [98, 50], [2, 50]];
const ROMBO_ABAJO = [[2, 50], [98, 50], [50, 98]];
const CHECK = [[27, 46], [45, 64], [74, 30]];
const GROSOR_CHECK = 13;

const COLOR = {
  arriba: [0x81, 0x58, 0xa4],
  abajo: [0x3d, 0x4a, 0x7b],
  check: [0xff, 0xff, 0xff],
  // Fondo del ícono `maskable`, que el launcher recorta a su antojo: tiene que
  // ser opaco y llegar hasta el borde. Es el fondo claro de la app.
  fondo: [0xf4, 0xf6, 0xfb],
};

const signo = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);

/** Punto dentro de un triángulo: los tres productos cruzados con el mismo signo. */
function enTriangulo(p, [a, b, c]) {
  const d1 = signo(p, a, b);
  const d2 = signo(p, b, c);
  const d3 = signo(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Distancia de un punto al segmento a-b. */
function distanciaASegmento(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const largo2 = vx * vx + vy * vy;
  const t = largo2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / largo2)) : 0;
  const dx = wx - t * vx;
  const dy = wy - t * vy;
  return Math.hypot(dx, dy);
}

/** El trazo del check, con extremos a tope como los de un `stroke-linecap` recto. */
function enCheck(p) {
  const mitad = GROSOR_CHECK / 2;
  for (let i = 0; i < CHECK.length - 1; i++) {
    if (distanciaASegmento(p, CHECK[i], CHECK[i + 1]) <= mitad) return true;
  }
  return false;
}

/** Color del logo en un punto del lienzo 0-100, o `null` si ahí no hay logo. */
function colorEn(p) {
  if (enCheck(p)) return COLOR.check;
  if (enTriangulo(p, ROMBO_ARRIBA)) return COLOR.arriba;
  if (enTriangulo(p, ROMBO_ABAJO)) return COLOR.abajo;
  return null;
}

// --- rasterizado ----------------------------------------------------------

const MUESTRAS = 4;   // 4×4 por píxel: suficiente para que los bordes no escalonen

/**
 * @param lado    píxeles del lado del PNG
 * @param escala  cuánto del lienzo ocupa el logo (1 = borde a borde)
 * @param fondo   color de relleno, o `null` para dejarlo transparente
 */
function dibujar(lado, escala, fondo) {
  const rgba = Buffer.alloc(lado * lado * 4);
  const margen = (1 - escala) / 2;

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < MUESTRAS; sy++) {
        for (let sx = 0; sx < MUESTRAS; sx++) {
          // Centro de la submuestra, llevado al lienzo del logo.
          const px = ((x + (sx + 0.5) / MUESTRAS) / lado - margen) / escala * 100;
          const py = ((y + (sy + 0.5) / MUESTRAS) / lado - margen) / escala * 100;

          const c = colorEn([px, py]) ?? fondo;
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }

      const total = MUESTRAS * MUESTRAS;
      const i = (y * lado + x) * 4;
      if (a > 0) {
        // Promedio sobre las muestras CUBIERTAS: si se promediara sobre todas,
        // los bordes saldrían oscurecidos contra el negro de las vacías.
        const cubiertas = a / 255;
        rgba[i] = Math.round(r / cubiertas);
        rgba[i + 1] = Math.round(g / cubiertas);
        rgba[i + 2] = Math.round(b / cubiertas);
        rgba[i + 3] = Math.round(a / total);
      }
    }
  }
  return rgba;
}

// --- codificación PNG ------------------------------------------------------

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(lado, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8;    // 8 bits por canal
  ihdr[9] = 6;    // RGBA

  /* Cada scanline lleva adelante su byte de filtro. Va en 0 —sin filtrar—:
     con estas imágenes el ahorro de los otros filtros es marginal y el
     código quedaría bastante menos legible. */
  const ancho = lado * 4;
  const crudo = Buffer.alloc((ancho + 1) * lado);
  for (let y = 0; y < lado; y++) {
    rgba.copy(crudo, y * (ancho + 1) + 1, y * ancho, (y + 1) * ancho);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- los tres archivos -----------------------------------------------------

/* `any` va con fondo transparente y el logo casi a borde: es el ícono que se
   usa tal cual. El `maskable` lo recorta el launcher a la forma que quiera
   —círculo, redondeado, gota—, así que lleva fondo opaco y el logo dentro de
   la zona segura, que es el 80% central. */
const ICONOS = [
  { archivo: 'icon-192.png', lado: 192, escala: 0.94, fondo: null },
  { archivo: 'icon-512.png', lado: 512, escala: 0.94, fondo: null },
  { archivo: 'icon-maskable-512.png', lado: 512, escala: 0.62, fondo: COLOR.fondo },
];

const destino = path.join(RAIZ, 'iconos');
fs.mkdirSync(destino, { recursive: true });

for (const { archivo, lado, escala, fondo } of ICONOS) {
  const datos = png(lado, dibujar(lado, escala, fondo));
  fs.writeFileSync(path.join(destino, archivo), datos);
  console.log(`  ${archivo.padEnd(24)} ${lado}×${lado}  ${(datos.length / 1024).toFixed(1)} kB`);
}

console.log(`\n${ICONOS.length} íconos escritos en iconos/`);
