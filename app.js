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

  /** Días que abarca cada vista. La mensual se resuelve aparte, como el mes entero. */
  const VIEW_SIZE = { day: 1, week: 7 };

  const LOCALE = 'es-AR';

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
   * Da al mes visible su propia copia de la lista, para poder modificarla
   * sin afectar los meses anteriores. Devuelve la lista editable.
   */
  function materialize() {
    const key = monthKey(ui.year, ui.month);
    if (!state.months[key]) {
      state.months[key] = currentTasks().map(t => ({ ...t, weekdays: [...t.weekdays] }));
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
      const start = typeof t.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.start)
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

  /** Mes más antiguo (`YYYY-MM`) que aparece en los estados guardados. */
  function earliestStatusMonth(status) {
    let earliest = null;
    for (const key of Object.keys(status && typeof status === 'object' ? status : {})) {
      const iso = String(key).split('|')[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) continue;
      const month = iso.slice(0, 7);
      if (!earliest || month < earliest) earliest = month;
    }
    return earliest;
  }

  /** Valida y sanea datos que vienen de localStorage o de un archivo importado. */
  function normalize(data) {
    if (!data || typeof data !== 'object') throw new Error('Formato inválido');

    const months = {};

    if (data.months && typeof data.months === 'object' && !Array.isArray(data.months)) {
      for (const [key, list] of Object.entries(data.months)) {
        // Una lista vacía es información válida: significa "este mes no tiene tareas".
        if (!/^\d{4}-\d{2}$/.test(key) || !Array.isArray(list)) continue;
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
    const src = data.status && typeof data.status === 'object' ? data.status : {};
    const ids = new Set(Object.values(months).flat().map(t => t.id));
    for (const [key, value] of Object.entries(src)) {
      if (!['done', 'partial', 'missed', 'skip'].includes(value)) continue;
      const [taskId, iso] = String(key).split('|');
      if (!ids.has(taskId) || !/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) continue;
      status[key] = value;
    }

    const locked = {};
    const srcLocked = data.locked && typeof data.locked === 'object' ? data.locked : {};
    for (const [key, value] of Object.entries(srcLocked)) {
      if (/^\d{4}-\d{2}$/.test(key) && value === true) locked[key] = true;
    }

    const theme = data.theme === 'light' || data.theme === 'dark' ? data.theme : null;
    return {
      months,
      status,
      locked,
      complianceMode: CP_MODES.some(m => m.id === data.complianceMode)
        ? data.complianceMode
        : 'glyph',
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
    // Se separan los puntos de días ya transcurridos: el cumplimiento compara
    // contra la meta a hoy, así que ambos lados tienen que cubrir la misma
    // ventana. Si no, marcar un día futuro inflaría el porcentaje.
    let points = 0;
    let elapsedPoints = 0;
    for (const d of days) {
      const s = getStatus(task, d);
      if (!s) continue;
      points += POINTS[s];
      if (d <= today) elapsedPoints += POINTS[s];
    }

    if (isCountMode(task)) {
      return { points, elapsedPoints, ...countModeGoal(task, days) };
    }

    const periods = new Set();
    const elapsed = new Set();
    for (const d of days) {
      if (!countsTowardGoal(task, d)) continue;
      const id = periodId(task, d);
      periods.add(id);
      // Un período cuenta apenas empieza, igual que un día cuenta desde que amanece.
      if (d <= today) elapsed.add(id);
    }

    return { points, elapsedPoints, max: periods.size, goal: elapsed.size };
  }

  /**
   * Meta de una tarea con meta mensual: el número que cargó el usuario es para
   * el mes entero, así que en una ventana más chica se reparte proporcionalmente
   * entre los días elegibles. El mes completo siempre devuelve el número exacto.
   */
  function countModeGoal(task, days) {
    if (!days.length) return { max: 0, goal: 0 };

    const first = days[0];
    const eligibleInMonth = monthDays(first.getFullYear(), first.getMonth())
      .filter(d => countsTowardGoal(task, d)).length;
    if (!eligibleInMonth) return { max: 0, goal: 0 };

    const share = task.target / eligibleInMonth;
    const inRange = days.filter(d => countsTowardGoal(task, d));

    return {
      max: share * inRange.length,
      goal: share * inRange.filter(d => d <= today).length,
    };
  }

  /**
   * Meta de todo el rango. Se suma por filas y no por columnas: la de una tarea
   * periódica es su cantidad de períodos, mientras que la de una columna solo
   * dice cuánto se podría marcar ese día puntual.
   */
  function rangeTotals(days) {
    return currentTasks().reduce((acc, task) => {
      const t = taskTotals(task, days);
      acc.points += t.points;
      acc.elapsedPoints += t.elapsedPoints;
      acc.max += t.max;
      acc.goal += t.goal;
      return acc;
    }, { points: 0, elapsedPoints: 0, max: 0, goal: 0 });
  }

  /**
   * Nivel de cumplimiento de unos puntos contra su meta.
   * Devuelve null si no hay meta en el rango (por ejemplo, una tarea de lunes a
   * viernes mirada en la vista diaria de un sábado): ahí no hay nada que medir.
   */
  function complianceOf(points, max) {
    if (max <= 0) return null;
    const ratio = (points / max) * 100;
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
    copyPrev: $('#btn-copy-prev'),
    deleteSel: $('#btn-delete-sel'),
    deleteSelText: $('#delete-sel-text'),
    resetSel: $('#btn-reset-sel'),
    lock: $('#btn-lock'),
    lockText: $('#lock-text'),
    lockedNote: $('#locked-note'),
    controlsCenter: $('#controls-center'),
    monthBar: $('#month-bar'),
    board: $('#board'),
    legend: $('#legend'),
    drawer: $('#drawer'),
    drawerBackdrop: $('#drawer-backdrop'),
    menu: $('#btn-menu'),
    pageToggle: $('#btn-page-toggle'),
    analysis: $('#analysis'),
    charts: $('#charts'),
    templates: $('#btn-templates'),
    templatesDialog: $('#templates-dialog'),
    templatesList: $('#templates-list'),
    templatesIntro: $('#templates-intro'),
    panelTiles: $('#panel-tiles'),
    panelCharts: $('#panel-charts'),
  };

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------

  function render() {
    const onHome = ui.page === 'home';
    const onHelp = ui.page === 'help';
    const { days, count } = visibleDays();

    // El selector de mes se muestra siempre: los indicadores también son mensuales.
    el.monthLabel.textContent = monthYearLabel(new Date(ui.year, ui.month, 1));

    // El atajo junto al mes alterna entre planilla e indicadores. En la guía no
    // aparece: ahí se sale por el menú.
    el.pageToggle.hidden = onHelp;
    el.pageToggle.querySelector('.nav-icon').textContent = onHome ? '◔' : '▦';
    el.pageToggle.querySelector('.nav-text').textContent = onHome ? 'Análisis' : 'Diario';
    el.pageToggle.title = onHome
      ? 'Ver el análisis de este mes'
      : 'Volver a la planilla';

    // Vista y navegación del rango solo aplican a la planilla.
    el.controlsCenter.hidden = !onHome;
    el.rangeNav.hidden = !onHome || ui.view === 'month';
    el.monthBar.hidden = !onHome;
    el.board.hidden = !onHome;
    el.legend.hidden = !onHome;
    el.analysis.hidden = onHome || onHelp;
    $('#help').hidden = !onHelp;

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
      const a = days[0];
      const b = days[days.length - 1];
      el.rangeLabel.textContent = sameDay(a, b)
        ? fmtDayLong.format(a)
        : `${fmtShort.format(a)} – ${fmtShort.format(b)}`;
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
    const prevName = monthYearLabel(new Date(prev.year, prev.month, 1));

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
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    hrow.appendChild(taskColumnHeader());

    for (const d of days) {
      const cell = th('', 'col-day', 'col');
      if (isWeekend(d)) cell.classList.add('is-weekend');
      if (sameDay(d, today)) cell.classList.add('is-today');

      const dow = document.createElement('span');
      dow.className = 'dow';
      dow.textContent = fmtDow.format(d).replace('.', '').slice(0, 3);

      const dnum = document.createElement('span');
      dnum.className = 'dnum';
      dnum.textContent = String(d.getDate());

      cell.append(dow, dnum);
      cell.title = fmtFull.format(d);
      hrow.appendChild(cell);
    }

    hrow.appendChild(complianceHeader());
    thead.appendChild(hrow);
    frag.appendChild(thead);

    // --- tbody ---
    const tbody = document.createElement('tbody');

    const tasks = currentTasks();
    tasks.forEach((task, index) => {
      const tr = document.createElement('tr');
      tr.dataset.taskId = task.id;
      tr.appendChild(taskHeaderCell(task, index, tasks.length));

      for (const d of days) {
        const td = document.createElement('td');
        td.className = 'cell-td';
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

    // El relleno de la fila de alta cubre los días más la columna de cumplimiento.
    if (!isLocked()) tbody.appendChild(addTaskRow(days.length + 1));
    frag.appendChild(tbody);

    // --- tfoot ---
    const tfoot = document.createElement('tfoot');
    const frow = document.createElement('tr');
    frow.appendChild(th('Tareas Diarias Completadas', 'col-task', 'row'));

    for (const d of days) {
      const { points, max } = dayTotals(d);

      const td = document.createElement('td');
      td.className = 'col-day';
      if (isWeekend(d)) td.classList.add('is-weekend');

      const span = document.createElement('span');
      span.className = 'day-total';
      if (points === 0) span.classList.add('is-zero');
      else if (max > 0 && points >= max) span.classList.add('is-full');
      span.textContent = num(points);
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

    // Las acciones sobre la selección viven en la barra del mes; la fila de
    // abajo se queda siempre como el botón de alta.
    el.deleteSel.hidden = count === 0;
    el.resetSel.hidden = count === 0;
    el.deleteSelText.textContent = `Eliminar ${count} ${count === 1 ? 'tarea' : 'tareas'}`;

    // El reseteo alcanza solo lo visible, así que el botón lo anticipa.
    if (count) {
      const rango = rangeLabel(visibleDays().days);
      el.deleteSel.title = `Las saca de ${monthYearLabel(new Date(ui.year, ui.month, 1))}`;
      el.resetSel.title = `Deja en «sin cargar» las celdas de ${rango}`;
    }

    const btn = el.grid.querySelector('[data-add-task]');
    if (btn) btn.textContent = '+ Agregar tarea';
  }

  function th(text, className, scope) {
    const node = document.createElement('th');
    node.className = className;
    if (scope) node.scope = scope;
    if (text) node.textContent = text;
    return node;
  }

  function taskHeaderCell(task, index, total) {
    const cell = document.createElement('th');
    cell.className = 'col-task';
    cell.scope = 'row';

    const wrap = document.createElement('div');
    wrap.className = 'task-cell';

    const locked = isLocked();

    const pick = document.createElement('input');
    pick.type = 'checkbox';
    pick.className = 'task-pick';
    pick.dataset.taskId = task.id;
    pick.checked = ui.selected.has(task.id);
    pick.disabled = locked;
    pick.title = `Seleccionar «${task.name}»`;
    pick.setAttribute('aria-label', `Seleccionar ${task.name}`);

    const move = document.createElement('div');
    move.className = 'move-stack';
    move.append(
      moveButton('up', '▲', task, locked || index === 0, `Subir «${task.name}»`),
      moveButton('down', '▼', task, locked || index === total - 1, `Bajar «${task.name}»`),
    );

    // El nombre hace de agarre para arrastrar: blanco grande y no interactivo.
    const info = document.createElement('div');
    info.className = 'task-info';
    if (!locked) {
      info.dataset.dragHandle = '';
      info.title = 'Arrastrá para reordenar';
    }

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = task.name;
    name.title = task.name;

    const freq = document.createElement('span');
    freq.className = 'task-freq';
    freq.textContent = freqLabel(task);
    // La fecha de inicio no se escribe en la fila para no alargarla; se consulta acá.
    freq.title = task.start
      ? `${freqLabel(task)} — empieza el ${fmtShort.format(parseDateKey(task.start))}`
      : freqLabel(task);

    info.append(name, freq);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'mini-btn';
    edit.dataset.action = 'edit';
    edit.title = `Editar «${task.name}»`;
    edit.setAttribute('aria-label', `Editar ${task.name}`);
    edit.textContent = '✎';

    // El borrado vive en el casillero de selección + la fila de abajo.
    edit.disabled = locked;
    actions.appendChild(edit);
    wrap.append(pick, move, info, actions);
    cell.appendChild(wrap);
    return cell;
  }

  function moveButton(dir, glyph, task, disabled, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'move-btn';
    btn.dataset.action = dir === 'up' ? 'move-up' : 'move-down';
    btn.disabled = disabled;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    return btn;
  }

  /** Fila final, siempre visible, para seguir sumando tareas. */
  function addTaskRow(colSpan) {
    const tr = document.createElement('tr');
    tr.className = 'add-row';

    const head = document.createElement('th');
    head.className = 'col-task';
    head.scope = 'row';

    // El rótulo lo define syncSelection(): con dos o más tareas tildadas,
    // este mismo botón pasa a ser el de borrado múltiple.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'add-task-btn';
    btn.dataset.addTask = '';
    head.appendChild(btn);

    const filler = document.createElement('td');
    filler.colSpan = colSpan;

    tr.append(head, filler);
    return tr;
  }

  function statusButton(task, date) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
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

    const wrap = document.createElement('div');
    wrap.className = 'task-head';

    const all = document.createElement('input');
    all.type = 'checkbox';
    all.className = 'task-pick';
    all.dataset.pickAll = '';
    all.disabled = isLocked();
    all.title = 'Seleccionar todas las tareas';
    all.setAttribute('aria-label', 'Seleccionar todas las tareas');

    const label = document.createElement('span');
    label.textContent = 'Tareas';

    wrap.append(all, label);
    cell.appendChild(wrap);
    return cell;
  }

  /** Encabezado de la columna: un botón que cicla entre los cuatro modos. */
  function complianceHeader() {
    const cell = th('', 'col-total', 'col');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'col-total-btn';
    btn.dataset.complianceMode = '';
    btn.textContent = 'Estatus';

    // El modo activo se lee en el propio encabezado, no solo en el tooltip.
    const mode = document.createElement('span');
    mode.className = 'cp-mode';
    mode.textContent = modeLabel(state.complianceMode);
    btn.appendChild(mode);

    btn.title = `Clic para ver ${modeLabel(nextComplianceMode())}`;

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
    const td = document.createElement('td');
    td.className = `col-total compliance ${extraClass}`.trim();

    const glyph = document.createElement('span');
    glyph.className = 'cp-glyph';

    const ratio = document.createElement('span');
    ratio.className = 'cp-pct';

    // Ambos se dibujan siempre; cuál se ve lo decide la clase `cpm-*` de la tabla.
    td.append(glyph, ratio);
    applyCompliance(td, totals);
    return td;
  }

  /**
   * @param totals {{points, elapsedPoints, goal, max}} — `elapsedPoints` contra
   *   `goal` mide el día de hoy; `points` contra `max`, el período completo.
   */
  function applyCompliance(td, totals) {
    const { points, elapsedPoints, goal, max } = totals;
    const level = complianceOf(elapsedPoints, goal);

    td.classList.remove('cp-done', 'cp-partial', 'cp-missed');
    if (level) td.classList.add(`cp-${level.status}`);

    const glyph = td.querySelector('.cp-glyph');
    const ratio = td.querySelector('.cp-pct');
    td.classList.toggle('cp-empty', !level);

    if (level) {
      glyph.textContent = level.glyph;
      ratio.textContent = pct(level.ratio);
      td.title = `${pct(level.ratio)} de cumplimiento — ${num(elapsedPoints)} `
        + `sobre una meta de ${num(goal)} al día de hoy`
        + (goal < max ? `\nAl cierre del período: ${num(points)} de ${num(max)}.` : '');
      return;
    }

    // Sin nada que medir: o la frecuencia no pide nada en el rango, o el rango
    // todavía no empezó. Un guion en cualquiera de los tres modos.
    glyph.textContent = '—';
    ratio.textContent = '—';
    td.title = max > 0
      ? `Todavía no transcurrieron días de este período (meta al cierre: ${num(max)})`
      : 'La frecuencia de la tarea no pide ningún día del rango visible';
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
      return complianceOf(t.elapsedPoints, t.goal)?.status === 'missed';
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

  /** Cumplimiento (0-100) de un mes entero, con las tareas propias de ese mes. */
  function monthCompliance(year, month) {
    const days = monthDays(year, month);
    let elapsedPoints = 0;
    let goal = 0;
    for (const task of tasksOf(year, month)) {
      const t = taskTotals(task, days);
      elapsedPoints += t.elapsedPoints;
      goal += t.goal;
    }
    return goal > 0 ? (elapsedPoints / goal) * 100 : null;
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

  /**
   * @param sub texto suelto, o un arreglo que se lista con viñetas.
   *   Con un solo elemento se dibuja como texto: una viñeta sola queda rara.
   */
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
    const card = document.createElement('figure');
    card.className = 'chart-card';

    const cap = document.createElement('figcaption');
    cap.className = 'chart-title';
    cap.textContent = title;
    card.appendChild(cap);

    if (hint) {
      const p = document.createElement('p');
      p.className = 'chart-hint';
      p.textContent = hint;
      card.appendChild(p);
    }
    return card;
  }

  /** Leyenda: cuadradito de color + símbolo + etiqueta + valor. */
  function chartLegend(items) {
    const box = document.createElement('ul');
    box.className = 'chart-legend';
    for (const item of items) {
      const li = document.createElement('li');

      // El símbolo va FUERA del cuadradito: adentro quedaría como texto sobre
      // un relleno saturado y el ámbar no llega a contraste. Afuera, la
      // identidad la dan el color, el símbolo y la palabra, nunca el tono solo.
      const swatch = document.createElement('span');
      swatch.className = 'lg-swatch';
      swatch.style.background = item.color;

      const name = document.createElement('span');
      name.className = 'lg-name';
      name.textContent = item.glyph ? `${item.glyph}  ${item.label}` : item.label;

      const value = document.createElement('span');
      value.className = 'lg-value';
      value.textContent = item.value;

      li.append(swatch, name, value);
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

    const wrap = document.createElement('div');
    wrap.className = 'pie-wrap';
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
    const card = chartCard('Cumplimiento por tarea', 'Sobre la meta a la fecha');

    const rows = currentTasks()
      .map(task => {
        const t = taskTotals(task, days);
        const level = complianceOf(t.elapsedPoints, t.goal);
        return level ? { name: task.name, ratio: level.ratio, status: level.status } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.ratio - a.ratio);

    if (!rows.length) {
      card.appendChild(emptyChart('Ninguna tarea tiene meta este mes'));
      return card;
    }

    const list = document.createElement('ul');
    list.className = 'hbars';

    for (const row of rows) {
      const li = document.createElement('li');

      const name = document.createElement('span');
      name.className = 'hb-name';
      name.textContent = row.name;
      name.title = row.name;

      // La escala se topea en la meta. Si una tarea llega al 600%, escalar a
      // ese máximo aplasta a todas las demás y el rango que importa —45 a
      // 100%— deja de leerse. El número al costado conserva el valor exacto,
      // y la barra que se pasa termina en escuadra contra el borde.
      const track = document.createElement('span');
      track.className = 'hb-track';
      const fill = document.createElement('i');
      fill.className = `hb-fill st-${row.status}${row.ratio > 100 ? ' is-over' : ''}`;
      fill.style.width = `${Math.min(row.ratio, 100)}%`;
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'hb-value';
      value.textContent = pct(row.ratio);

      li.append(name, track, value);
      li.title = `${row.name}: ${pct(row.ratio)} de cumplimiento`;
      list.appendChild(li);
    }

    // Sin leyenda: los umbrales ya están en la columna Estatus del tablero, y
    // acá cada barra lleva su porcentaje al lado, que es el dato exacto.
    card.appendChild(list);
    return card;
  }

  function emptyChart(text) {
    const p = document.createElement('p');
    p.className = 'chart-empty';
    p.textContent = text;
    return p;
  }

  function renderCharts() {
    const days = monthDays(ui.year, ui.month);
    el.charts.innerHTML = '';
    el.charts.append(pieChart(days), weekdayChart(days), taskChart(days));
  }

  function tile(label, value, sub, tone = '') {
    const node = document.createElement('div');
    node.className = tone ? `tile tone-${tone}` : 'tile';
    node.innerHTML = '<p class="tile-label"></p><p class="tile-value"></p>';
    node.querySelector('.tile-label').textContent = label;

    // El valor también puede ser varios: van apilados y algo más chicos.
    const values = Array.isArray(value) ? value : [value];
    const valueEl = node.querySelector('.tile-value');
    if (values.length > 1) {
      valueEl.classList.add('is-stacked');
      for (const v of values) {
        const line = document.createElement('span');
        line.textContent = v;
        valueEl.appendChild(line);
      }
    } else {
      valueEl.textContent = values[0];
    }

    const items = (Array.isArray(sub) ? sub : [sub]).filter(Boolean);

    if (items.length > 1) {
      const list = document.createElement('ul');
      list.className = 'tile-list';
      for (const item of items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }
      node.appendChild(list);
    } else {
      const p = document.createElement('p');
      p.className = 'tile-sub';
      p.textContent = items[0] || '';
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

    if (e.target.closest('[data-add-task]')) {
      openTaskDialog();
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
  // Alta / edición de tareas
  // ---------------------------------------------------------

  // Chips de días de la semana
  for (const wd of WEEKDAYS) {
    const label = document.createElement('label');
    label.className = 'wd';
    label.title = wd.long;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(wd.js);
    input.name = 'weekday';
    const span = document.createElement('span');
    span.textContent = wd.short;
    label.append(input, span);
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
    $('#task-submit').textContent = task ? 'Guardar cambios' : 'Crear tarea';
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
    el.taskStart.value = task?.start || '';

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
    const start = el.taskStart.value || null;

    if (!name) return showFormError('Escribí un nombre para la tarea.');
    if (freq === 'custom' && customMode === 'weekdays' && !weekdays.length) {
      return showFormError('Elegí al menos un día de la semana.');
    }
    if (freq === 'custom' && customMode === 'count'
        && (!Number.isInteger(rawTarget) || rawTarget < 1 || rawTarget > 99)) {
      return showFormError('La meta mensual tiene que ser un número entero entre 1 y 99.');
    }

    const fields = { name, freq, customMode, weekdays, target: clampTarget(rawTarget), start };

    const tasks = materialize();
    if (ui.editingId) {
      const task = tasks.find(t => t.id === ui.editingId);
      if (task) Object.assign(task, fields);
    } else {
      tasks.push({ id: newId(), ...fields });
    }

    save();
    el.taskDialog.close();
    render();
    toast(ui.editingId ? 'Tarea actualizada' : 'Tarea creada');
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
      `Se va a eliminar «${task.name}» de ${monthYearLabel(new Date(ui.year, ui.month, 1))}, `
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
      + `${monthYearLabel(new Date(ui.year, ui.month, 1))}, junto con los estados `
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

  /**
   * @param text  párrafo principal
   * @param onOk  qué hacer al confirmar
   * @param opts  `items` se lista con viñetas debajo; `note` es una aclaración al pie
   */
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
    const a = days[0];
    const b = days[days.length - 1];
    return sameDay(a, b)
      ? fmtDayLong.format(a)
      : `${fmtShort.format(a)} – ${fmtShort.format(b)}`;
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
        items: tasks.map(t => t.name),
        note: 'Las tareas y su configuración no se tocan, y fuera del rango '
          + 'visible no se borra nada.',
      },
    );
    el.confirmOk.textContent = 'Resetear';
  }

  function confirmAction(text, onOk, opts = {}) {
    el.confirmText.textContent = text;

    const items = opts.items || [];
    el.confirmList.innerHTML = '';
    el.confirmList.hidden = !items.length;
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      el.confirmList.appendChild(li);
    }

    el.confirmNote.textContent = opts.note || '';
    el.confirmNote.hidden = !opts.note;

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

  // El botón del estado vacío. El de la planilla se maneja por delegación en #grid.
  el.empty.querySelector('[data-add-task]').addEventListener('click', () => openTaskDialog());

  // ---------------------------------------------------------
  // Plantillas
  // ---------------------------------------------------------

  function openTemplates() {
    if (!ensureEditable()) return;

    const mes = monthYearLabel(new Date(ui.year, ui.month, 1));
    el.templatesIntro.textContent =
      `Las tareas se agregan a ${mes}. Las que ya existan con el mismo nombre se omiten.`;

    el.templatesList.innerHTML = '';
    for (const tpl of TEMPLATES) el.templatesList.appendChild(templateCard(tpl));
    el.templatesDialog.showModal();
    $('#templates-title').focus();
  }

  /**
   * Convierte una entrada de plantilla en una tarea completa, sin id.
   * `target` la vuelve meta mensual; `weekdays`, días fijos.
   */
  function templateTask(item) {
    const porConteo = typeof item.target === 'number';
    return {
      name: capitalizeFirstLetter(item.name.trim()),
      freq: item.freq,
      customMode: porConteo ? 'count' : 'weekdays',
      weekdays: item.weekdays ? [...item.weekdays] : [],
      target: porConteo ? item.target : 12,
      start: null,
    };
  }

  function templateCard(tpl) {
    const card = document.createElement('article');
    card.className = 'tpl';

    const head = document.createElement('header');
    head.className = 'tpl-head';

    const title = document.createElement('h3');
    title.className = 'tpl-name';
    title.textContent = tpl.name;

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-primary tpl-add';
    add.textContent = 'Agregar';
    add.addEventListener('click', () => applyTemplate(tpl));

    head.append(title, add);

    const desc = document.createElement('p');
    desc.className = 'tpl-desc';
    desc.textContent = `${tpl.tasks.length} tareas · ${tpl.description}`;

    const list = document.createElement('ul');
    list.className = 'tpl-tasks';
    for (const item of tpl.tasks) {
      const task = templateTask(item);
      const li = document.createElement('li');
      li.textContent = task.name;
      li.title = `${task.name} — ${freqLabel(task)}`;
      list.appendChild(li);
    }

    card.append(head, desc, list);
    return card;
  }

  function applyTemplate(tpl) {
    if (!ensureEditable()) return;

    const tasks = materialize();
    // Se comparan contra los nombres que YA estaban: así una plantilla que
    // repite un nombre a propósito entra completa, pero volver a aplicarla
    // no duplica nada.
    const existentes = new Set(tasks.map(t => t.name.trim().toLowerCase()));

    let agregadas = 0;
    for (const item of tpl.tasks) {
      const task = templateTask(item);
      if (existentes.has(task.name.toLowerCase())) continue;
      tasks.push({ id: newId(), ...task });
      agregadas += 1;
    }

    const omitidas = tpl.tasks.length - agregadas;
    save();
    el.templatesDialog.close();
    irA('home');

    if (!agregadas) toast('Esas tareas ya estaban en el mes');
    else toast(`${agregadas} tarea(s) agregadas`
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

    const prevName = monthYearLabel(new Date(prev.year, prev.month, 1));
    const thisName = monthYearLabel(new Date(ui.year, ui.month, 1));
    const current = currentTasks().length;

    confirmAction(
      `Se reemplazarán las ${current} tarea(s) de ${thisName} por las ${source.length} de ${prevName}. `
      + 'Las tareas que no estén en el mes anterior se pierden junto con sus estados de este mes; '
      + 'los periodos anteriores no se verán modificados.',
      () => copyFromPreviousMonth(source),
    );
    el.confirmOk.textContent = 'Reemplazar';
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
    const name = monthYearLabel(new Date(ui.year, ui.month, 1));

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
          render();
          toast('Datos importados');
        },
      );
      el.confirmOk.textContent = 'Importar';
    } catch (err) {
      console.error(err);
      toast('El archivo no es válido');
    }
  });

  el.confirmDialog.addEventListener('close', () => {
    el.confirmOk.textContent = 'Eliminar';
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
