/* ============================================================
   Tareas diarias — lógica de la aplicación
   Vanilla JS, sin dependencias. Persistencia en localStorage.
   ============================================================ */

(() => {
  'use strict';

  // ---------------------------------------------------------
  // Constantes
  // ---------------------------------------------------------

  /** Clave base. Al iniciar sesión se le agrega el id del usuario. */
  const STORAGE_BASE = 'tareas-diarias/v1';
  let STORAGE_KEY = STORAGE_BASE;

  /**
   * Orden del ciclo al hacer clic. `skip` va último por ser el menos frecuente,
   * y solo aparece en las tareas donde un día concreto carga la obligación
   * (ver `allowsSkip`).
   */
  const CYCLE = [null, 'done', 'partial', 'missed'];
  const CYCLE_CON_SKIP = [...CYCLE, 'skip'];

  /** Puntaje de cada estado. `skip` no suma: sale de la meta, no la penaliza. */
  const POINTS = { done: 1, partial: 0.5, missed: 0, skip: 0 };

  const STATUS_LABEL = {
    done: 'cumplido',
    partial: 'cumplido parcialmente',
    missed: 'no cumplido',
    skip: 'no requerido',
  };

  const STATUS_GLYPH = { done: '✓', partial: '~', missed: '✕', skip: '–' };

  /**
   * Niveles de cumplimiento de una fila, sobre el porcentaje alcanzado de su meta.
   * Se evalúan de mayor a menor: el primero cuyo `min` se alcanza es el que aplica.
   */
  const COMPLIANCE = [
    { min: 75, status: 'done' },
    { min: 45, status: 'partial' },
    { min: 0,  status: 'missed' },
  ];

  /** Modos de la columna de cumplimiento, en el orden en que los cicla su encabezado. */
  const CP_MODES = [
    { id: 'glyph', label: 'iconos' },
    { id: 'pct',   label: '%' },
    { id: 'both',  label: 'iconos + %' },
    { id: 'none',  label: 'oculto' },
  ];

  /** Días de la semana en orden lunes→domingo. `js` es el índice de Date#getDay. */
  const WEEKDAYS = [
    { js: 1, short: 'L', long: 'lunes' },
    { js: 2, short: 'M', long: 'martes' },
    { js: 3, short: 'X', long: 'miércoles' },
    { js: 4, short: 'J', long: 'jueves' },
    { js: 5, short: 'V', long: 'viernes' },
    { js: 6, short: 'S', long: 'sábado' },
    { js: 0, short: 'D', long: 'domingo' },
  ];

  /**
   * Frecuencias disponibles. Definen la META de la tarea, no qué días se pueden
   * marcar: cualquier día del mes es siempre marcable, todas las veces que haga
   * falta. Las que tienen `period` apuntan a un punto por período; el resto, a
   * un punto por cada día que les corresponde.
   */
  const FREQ = {
    daily:    { label: 'Todos los días' },
    weekdays: { label: 'Lunes a viernes' },
    weekly:   { label: 'Una vez por semana',   period: 'semana' },
    biweekly: { label: 'Una vez por quincena', period: 'quincena' },
    monthly:  { label: 'Una vez al mes',       period: 'mes' },
    custom:   { label: null },
  };
  const FREQ_KEYS = Object.keys(FREQ);

  /**
   * Plantillas: listas de tareas listas para incorporar al mes visible.
   * Cada entrada declara nombre y frecuencia; para `custom` se agrega
   * `weekdays` (días fijos) o `target` (meta mensual). El resto de los campos
   * toma los valores por omisión.
   */
  const TEMPLATES = [
    {
      id: 'basicos',
      name: 'Hábitos básicos',
      description: 'Seis para empezar, sin abrumarse',
      tasks: [
        { name: 'Tomar Agua (2 Litros)', freq: 'daily' },
        { name: 'Dormir 8 hs',           freq: 'daily' },
        { name: 'Tender cama',           freq: 'daily' },
        { name: 'Meditar',               freq: 'daily' },
        { name: 'Hacer ejercicio',       freq: 'custom', weekdays: [1, 3, 5] },
        { name: 'Leer 1 página',         freq: 'weekdays' },
      ],
    },
    {
      id: 'salud-higiene',
      name: 'Salud e higiene',
      description: 'El cuidado del cuerpo, de lo diario a lo esporádico',
      tasks: [
        { name: 'Cepillarse los dientes', freq: 'daily' },
        { name: 'Usar hilo dental',       freq: 'daily' },
        { name: 'Ducharse',               freq: 'daily' },
        // Mismos nombres que en «Día completo», para que aplicar las dos
        // plantillas no deje el hábito duplicado.
        { name: 'Tomar Agua (2 Litros)',  freq: 'daily' },
        { name: 'Dormir 8 hs',            freq: 'daily' },
        { name: 'Meditar',                freq: 'daily' },
        { name: 'Elongar',                freq: 'custom', weekdays: [1, 3, 5] },
        { name: 'Caminar al aire libre',  freq: 'custom', target: 8 },
        { name: 'Afeitarse',              freq: 'weekly' },
        { name: 'Cortarse las uñas',      freq: 'custom', target: 2 },
      ],
    },
    {
      id: 'limpieza-hogar',
      name: 'Limpieza del hogar',
      description: 'Lo de todos los días y lo que se posterga',
      tasks: [
        { name: 'Tender cama',            freq: 'daily' },
        { name: 'Lavar los platos',       freq: 'daily' },
        { name: 'Sacar la basura',        freq: 'custom', weekdays: [1, 4] },
        { name: 'Ordenar el escritorio',  freq: 'weekdays' },
        { name: 'Barrer y aspirar',       freq: 'weekly' },
        { name: 'Limpiar el baño',        freq: 'weekly' },
        { name: 'Lavar ropa',             freq: 'weekly' },
        { name: 'Cambiar las sábanas',    freq: 'custom', target: 2 },
        { name: 'Limpiar la heladera',    freq: 'monthly' },
        { name: 'Limpieza profunda',      freq: 'monthly' },
      ],
    },
    {
      id: 'dia-completo',
      name: 'Día completo',
      description: 'La rutina entera, de levantarse a acostarse',
      tasks: [
        { name: 'Dormir 8 hs',                     freq: 'daily' },
        { name: 'Levantarse temprano',             freq: 'weekdays' },
        { name: 'Tender cama',                     freq: 'daily' },
        { name: 'Hacer ejercicio',                 freq: 'custom', weekdays: [1, 3, 5] },
        { name: 'Desayunar',                       freq: 'daily' },
        { name: 'Cepillarse los dientes (Mañana)', freq: 'daily' },
        { name: 'Planificar trabajo',              freq: 'weekdays' },
        { name: 'Colación (Media Mañana)',         freq: 'weekdays' },
        { name: 'Tomar Agua (2 Litros)',           freq: 'weekdays' },
        { name: 'Almorzar',                        freq: 'daily' },
        { name: 'Terminar trabajo',                freq: 'weekdays' },
        { name: 'Colación (Media Tarde)',          freq: 'weekdays' },
        { name: 'Estudiar',                        freq: 'weekdays' },
        { name: 'Merendar',                        freq: 'daily' },
        { name: 'Ducharse',                        freq: 'daily' },
        { name: 'Leer 1 página',                   freq: 'weekdays' },
        { name: 'Cepillarse los dientes (Noche)',  freq: 'daily' },
        { name: 'Socializar',                      freq: 'custom', target: 8 },
        { name: 'Lavar Ropa',                      freq: 'weekly' },
        { name: 'Afeitarse',                       freq: 'weekly' },
        { name: 'Resolver Pendientes',             freq: 'custom', target: 8 },
        { name: 'Limpiar habitación',              freq: 'weekly' },
      ],
    },
  ];

  /**
   * Niveles de zoom de la planilla, en el orden en que los cicla su botón.
   * Solo tienen efecto en móvil: el CSS los aplica dentro del breakpoint
   * angosto, que es donde el ancho escasea. `normal` es el punto de partida.
   */
  const ZOOM_LEVELS = [
    { id: 'normal',   label: 'Normal' },
    { id: 'compacto', label: 'Compacto' },
    { id: 'comodo',   label: 'Cómodo' },
  ];

  /** Días que abarca cada vista. La mensual se resuelve aparte, como el mes entero. */
  const VIEW_SIZE = { day: 1, week: 7 };

  const LOCALE = 'es-AR';

  /** Rótulo del botón de confirmar cuando quien lo abre no pide otro. */
  const OK_POR_DEFECTO = 'Eliminar';

  /** Formatos que se validan al leer datos de afuera. */
  const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
  const RE_MES = /^\d{4}-\d{2}$/;

  // ---------------------------------------------------------
  // Estado
  // ---------------------------------------------------------

  /**
   * @typedef {object} Task
   * @property {string} id
   * @property {string} name
   * @property {keyof FREQ} freq
   * @property {'weekdays'|'count'} customMode  submodo cuando `freq` es 'custom'
   * @property {number[]} weekdays              días elegidos en el submodo 'weekdays'
   * @property {number} target                  veces por mes en el submodo 'count'
   * @property {string|null} start              fecha de inicio `YYYY-MM-DD`
   */

  const today = startOfDay(new Date());

  let state = {
    /**
     * Listas de tareas por mes, indexadas por `YYYY-MM`.
     * Un mes solo aparece acá cuando se lo tocó (alta, edición, borrado o reorden).
     * Mientras no exista, hereda la lista del mes propio más reciente que lo precede,
     * de modo que las tareas se trasladan solas al período siguiente.
     */
    months: /** @type {Record<string, Task[]>} */ ({}),
    /** Estados indexados por `taskId|YYYY-MM-DD`. */
    status: /** @type {Record<string, 'done'|'partial'|'missed'|'skip'>} */ ({}),
    /** Meses bloqueados, indexados por `YYYY-MM`. Un mes bloqueado es de solo lectura. */
    locked: /** @type {Record<string, true>} */ ({}),
    /** Qué muestra la columna de estatus: 'glyph' | 'pct' | 'both' | 'none'. */
    complianceMode: 'glyph',
    /** Densidad de la planilla en móvil: 'normal' | 'compacto' | 'comodo'. */
    zoom: 'normal',
    /** Controles del período plegados (solo tiene efecto en móvil). */
    controlsCollapsed: false,
    /** Paneles desplegados de la sección Análisis. */
    panels: { tiles: true, charts: true },
    theme: /** @type {'light'|'dark'|null} */ (null),
  };

  /** Estado de navegación (no se persiste). */
  const ui = {
    /** Sección visible: la planilla, los indicadores o la ayuda. */
    page: /** @type {'home'|'indicators'|'help'} */ ('home'),
    year: today.getFullYear(),
    month: today.getMonth(),
    view: /** @type {'day'|'week'|'month'} */ ('week'),
    windowIndex: 0,
    editingId: /** @type {string|null} */ (null),
    onConfirm: /** @type {(() => void)|null} */ (null),
    /** Ids tildados para el borrado múltiple. No se persiste. */
    selected: /** @type {Set<string>} */ (new Set()),
  };

  // ---------------------------------------------------------
  // Rutas
  // ---------------------------------------------------------

  /* Cada sección tiene su propia URL. Es una sola página que reescribe la
     dirección con la History API, así que el hosting tiene que devolver
     `index.html` ante cualquier ruta — ver `_redirects`, `vercel.json` y
     `404.html`. */

  const PAGE_DE_RUTA = { diario: 'home', analisis: 'indicators', comousar: 'help' };
  const RUTA_DE_PAGE = { home: 'diario', indicators: 'analisis', help: 'comousar' };

  const TITULO_DE_PAGE = {
    home: 'Diario · Hábitos',
    indicators: 'Análisis · Hábitos',
    help: 'Cómo usar · Hábitos',
  };

  /**
   * Carpeta donde vive la app, deducida de la URL de este mismo script. Así
   * las rutas funcionan igual en la raíz del dominio que en un subdirectorio
   * (el caso de GitHub Pages sin dominio propio).
   */
  const BASE = new URL('.', document.currentScript.src).pathname;

  function urlDe(page) {
    return BASE + RUTA_DE_PAGE[page];
  }

  /** Sección que pide la URL actual. Si no reconoce la ruta, cae en la planilla. */
  function pageDeUrl() {
    // `404.html` (GitHub Pages) reenvía a la raíz con la ruta en este parámetro.
    const desviada = new URLSearchParams(location.search).get('ruta');

    const camino = desviada ?? (location.pathname.startsWith(BASE)
      ? location.pathname.slice(BASE.length)
      : location.pathname.replace(/^\//, ''));

    const slug = camino.split('/')[0].replace(/\.html$/, '').toLowerCase();
    return PAGE_DE_RUTA[slug] || 'home';
  }

  /**
   * Cambia de sección y deja la URL en sintonía.
   * @param {'home'|'indicators'|'help'} page
   * @param {{ reemplazar?: boolean }} [opciones] `reemplazar` no agrega entrada
   *   al historial: se usa al abrir la app, para no dejar un paso atrás vacío.
   */
  function irA(page, { reemplazar = false } = {}) {
    ui.page = page;
    document.title = TITULO_DE_PAGE[page];

    const url = urlDe(page);
    if (reemplazar) history.replaceState({ page }, '', url);
    else if (location.pathname !== url) history.pushState({ page }, '', url);

    render();
  }

  // Atrás y adelante del navegador vuelven a la sección que corresponda.
  window.addEventListener('popstate', () => {
    // Sin sesión no hay nada que dibujar: manda la pantalla de login.
    if (!currentUserId) return;

    ui.page = pageDeUrl();
    document.title = TITULO_DE_PAGE[ui.page];
    render();
  });

  // ---------------------------------------------------------
  // Utilidades de fecha
  // ---------------------------------------------------------

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Clave local `YYYY-MM-DD` (no usa toISOString para evitar corrimientos por UTC). */
  function dateKey(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function addDays(d, n) {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function isWeekend(d) {
    const g = d.getDay();
    return g === 0 || g === 6;
  }

  /** Todos los días de un mes (por defecto, el visible). */
  function monthDays(year = ui.year, month = ui.month) {
    const total = new Date(year, month + 1, 0).getDate();
    const out = [];
    for (let i = 1; i <= total; i++) out.push(new Date(year, month, i));
    return out;
  }

  /**
   * Índice de la semana dentro del mes (0-based), alineada al lunes.
   * Coincide con el particionado de la vista semanal.
   */
  function weekIndexInMonth(date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const offsetToMonday = (first.getDay() + 6) % 7;
    return Math.floor((date.getDate() - 1 + offsetToMonday) / 7);
  }

  /**
   * Divide el mes en ventanas según la vista activa: una por día (diaria),
   * una por semana alineada al lunes (semanal) o una sola con todo el mes (mensual).
   * Siempre se recortan a los límites del mes, para que ningún total mezcle
   * datos de dos meses distintos.
   */
  function getWindows() {
    const all = monthDays();
    if (ui.view === 'month') return [all];

    const size = VIEW_SIZE[ui.view];
    const first = all[0];
    const offsetToMonday = (first.getDay() + 6) % 7;
    let cursor = addDays(first, -offsetToMonday);
    const last = all[all.length - 1];
    const windows = [];

    while (cursor <= last) {
      const block = [];
      for (let k = 0; k < size; k++) {
        const d = addDays(cursor, k);
        if (d.getFullYear() === ui.year && d.getMonth() === ui.month) block.push(d);
      }
      if (block.length) windows.push(block);
      cursor = addDays(cursor, size);
    }
    return windows;
  }

  function visibleDays() {
    const windows = getWindows();
    ui.windowIndex = Math.min(Math.max(ui.windowIndex, 0), windows.length - 1);
    return { days: windows[ui.windowIndex] || [], count: windows.length };
  }

  /** Ubica la ventana que contiene `date`, o 0 si no cae en el mes visible. */
  function windowIndexFor(date) {
    const windows = getWindows();
    const idx = windows.findIndex(w => w.some(d => sameDay(d, date)));
    return idx >= 0 ? idx : 0;
  }

  // ---------------------------------------------------------
  // Formateo
  // ---------------------------------------------------------

  const fmtMonthName = new Intl.DateTimeFormat(LOCALE, { month: 'long' });

  /** "Julio 2026" — mes y año se arman por separado para evitar el "de" del locale. */
  function monthYearLabel(date) {
    return `${fmtMonthName.format(date)} ${date.getFullYear()}`;
  }

  /** Lo mismo, desde año y mes sueltos. Sin argumentos, el mes visible. */
  function labelDeMes(year = ui.year, month = ui.month) {
    return monthYearLabel(new Date(year, month, 1));
  }

  /** "Lunes 27" para un solo día; "27 jul – 2 ago" para un tramo. */
  function spanLabel(days) {
    const a = days[0];
    const b = days[days.length - 1];
    return sameDay(a, b)
      ? fmtDayLong.format(a)
      : `${fmtShort.format(a)} – ${fmtShort.format(b)}`;
  }

  const fmtDow = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
  const fmtFull = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
  const fmtDayLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric' });

  /** 4 → "4"; 4.5 → "4,5" */
  function num(n) {
    return n.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
  }

  function pct(n) {
    return `${Math.round(n)}%`;
  }

  /**
   * Pone en mayúscula la primera LETRA del texto, sin importar qué venga antes:
   * "hola" → "Hola", "134+ hola" → "134+ Hola". Si no hay letras, no toca nada.
   * `\p{L}` cubre acentos y eñes ("ñandú" → "Ñandú").
   */
  function capitalizeFirstLetter(text) {
    return text.replace(/\p{L}/u, letter => letter.toUpperCase());
  }

  function freqLabel(task) {
    const preset = FREQ[task.freq]?.label;
    if (preset) return preset;
    if (isCountMode(task)) {
      return `${num(task.target)} ${task.target === 1 ? 'vez' : 'veces'} al mes`;
    }
    const names = WEEKDAYS.filter(w => task.weekdays.includes(w.js)).map(w => w.short);
    return names.length ? names.join(' · ') : 'Sin días';
  }

  /** `YYYY-MM-DD` → Date local (evita el corrimiento de `new Date('2026-07-15')`). */
  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // ---------------------------------------------------------
  // Modelo
  // ---------------------------------------------------------

  function monthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  /**
   * Lista de tareas vigente para un mes: la propia si el mes fue tocado alguna vez,
   * si no la del mes propio más reciente que lo precede (herencia hacia adelante).
   * Las claves `YYYY-MM` se comparan como texto, que en este formato ordena cronológicamente.
   */
  function tasksOf(year, month) {
    const key = monthKey(year, month);
    if (state.months[key]) return state.months[key];
    const previous = Object.keys(state.months).filter(k => k < key).sort().pop();
    return previous ? state.months[previous] : [];
  }

  function currentTasks() {
    return tasksOf(ui.year, ui.month);
  }

  /** Mes calendario anterior al visible. */
  function previousMonth() {
    const d = new Date(ui.year, ui.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  function isLocked(year = ui.year, month = ui.month) {
    return Boolean(state.locked[monthKey(year, month)]);
  }

  /**
   * Da a un mes su propia copia de la lista, para poder modificarla sin afectar
   * los meses anteriores. Devuelve la lista editable.
   *
   * Por omisión trabaja sobre el mes visible, que es lo que quiere casi toda la
   * app. Las plantillas son la excepción: pueden apuntar a otro mes cuando se
   * les da una fecha de inicio.
   */
  function materialize(year = ui.year, month = ui.month) {
    const key = monthKey(year, month);
    if (!state.months[key]) {
      state.months[key] = tasksOf(year, month).map(t => ({ ...t, weekdays: [...t.weekdays] }));
    }
    return state.months[key];
  }

  /**
   * Puerta única para cualquier modificación del mes visible.
   * Devuelve false y avisa si el período está bloqueado.
   */
  function ensureEditable() {
    if (!isLocked()) return true;
    toast('El período está bloqueado');
    return false;
  }

  /**
   * Días en los que la tarea suma a su meta. No limita qué se puede marcar
   * —cualquier día es marcable— sino cuánto se espera de la tarea en el rango.
   * Las periódicas cuentan por período, así que acá aceptan todos los días y el
   * agrupamiento lo hace `periodId`.
   */
  /** Personalizado con meta mensual: no fija días, solo cuántas veces al mes. */
  function isCountMode(task) {
    return task.freq === 'custom' && task.customMode === 'count';
  }

  /** La tarea todavía no arrancó en esa fecha. */
  function beforeStart(task, date) {
    return Boolean(task.start) && dateKey(date) < task.start;
  }

  /**
   * Si la tarea admite marcar un día como «no requerido».
   *
   * Solo tiene sentido donde la obligación está atada a un día concreto. En una
   * semanal, quincenal, mensual o de meta mensual el feriado no quita nada: la
   * obligación es del período, así que se corre a otro día y el promedio ni se
   * entera. Habilitarlo ahí sería una palanca sin efecto.
   */
  function allowsSkip(task) {
    return !FREQ[task.freq]?.period && !isCountMode(task);
  }

  /** El día quedó marcado a mano como no requerido. */
  function isSkipped(task, date) {
    return state.status[statusKey(task.id, date)] === 'skip';
  }

  function countsTowardGoal(task, date) {
    if (beforeStart(task, date)) return false;
    if (allowsSkip(task) && isSkipped(task, date)) return false;
    const g = date.getDay();
    if (task.freq === 'weekdays') return g >= 1 && g <= 5;
    if (task.freq === 'custom' && !isCountMode(task)) return task.weekdays.includes(g);
    return true;
  }

  /**
   * Días que la frecuencia pide expresamente, solo a efectos visuales: el resto
   * se tiñe para distinguirlos de un vistazo (siguen siendo marcables).
   * Las periódicas no piden ningún día puntual —cualquiera sirve—, así que
   * ninguno figura como requerido y la fila entera queda teñida.
   */
  function isRequiredDay(task, date) {
    if (beforeStart(task, date)) return false;   // todavía no arrancó
    if (FREQ[task.freq]?.period) return false;   // sirve cualquier día del período
    if (isCountMode(task)) return false;         // meta mensual sin días fijos
    return countsTowardGoal(task, date);         // incluye el «no requerido» manual
  }

  /**
   * Identificador del período al que pertenece un día para una tarea dada.
   * Para las no periódicas cada día es su propio período, así el cálculo de la
   * meta funciona sin ramificaciones.
   */
  function periodId(task, date) {
    const month = monthKey(date.getFullYear(), date.getMonth());
    switch (FREQ[task.freq]?.period) {
      case 'semana':   return `${month}#w${weekIndexInMonth(date)}`;
      case 'quincena': return `${month}#q${date.getDate() <= 15 ? 0 : 1}`;
      case 'mes':      return `${month}#m`;
      default:         return dateKey(date);
    }
  }

  function statusKey(taskId, date) {
    return `${taskId}|${dateKey(date)}`;
  }

  /**
   * Antes de la fecha de inicio la tarea no existe: no se puede marcar y lo que
   * hubiera quedado cargado de antes no se muestra ni suma. El dato igual se
   * conserva, así que vuelve a aparecer si se corre o se quita la fecha.
   */
  function getStatus(task, date) {
    if (beforeStart(task, date)) return null;
    return state.status[statusKey(task.id, date)] || null;
  }

  function setStatus(task, date, status) {
    const key = statusKey(task.id, date);
    if (status === null) delete state.status[key];
    else state.status[key] = status;
    save();
  }

  function newId() {
    return window.crypto?.randomUUID?.() || `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------
  // Persistencia
  // ---------------------------------------------------------

  let currentUserId = null;

  /**
   * Si la lectura remota al iniciar sesión falló, no se escribe nada en
   * Supabase durante la sesión: subir el estado que tengamos en memoria
   * reemplazaría datos del servidor que nunca llegamos a ver.
   */
  let lecturaRemotaOk = false;

  /** Último aviso de sincronización mostrado, para no repetirlo en cada guardado. */
  let avisoSync = '';

  /**
   * Avisa en pantalla, y una sola vez, cuando cambia el estado de la
   * sincronización. Un `console.error` no alcanza: fue exactamente así como
   * la app estuvo guardando solo en el navegador sin que se notara.
   */
  function avisarSync(mensaje) {
    if (mensaje === avisoSync) return;
    const seRecupero = !mensaje && avisoSync;
    avisoSync = mensaje;
    if (mensaje) toast(mensaje);
    else if (seRecupero) toast('Sincronización restablecida');
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('No se pudo guardar en localStorage', err);
      toast('No se pudieron guardar los cambios');
    }

    void syncToSupabase();
  }

  function loadFromLocalStorage() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      state = normalize(parsed);
      return true;
    } catch (err) {
      console.error('Datos guardados ilegibles', err);
      return false;
    }
  }

  async function syncToSupabase() {
    if (!currentUserId || !window.supabaseClient) return;

    // Escribir sin haber podido leer sería pisar el estado remoto a ciegas.
    if (!lecturaRemotaOk) {
      avisarSync('Sin conexión con la base: los cambios quedan solo en este navegador.');
      return;
    }

    try {
      const { error } = await window.supabaseClient.from('app_state').upsert(
        {
          user_id: currentUserId,
          payload: state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      avisarSync('');
    } catch (err) {
      console.error('No se pudo sincronizar con Supabase', err);
      avisarSync('No se pudieron guardar los cambios en la base. Quedaron en este navegador.');
    }
  }

  /**
   * Lee el estado del usuario en Supabase.
   * @returns {Promise<'ok'|'vacio'|'error'>} `vacio` es una cuenta sin datos
   *   todavía; `error` es no haber podido preguntar. Distinguirlos es el
   *   punto: con `vacio` se puede subir la copia local, con `error` no.
   */
  async function loadFromSupabase() {
    if (!currentUserId || !window.supabaseClient) return 'error';
    try {
      const { data, error } = await window.supabaseClient
        .from('app_state')
        .select('payload')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (error) throw error;
      if (data?.payload) {
        state = normalize(data.payload);
        return 'ok';
      }
      return 'vacio';
    } catch (err) {
      console.error('No se pudo leer el estado remoto de Supabase', err);
      return 'error';
    }
  }

  async function hydrateStateForUser(user) {
    currentUserId = user?.id || null;
    STORAGE_KEY = user?.id ? `${STORAGE_BASE}/${user.id}` : STORAGE_BASE;
    lecturaRemotaOk = false;
    avisoSync = '';

    if (!currentUserId) {
      state = estadoVacio();
      loadFromLocalStorage();
      return;
    }

    // Explícito: no heredar en memoria nada de la sesión anterior.
    state = estadoVacio();

    const remoto = await loadFromSupabase();
    lecturaRemotaOk = remoto !== 'error';

    if (remoto === 'ok') return;

    const hayLocal = loadFromLocalStorage();

    if (remoto === 'vacio') {
      // Cuenta sin datos en la base: la copia de este navegador pasa a ser la
      // de referencia. Es el único caso en que se sube sin haber leído nada.
      if (hayLocal) await syncToSupabase();
      return;
    }

    // La base no contestó. Se sigue en modo local y sin escribir, para no
    // destruir lo que haya del otro lado.
    avisarSync('No se pudo leer la base. Estás viendo la copia de este '
      + 'navegador y los cambios no se sincronizan. Recargá para reintentar.');
  }

  /** Meta mensual válida: entero entre 1 y 99. */
  function clampTarget(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 1;
  }

  /** Valida y sanea una lista de tareas suelta. */
  function cleanTaskList(list) {
    const clean = [];
    for (const t of Array.isArray(list) ? list : []) {
      if (!t || typeof t.name !== 'string' || !t.name.trim()) continue;
      const freq = FREQ_KEYS.includes(t.freq) ? t.freq : 'daily';
      const weekdays = Array.isArray(t.weekdays)
        ? [...new Set(t.weekdays.map(Number).filter(n => n >= 0 && n <= 6))].sort()
        : [];
      const customMode = t.customMode === 'count' ? 'count' : 'weekdays';
      const target = clampTarget(t.target);
      const start = typeof t.start === 'string' && RE_DIA.test(t.start)
        ? t.start
        : null;

      // Un personalizado por días sin días elegidos no describe nada: se descarta.
      if (freq === 'custom' && customMode === 'weekdays' && !weekdays.length) continue;

      clean.push({
        id: typeof t.id === 'string' && t.id ? t.id : newId(),
        name: capitalizeFirstLetter(t.name.trim().slice(0, 80)),
        freq,
        customMode,
        weekdays,
        target,
        start,
      });
    }
    return clean;
  }

  /*  Lo que llega de un archivo importado puede ser cualquier cosa —null, un
      número, un arreglo— y todos los recorridos de abajo asumen un objeto
      plano de clave/valor. Estas dos guardas encapsulan esa comprobación. */

  const esDiccionario = valor =>
    Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor);

  /** El diccionario, o uno vacío si no lo es. */
  const comoObjeto = valor => (esDiccionario(valor) ? valor : {});

  /** Mes más antiguo (`YYYY-MM`) que aparece en los estados guardados. */
  function earliestStatusMonth(status) {
    let earliest = null;
    for (const key of Object.keys(comoObjeto(status))) {
      const iso = String(key).split('|')[1];
      if (!RE_DIA.test(iso || '')) continue;
      const month = iso.slice(0, 7);
      if (!earliest || month < earliest) earliest = month;
    }
    return earliest;
  }

  /** Valida y sanea datos que vienen de localStorage o de un archivo importado. */
  function normalize(data) {
    if (!data || typeof data !== 'object') throw new Error('Formato inválido');

    const months = {};

    if (esDiccionario(data.months)) {
      for (const [key, list] of Object.entries(data.months)) {
        // Una lista vacía es información válida: significa "este mes no tiene tareas".
        if (!RE_MES.test(key) || !Array.isArray(list)) continue;
        months[key] = cleanTaskList(list);
      }
    } else if (Array.isArray(data.tasks)) {
      // Formato anterior: una sola lista global. Se ancla al mes más antiguo con
      // datos cargados, así todos los meses siguientes la heredan igual que antes.
      const clean = cleanTaskList(data.tasks);
      if (clean.length) {
        const anchor = earliestStatusMonth(data.status)
          || monthKey(today.getFullYear(), today.getMonth());
        months[anchor] = clean;
      }
    }

    const status = {};
    const ids = new Set(Object.values(months).flat().map(t => t.id));
    for (const [key, value] of Object.entries(comoObjeto(data.status))) {
      if (!['done', 'partial', 'missed', 'skip'].includes(value)) continue;
      const [taskId, iso] = String(key).split('|');
      if (!ids.has(taskId) || !RE_DIA.test(iso || '')) continue;
      status[key] = value;
    }

    const locked = {};
    for (const [key, value] of Object.entries(comoObjeto(data.locked))) {
      if (RE_MES.test(key) && value === true) locked[key] = true;
    }

    const theme = data.theme === 'light' || data.theme === 'dark' ? data.theme : null;
    return {
      months,
      status,
      locked,
      complianceMode: CP_MODES.some(m => m.id === data.complianceMode)
        ? data.complianceMode
        : 'glyph',
      zoom: ZOOM_LEVELS.some(z => z.id === data.zoom) ? data.zoom : 'normal',
      controlsCollapsed: data.controlsCollapsed === true,
      panels: {
        tiles: data.panels?.tiles !== false,
        charts: data.panels?.charts !== false,
      },
      theme,
    };
  }

  // ---------------------------------------------------------
  // Cálculos
  // ---------------------------------------------------------

  /**
   * Puntos y meta de una tarea en el rango.
   * Los puntos suman cualquier día marcado; la meta se cuenta por período, así
   * una semanal apunta a 1 punto por semana visible. Los puntos pueden superar
   * la meta: marcar de más es válido y el total lo muestra.
   */
  function taskTotals(task, days) {
    /* La meta es la del PERÍODO COMPLETO de la vista, no la de la parte
       transcurrida. Una tarea de lunes, miércoles y viernes vista en la semana
       apunta a 3, esté la semana empezada o terminada, y hacerla dos veces da
       67%. Medir contra lo transcurrido daba otra cosa: el martes esa misma
       semana solo llevaba un día exigible, así que dos marcas daban 200%. */
    let points = 0;
    for (const d of days) {
      const s = getStatus(task, d);
      if (s) points += POINTS[s];
    }

    if (isCountMode(task)) return { points, max: countModeMax(task, days, points) };

    const periods = new Set();
    for (const d of days) {
      if (countsTowardGoal(task, d)) periods.add(periodId(task, d));
    }

    return { points, max: periods.size };
  }

  /**
   * Meta de una tarea con meta mensual: el número que cargó el usuario es para
   * el mes entero, así que en una ventana más chica se reparte proporcionalmente.
   * El mes completo siempre devuelve el número exacto.
   *
   * El reparto se hace sobre los días del MES, no sobre los que la tarea tiene
   * disponibles. Dividir por los disponibles concentraba la meta entera en el
   * tramo que quedara: una tarea de 8 al mes iniciada el día 31 terminaba
   * pidiendo las 8 acciones en ese único día, y hacerla una vez daba 13%.
   * «8 veces al mes» es un ritmo; empezar tarde reduce lo que se espera, no lo
   * amontona.
   */
  function countModeMax(task, days, points) {
    if (!days.length) return 0;

    const first = days[0];
    const share = task.target
      / monthDays(first.getFullYear(), first.getMonth()).length;

    const inRange = days.filter(d => countsTowardGoal(task, d));
    return metaEnAcciones(share * inRange.length, points);
  }

  /**
   * Pasa una meta prorrateada a acciones enteras, que es la única unidad en la
   * que estas tareas se cumplen: «socializar» se hace o no se hace, no existe
   * hacer 0,26 de socializar.
   *
   * Cuando la ventana ni siquiera llega a pedir una acción, no hay obligación
   * que incumplir: ahí la meta la fija lo que se hizo. Marcar cumplido da 100%
   * y parcial da 50%, mientras que un día en blanco no muestra nada —un cero
   * acusaría de incumplida a una tarea que ese día no debía nada—.
   */
  function metaEnAcciones(prorrateada, puntos) {
    return prorrateada >= 1 ? Math.ceil(prorrateada) : Math.ceil(puntos);
  }

  /**
   * Aporte de una tarea a un promedio: nunca más que su propia meta.
   *
   * Marcar de más está permitido y los puntos crudos lo reflejan, pero no puede
   * empujar un promedio hacia arriba. Sin este tope, hacer una tarea de lunes a
   * viernes también el sábado compensaba el incumplimiento de otra tarea, y el
   * total del rango subía sin que nada se hubiera cumplido mejor.
   */
  function aporte(puntos, meta) {
    return Math.min(puntos, meta);
  }

  /**
   * Meta de todo el rango. Se suma por filas y no por columnas: la de una tarea
   * periódica es su cantidad de períodos, mientras que la de una columna solo
   * dice cuánto se podría marcar ese día puntual.
   */
  function rangeTotals(days) {
    return currentTasks().reduce((acc, task) => {
      const t = taskTotals(task, days);
      acc.points += aporte(t.points, t.max);
      acc.max += t.max;
      return acc;
    }, { points: 0, max: 0 });
  }

  /**
   * Nivel de cumplimiento de unos puntos contra su meta.
   * Devuelve null si no hay meta en el rango (por ejemplo, una tarea de lunes a
   * viernes mirada en la vista diaria de un sábado): ahí no hay nada que medir.
   *
   * El porcentaje topea en 100: cumplir es cumplir, y de ahí no se sube. Los
   * números crudos siguen a la vista en el tooltip, así que hacer de más se ve
   * igual —«30 sobre una meta de 22»— sin inflar la medida.
   */
  function complianceOf(points, max) {
    if (max <= 0) return null;
    const ratio = Math.min((points / max) * 100, 100);
    const level = COMPLIANCE.find(l => ratio >= l.min);
    return { ratio, status: level.status, glyph: STATUS_GLYPH[level.status] };
  }

  /**
   * Puntos de un día y su techo. Como del inicio en adelante cualquier tarea se
   * puede marcar cualquier día, el techo es la cantidad de tareas ya iniciadas.
   */
  function dayTotals(date) {
    let points = 0;
    let max = 0;
    for (const task of tasksOf(date.getFullYear(), date.getMonth())) {
      if (beforeStart(task, date)) continue;
      // Un día marcado como no requerido tampoco cuenta para el techo del día.
      if (allowsSkip(task) && isSkipped(task, date)) continue;
      max += 1;
      const s = getStatus(task, date);
      if (s) points += POINTS[s];
    }
    return { points, max };
  }

  // ---------------------------------------------------------
  // Referencias al DOM
  // ---------------------------------------------------------

  const $ = sel => document.querySelector(sel);

  /**
   * Nodo con clase y texto de una sola vez. Es el patrón más repetido del
   * render: escribirlo en tres líneas cada vez sepulta, entre ruido, las
   * decisiones que sí importan.
   *
   * Los vacíos se saltean en lugar de asignarse: poner `className = ''`
   * dejaría un `class=""` en el HTML que hoy no está.
   */
  function elem(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = text;
    return node;
  }

  /**
   * Botón con los atributos que siempre viajan juntos.
   *
   * `title` y `label` van separados a propósito: no siempre coinciden. El
   * title suele entrecomillar el nombre de la tarea («Leer») y el
   * aria-label no, porque el lector de pantalla leería las comillas.
   */
  function boton(className, { text = '', title = '', label = '', action = '', disabled = false } = {}) {
    const btn = elem('button', className, text);
    btn.type = 'button';
    if (action) btn.dataset.action = action;
    if (title) btn.title = title;
    if (label) btn.setAttribute('aria-label', label);
    if (disabled) btn.disabled = true;
    return btn;
  }

  const el = {
    monthLabel: $('#month-label'),
    rangeLabel: $('#range-label'),
    rangeNav: $('#range-nav'),
    viewSwitch: $('#view-switch'),
    summary: $('#summary'),
    grid: $('#grid'),
    tableWrap: $('#table-wrap'),
    empty: $('#empty'),
    taskDialog: $('#task-dialog'),
    taskForm: $('#task-form'),
    taskDialogTitle: $('#task-dialog-title'),
    taskSubmit: $('#task-submit'),
    taskName: $('#task-name'),
    taskError: $('#task-error'),
    customField: $('#custom-field'),
    countRow: $('#count-row'),
    taskTarget: $('#task-target'),
    taskStart: $('#task-start'),
    weekdayRow: $('#weekday-row'),
    confirmDialog: $('#confirm-dialog'),
    confirmText: $('#confirm-text'),
    confirmList: $('#confirm-list'),
    confirmNote: $('#confirm-note'),
    confirmOk: $('#confirm-ok'),
    toast: $('#toast'),
    theme: $('#btn-theme'),
    zoom: $('#btn-zoom'),
    zoomText: $('#zoom-text'),
    collapse: $('#btn-collapse'),
    addTask: $('#btn-add-task'),
    copyPrev: $('#btn-copy-prev'),
    deleteSel: $('#btn-delete-sel'),
    deleteSelText: $('#delete-sel-text'),
    resetSel: $('#btn-reset-sel'),
    lock: $('#btn-lock'),
    lockText: $('#lock-text'),
    lockedNote: $('#locked-note'),
    controls: $('.controls'),
    controlsCenter: $('#controls-center'),
    monthBar: $('#month-bar'),
    board: $('#board'),
    legend: $('#legend'),
    drawer: $('#drawer'),
    drawerBackdrop: $('#drawer-backdrop'),
    menu: $('#btn-menu'),
    pageToggle: $('#btn-page-toggle'),
    analysis: $('#analysis'),
    help: $('#help'),
    charts: $('#charts'),
    templates: $('#btn-templates'),
    templatesDialog: $('#templates-dialog'),
    templatesList: $('#templates-list'),
    templatesStart: $('#templates-start'),
    templatesStartHint: $('#templates-start-hint'),
    panelTiles: $('#panel-tiles'),
    panelCharts: $('#panel-charts'),
    jumpDialog: $('#jump-dialog'),
    jumpTitle: $('#jump-title'),
    jumpLabel: $('#jump-label'),
    jumpDows: $('#jump-dows'),
    jumpGrid: $('#jump-grid'),
  };

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------

  function render() {
    const onHome = ui.page === 'home';
    const onHelp = ui.page === 'help';
    const { days, count } = visibleDays();

    // El selector de mes se muestra en la planilla y en los indicadores: ambos
    // son mensuales. En la guía no hay período que elegir, así que la barra de
    // controles entera desaparece — si no, quedaría sola con las flechas de mes.
    el.controls.hidden = onHelp;
    el.monthLabel.textContent = labelDeMes();

    // El atajo del encabezado alterna entre planilla e indicadores. En la guía
    // no aparece: ahí se sale por el menú.
    el.pageToggle.hidden = onHelp;
    el.pageToggle.querySelector('.nav-icon').textContent = onHome ? '◔' : '▦';
    el.pageToggle.querySelector('.nav-text').textContent = onHome ? 'Análisis' : 'Diario';
    el.pageToggle.title = onHome
      ? 'Ver el análisis de este mes'
      : 'Volver a la planilla';
    el.pageToggle.setAttribute('aria-label', el.pageToggle.title);

    // Solo hay algo que plegar en la planilla: en los indicadores esas tres
    // zonas ya están ocultas y el botón no tendría sobre qué actuar.
    el.collapse.hidden = !onHome;
    applyCollapse();

    // Vista y navegación del rango solo aplican a la planilla.
    el.controlsCenter.hidden = !onHome;
    el.rangeNav.hidden = !onHome || ui.view === 'month';
    el.monthBar.hidden = !onHome;
    el.board.hidden = !onHome;
    el.legend.hidden = !onHome;
    el.analysis.hidden = onHome || onHelp;
    el.help.hidden = !onHelp;

    for (const item of el.drawer.querySelectorAll('[data-page]')) {
      item.classList.toggle('is-active', item.dataset.page === ui.page);
      item.setAttribute('aria-current', item.dataset.page === ui.page ? 'page' : 'false');
    }

    if (!onHome) {
      el.panelTiles.open = state.panels.tiles;
      el.panelCharts.open = state.panels.charts;
      if (ui.page === 'indicators') {
        renderSummary();
        renderCharts();
      }
      return;
    }

    if (days.length) {
      // A diferencia de rangeLabel(), acá el mes completo también se rotula
      // como tramo: el rótulo queda oculto en esa vista, pero se mantiene.
      el.rangeLabel.textContent = spanLabel(days);
      el.rangeLabel.title = `Ventana ${ui.windowIndex + 1} de ${count}`;
    }

    for (const btn of el.viewSwitch.querySelectorAll('.seg')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.view === ui.view));
    }

    renderMonthBar();

    const tasks = currentTasks();
    // La selección no puede sobrevivir a tareas que ya no están.
    const ids = new Set(tasks.map(t => t.id));
    for (const id of ui.selected) if (!ids.has(id)) ui.selected.delete(id);

    const hasTasks = tasks.length > 0;
    el.tableWrap.hidden = !hasTasks;
    el.empty.hidden = hasTasks;

    if (hasTasks) renderTable(days);
    else el.grid.innerHTML = '';
  }

  /** Barra de acciones del mes: copiar del anterior, cerrar/abrir y mostrar indicadores. */
  function renderMonthBar() {
    const locked = isLocked();
    const prev = previousMonth();
    const prevTasks = tasksOf(prev.year, prev.month);
    const prevName = labelDeMes(prev.year, prev.month);

    el.addTask.disabled = locked;
    el.addTask.title = locked
      ? 'El período está bloqueado'
      : `Crear una tarea nueva (atajo: N)`;

    el.copyPrev.disabled = locked || prevTasks.length === 0;
    el.copyPrev.title = locked
      ? 'El período está bloqueado'
      : prevTasks.length === 0
        ? `${prevName} no tiene tareas para copiar`
        : `Reemplaza las tareas de este mes por las ${prevTasks.length} de ${prevName}`;

    el.lockText.textContent = locked ? 'Desbloquear período' : 'Bloquear período';
    el.lock.classList.toggle('is-locked', locked);
    el.lock.setAttribute('aria-pressed', String(locked));
    el.lock.title = locked
      ? 'Volver a habilitar la edición de este mes'
      : 'Bloquear este mes para que no se modifique por accidente';

    el.lockedNote.hidden = !locked;
    el.empty.querySelector('[data-add-task]').disabled = locked;
  }

  function renderTable(days) {
    el.grid.className = `grid view-${ui.view} cpm-${state.complianceMode}`;

    const frag = document.createDocumentFragment();

    // --- thead ---
    const thead = elem('thead');
    const hrow = elem('tr');
    hrow.appendChild(taskColumnHeader());

    for (const d of days) {
      const cell = th('', 'col-day', 'col');
      if (isWeekend(d)) cell.classList.add('is-weekend');
      if (sameDay(d, today)) cell.classList.add('is-today');

      cell.append(
        elem('span', 'dow', fmtDow.format(d).replace('.', '').slice(0, 3)),
        elem('span', 'dnum', String(d.getDate())),
      );
      cell.title = fmtFull.format(d);
      hrow.appendChild(cell);
    }

    hrow.appendChild(complianceHeader());
    thead.appendChild(hrow);
    frag.appendChild(thead);

    // --- tbody ---
    const tbody = elem('tbody');

    const tasks = currentTasks();
    tasks.forEach((task, index) => {
      const tr = elem('tr');
      tr.dataset.taskId = task.id;
      tr.appendChild(taskHeaderCell(task, index, tasks.length));

      for (const d of days) {
        const td = elem('td', 'cell-td');
        // El tinte del cuerpo marca los días no requeridos por la frecuencia,
        // no los fines de semana: eso queda en el encabezado y en el pie.
        if (!isRequiredDay(task, d)) td.classList.add('is-optional');
        if (sameDay(d, today)) td.classList.add('is-today');
        td.appendChild(statusButton(task, d));
        tr.appendChild(td);
      }

      tr.appendChild(complianceCell(taskTotals(task, days), 'row-total'));
      tbody.appendChild(tr);
    });

    frag.appendChild(tbody);

    // --- tfoot ---
    const tfoot = elem('tfoot');
    const frow = elem('tr');
    frow.appendChild(th('Tareas completadas', 'col-task', 'row'));

    for (const d of days) {
      const { points, max } = dayTotals(d);

      const td = elem('td', 'col-day');
      if (isWeekend(d)) td.classList.add('is-weekend');

      const span = elem('span', 'day-total', num(points));
      if (points === 0) span.classList.add('is-zero');
      else if (max > 0 && points >= max) span.classList.add('is-full');
      td.appendChild(span);
      td.title = `${fmtFull.format(d)}: ${num(points)} de ${num(max)} puntos`;
      frow.appendChild(td);
    }

    // Esquina inferior derecha: cumplimiento global del rango visible.
    frow.appendChild(complianceCell(rangeTotals(days), 'grand-total'));

    tfoot.appendChild(frow);
    frag.appendChild(tfoot);

    el.grid.innerHTML = '';
    el.grid.appendChild(frag);
    syncSelection();
  }

  /**
   * Refleja la selección múltiple: resalta las filas tildadas y convierte el
   * botón de alta en uno de borrado cuando hay al menos dos.
   */
  function syncSelection() {
    const count = ui.selected.size;
    const total = currentTasks().length;

    for (const tr of el.grid.querySelectorAll('tbody tr[data-task-id]')) {
      tr.classList.toggle('is-selected', ui.selected.has(tr.dataset.taskId));
    }

    const all = el.grid.querySelector('[data-pick-all]');
    if (all) {
      all.checked = total > 0 && count === total;
      // Estado intermedio cuando hay algunas tildadas pero no todas.
      all.indeterminate = count > 0 && count < total;
    }

    // Las acciones sobre la selección aparecen en la barra del mes, al lado
    // del alta, y solo mientras haya algo tildado.
    el.deleteSel.hidden = count === 0;
    el.resetSel.hidden = count === 0;
    el.deleteSelText.textContent = `Eliminar ${count} ${count === 1 ? 'tarea' : 'tareas'}`;

    // El reseteo alcanza solo lo visible, así que el botón lo anticipa.
    if (count) {
      const rango = rangeLabel(visibleDays().days);
      el.deleteSel.title = `Las saca de ${labelDeMes()}`;
      el.resetSel.title = `Deja en «sin cargar» las celdas de ${rango}`;
    }
  }

  function th(text, className, scope) {
    const node = elem('th', className, text || '');
    if (scope) node.scope = scope;
    return node;
  }

  function taskHeaderCell(task, index, total) {
    const cell = th('', 'col-task', 'row');
    const wrap = elem('div', 'task-cell');
    const locked = isLocked();

    const pick = elem('input', 'task-pick');
    pick.type = 'checkbox';
    pick.dataset.taskId = task.id;
    pick.checked = ui.selected.has(task.id);
    pick.disabled = locked;
    pick.title = `Seleccionar «${task.name}»`;
    pick.setAttribute('aria-label', `Seleccionar ${task.name}`);

    const move = elem('div', 'move-stack');
    move.append(
      moveButton('up', '▲', locked || index === 0, `Subir «${task.name}»`),
      moveButton('down', '▼', locked || index === total - 1, `Bajar «${task.name}»`),
    );

    // El nombre hace de agarre para arrastrar: blanco grande y no interactivo.
    const info = elem('div', 'task-info');
    if (!locked) {
      info.dataset.dragHandle = '';
      info.title = 'Arrastrá para reordenar';
    }

    const name = elem('span', 'task-name', task.name);
    name.title = task.name;

    const freq = elem('span', 'task-freq', freqLabel(task));
    // La fecha de inicio no se escribe en la fila para no alargarla; se consulta acá.
    freq.title = task.start
      ? `${freqLabel(task)} — empieza el ${fmtShort.format(parseDateKey(task.start))}`
      : freqLabel(task);

    info.append(name, freq);

    // El borrado vive en el casillero de selección + la fila de abajo.
    const actions = elem('div', 'task-actions');
    actions.appendChild(boton('mini-btn', {
      text: '✎',
      action: 'edit',
      title: `Editar «${task.name}»`,
      label: `Editar ${task.name}`,
      disabled: locked,
    }));

    wrap.append(pick, move, info, actions);
    cell.appendChild(wrap);
    return cell;
  }

  function moveButton(dir, glyph, disabled, label) {
    // Acá title y aria-label sí coinciden: ambos nombran la tarea igual.
    return boton('move-btn', {
      text: glyph,
      action: dir === 'up' ? 'move-up' : 'move-down',
      title: label,
      label,
      disabled,
    });
  }

  function statusButton(task, date) {
    const btn = boton('cell');
    btn.dataset.taskId = task.id;
    btn.dataset.date = dateKey(date);

    // Anterior a la fecha de inicio: la tarea todavía no existía ese día.
    if (beforeStart(task, date)) {
      btn.classList.add('st-none');
      btn.disabled = true;
      btn.tabIndex = -1;
      btn.title = `«${task.name}» empieza el ${fmtShort.format(parseDateKey(task.start))}`;
      btn.setAttribute('aria-label',
        `${task.name}, ${fmtFull.format(date)}: anterior a la fecha de inicio`);
      return btn;
    }

    // Del inicio en adelante cualquier día es marcable, las veces que haga falta.
    const status = getStatus(task, date);
    btn.classList.add(status ? `st-${status}` : 'st-none');
    btn.textContent = status ? STATUS_GLYPH[status] : '';
    btn.setAttribute('aria-label',
      `${task.name}, ${fmtFull.format(date)}: ${status ? STATUS_LABEL[status] : 'sin cargar'}`);

    // Un mes bloqueado conserva los colores cargados, pero deja de aceptar clics.
    if (isLocked()) {
      btn.disabled = true;
      btn.title = 'Período bloqueado';
    }
    return btn;
  }

  /** Encabezado de la columna de tareas: casillero de "todas" + rótulo. */
  function taskColumnHeader() {
    const cell = th('', 'col-task', 'col');

    const wrap = elem('div', 'task-head');

    const all = elem('input', 'task-pick');
    all.type = 'checkbox';
    all.dataset.pickAll = '';
    all.disabled = isLocked();
    all.title = 'Seleccionar todas las tareas';
    all.setAttribute('aria-label', 'Seleccionar todas las tareas');

    wrap.append(all, elem('span', '', 'Tareas'));
    cell.appendChild(wrap);
    return cell;
  }

  /** Encabezado de la columna: un botón que cicla entre los cuatro modos. */
  function complianceHeader() {
    const cell = th('', 'col-total', 'col');

    const btn = boton('col-total-btn', {
      text: 'Estatus',
      title: `Clic para ver ${modeLabel(nextComplianceMode())}`,
    });
    btn.dataset.complianceMode = '';

    // El modo activo se lee en el propio encabezado, no solo en el tooltip.
    btn.appendChild(elem('span', 'cp-mode', modeLabel(state.complianceMode)));

    cell.appendChild(btn);
    return cell;
  }

  const modeLabel = id => CP_MODES.find(m => m.id === id).label;

  function nextComplianceMode() {
    const i = CP_MODES.findIndex(m => m.id === state.complianceMode);
    return CP_MODES[(i + 1) % CP_MODES.length].id;
  }

  /** Celda de cumplimiento: símbolo y/o porcentaje, según el modo activo. */
  function complianceCell(totals, extraClass = '') {
    const td = elem('td', `col-total compliance ${extraClass}`.trim());

    // Ambos se dibujan siempre; cuál se ve lo decide la clase `cpm-*` de la tabla.
    td.append(elem('span', 'cp-glyph'), elem('span', 'cp-pct'));
    applyCompliance(td, totals);
    return td;
  }

  /**
   * @param totals {{points, max}} — puntos contra la meta del período completo
   *   de la vista. Lo transcurrido no entra en la cuenta: el porcentaje dice
   *   cuánto del período se cumplió, y sube a medida que se carga.
   */
  function applyCompliance(td, totals) {
    const { points, max } = totals;
    const level = complianceOf(points, max);

    td.classList.remove('cp-done', 'cp-partial', 'cp-missed');
    if (level) td.classList.add(`cp-${level.status}`);

    const glyph = td.querySelector('.cp-glyph');
    const ratio = td.querySelector('.cp-pct');
    td.classList.toggle('cp-empty', !level);

    if (level) {
      glyph.textContent = level.glyph;
      ratio.textContent = pct(level.ratio);
      td.title = `${pct(level.ratio)} de cumplimiento — ${num(points)} `
        + `sobre una meta de ${num(max)} en el período visible`;
      return;
    }

    // Sin meta no hay nada que medir: la frecuencia no pide nada en el rango.
    // Un guion en cualquiera de los tres modos.
    glyph.textContent = '—';
    ratio.textContent = '—';
    td.title = 'La frecuencia de la tarea no pide ningún día del rango visible';
  }

  /**
   * Los indicadores describen siempre el MES visible, no la ventana de la vista:
   * un promedio por día de la semana no significa nada dentro de una sola semana,
   * y la comparación es explícitamente mensual.
   */
  function renderSummary() {
    const days = monthDays(ui.year, ui.month);

    el.summary.innerHTML = '';
    el.summary.append(
      attentionTile(days),
      ...productivityTiles(days),
      comparisonTile(),
    );
  }

  /** Tareas del mes cuyo cumplimiento está en rojo. */
  function attentionTile(days) {
    const flagged = currentTasks().filter(task => {
      const t = taskTotals(task, days);
      return complianceOf(t.points, t.max)?.status === 'missed';
    });

    return tile(
      'Necesitan tu atención',
      String(flagged.length),
      flagged.length ? flagged.map(t => t.name) : 'Ninguna tarea en rojo',
      flagged.length ? 'alert' : '',
    );
  }

  /**
   * Promedio de puntos por día de la semana, sobre los días ya transcurridos.
   * Los días futuros quedan fuera: valen 0 y hundirían el promedio de su día.
   */
  function weekdayAverages(days) {
    const buckets = new Map();
    for (const d of days) {
      if (d > today) continue;
      const bucket = buckets.get(d.getDay()) || { sum: 0, count: 0 };
      bucket.sum += dayTotals(d).points;
      bucket.count += 1;
      buckets.set(d.getDay(), bucket);
    }
    // Se redondea para que comparar promedios iguales no falle por coma flotante.
    return [...buckets].map(([js, b]) => ({ js, avg: Math.round(b.sum / b.count * 1e4) / 1e4 }));
  }

  function productivityTiles(days) {
    const averages = weekdayAverages(days);
    const values = averages.map(a => a.avg);
    const top = Math.max(...values);
    const bottom = Math.min(...values);

    // Sin datos, o con todos los días parejos, no hay ranking que mostrar.
    if (averages.length < 2 || top === 0 || top === bottom) {
      const reason = averages.length < 2 || top === 0
        ? 'Sin datos suficientes'
        : 'Todos los días parejos';
      return [
        tile('Días más productivos', '—', reason),
        tile('Días menos productivos', '—', reason),
      ];
    }

    return [
      weekdayTile('Días más productivos', averages.filter(a => a.avg === top), 'best'),
      weekdayTile('Días menos productivos', averages.filter(a => a.avg === bottom), 'worst'),
    ];
  }

  function weekdayTile(label, group, tone) {
    // Se recorre WEEKDAYS para que los empates queden en orden cronológico
    // (lunes → domingo), y no en el orden en que aparecieron en el mes.
    const included = new Set(group.map(a => a.js));
    const days = WEEKDAYS.filter(w => included.has(w.js));

    const avg = group[0].avg;
    const nombres = days.map(d => capitalizeFirstLetter(d.long));

    return tile(
      label,
      nombres.length === 1 ? nombres[0] : nombres,   // varios: uno debajo del otro
      `Realizás en promedio ${num(avg)} ${avg === 1 ? 'tarea' : 'tareas'}`,
      tone,
    );
  }

  /**
   * Cumplimiento (0-100) de un mes entero, con las tareas propias de ese mes.
   * Contra la meta del mes completo, así que el mes en curso arranca bajo y
   * sube: comparar un mes a medio andar con uno cerrado es comparar avances,
   * no ritmos.
   */
  function monthCompliance(year, month) {
    const days = monthDays(year, month);
    let points = 0;
    let max = 0;
    for (const task of tasksOf(year, month)) {
      const t = taskTotals(task, days);
      points += aporte(t.points, t.max);
      max += t.max;
    }
    return max > 0 ? (points / max) * 100 : null;
  }

  function comparisonTile() {
    const label = 'Mes actual vs mes pasado';
    const prev = previousMonth();
    const current = monthCompliance(ui.year, ui.month);
    const before = monthCompliance(prev.year, prev.month);

    const nameNow = capitalizeFirstLetter(fmtMonthName.format(new Date(ui.year, ui.month, 1)));
    const nameBefore = capitalizeFirstLetter(
      fmtMonthName.format(new Date(prev.year, prev.month, 1)));

    if (current === null) return tile(label, '—', `${nameNow} todavía no tiene meta`);
    if (before === null) return tile(label, pct(current), `${nameBefore} no tiene datos`);

    const delta = Math.round(current) - Math.round(before);
    const sign = delta > 0 ? '+' : '';
    return tile(
      label,
      `${sign}${delta} pts`,
      [`${nameNow}: ${pct(current)}`,
       `${nameBefore}: ${pct(before)}`],
      delta > 0 ? 'up' : delta < 0 ? 'down' : '',
    );
  }

  // ---------------------------------------------------------
  // Gráficos
  // ---------------------------------------------------------
  //  SVG a mano, sin librerías: la app no tiene build ni dependencias.
  //  Los colores son los MISMOS estados del tablero, así una celda verde y
  //  su porción del gráfico se leen como lo mismo. Son colores de estado,
  //  no de identidad: por eso cada uno viaja siempre con su símbolo y su
  //  etiqueta, que es lo que sostiene la lectura para daltonismo —
  //  verde y amarillo no se separan por tono bajo protanopia.

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  /**
   * Columna con el extremo superior redondeado y la base cuadrada contra el eje.
   * Un `rect` con `rx` redondearía también abajo y despegaría la barra de su
   * línea de base. El radio se achica en barras muy bajas para no deformarlas.
   */
  function columnPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h / 2);
    return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} `
      + `L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} `
      + `L ${x + w} ${y + h} Z`;
  }

  /**
   * Reparto de estados de los días ya transcurridos del mes.
   * Los días marcados como no requeridos quedan afuera del reparto: no son un
   * resultado, son días que se sacaron de la cuenta.
   */
  function statusBreakdown(days) {
    const counts = { done: 0, partial: 0, missed: 0, none: 0 };
    for (const task of currentTasks()) {
      for (const d of days) {
        if (d > today || beforeStart(task, d)) continue;
        const s = getStatus(task, d);
        if (s === 'skip') continue;
        counts[s || 'none'] += 1;
      }
    }
    return counts;
  }

  function chartCard(title, hint) {
    const card = elem('figure', 'chart-card');
    card.appendChild(elem('figcaption', 'chart-title', title));
    if (hint) card.appendChild(elem('p', 'chart-hint', hint));
    return card;
  }

  /** Leyenda: cuadradito de color + símbolo + etiqueta + valor. */
  function chartLegend(items) {
    const box = elem('ul', 'chart-legend');
    for (const item of items) {
      const li = elem('li');

      // El símbolo va FUERA del cuadradito: adentro quedaría como texto sobre
      // un relleno saturado y el ámbar no llega a contraste. Afuera, la
      // identidad la dan el color, el símbolo y la palabra, nunca el tono solo.
      const swatch = elem('span', 'lg-swatch');
      swatch.style.background = item.color;

      li.append(
        swatch,
        elem('span', 'lg-name', item.glyph ? `${item.glyph}  ${item.label}` : item.label),
        elem('span', 'lg-value', item.value),
      );
      box.appendChild(li);
    }
    return box;
  }

  // ---- Torta: reparto de estados --------------------------------------

  function pieChart(days) {
    const counts = statusBreakdown(days);
    const total = counts.done + counts.partial + counts.missed + counts.none;

    const card = chartCard('Reparto de estados',
      'Sobre los días transcurridos del mes');

    if (!total) {
      card.appendChild(emptyChart('Todavía no hay días que analizar'));
      return card;
    }

    const segments = [
      { key: 'done',    label: 'Cumplido',    glyph: '✓', color: 'var(--chart-done)' },
      { key: 'partial', label: 'Parcial',     glyph: '~', color: 'var(--chart-partial)' },
      { key: 'missed',  label: 'No cumplido', glyph: '✕', color: 'var(--chart-missed)' },
      { key: 'none',    label: 'Sin cargar',  glyph: '',  color: 'var(--chart-none)' },
    ].filter(s => counts[s.key] > 0);

    const size = 168;
    const r = 62;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;
    const gap = 3;   // separador en color superficie, no un borde dibujado

    const plot = svg('svg', {
      viewBox: `0 0 ${size} ${size}`,
      class: 'pie',
      role: 'img',
      'aria-label': `Reparto de estados de ${total} marcas posibles`,
    });

    let offset = 0;
    for (const seg of segments) {
      const len = (counts[seg.key] / total) * circumference;
      const visible = Math.max(len - gap, 0.8);

      const arc = svg('circle', {
        cx: c, cy: c, r,
        fill: 'none',
        stroke: seg.color,
        'stroke-width': 26,
        'stroke-dasharray': `${visible} ${circumference - visible}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${c} ${c})`,
      });
      arc.appendChild(svg('title')).textContent =
        `${seg.label}: ${counts[seg.key]} (${pct(counts[seg.key] / total * 100)})`;
      plot.appendChild(arc);
      offset += len;
    }

    // Centro: qué proporción del mes llegaste a registrar.
    const cargado = total - counts.none;
    const big = svg('text', { x: c, y: c - 2, class: 'pie-value', 'text-anchor': 'middle' });
    big.textContent = pct(cargado / total * 100);
    const small = svg('text', { x: c, y: c + 16, class: 'pie-label', 'text-anchor': 'middle' });
    small.textContent = 'cargado';
    plot.append(big, small);

    const wrap = elem('div', 'pie-wrap');
    wrap.appendChild(plot);
    wrap.appendChild(chartLegend(segments.map(s => ({
      color: s.color,
      glyph: s.glyph,
      label: s.label,
      value: `${counts[s.key]} · ${pct(counts[s.key] / total * 100)}`,
    }))));

    card.appendChild(wrap);
    return card;
  }

  // ---- Barras: promedio por día de la semana ---------------------------

  function weekdayChart(days) {
    const card = chartCard('Promedio por día de la semana',
      'Tareas completadas, sobre los días ya transcurridos');

    const averages = weekdayAverages(days);
    if (!averages.length || averages.every(a => a.avg === 0)) {
      card.appendChild(emptyChart('Todavía no hay datos cargados'));
      return card;
    }

    const byJs = new Map(averages.map(a => [a.js, a.avg]));
    const data = WEEKDAYS.map(w => ({ w, avg: byJs.get(w.js) ?? null }));
    const values = data.filter(d => d.avg !== null).map(d => d.avg);
    const top = Math.max(...values);
    const bottom = Math.min(...values);

    const W = 340, H = 170;
    const padX = 10, padTop = 22, padBottom = 26;
    const band = (W - padX * 2) / data.length;
    const barW = Math.min(24, band * 0.55);
    const plotH = H - padTop - padBottom;

    const plot = svg('svg', {
      viewBox: `0 0 ${W} ${H}`,
      class: 'bars',
      role: 'img',
      'aria-label': 'Promedio de tareas completadas por día de la semana',
    });

    // Línea de base: hairline sólida, un paso por encima de la superficie.
    plot.appendChild(svg('line', {
      x1: padX, y1: padTop + plotH, x2: W - padX, y2: padTop + plotH,
      class: 'axis-line',
    }));

    data.forEach((d, i) => {
      const cx = padX + band * i + band / 2;

      const label = svg('text', {
        x: cx, y: H - 8, 'text-anchor': 'middle', class: 'axis-text',
      });
      label.textContent = d.w.short;
      plot.appendChild(label);

      if (d.avg === null) return;

      const h = Math.max(top > 0 ? (d.avg / top) * plotH : 0, 2);
      const y = padTop + plotH - h;
      const esTope = d.avg === top;
      const esPiso = d.avg === bottom && top !== bottom;

      const bar = svg('path', {
        d: columnPath(cx - barW / 2, y, barW, h),
        fill: esTope ? 'var(--chart-done)' : esPiso ? 'var(--chart-missed)' : 'var(--chart-neutral)',
      });
      bar.appendChild(svg('title')).textContent =
        `${capitalizeFirstLetter(d.w.long)}: ${num(d.avg)} en promedio`;
      plot.appendChild(bar);

      // Solo se rotulan los extremos: un número sobre cada barra es ruido.
      if (esTope || esPiso) {
        const value = svg('text', {
          x: cx, y: y - 6, 'text-anchor': 'middle', class: 'bar-value',
        });
        value.textContent = num(d.avg);
        plot.appendChild(value);
      }
    });

    card.appendChild(plot);
    return card;
  }

  // ---- Barras horizontales: cumplimiento por tarea ---------------------

  function taskChart(days) {
    const card = chartCard('Cumplimiento por tarea', 'Sobre la meta del mes completo');

    const rows = currentTasks()
      .map(task => {
        const t = taskTotals(task, days);
        const level = complianceOf(t.points, t.max);
        return level ? { name: task.name, ratio: level.ratio, status: level.status } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.ratio - a.ratio);

    if (!rows.length) {
      card.appendChild(emptyChart('Ninguna tarea tiene meta este mes'));
      return card;
    }

    const list = elem('ul', 'hbars');

    for (const row of rows) {
      const li = elem('li');

      const name = elem('span', 'hb-name', row.name);
      name.title = row.name;

      // El cumplimiento topea en 100%, así que la barra llena es el máximo y la
      // escala coincide con el dato: no hace falta recortar nada.
      const track = elem('span', 'hb-track');
      const fill = elem('i', `hb-fill st-${row.status}`);
      fill.style.width = `${row.ratio}%`;
      track.appendChild(fill);

      li.append(name, track, elem('span', 'hb-value', pct(row.ratio)));
      li.title = `${row.name}: ${pct(row.ratio)} de cumplimiento`;
      list.appendChild(li);
    }

    // Sin leyenda: los umbrales ya están en la columna Estatus del tablero, y
    // acá cada barra lleva su porcentaje al lado, que es el dato exacto.
    card.appendChild(list);
    return card;
  }

  function emptyChart(text) {
    return elem('p', 'chart-empty', text);
  }

  function renderCharts() {
    const days = monthDays(ui.year, ui.month);
    el.charts.innerHTML = '';
    el.charts.append(pieChart(days), weekdayChart(days), taskChart(days));
  }

  /**
   * @param sub texto suelto, o un arreglo que se lista con viñetas.
   *   Con un solo elemento se dibuja como texto: una viñeta sola queda rara.
   */
  function tile(label, value, sub, tone = '') {
    const node = elem('div', tone ? `tile tone-${tone}` : 'tile');
    node.innerHTML = '<p class="tile-label"></p><p class="tile-value"></p>';
    node.querySelector('.tile-label').textContent = label;

    // El valor también puede ser varios: van apilados y algo más chicos.
    const values = Array.isArray(value) ? value : [value];
    const valueEl = node.querySelector('.tile-value');
    if (values.length > 1) {
      valueEl.classList.add('is-stacked');
      for (const v of values) valueEl.appendChild(elem('span', '', v));
    } else {
      valueEl.textContent = values[0];
    }

    const items = (Array.isArray(sub) ? sub : [sub]).filter(Boolean);

    if (items.length > 1) {
      const list = elem('ul', 'tile-list');
      for (const item of items) list.appendChild(elem('li', '', item));
      node.appendChild(list);
    } else {
      const p = elem('p', 'tile-sub', items[0] || '');
      p.title = items[0] || '';
      node.appendChild(p);
    }

    return node;
  }

  // ---------------------------------------------------------
  // Interacción con la grilla
  // ---------------------------------------------------------

  el.grid.addEventListener('change', e => {
    // "Todas": tilda o destilda de una vez y sincroniza los casilleros de fila.
    const all = e.target.closest('[data-pick-all]');
    if (all) {
      ui.selected.clear();
      if (all.checked) for (const t of currentTasks()) ui.selected.add(t.id);
      for (const box of el.grid.querySelectorAll('tbody .task-pick')) {
        box.checked = ui.selected.has(box.dataset.taskId);
      }
      syncSelection();
      return;
    }

    const pick = e.target.closest('.task-pick');
    if (!pick) return;
    if (pick.checked) ui.selected.add(pick.dataset.taskId);
    else ui.selected.delete(pick.dataset.taskId);
    syncSelection();
  });

  el.grid.addEventListener('click', e => {
    if (e.target.closest('[data-compliance-mode]')) {
      state.complianceMode = nextComplianceMode();
      save();
      render();
      return;
    }

    const action = e.target.closest('[data-action]');
    if (action) {
      const taskId = action.closest('tr').dataset.taskId;
      switch (action.dataset.action) {
        case 'edit': openTaskDialog(taskId); break;
        case 'move-up': moveTask(taskId, -1); break;
        case 'move-down': moveTask(taskId, 1); break;
      }
      return;
    }

    const cell = e.target.closest('.cell');
    if (!cell || cell.disabled) return;
    cycleCell(cell, e.shiftKey ? -1 : 1);
  });

  // ---------------------------------------------------------
  // Reordenar arrastrando
  // ---------------------------------------------------------
  //  La fila solo se vuelve arrastrable mientras el puntero apoya sobre el
  //  nombre. Si `draggable` quedara siempre activo, arrastrar desde una celda
  //  de estado movería la tarea sin querer.

  let arrastrando = null;

  function limpiarArrastre() {
    for (const tr of el.grid.querySelectorAll('tbody tr')) {
      tr.draggable = false;
      tr.classList.remove('is-dragging', 'drop-before', 'drop-after');
    }
    arrastrando = null;
  }

  el.grid.addEventListener('mousedown', e => {
    if (isLocked()) return;
    const tr = e.target.closest('[data-drag-handle]')?.closest('tr[data-task-id]');
    if (tr) tr.draggable = true;
  });

  el.grid.addEventListener('dragstart', e => {
    const tr = e.target.closest('tr[data-task-id]');
    if (!tr || !tr.draggable) return;
    arrastrando = tr.dataset.taskId;
    tr.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', arrastrando);
  });

  el.grid.addEventListener('dragover', e => {
    if (!arrastrando) return;
    const tr = e.target.closest('tr[data-task-id]');
    if (!tr || tr.dataset.taskId === arrastrando) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // El punto medio de la fila decide si se suelta antes o después.
    const caja = tr.getBoundingClientRect();
    const antes = e.clientY < caja.top + caja.height / 2;
    for (const otra of el.grid.querySelectorAll('tbody tr')) {
      otra.classList.remove('drop-before', 'drop-after');
    }
    tr.classList.add(antes ? 'drop-before' : 'drop-after');
  });

  el.grid.addEventListener('drop', e => {
    const tr = e.target.closest('tr[data-task-id]');
    if (!arrastrando || !tr) return;
    e.preventDefault();

    const antes = tr.classList.contains('drop-before');
    const destino = tr.dataset.taskId;
    const origen = arrastrando;
    limpiarArrastre();
    reorderTask(origen, destino, antes);
  });

  el.grid.addEventListener('dragend', limpiarArrastre);

  /** Mueve `taskId` justo antes o después de `targetId`. */
  function reorderTask(taskId, targetId, antes) {
    if (!ensureEditable() || taskId === targetId) return;

    const tasks = materialize();
    const orden = tasks.map(t => t.id);
    if (!orden.includes(taskId) || !orden.includes(targetId)) return;

    // Se saca primero y recién después se busca el destino: así el índice ya
    // contempla el corrimiento y no hay que compensarlo a mano.
    orden.splice(orden.indexOf(taskId), 1);
    orden.splice(orden.indexOf(targetId) + (antes ? 0 : 1), 0, taskId);

    const porId = new Map(tasks.map(t => [t.id, t]));
    state.months[monthKey(ui.year, ui.month)] = orden.map(id => porId.get(id));

    const scroll = el.tableWrap.scrollLeft;
    save();
    render();
    el.tableWrap.scrollLeft = scroll;
  }

  /** Reordena una tarea manteniendo el scroll y el foco sobre el mismo botón. */
  function moveTask(taskId, delta) {
    if (!ensureEditable()) return;
    const tasks = materialize();
    const from = tasks.findIndex(t => t.id === taskId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= tasks.length) return;

    [tasks[from], tasks[to]] = [tasks[to], tasks[from]];
    save();

    const scroll = el.tableWrap.scrollLeft;
    render();
    el.tableWrap.scrollLeft = scroll;

    const action = delta < 0 ? 'move-up' : 'move-down';
    const next = el.grid.querySelector(
      `tr[data-task-id="${CSS.escape(taskId)}"] [data-action="${action}"]`);
    if (next && !next.disabled) next.focus();
  }

  function cycleCell(cell, dir) {
    if (!ensureEditable()) return;
    const task = currentTasks().find(t => t.id === cell.dataset.taskId);
    if (!task) return;

    const date = parseDateKey(cell.dataset.date);
    if (beforeStart(task, date)) {
      toast(`«${task.name}» empieza el ${fmtShort.format(parseDateKey(task.start))}`);
      return;
    }

    const ciclo = allowsSkip(task) ? CYCLE_CON_SKIP : CYCLE;
    const current = getStatus(task, date);
    const next = ciclo[(ciclo.indexOf(current) + dir + ciclo.length) % ciclo.length];

    setStatus(task, date, next);

    // Repintado puntual de la celda + recálculo de totales.
    cell.className = `cell ${next ? 'st-' + next : 'st-none'}`;
    cell.textContent = next ? STATUS_GLYPH[next] : '';
    cell.setAttribute('aria-label',
      `${task.name}, ${fmtFull.format(date)}: ${next ? STATUS_LABEL[next] : 'sin cargar'}`);

    refreshTotals();
    scrollCellIntoView(cell);
  }

  function scrollCellIntoView(cell) {
    if (!cell || !el.tableWrap.contains(cell)) return;

    const container = el.tableWrap;
    const cellRect = cell.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const leftSticky = el.grid.querySelector('.col-task')?.getBoundingClientRect().width || 0;
    const rightSticky = el.grid.querySelector('.col-total')?.getBoundingClientRect().width || 0;
    const padding = 8;

    let targetLeft = container.scrollLeft;
    const cellLeft = cellRect.left - containerRect.left + container.scrollLeft;
    const cellRight = cellLeft + cellRect.width;
    const visibleLeft = container.scrollLeft + leftSticky + padding;
    const visibleRight = container.scrollLeft + container.clientWidth - rightSticky - padding;

    if (cellLeft < visibleLeft) {
      targetLeft = Math.max(0, cellLeft - leftSticky - padding);
    } else if (cellRight > visibleRight) {
      targetLeft = Math.min(container.scrollWidth - container.clientWidth,
        cellRight - container.clientWidth + rightSticky + padding);
    }

    if (targetLeft !== container.scrollLeft) {
      container.scrollLeft = targetLeft;
    }
  }

  /** Recalcula fila de totales, columna de totales y tarjetas sin reconstruir la tabla. */
  function refreshTotals() {
    const { days } = visibleDays();

    const rows = el.grid.querySelectorAll('tbody tr');
    rows.forEach(tr => {
      const task = currentTasks().find(t => t.id === tr.dataset.taskId);
      if (!task) return;
      const cell = tr.querySelector('.row-total');
      if (!cell) return;   // columna de cumplimiento oculta
      applyCompliance(cell, taskTotals(task, days));
    });

    const footCells = el.grid.querySelectorAll('tfoot .col-day');

    days.forEach((d, i) => {
      const { points, max } = dayTotals(d);
      const span = footCells[i]?.querySelector('.day-total');
      if (!span) return;
      span.textContent = num(points);
      span.classList.toggle('is-zero', points === 0);
      span.classList.toggle('is-full', max > 0 && points >= max);
      footCells[i].title = `${fmtFull.format(d)}: ${num(points)} de ${num(max)} puntos`;
    });

    const grand = el.grid.querySelector('tfoot .grand-total');
    if (grand) applyCompliance(grand, rangeTotals(days));

    // los indicadores viven en su propia sección del menú
  }

  // ---------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------

  /** Cambia de mes. `landing` indica en qué ventana caer: la primera o la última. */
  function goToMonth(delta, landing = 'first') {
    const d = new Date(ui.year, ui.month + delta, 1);
    ui.year = d.getFullYear();
    ui.month = d.getMonth();
    // Los meses tienen listas propias: la selección no se arrastra entre ellos.
    ui.selected.clear();
    ui.windowIndex = landing === 'last' ? getWindows().length - 1 : 0;
    render();
  }

  function goToToday() {
    if (ui.year !== today.getFullYear() || ui.month !== today.getMonth()) ui.selected.clear();
    ui.year = today.getFullYear();
    ui.month = today.getMonth();
    ui.windowIndex = windowIndexFor(today);
    render();
  }

  function shiftRange(delta) {
    const { count } = visibleDays();
    const next = ui.windowIndex + delta;
    if (next < 0) {
      goToMonth(-1, 'last');
    } else if (next >= count) {
      goToMonth(1, 'first');
    } else {
      ui.windowIndex = next;
      render();
    }
  }

  $('#prev-month').addEventListener('click', () => goToMonth(-1));
  $('#next-month').addEventListener('click', () => goToMonth(1));
  $('#btn-today').addEventListener('click', goToToday);
  $('#prev-range').addEventListener('click', () => shiftRange(-1));
  $('#next-range').addEventListener('click', () => shiftRange(1));

  el.viewSwitch.addEventListener('click', e => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    ui.view = btn.dataset.view;
    // Al cambiar de vista, mantener el foco en hoy si estamos en el mes actual.
    ui.windowIndex = (ui.year === today.getFullYear() && ui.month === today.getMonth())
      ? windowIndexFor(today)
      : 0;
    render();
  });

  // ---------------------------------------------------------
  // Seleccionar día o mes
  // ---------------------------------------------------------
  //  Un solo diálogo con dos modos. Comparten el encabezado con flechas y la
  //  grilla; lo único que cambia es qué se dibuja y de a cuánto se navega:
  //  el de días avanza de mes en mes, el de meses de año en año.

  /** @type {'day'|'month'} */
  let jumpMode = 'day';
  /** Período que muestra el diálogo, independiente del que está a la vista. */
  let jumpYear = today.getFullYear();
  let jumpMonth = today.getMonth();

  // Encabezado de días de la semana: fijo, se arma una sola vez.
  el.jumpDows.append(...WEEKDAYS.map(w => elem('span', '', w.short)));

  function openJump(mode) {
    jumpMode = mode;
    jumpYear = ui.year;
    jumpMonth = ui.month;

    el.jumpTitle.textContent = mode === 'day' ? 'Seleccionar día' : 'Seleccionar mes';
    renderJump();
    el.jumpDialog.showModal();
    // Al título, no a la grilla: si no, el anillo de foco rodea la grilla entera.
    el.jumpTitle.focus();
  }

  function renderJump() {
    const esDia = jumpMode === 'day';

    el.jumpLabel.textContent = esDia ? labelDeMes(jumpYear, jumpMonth) : String(jumpYear);
    el.jumpDows.hidden = !esDia;
    el.jumpGrid.className = esDia ? 'jump-grid' : 'jump-grid is-months';
    el.jumpGrid.innerHTML = '';

    if (!esDia) {
      for (let m = 0; m < 12; m++) {
        const btn = boton('jump-cell', {
          text: capitalizeFirstLetter(fmtMonthName.format(new Date(jumpYear, m, 1))),
          title: labelDeMes(jumpYear, m),
        });
        btn.dataset.month = String(m);
        marcarJump(btn, jumpYear === ui.year && m === ui.month,
          jumpYear === today.getFullYear() && m === today.getMonth());
        el.jumpGrid.appendChild(btn);
      }
      return;
    }

    // El mes propio del diálogo, alineado al lunes como el resto de la app.
    const dias = monthDays(jumpYear, jumpMonth);
    const hueco = (dias[0].getDay() + 6) % 7;
    for (let i = 0; i < hueco; i++) el.jumpGrid.appendChild(elem('span', 'jump-blank'));

    // Qué días están a la vista ahora, para señalarlos en el calendario.
    const visibles = new Set(visibleDays().days.map(dateKey));

    for (const d of dias) {
      const btn = boton('jump-cell', { text: String(d.getDate()), title: fmtFull.format(d) });
      btn.dataset.date = dateKey(d);
      if (isWeekend(d)) btn.classList.add('is-weekend');
      marcarJump(btn, jumpYear === ui.year && jumpMonth === ui.month && visibles.has(dateKey(d)),
        sameDay(d, today));
      el.jumpGrid.appendChild(btn);
    }
  }

  /** `actual` es lo que ya se está mirando; `hoy`, el día o mes reales. */
  function marcarJump(btn, actual, hoy) {
    btn.classList.toggle('is-current', actual);
    btn.classList.toggle('is-today', hoy);
  }

  function shiftJump(delta) {
    if (jumpMode === 'month') {
      jumpYear += delta;
    } else {
      const d = new Date(jumpYear, jumpMonth + delta, 1);
      jumpYear = d.getFullYear();
      jumpMonth = d.getMonth();
    }
    renderJump();
  }

  /** Salta a un mes. La selección no cruza de mes: cada uno tiene su lista. */
  function jumpToMonth(year, month) {
    if (year !== ui.year || month !== ui.month) ui.selected.clear();
    ui.year = year;
    ui.month = month;
    ui.windowIndex = 0;
    render();
  }

  /** Salta a un día y cae en la ventana que lo contiene, según la vista activa. */
  function jumpToDay(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    if (year !== ui.year || month !== ui.month) ui.selected.clear();
    ui.year = year;
    ui.month = month;
    // Después de fijar el mes: `windowIndexFor` particiona el mes visible.
    ui.windowIndex = windowIndexFor(date);
    render();
  }

  $('#btn-pick-month').addEventListener('click', () => openJump('month'));
  $('#btn-pick-day').addEventListener('click', () => openJump('day'));
  $('#jump-prev').addEventListener('click', () => shiftJump(-1));
  $('#jump-next').addEventListener('click', () => shiftJump(1));

  el.jumpGrid.addEventListener('click', e => {
    const btn = e.target.closest('.jump-cell');
    if (!btn) return;

    if (btn.dataset.month !== undefined) jumpToMonth(jumpYear, Number(btn.dataset.month));
    else jumpToDay(parseDateKey(btn.dataset.date));

    el.jumpDialog.close();
  });

  // ---------------------------------------------------------
  // Alta / edición de tareas
  // ---------------------------------------------------------

  // Chips de días de la semana
  for (const wd of WEEKDAYS) {
    const label = elem('label', 'wd');
    label.title = wd.long;

    const input = elem('input');
    input.type = 'checkbox';
    input.value = String(wd.js);
    input.name = 'weekday';

    label.append(input, elem('span', '', wd.short));
    el.weekdayRow.appendChild(label);
  }

  function selectedWeekdays() {
    return [...el.weekdayRow.querySelectorAll('input:checked')].map(i => Number(i.value));
  }

  function currentFreq() {
    return el.taskForm.querySelector('input[name="freq"]:checked').value;
  }

  function currentCustomMode() {
    return el.taskForm.querySelector('input[name="custom-mode"]:checked').value;
  }

  function syncFreqFields() {
    const isCustom = currentFreq() === 'custom';
    const mode = currentCustomMode();

    el.customField.hidden = !isCustom;
    el.weekdayRow.hidden = !isCustom || mode !== 'weekdays';
    el.countRow.hidden = !isCustom || mode !== 'count';
  }

  el.taskForm.addEventListener('change', e => {
    if (e.target.name === 'freq' || e.target.name === 'custom-mode') syncFreqFields();
  });

  // Se aplica al salir del campo, no mientras se tipea, para no mover el cursor.
  el.taskName.addEventListener('blur', () => {
    el.taskName.value = capitalizeFirstLetter(el.taskName.value.trim());
  });

  function openTaskDialog(taskId = null) {
    if (!ensureEditable()) return;
    ui.editingId = taskId;
    const task = taskId ? currentTasks().find(t => t.id === taskId) : null;

    el.taskDialogTitle.textContent = task ? 'Editar tarea' : 'Nueva tarea';
    el.taskSubmit.textContent = task ? 'Guardar cambios' : 'Crear tarea';
    el.taskName.value = task ? task.name : '';
    el.taskError.hidden = true;

    const freq = task ? task.freq : 'daily';
    el.taskForm.querySelector(`input[name="freq"][value="${freq}"]`).checked = true;

    const mode = task?.customMode === 'count' ? 'count' : 'weekdays';
    el.taskForm.querySelector(`input[name="custom-mode"][value="${mode}"]`).checked = true;

    const days = task ? task.weekdays : [];
    for (const input of el.weekdayRow.querySelectorAll('input')) {
      input.checked = days.includes(Number(input.value));
    }

    el.taskTarget.value = String(task?.target ?? 12);

    /* La fecha es obligatoria, así que el campo nunca sale vacío.

       ALTA: hoy. Una tarea que se da de alta suele empezar el día en que se la
       crea. Ojo con crear parado en un mes ANTERIOR al actual: hoy queda
       después de todo ese mes y la fila nace apagada. Es correcto según el
       modelo —la tarea todavía no existía— y se corrige moviendo la fecha.

       EDICIÓN: la fecha de la tarea, que es un dato ya elegido. Y si no tiene
       —una tarea anterior a que el campo fuera obligatorio—, el día 1 del mes
       visible, NO hoy. Proponer hoy acá recortaría el historial: guardar sin
       tocar nada apagaría todos los días ya cargados anteriores a la fecha, y
       dejarían de contar para la meta. El día 1 es justamente lo que significaba
       no tener fecha, así que completarla no cambia nada. */
    el.taskStart.value = task
      ? task.start || dateKey(new Date(ui.year, ui.month, 1))
      : dateKey(today);

    syncFreqFields();
    el.taskDialog.showModal();
    el.taskName.focus();
    el.taskName.select();
  }

  el.taskForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!ensureEditable()) return el.taskDialog.close();

    const name = capitalizeFirstLetter(el.taskName.value.trim());
    const freq = currentFreq();
    const customMode = currentCustomMode();
    const weekdays = selectedWeekdays();
    const rawTarget = Number(el.taskTarget.value);
    // Se valida el formato además de la presencia: un navegador sin soporte de
    // `input[type=date]` lo degrada a texto libre y acepta cualquier cosa.
    const start = RE_DIA.test(el.taskStart.value) ? el.taskStart.value : null;

    if (!name) return showFormError('Escribí un nombre para la tarea.');
    if (freq === 'custom' && customMode === 'weekdays' && !weekdays.length) {
      return showFormError('Elegí al menos un día de la semana.');
    }
    if (freq === 'custom' && customMode === 'count'
        && (!Number.isInteger(rawTarget) || rawTarget < 1 || rawTarget > 99)) {
      return showFormError('La meta mensual tiene que ser un número entero entre 1 y 99.');
    }
    if (!start) return showFormError('Elegí la fecha de inicio de la tarea.');

    const fields = { name, freq, customMode, weekdays, target: clampTarget(rawTarget), start };

    /* EDICIÓN: la tarea ya vive en la lista del mes visible, así que se la
       modifica ahí. Cambiarle la fecha no la muda de mes: mudarla partiría en
       dos su historial, y correr un inicio unos días es algo que se hace todo
       el tiempo. */
    if (ui.editingId) {
      const task = materialize().find(t => t.id === ui.editingId);
      if (task) Object.assign(task, fields);

      save();
      el.taskDialog.close();
      render();
      toast('Tarea actualizada');
      ui.editingId = null;
      return;
    }

    /* ALTA: manda la fecha, no el mes que se esté mirando. Es lo mismo que
       hacen las plantillas, y evita que dar de alta algo desde un mes viejo lo
       cree ahí con la fila entera apagada. */
    const inicio = parseDateKey(start);
    const year = inicio.getFullYear();
    const month = inicio.getMonth();
    const nombreMes = labelDeMes(year, month);

    // El bloqueo que corresponde es el del mes DESTINO. El del visible ya lo
    // miró `ensureEditable()` al entrar.
    if (isLocked(year, month)) {
      return showFormError(`${capitalizeFirstLetter(nombreMes)} está bloqueado.`);
    }

    materialize(year, month).push({ id: newId(), ...fields });
    save();
    el.taskDialog.close();

    // Se sigue a la tarea hasta el mes donde quedó, si no es el que se veía.
    ui.year = year;
    ui.month = month;
    ui.selected.clear();
    ui.windowIndex = windowIndexFor(inicio);
    render();

    toast(`Tarea creada en ${nombreMes}`);
    ui.editingId = null;
  });

  function showFormError(msg) {
    el.taskError.textContent = msg;
    el.taskError.hidden = false;
  }

  /** Borra tareas del mes visible junto con sus estados de ESE mes. */
  function deleteTasks(ids) {
    const month = monthKey(ui.year, ui.month);
    materialize();
    state.months[month] = state.months[month].filter(t => !ids.has(t.id));

    // Solo los estados de este mes: los de meses anteriores siguen siendo válidos.
    for (const key of statusKeysOf(ids, month)) delete state.status[key];

    for (const id of ids) ui.selected.delete(id);
    save();
    render();
  }

  function askDeleteTask(taskId) {
    if (!ensureEditable()) return;
    const task = currentTasks().find(t => t.id === taskId);
    if (!task) return;

    confirmAction(
      `Se va a eliminar «${task.name}» de ${labelDeMes()}, `
      + 'junto con los estados cargados ese mes.',
      () => {
        deleteTasks(new Set([taskId]));
        toast('Tarea eliminada');
      },
      { note: 'Los periodos anteriores no se verán modificados.' },
    );
  }

  function askDeleteSelected() {
    if (!ensureEditable()) return;
    const tasks = currentTasks().filter(t => ui.selected.has(t.id));
    if (!tasks.length) return;
    // Con una sola, el mensaje que la nombra es más claro que el genérico.
    if (tasks.length === 1) return askDeleteTask(tasks[0].id);

    confirmAction(
      `Se van a eliminar estas ${tasks.length} tareas de `
      + `${labelDeMes()}, junto con los estados `
      + 'cargados ese mes:',
      () => {
        deleteTasks(new Set(tasks.map(t => t.id)));
        toast(`${tasks.length} tareas eliminadas`);
      },
      {
        items: tasks.map(t => t.name),
        note: 'Los periodos anteriores no se verán modificados.',
      },
    );
  }

  /** Claves de estado de esas tareas dentro del mes visible. */
  function statusKeysOf(ids, month) {
    return Object.keys(state.status).filter(key => {
      const [taskId, iso] = key.split('|');
      return ids.has(taskId) && iso && iso.startsWith(`${month}-`);
    });
  }

  /** Claves de estado de esas tareas dentro de un conjunto concreto de días. */
  function statusKeysIn(ids, days) {
    const fechas = new Set(days.map(dateKey));
    return Object.keys(state.status).filter(key => {
      const [taskId, iso] = key.split('|');
      return ids.has(taskId) && fechas.has(iso);
    });
  }

  /** Cómo nombrar el rango visible en un mensaje: el mes, la semana o el día. */
  function rangeLabel(days) {
    if (!days.length) return '';
    if (ui.view === 'month') return monthYearLabel(days[0]);
    return spanLabel(days);
  }

  function askResetSelected() {
    if (!ensureEditable()) return;
    const tasks = currentTasks().filter(t => ui.selected.has(t.id));
    if (!tasks.length) return;

    // Alcance: lo que se ve. En vista semanal borra esa semana, en diaria ese
    // día, en mensual el mes entero.
    const { days } = visibleDays();
    const keys = statusKeysIn(new Set(tasks.map(t => t.id)), days);
    const rango = rangeLabel(days);

    if (!keys.length) {
      toast(`Esas tareas no tienen estados cargados en ${rango}`);
      return;
    }

    const cuantas = tasks.length === 1 ? 'esta tarea' : `estas ${tasks.length} tareas`;
    confirmAction(
      `Se van a borrar ${keys.length} estado(s) cargados de ${cuantas} en ${rango}, `
      + 'y las celdas vuelven a "sin cargar":',
      () => {
        for (const key of keys) delete state.status[key];
        ui.selected.clear();
        save();
        render();
        toast(`${keys.length} estado(s) reseteados`);
      },
      {
        ok: 'Resetear',
        items: tasks.map(t => t.name),
        note: 'Las tareas y su configuración no se tocan, y fuera del rango '
          + 'visible no se borra nada.',
      },
    );
  }

  /**
   * @param text  párrafo principal
   * @param onOk  qué hacer al confirmar
   * @param opts  `items` se lista con viñetas debajo; `note` es una aclaración
   *   al pie; `ok` es el rótulo del botón, que vuelve solo a "Eliminar" al
   *   cerrarse el diálogo.
   */
  function confirmAction(text, onOk, opts = {}) {
    el.confirmText.textContent = text;

    const items = opts.items || [];
    el.confirmList.innerHTML = '';
    el.confirmList.hidden = !items.length;
    for (const item of items) el.confirmList.appendChild(elem('li', '', item));

    el.confirmNote.textContent = opts.note || '';
    el.confirmNote.hidden = !opts.note;

    el.confirmOk.textContent = opts.ok || OK_POR_DEFECTO;

    ui.onConfirm = onOk;
    el.confirmDialog.showModal();
  }

  el.confirmOk.addEventListener('click', () => {
    el.confirmDialog.close();
    const fn = ui.onConfirm;
    ui.onConfirm = null;
    if (fn) fn();
  });

  for (const btn of document.querySelectorAll('[data-close-dialog]')) {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  }

  // Los dos accesos al alta: el de la barra del mes y el del estado vacío.
  for (const btn of document.querySelectorAll('[data-add-task]')) {
    btn.addEventListener('click', () => openTaskDialog());
  }

  // ---------------------------------------------------------
  // Plantillas
  // ---------------------------------------------------------

  /*  El diálogo NO exige que el mes visible sea editable. La fecha de inicio
      decide a qué mes van las tareas, así que estar parado en un mes bloqueado
      no impide agregar a otro. El bloqueo se comprueba contra el mes destino,
      que es el único que se va a tocar. */

  function openTemplates() {
    /* Cada apertura vuelve a hoy. No recuerda la fecha anterior a propósito:
       esa fecha decide a qué mes van las tareas, y arrastrarla mandaría la
       próxima plantilla a un mes que nadie volvió a elegir.

       Ojo: la fecha, no el mes que se está mirando, es lo que fija el destino.
       Con el valor por omisión, abrir el diálogo parado en otro mes propone
       igual el mes actual — lo dice la ayuda debajo del campo. */
    el.templatesStart.value = dateKey(today);

    el.templatesList.innerHTML = '';
    for (const tpl of TEMPLATES) el.templatesList.appendChild(templateCard(tpl));

    syncTemplatesTarget();
    el.templatesDialog.showModal();
    $('#templates-title').focus();
  }

  /**
   * Mes al que van a parar las tareas, o null si todavía no se eligió fecha.
   * La fecha manda sobre la navegación: pedir que arranquen el 15 de septiembre
   * y que aparezcan en el mes que quedó abierto sería otra cosa.
   */
  function templatesTarget() {
    const start = templatesStart();
    if (!start) return null;
    const d = parseDateKey(start);
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  /** Ayuda y botones, que dependen de la fecha elegida y del mes al que apunta. */
  function syncTemplatesTarget() {
    const destino = templatesTarget();
    const nombre = destino ? labelDeMes(destino.year, destino.month) : '';
    const bloqueado = Boolean(destino) && isLocked(destino.year, destino.month);

    /* El nombre del mes viene en minúscula del locale, y así va bien en medio
       de una oración. Donde la abre hay que capitalizarlo a mano: el encabezado
       se apoya en un `text-transform` del CSS que acá no alcanza. */
    /* Con una fecha válida y el mes destino editable no se dice nada: el botón
       ya nombra a dónde van las tareas. La ayuda queda para los dos casos en
       los que el botón está apagado y hace falta explicar por qué. */
    el.templatesStartHint.textContent = !destino
      ? 'Elegí la fecha en la que arrancan las tareas.'
      : bloqueado
        ? `${capitalizeFirstLetter(nombre)} está bloqueado. Hay que desbloquearlo para `
          + 'poder agregarle tareas.'
        : '';

    // Vacío no alcanza: el `gap` de .field dejaría un escalón bajo el campo.
    el.templatesStartHint.hidden = !el.templatesStartHint.textContent;

    /* Sin fecha no hay a dónde agregar, y un mes bloqueado no admite cambios.
       En los dos casos el botón se apaga en vez de dejar que el clic falle: el
       diálogo dice por qué antes de que nadie lo intente. */
    for (const btn of el.templatesList.querySelectorAll('.tpl-add')) {
      btn.disabled = !destino || bloqueado;
      btn.title = !destino
        ? 'Elegí primero una fecha de inicio'
        : bloqueado
          ? `${capitalizeFirstLetter(nombre)} está bloqueado`
          : `Agregar a ${nombre}`;
    }
  }

  // La fecha redirige la plantilla a otro mes: los rótulos lo dicen al instante.
  el.templatesStart.addEventListener('input', syncTemplatesTarget);
  el.templatesStart.addEventListener('change', syncTemplatesTarget);

  /**
   * Convierte una entrada de plantilla en una tarea completa, sin id.
   * `target` la vuelve meta mensual; `weekdays`, días fijos.
   *
   * @param start fecha de inicio `YYYY-MM-DD` para toda la plantilla, o null.
   *   Las plantillas no la traen: la elige quien las aplica. Al dibujar la
   *   ficha de la plantilla se omite, porque ahí todavía no hay fecha elegida.
   */
  function templateTask(item, start = null) {
    const porConteo = typeof item.target === 'number';
    return {
      name: capitalizeFirstLetter(item.name.trim()),
      freq: item.freq,
      customMode: porConteo ? 'count' : 'weekdays',
      weekdays: item.weekdays ? [...item.weekdays] : [],
      target: porConteo ? item.target : 12,
      start,
    };
  }

  /**
   * Fecha de inicio elegida en el diálogo, o null si quedó vacía.
   * Un `input[type=date]` devuelve `YYYY-MM-DD` o cadena vacía, pero se valida
   * igual: los navegadores sin soporte lo degradan a campo de texto libre.
   */
  function templatesStart() {
    const valor = el.templatesStart.value;
    return RE_DIA.test(valor) ? valor : null;
  }

  function templateCard(tpl) {
    const card = elem('article', 'tpl');

    const add = boton('btn btn-primary tpl-add', { text: 'Agregar' });
    add.addEventListener('click', () => applyTemplate(tpl));

    const head = elem('header', 'tpl-head');
    head.append(elem('h3', 'tpl-name', tpl.name), add);

    const desc = elem('p', 'tpl-desc', `${tpl.tasks.length} tareas · ${tpl.description}`);

    const list = elem('ul', 'tpl-tasks');
    for (const item of tpl.tasks) {
      const task = templateTask(item);
      const li = elem('li', '', task.name);
      li.title = `${task.name} — ${freqLabel(task)}`;
      list.appendChild(li);
    }

    card.append(head, desc, list);
    return card;
  }

  function applyTemplate(tpl) {
    const start = templatesStart();
    const destino = templatesTarget();

    // Los botones ya salen apagados sin fecha; esto cubre el resto de los
    // caminos —un Enter, el teclado— sin depender de que la UI se adelante.
    if (!destino) {
      toast('Elegí una fecha de inicio');
      return;
    }

    const { year, month } = destino;
    const nombreMes = labelDeMes(year, month);

    // El bloqueo que importa es el del mes DESTINO, no el del que se está
    // mirando. `ensureEditable()` no sirve acá: siempre mira el visible.
    if (isLocked(year, month)) {
      toast(`${capitalizeFirstLetter(nombreMes)} está bloqueado`);
      return;
    }

    const tasks = materialize(year, month);
    // Se comparan contra los nombres que YA estaban EN ESE MES: así una
    // plantilla que repite un nombre a propósito entra completa, pero volver a
    // aplicarla no duplica nada.
    const existentes = new Set(tasks.map(t => t.name.trim().toLowerCase()));

    let agregadas = 0;
    for (const item of tpl.tasks) {
      const task = templateTask(item, start);
      if (existentes.has(task.name.toLowerCase())) continue;
      tasks.push({ id: newId(), ...task });
      agregadas += 1;
    }

    const omitidas = tpl.tasks.length - agregadas;
    save();
    el.templatesDialog.close();

    /* Se sigue a las tareas hasta donde fueron. Quedarse en el mes anterior
       dejaría un aviso de «6 tareas agregadas» sobre una pantalla en la que no
       cambió nada, que es indistinguible de un error. */
    ui.year = year;
    ui.month = month;
    ui.selected.clear();
    // La fecha es obligatoria, así que siempre hay una ventana a la que ir.
    ui.windowIndex = windowIndexFor(parseDateKey(start));
    irA('home');

    if (!agregadas) toast(`Esas tareas ya estaban en ${nombreMes}`);
    else toast(`${agregadas} tarea(s) agregadas a ${nombreMes}`
      + ` desde el ${fmtShort.format(parseDateKey(start))}`
      + (omitidas ? ` · ${omitidas} ya estaban` : ''));
  }

  // ---------------------------------------------------------
  // Menú lateral
  // ---------------------------------------------------------

  function setDrawer(open) {
    document.body.classList.toggle('drawer-open', open);
    el.menu.setAttribute('aria-expanded', String(open));
    if (open) $('#btn-menu-close').focus();
    else el.menu.focus();
  }

  el.menu.addEventListener('click', () => setDrawer(true));
  $('#btn-menu-close').addEventListener('click', () => setDrawer(false));
  el.drawerBackdrop.addEventListener('click', () => setDrawer(false));

  // Los paneles de Análisis recuerdan si quedaron plegados.
  el.panelTiles.addEventListener('toggle', () => {
    state.panels.tiles = el.panelTiles.open;
    save();
  });
  el.panelCharts.addEventListener('toggle', () => {
    state.panels.charts = el.panelCharts.open;
    save();
  });

  // Alterna entre las dos secciones sin pasar por el menú.
  el.pageToggle.addEventListener('click', () => {
    irA(ui.page === 'home' ? 'indicators' : 'home');
  });

  el.drawer.addEventListener('click', e => {
    const item = e.target.closest('[data-page]');
    if (!item) return;

    // Son enlaces de verdad: ctrl/cmd/rueda abren la sección en otra pestaña.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    e.preventDefault();
    setDrawer(false);
    irA(item.dataset.page);
  });

  el.templates.addEventListener('click', () => {
    setDrawer(false);
    openTemplates();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) {
      setDrawer(false);
    }
  });

  // ---------------------------------------------------------
  // Acciones del mes
  // ---------------------------------------------------------

  el.copyPrev.addEventListener('click', () => {
    if (!ensureEditable()) return;

    const prev = previousMonth();
    const source = tasksOf(prev.year, prev.month);
    if (!source.length) return;

    const prevName = labelDeMes(prev.year, prev.month);
    const thisName = labelDeMes();
    const current = currentTasks().length;

    confirmAction(
      `Se reemplazarán las ${current} tarea(s) de ${thisName} por las ${source.length} de ${prevName}. `
      + 'Las tareas que no estén en el mes anterior se pierden junto con sus estados de este mes; '
      + 'los periodos anteriores no se verán modificados.',
      () => copyFromPreviousMonth(source),
      { ok: 'Reemplazar' },
    );
  });

  /**
   * Reemplaza la lista del mes visible por una copia de la del mes anterior.
   * Conserva los ids, así los estados ya cargados este mes sobreviven para las
   * tareas que siguen existiendo; los del resto se descartan.
   */
  function copyFromPreviousMonth(source) {
    const key = monthKey(ui.year, ui.month);
    const copy = source.map(t => ({ ...t, weekdays: [...t.weekdays] }));
    const keep = new Set(copy.map(t => t.id));

    for (const statusK of Object.keys(state.status)) {
      const [taskId, iso] = statusK.split('|');
      if (!iso || !iso.startsWith(`${key}-`)) continue;
      if (!keep.has(taskId)) delete state.status[statusK];
    }

    state.months[key] = copy;
    save();
    render();
    toast(`${copy.length} tarea(s) copiadas del mes anterior`);
  }

  el.deleteSel.addEventListener('click', askDeleteSelected);
  el.resetSel.addEventListener('click', askResetSelected);

  el.lock.addEventListener('click', () => {
    const key = monthKey(ui.year, ui.month);
    const name = labelDeMes();

    if (isLocked()) {
      delete state.locked[key];
      save();
      render();
      toast(`${name} desbloqueado`);
    } else {
      state.locked[key] = true;
      ui.selected.clear();   // un mes bloqueado no admite borrado múltiple
      save();
      render();
      toast(`${name} bloqueado`);
    }
  });

  // ---------------------------------------------------------
  // Exportar / importar
  // ---------------------------------------------------------

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tareas-diarias-${dateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Copia descargada');
  });

  $('#btn-import').addEventListener('click', () => $('#file-import').click());

  $('#file-import').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = normalize(JSON.parse(await file.text()));
      const months = Object.keys(parsed.months).length;
      confirmAction(
        `El archivo tiene ${months} mes(es) con tareas y ${Object.keys(parsed.status).length} `
        + 'estado(s) cargados. Se reemplazarán todos los datos actuales.',
        () => {
          state = parsed;
          save();
          applyTheme();
          applyZoom();
          render();
          toast('Datos importados');
        },
        { ok: 'Importar' },
      );
    } catch (err) {
      console.error(err);
      toast('El archivo no es válido');
    }
  });

  // Red de seguridad: el rótulo lo fija confirmAction en cada apertura, pero
  // dejarlo en el valor por defecto evita que un diálogo cerrado se quede
  // mostrando "Reemplazar" si alguien lo abriera por otro camino.
  el.confirmDialog.addEventListener('close', () => {
    el.confirmOk.textContent = OK_POR_DEFECTO;
  });

  // ---------------------------------------------------------
  // Tema
  // ---------------------------------------------------------

  function loadSavedTheme() {
    try {
      const rawTheme = localStorage.getItem('tareas-diarias/theme');
      if (rawTheme) {
        const parsed = JSON.parse(rawTheme);
        if (parsed === 'light' || parsed === 'dark') return parsed;
      }
    } catch (err) {
      // Ignorar si no hay acceso a localStorage o los datos no son JSON.
    }
    return null;
  }

  function applyTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!state.theme) {
      state.theme = loadSavedTheme();
    }
    const theme = state.theme || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.body.style.background = theme === 'dark' ? '#0d1220' : '#f4f6fb';
    document.body.style.color = theme === 'dark' ? '#e7ecf7' : '#16203a';
    el.theme.textContent = theme === 'dark' ? '☀' : '☾';
    el.theme.title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';

    try {
      localStorage.setItem('tareas-diarias/theme', JSON.stringify(theme));
    } catch (err) {
      // Ignorar fallos de localStorage.
    }
    try {
      localStorage.setItem(`${STORAGE_KEY}/theme`, JSON.stringify(theme));
    } catch (err) {
      // Ignorar fallos de localStorage.
    }
  }

  el.theme.addEventListener('click', () => {
    state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    save();
    applyTheme();
  });

  // ---------------------------------------------------------
  // Zoom de la planilla (solo móvil)
  // ---------------------------------------------------------
  //  El nivel se publica como atributo en <html> y el CSS hace el resto, dentro
  //  del breakpoint angosto. En escritorio el botón no se ve y el atributo no
  //  cambia nada: no hay medidas atadas a él fuera de ese bloque.

  const zoomLabel = id => ZOOM_LEVELS.find(z => z.id === id)?.label ?? 'Normal';

  function nextZoom() {
    const i = ZOOM_LEVELS.findIndex(z => z.id === state.zoom);
    return ZOOM_LEVELS[(i + 1) % ZOOM_LEVELS.length].id;
  }

  function applyZoom() {
    document.documentElement.dataset.zoom = state.zoom;
    el.zoomText.textContent = zoomLabel(state.zoom);
    el.zoom.title = `Tamaño de la planilla: ${zoomLabel(state.zoom).toLowerCase()}`
      + ` · clic para pasar a ${zoomLabel(nextZoom()).toLowerCase()}`;
    el.zoom.setAttribute('aria-label', el.zoom.title);
  }

  el.zoom.addEventListener('click', () => {
    state.zoom = nextZoom();
    save();
    applyZoom();
  });

  // ---------------------------------------------------------
  // Plegar los controles del período (solo móvil)
  // ---------------------------------------------------------
  //  Oculta todo lo que hay entre la línea del mes y la planilla: el selector
  //  de vista, la navegación del rango y las acciones del mes. En un teléfono
  //  eso son tres filas que empujan la planilla fuera de la pantalla.

  function applyCollapse() {
    const plegado = state.controlsCollapsed;
    document.body.classList.toggle('controls-collapsed', plegado);

    el.collapse.textContent = plegado ? '+' : '–';
    el.collapse.setAttribute('aria-expanded', String(!plegado));
    el.collapse.title = plegado
      ? 'Mostrar las vistas y las acciones del mes'
      : 'Ocultar las vistas y las acciones del mes';
    el.collapse.setAttribute('aria-label', el.collapse.title);
  }

  el.collapse.addEventListener('click', () => {
    state.controlsCollapsed = !state.controlsCollapsed;
    save();
    applyCollapse();
  });

  // ---------------------------------------------------------
  // Atajos de teclado
  // ---------------------------------------------------------

  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea') || document.querySelector('dialog[open]')) return;

    if (e.key === 'ArrowLeft') { shiftRangeOrMonth(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { shiftRangeOrMonth(1); e.preventDefault(); }
    // Dar de alta una tarea solo tiene sentido con la planilla a la vista.
    else if ((e.key === 'n' || e.key === 'N') && ui.page === 'home') {
      openTaskDialog();
      e.preventDefault();
    } else if (e.key === 't' || e.key === 'T') { goToToday(); e.preventDefault(); }
  });

  function shiftRangeOrMonth(delta) {
    // Fuera de la planilla no hay ventana que mover: las flechas cambian de mes.
    if (ui.page !== 'home' || ui.view === 'month') goToMonth(delta);
    else shiftRange(delta);
  }

  // ---------------------------------------------------------
  // Toast
  // ---------------------------------------------------------

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
  }

  // ---------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------
  //  La app no arranca sola: espera a que `auth.js` resuelva la sesión.
  //  El tema sí se aplica de entrada, para que la pantalla de login no
  //  aparezca en claro y salte a oscuro un instante después.

  applyTheme();
  applyZoom();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!state.theme) applyTheme();
  });

  /**
   * Los datos se guardan por usuario. La primera vez que alguien entra, si
   * había un diario de la época sin login, se lo queda: si no, al agregar
   * sesión se perdería de vista todo lo cargado hasta ahora.
   */
  function adoptarDatosPrevios() {
    try {
      const previos = localStorage.getItem(STORAGE_BASE);
      if (previos && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, previos);
      }
    } catch { /* almacenamiento no disponible: se sigue sin migrar */ }
  }

  function estadoVacio() {
    return {
      months: {}, status: {}, locked: {},
      complianceMode: 'glyph',
      zoom: 'normal',
      controlsCollapsed: false,
      panels: { tiles: true, charts: true },
      theme: state.theme,   // el tema es de la pantalla, no del usuario
    };
  }

  window.Habitos = {
    /** Llamado por auth.js cuando hay sesión. */
    async start(user) {
      adoptarDatosPrevios();
      await hydrateStateForUser(user);
      applyTheme();
      applyZoom();

      ui.year = today.getFullYear();
      ui.month = today.getMonth();
      ui.selected.clear();
      ui.windowIndex = windowIndexFor(today);

      // Los enlaces del menú se apuntan acá: `BASE` solo se conoce en runtime.
      for (const item of el.drawer.querySelectorAll('[data-page]')) {
        item.href = urlDe(item.dataset.page);
      }

      // Respeta la sección que pide la URL, así un enlace compartido abre donde
      // corresponde. `reemplazar` normaliza de paso el desvío de `404.html`.
      irA(pageDeUrl(), { reemplazar: true });
    },

    /** Llamado al cerrar sesión: no queda nada del usuario anterior en memoria. */
    stop() {
      currentUserId = null;
      state = estadoVacio();
      ui.selected.clear();
      el.grid.innerHTML = '';
      el.summary.innerHTML = '';
      el.charts.innerHTML = '';
      STORAGE_KEY = STORAGE_BASE;
    },
  };
})();
