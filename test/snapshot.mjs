/* ============================================================
   Instantáneas del DOM
   ------------------------------------------------------------
     node test/snapshot.mjs guardar    → graba la referencia
     node test/snapshot.mjs comparar   → verifica contra ella

   La idea es simple: si un refactor no cambia el comportamiento,
   el HTML que produce la app tiene que ser byte a byte el mismo.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montar, normalizarHtml } from './harness.mjs';
import {
  ESTADO_LLENO, ESTADO_VACIO, ESTADO_BLOQUEADO, ESTADO_LEGADO, ESTADO_SUCIO,
} from './escenarios.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__snapshots__');
const ARCHIVO = path.join(DIR, 'dom.json');

/** Superficies que se capturan en cada escenario. */
function capturar(doc) {
  const html = sel => normalizarHtml(doc.querySelector(sel)?.innerHTML ?? '(ausente)');
  const attrs = sel => {
    const n = doc.querySelector(sel);
    if (!n) return '(ausente)';
    return [...n.attributes].map(a => `${a.name}="${a.value}"`).sort().join(' ');
  };
  // Qué secciones quedan ocultas. Va aparte del innerHTML porque ocultar un
  // bloque no cambia su contenido: sin esto, el test no vería la diferencia.
  const visibilidad = ['.controls', '.month-nav', '#controls-center', '#range-nav',
    '#month-bar', '#board', '#legend', '#analysis', '#help', '#btn-page-toggle',
    '#btn-collapse']
    .map(sel => `${sel}:${doc.querySelector(sel)?.hidden ? 'oculto' : 'visible'}`)
    .join(' ');

  return {
    visibilidad,
    // «Análisis» vive acá y no en `.controls`: sin esto su marcado no lo
    // miraría ningún escenario.
    acciones: html('.header-actions'),
    grid: html('#grid'),
    gridClase: doc.querySelector('#grid')?.className ?? '',
    resumen: html('#summary'),
    graficos: html('#charts'),
    barraMes: html('#month-bar'),
    cajon: html('#drawer'),
    controles: html('.controls'),
    vacio: html('#empty'),
    notaBloqueo: attrs('#locked-note'),
    titulo: doc.title,
  };
}

async function recolectar() {
  const out = {};

  // --- planilla en las tres vistas -------------------------------
  for (const vista of ['day', 'week', 'month']) {
    const { window, doc } = await montar(ESTADO_LLENO);
    window.document.querySelector(`.seg[data-view="${vista}"]`).click();
    out[`planilla-${vista}`] = capturar(doc);
  }

  // --- los cuatro modos de la columna Estatus ---------------------
  for (const modo of ['glyph', 'pct', 'both', 'none']) {
    const { doc } = await montar({ ...ESTADO_LLENO, complianceMode: modo });
    out[`estatus-${modo}`] = capturar(doc);
  }

  // --- selección múltiple -----------------------------------------
  {
    const { doc } = await montar(ESTADO_LLENO);
    for (const cb of [...doc.querySelectorAll('.task-pick[data-task-id]')].slice(0, 3)) {
      cb.click();
    }
    out['seleccion-multiple'] = capturar(doc);
  }

  // --- indicadores y gráficos --------------------------------------
  {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('[data-page="indicators"]').click();
    out['analisis'] = capturar(doc);
  }

  // --- guía ---------------------------------------------------------
  {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('[data-page="help"]').click();
    out['guia'] = capturar(doc);
  }

  // --- mes bloqueado -------------------------------------------------
  {
    const { doc } = await montar(ESTADO_BLOQUEADO);
    out['bloqueado'] = capturar(doc);
  }

  // --- sin tareas ------------------------------------------------------
  {
    const { doc } = await montar(ESTADO_VACIO);
    out['sin-tareas'] = capturar(doc);
    doc.querySelector('[data-page="indicators"]').click();
    out['sin-tareas-analisis'] = capturar(doc);
  }

  // --- saneado de datos de entrada --------------------------------------
  // Estos dos escenarios existen por normalize(): lo que se dibuja es el
  // resultado de haber descartado (o migrado) lo que no era válido.
  {
    const { doc } = await montar(ESTADO_LEGADO);
    out['formato-legado'] = capturar(doc);
  }
  {
    const { doc } = await montar(ESTADO_SUCIO);
    out['datos-sucios'] = capturar(doc);
  }

  // --- diálogo de plantillas -------------------------------------------
  {
    const { doc } = await montar(ESTADO_VACIO);
    doc.querySelector('#btn-templates').click();
    out['plantillas'] = {
      lista: normalizarHtml(doc.querySelector('#templates-list')?.innerHTML ?? ''),
      // El campo de fecha va aparte de `lista`: vive fuera de #templates-list,
      // así que sin esto ninguno de los 18 escenarios lo miraría.
      inicio: normalizarHtml(doc.querySelector('.tpl-start')?.outerHTML ?? '(ausente)'),
      // El `value` no aparece en el HTML serializado y es el que decide el mes
      // destino, así que va como campo propio.
      inicioValor: doc.querySelector('#templates-start')?.value ?? '(ausente)',
    };
  }

  // --- alta de tarea ----------------------------------------------------
  {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('[data-add-task]').click();
    out['dialogo-tarea'] = {
      titulo: doc.querySelector('#task-dialog-title')?.textContent ?? '',
      dias: normalizarHtml(doc.querySelector('#weekday-row')?.innerHTML ?? ''),
      submit: doc.querySelector('#task-submit')?.textContent ?? '',
      // El `value` no viaja en el HTML serializado, así que se captura aparte:
      // es el que decide si la fecha obligatoria sale con un valor por omisión.
      inicio: doc.querySelector('#task-start')?.value ?? '(ausente)',
    };
  }

  // --- edición de tarea existente ---------------------------------------
  {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelectorAll('[data-action="edit"]')[2]?.click();
    out['dialogo-edicion'] = {
      titulo: doc.querySelector('#task-dialog-title')?.textContent ?? '',
      nombre: doc.querySelector('#task-name')?.value ?? '',
      submit: doc.querySelector('#task-submit')?.textContent ?? '',
      // Al editar, el valor por omisión NO es hoy: proponerlo recortaría los
      // días ya cargados de una tarea anterior al campo obligatorio.
      inicio: doc.querySelector('#task-start')?.value ?? '(ausente)',
    };
  }

  return out;
}

