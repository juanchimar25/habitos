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
import { montar, normalizarHtml, verDia } from './harness.mjs';
import {
  ESTADO_LLENO, ESTADO_VACIO, ESTADO_LEGADO, ESTADO_SUCIO,
} from './escenarios.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__snapshots__');
const ARCHIVO = path.join(DIR, 'dom.json');

/** Superficies que se capturan en cada escenario. */
function capturar(doc) {
  const html = sel => normalizarHtml(doc.querySelector(sel)?.innerHTML ?? '(ausente)');
  // Qué secciones quedan ocultas. Va aparte del innerHTML porque ocultar un
  // bloque no cambia su contenido: sin esto, el test no vería la diferencia.
  const visibilidad = ['.controls', '.month-nav', '#controls-center',
    '#board', '#dia', '#legend', '#analysis', '#todos', '#settings',
    '#help', '#btn-fab']
    .map(sel => `${sel}:${doc.querySelector(sel)?.hidden ? 'oculto' : 'visible'}`)
    .join(' ');

  return {
    visibilidad,
    // El encabezado quedó con el cambio de tema y nada más; la navegación es de
    // `#tabbar`, que se captura aparte.
    acciones: html('.header-actions'),
    // La barra del pie: cuatro entradas fijas, pero el marcado de la que está
    // activa cambia con la sección, y eso es lo que interesa mirar.
    barraSecciones: html('#tabbar'),
    // El botón redondo de alta: cambia de nombre según la sección y desaparece
    // en las que no crean nada.
    alta: normalizarHtml(doc.querySelector('#btn-fab')?.outerHTML ?? '(ausente)'),
    // El carrete y la lista del día, que reemplazaron a la planilla.
    carrete: html('#carrete-pista'),
    dia: html('#dia-lista'),
    resumenDelDia: html('#dia-resumen'),
    graficos: html('#charts'),
    cajon: html('#drawer'),
    controles: html('.controls'),
    // La leyenda de estados: hasta ahora solo se miraba si estaba visible, así
    // que cambiarle las entradas no aparecía en ningún diff.
    referencias: html('#legend'),
    vacio: html('#empty'),
    titulo: doc.title,
  };
}

async function recolectar() {
  const out = {};

  /* El día en tres momentos del mes: el primero, uno del medio y hoy. El
     carrete se dibuja distinto en cada uno —al principio y al final del mes
     asoman días del vecino— y la lista cambia con lo que cada día pide. */
  for (const dia of ['2026-07-01', '2026-07-15', '2026-07-30']) {
    const { doc } = await montar(ESTADO_LLENO);
    verDia(doc, dia);
    out[`dia-${dia}`] = capturar(doc);
  }

  /* El cruce de mes: con el 31 al centro, el carrete ya muestra agosto. */
  {
    const { doc } = await montar(ESTADO_LLENO);
    verDia(doc, '2026-07-31');
    out['dia-borde-de-mes'] = capturar(doc);
  }

  // --- una tarea archivada -----------------------------------------
  {
    /* Archivada desde el 20: el 30 no está en la lista, y el 19 sí. Es el único
       caso en el que la lista del día muestra menos de lo que el mes tiene sin
       que se haya borrado nada. */
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('#dia-lista .dia-fila[data-task-id="t1"] [data-action="edit"]').click();
    doc.querySelector('#task-archive').click();
    doc.querySelector('#archive-date').value = '2026-07-20';
    doc.querySelector('#archive-form').dispatchEvent(
      new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
    out['tarea-archivada'] = capturar(doc);

    verDia(doc, '2026-07-19');
    out['tarea-archivada-antes-del-corte'] = capturar(doc);
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

  // --- las dos secciones nuevas de la barra del pie -------------------
  {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('[data-page="todos"]').click();
    out['pendientes'] = { ...capturar(doc), seccion: normalizarHtml(doc.querySelector('#todos')?.innerHTML ?? '(ausente)') };
  }
  {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('[data-page="settings"]').click();
    /* La tarjeta de la cuenta sale vacía a propósito: el arnés no carga
       `auth.js`, que es quien escribe el email y la fecha de alta. Lo que
       captura el escenario es el molde. */
    out['ajustes'] = { ...capturar(doc), seccion: normalizarHtml(doc.querySelector('#settings')?.innerHTML ?? '(ausente)') };
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
    doc.querySelector('#btn-fab').click();
    out['dialogo-tarea'] = {
      titulo: doc.querySelector('#task-dialog-title')?.textContent ?? '',
      dias: normalizarHtml(doc.querySelector('#weekday-row')?.innerHTML ?? ''),
      // El botón que remata es un tilde: lo que lo nombra es el `aria-label`.
      submit: doc.querySelector('#task-submit')?.getAttribute('aria-label') ?? '',
      // Las tres acciones sobre la tarea existen solo al editar.
      acciones: [...doc.querySelectorAll('#task-tools .task-tool')]
        .map(b => b.textContent).join(' · ') || '(ninguna)',
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
      // El botón que remata es un tilde: lo que lo nombra es el `aria-label`.
      submit: doc.querySelector('#task-submit')?.getAttribute('aria-label') ?? '',
      // Las tres acciones sobre la tarea existen solo al editar.
      acciones: [...doc.querySelectorAll('#task-tools .task-tool')]
        .map(b => b.textContent).join(' · ') || '(ninguna)',
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
  process.exit(0);
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
  /* Cada escenario deja su jsdom en pie, y ahí adentro hay un temporizador vivo
     —el que relee la fecha al cruzar la medianoche—. Node no termina mientras
     quede uno pendiente, así que se sale a mano. Es lo mismo que hace cada
     archivo de `casos/`. */
  process.exit(0);
} else {
  console.error('Uso: node test/snapshot.mjs guardar|comparar');
  process.exit(2);
}