const modo = process.argv[2];

if (modo === 'guardar') {
  const datos = await recolectar();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify(datos, null, 2));
  const claves = Object.keys(datos);
  const bytes = claves.reduce((n, k) => n + JSON.stringify(datos[k]).length, 0);
  console.log(`Referencia guardada: ${claves.length} escenarios, ${(bytes / 1024).toFixed(0)} KB`);
  console.log(claves.map(k => '  · ' + k).join('\n'));
} else if (modo === 'comparar') {
  if (!fs.existsSync(ARCHIVO)) {
    console.error('No hay referencia. Corré primero: node test/snapshot.mjs guardar');
    process.exit(2);
  }
  const esperado = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  const actual = await recolectar();

  let fallos = 0;

  /* Se recorre la UNIÓN de ambos lados, no solo la referencia. Mirando solo la
     referencia, agregar una superficie nueva a capturar() no falla: como la
     clave no existe del lado esperado, nadie la compara y el test pasa en
     verde sin haber mirado nada. El campo queda sin cobertura hasta que a
     alguien se le ocurre regrabar. */
  const escenarios = new Set([...Object.keys(esperado), ...Object.keys(actual)]);

  for (const escenario of escenarios) {
    const esp = esperado[escenario];
    const act = actual[escenario];

    if (!esp) {
      fallos++;
      console.log(`\nNUEVO    ${escenario} — no está en la referencia`);
      continue;
    }
    if (!act) {
      fallos++;
      console.log(`\nFALTA    ${escenario} — está en la referencia y ya no se genera`);
      continue;
    }

    for (const campo of new Set([...Object.keys(esp), ...Object.keys(act)])) {
      const a = esp[campo];
      const b = act[campo];
      if (a === b) continue;
      fallos++;

      if (a === undefined) {
        console.log(`\nNUEVO    ${escenario} → ${campo} — se captura pero no hay referencia`);
        continue;
      }
      if (b === undefined) {
        console.log(`\nFALTA    ${escenario} → ${campo} — hay referencia pero ya no se captura`);
        continue;
      }

      console.log(`\nDIFIERE  ${escenario} → ${campo}`);
      // Primer punto de divergencia, con algo de contexto alrededor.
      let i = 0;
      while (i < a.length && a[i] === b?.[i]) i++;
      console.log('  esperado: …' + String(a).slice(Math.max(0, i - 60), i + 120));
      console.log('  actual  : …' + String(b).slice(Math.max(0, i - 60), i + 120));
    }
  }

  const total = escenarios.size;
  if (fallos) {
    console.log(`\n${fallos} diferencia(s) en ${total} escenarios`);
    process.exit(1);
  }
  console.log(`Sin cambios: ${total} escenarios idénticos al de referencia`);
} else {
  console.error('Uso: node test/snapshot.mjs guardar|comparar');
  process.exit(2);
}
