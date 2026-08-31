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
    { min: 50, status: 'partial' },
    { min: 0,  status: 'missed' },
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
   * Cuántas plantillas se pueden tener a la vez, contando las de fábrica.
   *
   * El tope es sobre el TOTAL y las de fábrica se pueden borrar: es lo que le
   * da sentido al límite. Sin poder borrarlas, cuatro de los cinco lugares
   * estarían tomados de entrada y guardar una propia sería casi siempre
   * reemplazar la anterior.
   */
  const MAX_PLANTILLAS = 5;

  /** Cuántos días muestra el carrete: el elegido al medio y los de al lado. */
  const CARRETE = 7;

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

  /* No es constante: al cruzar la medianoche se recalcula, y con eso el día que
     acaba de terminar pasa a estar cerrado. Ver `programarMedianoche`. */
  let today = startOfDay(new Date());

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
    /**
     * Plantillas guardadas por el usuario, con la misma forma que las de
     * `TEMPLATES`. Son datos suyos —una lista de tareas que armó—, no una
     * preferencia de pantalla, así que viajan a la base y salen en el archivo
     * que exporta la app.
     */
    templates: /** @type {{id:string,name:string,description:string,tasks:object[]}[]} */ ([]),
    /**
     * Ids de las plantillas de fábrica que se borraron. Se guarda la ausencia y
     * no la lista completa: copiar las cuatro de `TEMPLATES` al payload las
     * congelaría en la versión que tenían el día que alguien tocó cualquier
     * cosa, y dejarían de mejorar con la app.
     */
    removedTemplates: /** @type {string[]} */ ([]),
    /**
     * Lo que hay que hacer una vez, sin frecuencia ni puntaje.
     *
     * Va aparte de `months`: un pendiente no se repite, no se mide y no
     * arrastra historial, así que meterlo entre las tareas obligaría a que todo
     * el cálculo de cumplimiento lo esquive.
     *
     * `categorias` admite UN nivel de anidado —una categoría con `padre` es una
     * subcategoría— y `items` cuelga de cualquiera de los dos, o de ninguna.
     *
     * `papelera` guarda lo borrado por `DIAS_PAPELERA` días, con lo necesario
     * para devolverlo a su lugar. Es la misma idea que `state.trash`, pero de
     * esta pantalla: lo que se borra acá no tiene nada que ver con las tareas.
     */
    pendientes: /** @type {{ categorias: {id:string,name:string,padre:string|null}[],
     *   items: {id:string,name:string,categoria:string|null,
     *   estado:'sin-iniciar'|'en-proceso'|'finalizada',fecha:string|null}[] }} */
      ({ categorias: [], items: [], papelera: [] }),
    /** Qué muestra la columna de estatus: 'glyph' | 'pct' | 'both' | 'none'. */
    /** Qué miden las barras del análisis diario: 'tareas' | 'pct'. */
    /**
     * Si ya se ofreció el recordatorio en ESTE aparato, se haya aceptado o no.
     *
     * Va con las preferencias de pantalla y no con los datos, aunque parezca
     * una decisión del usuario: la suscripción al push es por navegador, así
     * que ofrecerlo de nuevo en el teléfono cuando se activó en la computadora
     * es lo correcto — ahí todavía no está activo.
     */
    recordatorioOfrecido: false,
    /** Densidad de la planilla en móvil: 'normal' | 'compacto' | 'comodo'. */
    /** Controles del período plegados (solo tiene efecto en móvil). */
    /** Paneles desplegados de la sección Análisis. */
    theme: /** @type {'light'|'dark'|null} */ (null),
  };

  /** Estado de navegación (no se persiste). */
  const ui = {
    /** Sección visible: la planilla, los indicadores o la ayuda. */
    page: /** @type {'home'|'todos'|'indicators'|'settings'|'help'} */ ('home'),
    /**
     * Cuál de las tres guías muestra «Cómo usar»: la de la sección desde la que
     * se abrió. No hay una guía de la app entera —cada sección explica lo suyo—,
     * así que esto siempre vale algo.
     */
    guia: /** @type {'home'|'indicators'|'todos'} */ ('home'),
    year: today.getFullYear(),
    month: today.getMonth(),
    /**
     * El día elegido: el que va al centro del carrete y el que se carga abajo.
     * Se guarda como clave `YYYY-MM-DD` para que comparar sea comparar texto.
     */
    day: '',
    editingId: /** @type {string|null} */ (null),
    /**
     * Cómo se miran los pendientes: todo junto y por fecha, por categoría, o
     * el mes en el calendario. Es siempre la MISMA lista.
     */
    vistaPendientes: /** @type {'lista'|'categorias'|'calendario'} */ ('lista'),
    /**
     * Las tarjetas de Pendientes que están abiertas — todas arrancan plegadas.
     *
     * Anota la excepción y no el estado de cada una: son las menos, y una
     * categoría recién creada no necesita que nadie la marque para verse como
     * las demás.
     *
     * Es una postura de pantalla: no se persiste.
     */
    pendDesplegadas: /** @type {Set<string>} */ (new Set()),
    /**
     * Cómo se ordena cada una de las dos vistas que son listas. Uno por vista
     * porque ordenan cosas distintas —tareas y categorías—, y volver de una a
     * otra sin perder lo elegido es lo que se espera. No se persiste: es una
     * postura de pantalla, como el orden de Análisis.
     */
    ordenPend: /** @type {{lista: 'personalizado'|'fecha'|'alfabetico',
     *   categorias: 'personalizado'|'alfabetico'|'cantidad'}} */
      ({ lista: 'fecha', categorias: 'personalizado' }),
    /** Qué pendiente y qué categoría están abiertos en su diálogo. */
    editandoPendiente: /** @type {string|null} */ (null),
    editandoCategoria: /** @type {string|null} */ (null),
    onConfirm: /** @type {(() => void)|null} */ (null),
    /** Ids tildados para las acciones sobre varias. No se persiste. */
    selected: /** @type {Set<string>} */ (new Set()),
    /**
     * Qué controles muestra cada fila, elegido en «Selección masiva». En reposo
     * las filas van limpias. No se persiste: es una postura momentánea.
     * @type {null|'eliminar'|'archivar'|'reordenar'}
     */
    rowMode: null,
    /**
     * Orden de las tareas al entrar a reordenar, para poder volver atrás con ✕.
     * Los chevrones aplican en el acto —hay que ver el movimiento para saber si
     * quedó bien—, así que lo cancelable es de dónde se salió.
     * @type {string[]|null}
     */
    ordenPrevio: null,
    /**
     * Qué gráfico se está mirando en Análisis, nombrado por su forma. No se
     * persiste: cada visita abre en el primero, que es el que muestra el mes
     * día por día.
     * @type {'puntos'|'porcentajes'|'barras'}
     */
    chart: 'puntos',
    /**
     * Cómo se ordenan las tareas en «Puntos» y en «Porcentajes». `lista` es el
     * orden que uno armó —el mismo que en Hábitos—; los otros dos son por
     * cumplimiento. Tampoco se persiste: es una manera de mirar, no una
     * preferencia.
     * @type {'lista'|'desc'|'asc'}
     */
    orden: 'lista',
    // Las tareas que el diálogo de archivo tiene entre manos, y de qué lado.
    archivingIds: /** @type {string[]} */ ([]),
    // Las tareas que el diálogo de borrado tiene entre manos.
    deletingIds: /** @type {string[]} */ ([]),
    /** @type {'archivar'|'desarchivar'} */
    archiveMode: 'archivar',
    /**
     * Días ya transcurridos que se habilitaron a mano en esta sesión, por
     * `YYYY-MM-DD`. No se persiste, y la medianoche lo vacía: el permiso vale
     * para la corrección que se está haciendo, no para siempre.
     * @type {Set<string>}
     */
    diasEditables: new Set(),
  };

  /* Con la pestaña abierta toda la noche, `today` quedaría clavado en la
     fecha de carga y el día recién terminado seguiría admitiendo clics. El
     temporizador apunta a las 00:00 siguientes; `revisarDia` además se llama
     al volver a la pestaña, porque un equipo suspendido no dispara timers a
     tiempo. */
  let relojDia = null;

  function revisarDia() {
    const ahora = startOfDay(new Date());
    if (ahora.getTime() !== today.getTime()) {
      today = ahora;
      // El permiso sobre un día viejo no sobrevive al cambio de fecha.
      ui.diasEditables.clear();
      if (currentUserId) render();
    }
    programarMedianoche();
  }

  function programarMedianoche() {
    clearTimeout(relojDia);
    const manana = new Date(today);
    manana.setDate(manana.getDate() + 1);

    /* Un segundo de margen: apuntar exacto a las 00:00 a veces despierta antes.
       Y nunca más de una hora de espera: un `setTimeout` de catorce horas no es
       algo en lo que se pueda confiar —el navegador lo pospone en una pestaña de
       fondo, y un cambio de hora del sistema lo deja apuntando a cualquier lado—.
       Despertarse cada hora para no hacer nada no cuesta nada, y la comprobación
       que corre al volver es la misma. */
    const espera = Math.max(1000, manana - Date.now() + 1000);
    relojDia = setTimeout(revisarDia, Math.min(espera, 60 * 60 * 1000));
  }

  // ---------------------------------------------------------
  // Rutas
  // ---------------------------------------------------------

  /* Cada sección tiene su propia URL. Es una sola página que reescribe la
     dirección con la History API, así que el hosting tiene que devolver
     `index.html` ante cualquier ruta — ver `_redirects`, `vercel.json` y
     `404.html`. */

  const PAGE_DE_RUTA = {
    diario: 'home',
    pendientes: 'todos',
    analisis: 'indicators',
    ajustes: 'settings',
    comousar: 'help',
    'comousar-analisis': 'help',
    'comousar-pendientes': 'help',
  };
  const RUTA_DE_PAGE = {
    home: 'diario',
    todos: 'pendientes',
    indicators: 'analisis',
    settings: 'ajustes',
  };

  /**
   * La guía es UNA POR SECCIÓN: cada una explica lo suyo y nada más.
   *
   * Cuál se está leyendo va en la ruta y no solo en memoria, así recargar o
   * compartir el enlace abre la misma que se estaba mirando. Las tres caen en
   * la misma `page`, que es la pantalla que las dibuja.
   */
  const GUIA_DE_RUTA = {
    comousar: 'home',
    'comousar-analisis': 'indicators',
    'comousar-pendientes': 'todos',
  };
  const RUTA_DE_GUIA = {
    home: 'comousar',
    indicators: 'comousar-analisis',
    todos: 'comousar-pendientes',
  };
  const NOMBRE_DE_GUIA = { home: 'Hábitos', indicators: 'Análisis', todos: 'Pendientes' };

  const TITULO_DE_PAGE = {
    home: 'Hábitos',
    todos: 'Pendientes · Hábitos',
    indicators: 'Análisis · Hábitos',
    settings: 'Ajustes · Hábitos',
  };

  /** El de la pestaña. En la guía nombra CUÁL, que son tres. */
  const tituloDe = page => (page === 'help'
    ? `Cómo usar ${NOMBRE_DE_GUIA[ui.guia]} · Hábitos`
    : TITULO_DE_PAGE[page]);

  /**
   * Carpeta donde vive la app, deducida de la URL de este mismo script. Así
   * las rutas funcionan igual en la raíz del dominio que en un subdirectorio
   * (el caso de GitHub Pages sin dominio propio).
   */
  const BASE = new URL('.', document.currentScript.src).pathname;

  function urlDe(page) {
    // La guía no tiene una ruta sola: tiene una por sección.
    return BASE + (page === 'help' ? RUTA_DE_GUIA[ui.guia] : RUTA_DE_PAGE[page]);
  }

  /** El tramo de la URL que nombra la pantalla, sin la carpeta ni el `.html`. */
  function slugDeUrl() {
    // `404.html` (GitHub Pages) reenvía a la raíz con la ruta en este parámetro.
    const desviada = new URLSearchParams(location.search).get('ruta');

    const camino = desviada ?? (location.pathname.startsWith(BASE)
      ? location.pathname.slice(BASE.length)
      : location.pathname.replace(/^\//, ''));

    return camino.split('/')[0].replace(/\.html$/, '').toLowerCase();
  }

  /** Sección que pide la URL actual. Si no reconoce la ruta, cae en la planilla. */
  function pageDeUrl() {
    return PAGE_DE_RUTA[slugDeUrl()] || 'home';
  }

  /** Y cuál de las tres guías, si la ruta es una de ellas. */
  function guiaDeUrl() {
    return GUIA_DE_RUTA[slugDeUrl()] || 'home';
  }

  /**
   * Cambia de sección y deja la URL en sintonía.
   * @param {'home'|'todos'|'indicators'|'settings'|'help'} page
   * @param {{ reemplazar?: boolean }} [opciones] `reemplazar` no agrega entrada
   *   al historial: se usa al abrir la app, para no dejar un paso atrás vacío.
   */
  function irA(page, { reemplazar = false } = {}) {
    ui.page = page;
    document.title = tituloDe(page);

    const url = urlDe(page);
    if (reemplazar) history.replaceState({ page }, '', url);
    else if (location.pathname !== url) history.pushState({ page }, '', url);

    render();
  }

  // Atrás y adelante del navegador vuelven a la sección que corresponda.
  window.addEventListener('popstate', () => {
    // Sin sesión no hay nada que dibujar: manda la pantalla de login.
    if (!currentUserId) return;

    /* La guía primero: el título y la URL de `help` dependen de cuál sea. */
    ui.guia = guiaDeUrl();
    ui.page = pageDeUrl();
    document.title = tituloDe(ui.page);
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

  /** El día elegido, como `Date`. Sin nada guardado, hoy. */
  function diaActual() {
    return ui.day ? parseDateKey(ui.day) : today;
  }

  /**
   * Los días del carrete: el elegido al medio y los de los costados.
   *
   * Es CONTINUO — no se corta en el borde del mes. Los del mes vecino se
   * dibujan atenuados y llevan a su propio mes al elegirlos, que es lo que
   * mantiene el modelo mensual en pie: el día del centro decide qué mes se
   * está trabajando y de qué lista salen las tareas.
   */
  function diasDelCarrete() {
    const centro = diaActual();
    const lado = (CARRETE - 1) / 2;
    return Array.from({ length: CARRETE }, (_, i) => addDays(centro, i - lado));
  }

  /**
   * Lo que está a la vista, que ahora es un solo día. Sigue devolviendo una
   * lista porque todo lo que calcula totales —`taskTotals`, `statusKeysIn`—
   * trabaja sobre un conjunto de días, y con uno solo la cuenta es la misma.
   */
  function visibleDays() {
    return { days: [diaActual()], count: 1 };
  }

  /**
   * Elige un día. Si cae en otro mes, el mes de trabajo lo sigue: las tareas
   * son listas por mes.
   */
  function irAlDia(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    // Las tareas son listas por mes, así que lo tildado no puede cruzar.
    if (year !== ui.year || month !== ui.month) ui.selected.clear();
    ui.year = year;
    ui.month = month;
    ui.day = dateKey(date);
    render();
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
  /* Con año y en números: para una lista de fechas que se comparan entre sí,
     donde el año importa y «20 jul» se lee más lento que 20/07. */
  const fmtNumerica = new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
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

  /**
   * ¿Es el mismo nombre? Como lo leería una persona: sin distinguir mayúsculas
   * ni acentos, y sin los espacios de los bordes. «Correr» y «correr» son el
   * mismo hábito escrito de dos maneras.
   */
  function mismoNombre(uno, otro) {
    return String(uno).trim().localeCompare(String(otro).trim(), LOCALE,
      { sensitivity: 'base' }) === 0;
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
   * Los tramos en los que la tarea estuvo archivada: `from` es el primer día
   * archivado y `to` el día en que volvió —ya fuera del tramo—, o null si sigue
   * archivada. Vienen ordenados y sin pisarse; de eso se ocupa `saneaArchivado`.
   *
   * Es una lista y no una fecha sola porque una tarea puede irse y volver más de
   * una vez, y cada ida deja un hueco propio en el historial.
   */
  function tramosArchivados(task) {
    return Array.isArray(task.archived) ? task.archived : [];
  }

  /** El tramo sin fecha de vuelta: existe solo si la tarea está archivada HOY. */
  function tramoAbierto(task) {
    return tramosArchivados(task).find(tramo => !tramo.to) ?? null;
  }

  /** Ese día cae adentro de alguno de los tramos archivados. */
  function archivada(task, date) {
    const dia = dateKey(date);
    return tramosArchivados(task)
      .some(tramo => dia >= tramo.from && (!tramo.to || dia < tramo.to));
  }

  /**
   * La tarea se eliminó desde ese día. `end` es el espejo de `start`: el primer
   * día en que ya no existe. Lo anterior queda como estaba.
   *
   * Es distinto de un tramo archivado: archivar se deshace y la tarea figura en
   * el Archivo; esto no vuelve. Por eso es un campo aparte.
   */
  function terminada(task, date) {
    return Boolean(task.end) && dateKey(date) >= task.end;
  }

  /**
   * Fuera de vigencia: antes de empezar, mientras estuvo archivada, o desde que
   * se eliminó. En los tres casos la tarea no se ve, no se marca y no suma, y en
   * los tres lo cargado ANTES se conserva.
   */
  function fueraDeVigencia(task, date) {
    return beforeStart(task, date) || archivada(task, date) || terminada(task, date);
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
    if (fueraDeVigencia(task, date)) return false;
    if (allowsSkip(task) && isSkipped(task, date)) return false;
    const g = date.getDay();
    if (task.freq === 'weekdays') return g >= 1 && g <= 5;
    if (task.freq === 'custom' && !isCountMode(task)) return task.weekdays.includes(g);
    return true;
  }

  /**
   * Días que la frecuencia pide expresamente. El resto se tiñe para
   * distinguirlos de un vistazo (siguen siendo marcables), y además quedan
   * fuera del techo de la columna — ver `dayCompliance`.
   *
   * Las periódicas no piden ningún día puntual —cualquiera sirve—, así que
   * ninguno figura como requerido y la fila entera queda teñida.
   */
  function isRequiredDay(task, date) {
    if (fueraDeVigencia(task, date)) return false;   // todavía no, o ya no
    if (FREQ[task.freq]?.period) return false;   // sirve cualquier día del período
    if (isCountMode(task)) return false;         // meta mensual sin días fijos
    return countsTowardGoal(task, date);         // incluye el «no requerido» manual
  }

  /**
   * Identificador del período al que pertenece un día para una tarea dada.
   * Para las no periódicas cada día es su propio período, así el cálculo de la
   * meta funciona sin ramificaciones.
   *
   * La de meta mensual también es periódica: su período es el mes entero, con
   * la particularidad de que no pide una vez sino `target` — ver `periodTarget`.
   */
  function periodId(task, date) {
    const month = monthKey(date.getFullYear(), date.getMonth());
    if (isCountMode(task)) return `${month}#m`;
    switch (FREQ[task.freq]?.period) {
      case 'semana':   return `${month}#w${weekIndexInMonth(date)}`;
      case 'quincena': return `${month}#q${date.getDate() <= 15 ? 0 : 1}`;
      case 'mes':      return `${month}#m`;
      default:         return dateKey(date);
    }
  }

  /**
   * Cuántos días tiene, EN EL CALENDARIO, el período al que pertenece una fecha.
   *
   * Es el denominador con el que se mide qué parte del período está a la vista,
   * y por eso cuenta los días completos aunque el rango solo muestre algunos: la
   * semana del 1 de agosto de 2026 mide 7, no los 2 que caen dentro del mes.
   * Justamente esa diferencia es la que hace que un tramo suelto no termine
   * exigiendo lo mismo que la semana entera.
   */
  function periodLength(task, date) {
    const delMes = () => monthDays(date.getFullYear(), date.getMonth()).length;
    if (isCountMode(task)) return delMes();
    switch (FREQ[task.freq]?.period) {
      case 'semana':   return 7;
      // Del 1 al 15, y del 16 a fin de mes: la segunda dura lo que sobre.
      case 'quincena': return date.getDate() <= 15 ? 15 : delMes() - 15;
      case 'mes':      return delMes();
      default:         return 1;
    }
  }

  /**
   * Cuántas veces pide la tarea en un período COMPLETO. Uno para todas, salvo
   * la de meta mensual, cuyo período es el mes y pide el número que se cargó.
   */
  function periodTarget(task) {
    return isCountMode(task) ? task.target : 1;
  }

  function statusKey(taskId, date) {
    return `${taskId}|${dateKey(date)}`;
  }

  /**
   * Fuera de vigencia la tarea no existe: no se puede marcar y lo que hubiera
   * quedado cargado no se muestra ni suma. El dato igual se conserva, así que
   * vuelve a aparecer si se corre o se quita la fecha —la de inicio o la de
   * archivo, las dos funcionan igual.
   */
  function getStatus(task, date) {
    if (fueraDeVigencia(task, date)) return null;
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
  let currentUserEmail = null;

  /**
   * Si la lectura remota al iniciar sesión falló, no se escribe nada en
   * Supabase durante la sesión: subir el estado que tengamos en memoria
   * reemplazaría datos del servidor que nunca llegamos a ver.
   */
  let lecturaRemotaOk = false;

  /** Último aviso de sincronización mostrado, para no repetirlo en cada guardado. */
  let avisoSync = '';

  /**
   * Espera antes de subir. Agrupa las ráfagas —marcar una fila entera son diez
   * o quince clics seguidos— en una sola escritura, en vez de mandar el estado
   * completo por cada celda.
   *
   * No se reinicia con cada cambio: el primero arma el temporizador y los que
   * llegan después viajan con él. Un debounce que se reinicia dejaría que
   * alguien marcando sin parar postergara la subida indefinidamente.
   */
  const ESPERA_SYNC = 800;

  /** Reintento tras un fallo: 5s, 10s, 20s, 40s, y de ahí en más cada minuto. */
  const REINTENTO_BASE = 5000;
  const REINTENTO_TOPE = 60000;

  let syncTimer = null;
  /** Hay un upsert sin resolver. Nunca se lanzan dos a la vez: ver `drenarSync`. */
  let syncEnVuelo = false;
  /** El estado local tiene cambios que todavía no están en la base. */
  let cambiosSinSubir = false;
  let fallosSeguidos = 0;

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

  /**
   * Marca la hora de los cambios que todavía no llegaron a la base. Vive en su
   * propia clave y no dentro del estado, para no tocar el formato del payload
   * —es el mismo JSON que exporta la app—. Se compara contra el `updated_at`
   * remoto al iniciar sesión: ver `hydrateStateForUser`.
   */
  function marcarPendiente(iso) {
    try {
      if (iso) localStorage.setItem(`${STORAGE_KEY}/pendiente`, iso);
      else localStorage.removeItem(`${STORAGE_KEY}/pendiente`);
    } catch { /* sin almacenamiento se sigue igual, solo sin la red de seguridad */ }
  }

  function pendienteGuardado() {
    try {
      return localStorage.getItem(`${STORAGE_KEY}/pendiente`);
    } catch {
      return null;
    }
  }

  function guardarLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('No se pudo guardar en localStorage', err);
      toast('No se pudieron guardar los cambios');
    }
  }

  function save() {
    guardarLocal();
    cambiosSinSubir = true;
    marcarPendiente(new Date().toISOString());
    programarSync();
  }

  /* ---- Preferencias de pantalla ----------------------------------------
     El tema y el aviso del recordatorio describen cómo se ve la app en ESTE
     aparato, no qué hizo el usuario. Se guardan
     solo acá y no viajan a la base: antes iban en el mismo payload, así que
     elegir tema claro en la compu lo cambiaba también en el teléfono — y
     subía el diario entero para hacerlo.

     El tema conserva su propia clave aparte porque lo lee el script
     anti-parpadeo de `index.html`, antes de que exista `app.js`. */

  const PREFS_KEY = 'tareas-diarias/prefs';
  const CAMPOS_PREF = ['recordatorioOfrecido'];

  /** Guarda una preferencia. No toca la red: no hay nada que sincronizar. */
  function savePrefs() {
    guardarLocal();
    try {
      const prefs = {};
      for (const campo of CAMPOS_PREF) prefs[campo] = state[campo];
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* sin almacenamiento las preferencias duran lo que la pestaña */ }
  }

  /** Vuelca sobre `state` las preferencias de este dispositivo, si las hay. */
  function aplicarPrefsLocales() {
    let prefs = null;
    try {
      prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    } catch { return; }
    if (!esDiccionario(prefs)) return;

    if (typeof prefs.recordatorioOfrecido === 'boolean') {
      state.recordatorioOfrecido = prefs.recordatorioOfrecido;
    }
  }

  /** Lo que se sube: el estado sin las preferencias de pantalla. */
  function payloadRemoto() {
    const { theme, ...resto } = state;
    for (const campo of CAMPOS_PREF) delete resto[campo];
    return resto;
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

  /* ---- Subida incremental ------------------------------------------------

     Lo último que la base confirmó tener, para calcular contra eso qué cambió.
     Se llena al leer y en cada subida exitosa; sin sombra —primera vez, o
     después de un error raro— se sube el estado entero, que siempre es
     correcto aunque cueste más. */
  let sombraRemota = null;

  /* Si la base todavía no tiene `merge_app_state`. Se prueba una vez: cuando
     falta, no tiene sentido reintentarla en cada guardado. */
  let mergeDisponible = true;

  const clonar = valor => JSON.parse(JSON.stringify(valor));

  /**
   * El parche que lleva de `antes` a `ahora`, en formato JSON Merge Patch
   * (RFC 7386): las claves que cambian traen su valor nuevo, las que se borran
   * traen `null`, y lo que no cambió no viaja.
   *
   * Devuelve `null` si no hay nada que mandar. Los arreglos se tratan como
   * valores enteros —así lo define el formato— y acá es además lo que se
   * quiere: reordenar las tareas de un mes ES un cambio del mes.
   */
  function parcheDeMerge(antes, ahora) {
    if (Array.isArray(antes) || Array.isArray(ahora)
      || !esDiccionario(antes) || !esDiccionario(ahora)) {
      return JSON.stringify(antes) === JSON.stringify(ahora) ? null : ahora;
    }

    const parche = {};

    for (const clave of Object.keys(antes)) {
      if (!(clave in ahora)) parche[clave] = null;   // lo que se borró
    }
    for (const [clave, valor] of Object.entries(ahora)) {
      if (!(clave in antes)) {
        parche[clave] = valor;
        continue;
      }
      const dentro = parcheDeMerge(antes[clave], valor);
      if (dentro !== null) parche[clave] = dentro;
    }

    return Object.keys(parche).length ? parche : null;
  }

  /** Escribe el estado en la base. `true` si quedó guardado. */
  async function subirEstado() {
    /* Una copia y no el estado vivo: entre que se arma la subida y contesta la
       base puede pasar cualquier cosa —marcar otra celda—, y `payloadRemoto()`
       devuelve un objeto que COMPARTE las ramas con `state`. Sin clonar, la
       sombra terminaba diciendo que la base ya tiene cambios que nunca se
       mandaron, y el siguiente parche salía vacío. */
    const payload = clonar(payloadRemoto());

    try {
      /* Con sombra y con la función instalada, viaja el parche. Es lo que hace
         que marcar una celda mande cien bytes en vez del historial entero. */
      if (sombraRemota && mergeDisponible && typeof window.supabaseClient.rpc === 'function') {
        const parche = parcheDeMerge(sombraRemota, payload);
        if (!parche) return true;   // nada cambió de lo que la base ya tiene

        const { error } = await window.supabaseClient.rpc('merge_app_state', { parche });
        if (!error) {
          sombraRemota = clonar(payload);
          return true;
        }

        /* Si la función no está, se sigue por el camino de siempre y no se
           vuelve a intentar: es un paso de puesta en marcha, no un error. */
        if (!faltaLaFuncion(error)) throw error;
        mergeDisponible = false;
      }

      const { error } = await window.supabaseClient.from('app_state').upsert(
        {
          user_id: currentUserId,
          payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;

      sombraRemota = clonar(payload);
      return true;
    } catch (err) {
      console.error('No se pudo sincronizar con Supabase', err);
      /* Después de un error no se sabe qué quedó del otro lado: la próxima
         sube todo, que es el camino que no depende de saberlo. */
      sombraRemota = null;
      return false;
    }
  }

  /** Si el error es «esa función no existe» y no otra cosa. */
  function faltaLaFuncion(error) {
    const texto = `${error?.message ?? ''} ${error?.code ?? ''} ${error?.details ?? ''}`;
    return /merge_app_state|PGRST202|404|does not exist|Could not find/i.test(texto);
  }


  /**
   * Pide una subida. Si ya hay un temporizador armado no hace nada: ese mismo
   * se va a llevar también estos cambios. Tras un fallo la espera crece, para
   * no castigar una base caída con un intento por cada clic.
   */
  function programarSync() {
    if (!cambiosSinSubir || syncTimer !== null || syncEnVuelo) return;
    if (!currentUserId || !window.supabaseClient) return;

    // Escribir sin haber podido leer sería pisar el estado remoto a ciegas.
    if (!lecturaRemotaOk) {
      avisarSync('Sin conexión con la base: los cambios quedan solo en este navegador.');
      return;
    }

    const espera = fallosSeguidos
      ? Math.min(REINTENTO_BASE * 2 ** (fallosSeguidos - 1), REINTENTO_TOPE)
      : ESPERA_SYNC;

    syncTimer = setTimeout(() => { syncTimer = null; void drenarSync(); }, espera);
  }

  /**
   * Sube lo pendiente, de a una escritura por vez. Lo que se marque mientras
   * hay una en vuelo se sube en la vuelta siguiente: lanzarlas en paralelo
   * dejaría que la respuesta de una vieja pisara a una nueva.
   */
  async function drenarSync() {
    if (syncEnVuelo || !cambiosSinSubir) return;
    if (!currentUserId || !window.supabaseClient || !lecturaRemotaOk) return;

    syncEnVuelo = true;
    try {
      while (cambiosSinSubir) {
        // Se limpia ANTES de subir: lo que llegue durante el `await` vuelve a
        // marcarlo y se sube en la vuelta siguiente, en vez de perderse.
        cambiosSinSubir = false;

        if (!await subirEstado()) {
          cambiosSinSubir = true;
          fallosSeguidos++;
          avisarSync('No se pudieron guardar los cambios en la base. '
            + 'Quedaron en este navegador y se reintenta solo.');
          break;
        }

        fallosSeguidos = 0;
        if (!cambiosSinSubir) marcarPendiente(null);
        avisarSync('');
      }
    } finally {
      syncEnVuelo = false;
      programarSync();   // no hace nada si no quedó nada pendiente
    }
  }

  /** Sube sin esperar el temporizador. */
  function sincronizarYa() {
    if (syncTimer !== null) { clearTimeout(syncTimer); syncTimer = null; }
    // Un intento a pedido no arrastra el castigo de los anteriores.
    fallosSeguidos = 0;
    void drenarSync();
  }

  /* Agrupar las subidas abre una ventana de hasta `ESPERA_SYNC` con cambios
     guardados acá y todavía no en la base. Si la pestaña se va justo ahí, se
     sube en el acto; lo que aun así no llegue queda marcado como pendiente y
     se resuelve al volver a entrar. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return sincronizarYa();
    revisarDia();
    programarSync();
  });
  window.addEventListener('pagehide', sincronizarYa);
  window.addEventListener('online', sincronizarYa);

  /**
   * Lee el estado del usuario en Supabase.
   * @returns {Promise<{estado:'ok'|'vacio'|'error', payload?:object, updatedAt?:string}>}
   *   `vacio` es una cuenta sin datos todavía; `error` es no haber podido
   *   preguntar. Distinguirlos es el punto: con `vacio` se puede subir la
   *   copia local, con `error` no.
   */
  async function loadFromSupabase() {
    if (!currentUserId || !window.supabaseClient) return { estado: 'error' };
    try {
      const { data, error } = await window.supabaseClient
        .from('app_state')
        .select('payload, updated_at')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (error) throw error;
      if (data?.payload) {
        return { estado: 'ok', payload: data.payload, updatedAt: data.updated_at };
      }
      return { estado: 'vacio' };
    } catch (err) {
      console.error('No se pudo leer el estado remoto de Supabase', err);
      return { estado: 'error' };
    }
  }

  /**
   * ¿Lo que quedó sin subir en este navegador es más nuevo que lo que hay en
   * la base? Las dos marcas las escribe un cliente, así que se comparan como
   * instantes y no como texto: el `updated_at` de Postgres vuelve con offset
   * (`+00:00`) y el nuestro con `Z`, que ordenados como cadena mienten.
   */
  function localMasNuevo(pendiente, updatedAt) {
    const local = Date.parse(pendiente || '');
    const remoto = Date.parse(updatedAt || '');
    return Number.isFinite(local) && Number.isFinite(remoto) && local > remoto;
  }

  async function hydrateStateForUser(user) {
    currentUserId = user?.id || null;
    currentUserEmail = user?.email || null;
    STORAGE_KEY = user?.id ? `${STORAGE_BASE}/${user.id}` : STORAGE_BASE;
    lecturaRemotaOk = false;
    avisoSync = '';
    cambiosSinSubir = false;
    fallosSeguidos = 0;

    if (!currentUserId) {
      state = estadoVacio();
      loadFromLocalStorage();
      aplicarPrefsLocales();
      return;
    }

    // Explícito: no heredar en memoria nada de la sesión anterior.
    state = estadoVacio();

    const remoto = await loadFromSupabase();
    lecturaRemotaOk = remoto.estado !== 'error';

    /* La sombra es lo que la base tiene AHORA, se use o no ese payload: contra
       eso se calcula el primer parche. Si la copia local resulta más nueva, lo
       que sube es justamente la diferencia entre las dos. */
    sombraRemota = remoto.estado === 'ok' ? clonar(remoto.payload) : null;

    if (remoto.estado === 'ok') {
      /* La copia local puede ser MÁS NUEVA que la remota: si la pestaña se
         cerró antes de que la última subida llegara, quedó marcada con la hora
         de ese cambio. Tomar el remoto sin mirar la marca borraría justo lo
         último que se hizo. */
      const pendiente = pendienteGuardado();
      if (localMasNuevo(pendiente, remoto.updatedAt) && loadFromLocalStorage()) {
        cambiosSinSubir = true;
        programarSync();
      } else {
        state = normalize(remoto.payload);
        marcarPendiente(null);
      }
      aplicarPrefsLocales();
      return;
    }

    const hayLocal = loadFromLocalStorage();
    aplicarPrefsLocales();

    if (remoto.estado === 'vacio') {
      // Cuenta sin datos en la base: la copia de este navegador pasa a ser la
      // de referencia. Es el único caso en que se sube sin haber leído nada.
      if (hayLocal) {
        cambiosSinSubir = true;
        await drenarSync();
      }
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

  /**
   * Los tramos archivados de una tarea, saneados: ordenados, sin pisarse y sin
   * los que no describen nada.
   *
   * Acepta también el formato viejo —una fecha suelta, que era «archivada desde
   * ahí y sin vuelta»— porque eso es exactamente un tramo abierto.
   *
   * Se descarta un tramo que empiece antes de que la tarea exista (nunca estuvo
   * viva), uno que vuelva antes de irse, y uno que se pise con el anterior. Esto
   * último es lo que garantiza que haya COMO MUCHO UN TRAMO ABIERTO y que sea el
   * último: cualquier cosa que empiece después de uno sin vuelta cae adentro de
   * él, y se descarta.
   */
  function saneaArchivado(valor, start) {
    const crudos = typeof valor === 'string'
      ? [{ from: valor, to: null }]
      : Array.isArray(valor) ? valor : [];

    const candidatos = [];
    for (const tramo of crudos) {
      if (!tramo || typeof tramo !== 'object') continue;
      const from = typeof tramo.from === 'string' && RE_DIA.test(tramo.from) ? tramo.from : null;
      if (!from) continue;
      if (start && from <= start) continue;
      const to = typeof tramo.to === 'string' && RE_DIA.test(tramo.to) ? tramo.to : null;
      if (to && to <= from) continue;
      candidatos.push({ from, to });
    }
    candidatos.sort((a, b) => (a.from < b.from ? -1 : 1));

    const limpios = [];
    for (const tramo of candidatos) {
      const previo = limpios[limpios.length - 1];
      if (previo && (!previo.to || tramo.from < previo.to)) continue;
      limpios.push(tramo);
    }
    return limpios;
  }

  /** Cuántos días vive una tarea eliminada antes de perderse. */
  const DIAS_PAPELERA = 7;

  /**
   * Sanea la papelera. Cada entrada es el CAMBIO que hizo una eliminación: la
   * copia de la tarea en cada mes que tocó —con el índice donde estaba— y los
   * estados que borró. Sin eso no se puede devolver la tarea a donde estaba.
   *
   * Se descarta lo vencido acá mismo: es el único lugar por el que pasan los
   * datos al entrar, así que una copia vieja no puede colarse por un archivo
   * importado.
   */
  function cleanTrash(lista) {
    const limpias = [];
    for (const item of Array.isArray(lista) ? lista : []) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.taskId !== 'string' || !item.taskId) continue;
      if (!RE_DIA.test(item.fecha || '')) continue;
      if (diasDesde(item.fecha) >= DIAS_PAPELERA) continue;

      const meses = {};
      for (const [mes, guardado] of Object.entries(comoObjeto(item.meses))) {
        if (!RE_MES.test(mes) || !guardado || typeof guardado !== 'object') continue;
        const [task] = cleanTaskList([guardado.task]);
        if (!task) continue;
        const indice = Number(guardado.indice);
        meses[mes] = { indice: Number.isFinite(indice) && indice >= 0 ? indice : 0, task };
      }
      if (!Object.keys(meses).length) continue;

      const estados = {};
      for (const [key, value] of Object.entries(comoObjeto(item.estados))) {
        if (!['done', 'partial', 'missed', 'skip'].includes(value)) continue;
        const [taskId, iso] = String(key).split('|');
        if (taskId !== item.taskId || !RE_DIA.test(iso || '')) continue;
        estados[key] = value;
      }

      limpias.push({
        taskId: item.taskId,
        nombre: typeof item.nombre === 'string' ? item.nombre.slice(0, 80) : '',
        frecuencia: typeof item.frecuencia === 'string' ? item.frecuencia.slice(0, 60) : '',
        desde: RE_DIA.test(item.desde || '') ? item.desde : null,
        fecha: item.fecha,
        meses,
        estados,
      });
    }
    return limpias;
  }

  /** Días enteros transcurridos desde una fecha en clave hasta hoy. */
  function diasDesde(clave) {
    return Math.round((today - parseDateKey(clave)) / 86400000);
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
      const archived = saneaArchivado(t.archived, start);
      /* El corte de eliminación. Uno anterior o igual al inicio no deja ni un
         día vivo: esa tarea no debería estar en la lista, así que se descarta
         entera más abajo. */
      const end = typeof t.end === 'string' && RE_DIA.test(t.end) ? t.end : null;

      // Un personalizado por días sin días elegidos no describe nada: se descarta.
      if (freq === 'custom' && customMode === 'weekdays' && !weekdays.length) continue;
      // Eliminada desde antes de empezar: no le queda un solo día vivo.
      if (end && start && end <= start) continue;

      clean.push({
        id: typeof t.id === 'string' && t.id ? t.id : newId(),
        name: capitalizeFirstLetter(t.name.trim().slice(0, 80)),
        freq,
        customMode,
        weekdays,
        target,
        start,
        archived,
        end,
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

  /**
   * Día más antiguo (`YYYY-MM-DD`) que aparece en los estados guardados.
   *
   * Es lo que la app usa como **comienzo de uso**: la primera marca es la
   * primera evidencia de que alguien la usó. La fecha de inicio de las tareas
   * no sirve para eso — se declara, no se observa: dar de alta hoy un hábito
   * con inicio en enero no significa que haya siete meses de datos.
   */
  function earliestStatusDay(status) {
    let earliest = null;
    for (const key of Object.keys(comoObjeto(status))) {
      const iso = String(key).split('|')[1];
      if (!RE_DIA.test(iso || '')) continue;
      if (!earliest || iso < earliest) earliest = iso;
    }
    return earliest;
  }

  /** Mes más antiguo (`YYYY-MM`) que aparece en los estados guardados. */
  function earliestStatusMonth(status) {
    return earliestStatusDay(status)?.slice(0, 7) ?? null;
  }

  /**
   * Valida y sanea las plantillas guardadas por el usuario.
   *
   * Vienen del mismo lugar que todo lo demás —localStorage o un archivo
   * importado—, así que pueden ser cualquier cosa. Una plantilla sin tareas no
   * describe nada y se descarta entera.
   *
   * @param ocupadas cuántos lugares se llevan ya las de fábrica que siguen a la
   *   vista. El tope de `MAX_PLANTILLAS` es sobre el total, así que un archivo
   *   importado con veinte propias se recorta acá en vez de dejar la app en un
   *   estado que su propia interfaz no permite crear.
   */
  function cleanTemplates(lista, ocupadas) {
    const limpias = [];
    const nombres = new Set();

    for (const tpl of Array.isArray(lista) ? lista : []) {
      if (limpias.length >= MAX_PLANTILLAS - ocupadas) break;
      if (!tpl || typeof tpl.name !== 'string' || !tpl.name.trim()) continue;

      const nombre = capitalizeFirstLetter(tpl.name.trim().slice(0, 40));
      if (nombres.has(nombre.toLowerCase())) continue;

      /* Las tareas se sanean con la misma función que las del mes y después se
         devuelven a la forma de plantilla: sin id, sin fecha de inicio y sin
         los campos que no aporten nada. Así una plantilla no puede traer una
         frecuencia inventada ni una meta fuera de rango. */
      const tasks = cleanTaskList(tpl.tasks).map(t => ({
        name: t.name,
        freq: t.freq,
        ...(t.freq === 'custom' && t.customMode === 'count'
          ? { target: t.target }
          : t.freq === 'custom' ? { weekdays: t.weekdays } : {}),
      }));
      if (!tasks.length) continue;

      nombres.add(nombre.toLowerCase());
      limpias.push({
        id: typeof tpl.id === 'string' && tpl.id ? tpl.id : newId(),
        name: nombre,
        description: typeof tpl.description === 'string' ? tpl.description.slice(0, 80) : '',
        tasks,
      });
    }
    return limpias;
  }

  /** Valida y sanea datos que vienen de localStorage o de un archivo importado. */
  /**
   * Sanea la lista de pendientes que viene de afuera —de la base o de un
   * archivo importado—.
   *
   * El anidado se corta en dos niveles a propósito: con una cadena libre habría
   * que dibujar una sangría sin fondo, y un padre que apunte a un descendiente
   * dejaría la lista sin poder recorrerse. Una categoría cuyo padre no existe,
   * o cuyo padre ya es subcategoría, queda de primer nivel: se conserva el dato
   * en vez de tirarlo.
   */
  /* La categoría en la que cae todo lo que no se puso en otro lado. Existe
     desde la primera vez, con su subcategoría, y no se puede borrar: es lo que
     sostiene que ninguna tarea quede huérfana. El id es fijo —no un uuid— para
     poder reconocerla después de que le cambien el nombre. */
  const VARIOS = 'cat-varios';
  const VARIOS_SUB = 'cat-varios-sub';
  const esProtegida = id => id === VARIOS || id === VARIOS_SUB;

  /**
   * Se asegura de que «Varios» y su subcategoría estén, sin pisar el nombre que
   * les hayan puesto. Van al final: en una lista que ya tiene categorías
   * propias, el cajón de sastre no encabeza.
   */
  function conVarios(categorias) {
    const completas = [...categorias];
    if (!completas.some(c => c.id === VARIOS)) {
      completas.push({ id: VARIOS, name: 'Varios', padre: null, archivada: false });
    }
    if (!completas.some(c => c.id === VARIOS_SUB)) {
      completas.push({ id: VARIOS_SUB, name: 'Varios', padre: VARIOS, archivada: false });
    }
    return completas;
  }

  function cleanPendientes(valor) {
    // Sin nada guardado, «Varios» igual: es el piso, no un dato del usuario.
    if (!esDiccionario(valor)) return { categorias: conVarios([]), items: [], papelera: [] };

    const crudas = [];
    const vistas = new Set();
    for (const cruda of Array.isArray(valor.categorias) ? valor.categorias : []) {
      if (!esDiccionario(cruda)) continue;
      const id = String(cruda.id ?? '');
      const name = capitalizeFirstLetter(String(cruda.name ?? '').trim().slice(0, 60));
      if (!id || !name || vistas.has(id)) continue;
      vistas.add(id);
      crudas.push({ id, name, pedido: String(cruda.padre ?? ''), archivada: cruda.archivada === true });
    }

    /* Primero quiénes son raíz —las que no piden padre válido—, y recién
       después quién puede colgar de quién: al revés, el orden del arreglo
       decidiría el resultado.

       Una que se pide a sí misma es raíz y además se queda SIN padre: dejarle
       el suyo la sacaría de la lista de raíces sin ponerla en ninguna otra
       parte, y al dibujarla sería su propia hija. */
    const esRaiz = c => c.pedido === c.id || !vistas.has(c.pedido);
    const raices = new Set(crudas.filter(esRaiz).map(c => c.id));
    const categorias = crudas.map(({ id, name, pedido, archivada }) => ({
      id,
      name,
      padre: pedido !== id && raices.has(pedido) ? pedido : null,
      archivada,
    }));
    const porId = new Set(categorias.map(c => c.id));

    const items = [];
    const idsVistos = new Set();
    for (const crudo of Array.isArray(valor.items) ? valor.items : []) {
      if (!esDiccionario(crudo)) continue;
      const id = String(crudo.id ?? '');
      const name = String(crudo.name ?? '').trim().slice(0, 80);
      if (!id || !name || idsVistos.has(id)) continue;
      idsVistos.add(id);

      const categoria = String(crudo.categoria ?? '');
      const fecha = String(crudo.fecha ?? '');
      items.push({
        id,
        name,
        /* Una categoría borrada no se lleva puesta la tarea: cae en «Varios»,
           que es donde vive lo que no está en ningún otro lado. */
        categoria: porId.has(categoria) ? categoria : VARIOS,
        estado: esEstadoPendiente(crudo.estado) ? crudo.estado : 'sin-iniciar',
        fecha: RE_DIA.test(fecha) ? fecha : null,
        /* Recortado clavado y no con holgura: el campo nace con este tope, así
           que no hay datos viejos más largos que respetar —al revés que
           `name`, que acepta hasta 80 para no mutilar lo que se guardó cuando
           el tope todavía no existía—. */
        comentario: typeof crudo.comentario === 'string'
          ? crudo.comentario.trim().slice(0, TOPE_COMENTARIO)
          : '',
        archivado: crudo.archivado === true,
      });
    }

    return { categorias: conVarios(categorias), items, papelera: cleanPapelera(valor.papelera) };
  }

  /**
   * Sanea la papelera de Pendientes y de paso la vacía: lo que pasó de
   * `DIAS_PAPELERA` días no vuelve más, así que no viaja a la base.
   */
  function cleanPapelera(lista) {
    if (!Array.isArray(lista)) return [];

    const limpia = [];
    for (const entrada of lista) {
      if (!esDiccionario(entrada)) continue;
      if (!RE_DIA.test(String(entrada.fecha ?? ''))) continue;
      if (diasDesde(entrada.fecha) >= DIAS_PAPELERA) continue;
      if (!['pendiente', 'categoria'].includes(entrada.tipo)) continue;
      if (!esDiccionario(entrada.dato)) continue;

      limpia.push({
        tipo: entrada.tipo,
        fecha: entrada.fecha,
        nombre: String(entrada.nombre ?? '').slice(0, 80),
        indice: Number.isFinite(Number(entrada.indice)) ? Number(entrada.indice) : 0,
        dato: entrada.dato,
        hijas: Array.isArray(entrada.hijas) ? entrada.hijas.map(String) : [],
        sueltos: Array.isArray(entrada.sueltos) ? entrada.sueltos.map(String) : [],
      });
    }
    return limpia;
  }

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

    const theme = data.theme === 'light' || data.theme === 'dark' ? data.theme : null;

    /* Las de fábrica que no existen se descartan: si mañana se renombra o se
       quita una de `TEMPLATES`, su id quedaría marcado como borrado para
       siempre y nadie entendería por qué la plantilla nueva no aparece. */
    const deFabrica = new Set(TEMPLATES.map(t => t.id));
    /* El `Set` va ANTES de contar, no después: con el id repetido, la cuenta
       de lugares libres daba de más y entraba una plantilla extra. */
    const removedTemplates = [...new Set(
      (Array.isArray(data.removedTemplates) ? data.removedTemplates : [])
        .filter(id => deFabrica.has(id)),
    )];

    return {
      months,
      status,
      trash: cleanTrash(data.trash),
      templates: cleanTemplates(data.templates, deFabrica.size - removedTemplates.length),
      removedTemplates,
      pendientes: cleanPendientes(data.pendientes),
      recordatorioOfrecido: data.recordatorioOfrecido === true,
      theme,
    };
  }

  // ---------------------------------------------------------
  // Cálculos
  // ---------------------------------------------------------

  /**
   * Puntos y meta de una tarea en el rango.
   *
   * Los puntos suman cualquier día marcado. La meta se arma período por período
   * y a cada uno se le pide SOLO LA PARTE QUE SE ESTÁ VIENDO: una semana de la
   * que el rango muestra dos días pide dos séptimos de vez, que redondeado a
   * acciones enteras no llega a pedir nada — ver `metaEnAcciones`.
   *
   * Antes bastaba con que un día del período estuviera a la vista para exigirlo
   * entero, y eso distorsionaba todos los bordes: agosto de 2026 toca seis
   * semanas —dos días sueltos al principio, cuatro completas y el 31— así que
   * una tarea semanal hecha las cuatro veces que el mes pedía marcaba 4 sobre
   * 6, un 67%. Lo mismo, peor, hacia abajo: en la vista semanal una tarea
   * mensual pedía su única vez en cada una de las seis semanas, y la quincenal
   * pedía dos en la semana que cruza el día 15.
   *
   * Los puntos pueden superar la meta: marcar de más es válido y el total lo
   * muestra.
   */
  function taskTotals(task, days) {
    /* LO QUE NO TRANSCURRIÓ NO SE EXIGE. La meta cuenta los días vencidos del
       rango; los que todavía no llegaron no entran, porque no se incumplió
       nada en ellos. El 20 de agosto una tarea diaria marcada los veinte días
       va 20 de 20 —100%—, y no 20 de 31.

       Antes la meta era la del rango entero, con lo que el porcentaje decía
       cuánto del mes llevabas hecho: al día 4, esa misma tarea sin faltar un
       día marcaba 13% y se pintaba de rojo. Medía el avance del mes en vez del
       cumplimiento, que es lo que la columna dice medir.

       Lo hecho POR ADELANTADO sí suma —lo hecho es lo hecho, el mismo criterio
       que la fila `Cumplimiento diario`—; lo que no se cuenta es un
       incumplimiento que todavía no ocurrió. Por eso los puntos miran todos los
       días y solo `dias` se recorta. El desbalance no puede pasarse de 100%:
       lo topea `complianceOf`, que es por donde pasan todos los porcentajes.

       Que el período esté partido por el borde del mes o por la ventana de la
       vista recorta la meta igual, pero es cosa distinta: ahí no es que no haya
       pasado todavía, es que no está a la vista. */
    let points = 0;

    /** Por período: cuántos de sus días vencieron dentro del rango y qué se hizo. */
    const periodos = new Map();

    for (const d of days) {
      const s = getStatus(task, d);
      if (s) points += POINTS[s];
      if (!countsTowardGoal(task, d)) continue;

      const id = periodId(task, d);
      let p = periodos.get(id);
      if (!p) periodos.set(id, (p = { dias: 0, puntos: 0, largo: periodLength(task, d) }));
      if (d <= today) p.dias++;
      if (s) p.puntos += POINTS[s];
    }

    const objetivo = periodTarget(task);
    let max = 0;
    let dias = 0;
    for (const p of periodos.values()) {
      max += metaEnAcciones(objetivo * (p.dias / p.largo), p.puntos, objetivo);
      dias += p.dias;
    }

    /* `dias` separa los dos motivos por los que una meta puede quedar en cero,
       que la celda cuenta distinto: que la frecuencia no pida ningún día del
       rango —una tarea de lunes a viernes mirada un sábado—, o que los pida
       pero el tramo visible del período sea demasiado corto para pedir una vez. */
    return { points, max, dias };
  }

  /**
   * Pasa una meta prorrateada a acciones enteras, que es la única unidad en la
   * que estas tareas se cumplen: «socializar» se hace o no se hace, no existe
   * hacer 0,26 de socializar, ni media vez por semana.
   *
   * Cuando la parte visible del período ni siquiera llega a pedir una acción,
   * no hay obligación que incumplir: ahí la meta la fija lo que se hizo. Marcar
   * cumplido da 100% y parcial da 50%, mientras que un tramo en blanco no
   * muestra nada —un cero acusaría de incumplida a una tarea que ahí no debía
   * nada—.
   *
   * Pero esa meta improvisada NUNCA pasa de lo que pide el período completo:
   * una tarea de una vez por semana no puede pedir dos en media semana por
   * haberla hecho dos veces. Sin el tope, hacerla de más se cobraba a sí mismo
   * —dos marcas en la semana en curso levantaban una meta de 2 y se gastaban
   * en llenarla—, y una tarea hecha dos veces terminaba midiendo igual que una
   * hecha una sola vez.
   *
   * @param objetivo cuántas veces pide la tarea en un período completo.
   */
  function metaEnAcciones(prorrateada, puntos, objetivo) {
    if (prorrateada >= 1) return Math.ceil(prorrateada);
    return Math.min(Math.ceil(puntos), objetivo);
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
   * Cumplimiento de un día: lo que ese día pedía, más lo que se hizo sin que lo
   * pidiera. Entran al conteo, cada una sumando uno al techo:
   *
   *   - Las que el día pide expresamente — `isRequiredDay`. Una semanal, una
   *     quincenal o una de meta mensual no piden ningún día en particular
   *     (cualquiera del período sirve); una de lunes a viernes no pide el
   *     sábado; y las marcadas a mano como «no requerido» salen de la cuenta.
   *   - Las que NO pedía pero se hicieron igual, cumplidas o parciales. Hacer
   *     algo que no tocaba cuenta como hecho: el día tuvo una cosa más para
   *     mostrar, no una menos.
   *
   * Lo que queda afuera es lo que ni se pedía ni se hizo. Una ✕ en un día que
   * no la pedía tampoco entra: no hacer algo que nadie pidió no es un
   * incumplimiento.
   *
   * Contar todas las iniciadas —lo que se hacía antes— inflaba el denominador
   * con tareas que ese día no pedía nada: con 18 tareas de las que el lunes
   * pedía 11, hacer 8 daba 44% en vez de 73%.
   */
  function dayCompliance(date) {
    /* Un día que todavía no llegó no pide nada: nada venció aún, así que su
       techo arranca vacío y la columna muestra «—» en vez de acusar un 0% de
       incumplimiento por lo que no pasó todavía.

       Lo que se haya marcado por adelantado sí cuenta, igual que cualquier otra
       cosa hecha sin que el día la pidiera. */
    const futuro = date > today;

    let points = 0;
    let max = 0;
    for (const task of tasksOf(date.getFullYear(), date.getMonth())) {
      const s = getStatus(task, date);
      const hecha = s === 'done' || s === 'partial';
      const pedida = !futuro && isRequiredDay(task, date);
      if (!pedida && !hecha) continue;
      max += 1;
      if (s) points += POINTS[s];
    }
    return { points, max };
  }

  /**
   * Días del rango que pueden alimentar un promedio por día de la semana: los
   * que ya transcurrieron y no son anteriores al comienzo de uso.
   *
   * Los futuros quedan afuera porque valen 0 y hundirían el promedio de su día.
   * Los anteriores al comienzo de uso, porque tampoco son días flojos: son días
   * en los que la app todavía no existía para quien la usa, y contarlos como
   * ceros pintaría de rojo al día de la semana que le tocó al arranque.
   */
  function diasMedibles(days) {
    const desde = earliestStatusDay(state.status);
    // Sin una sola marca no hay comienzo de uso, y por lo tanto ningún día de uso.
    if (!desde) return [];
    return days.filter(d => d <= today && dateKey(d) >= desde);
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
  /**
   * Abre un diálogo y le deja el foco en su título.
   *
   * El título lleva  justamente para esto: sin dárselo a mano, el
   * foco cae en el contenedor scrolleable de la lista y el anillo aparece
   * rodeando todo el interior del diálogo.
   */
  function abrirDialogo(dialogo, titulo) {
    dialogo.showModal();
    $(titulo).focus();
  }

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
    prevRange: $('#prev-range'),
    nextRange: $('#next-range'),
    hoy: $('#btn-hoy'),
    carretePista: $('#carrete-pista'),
    dia: $('#dia'),
    diaLista: $('#dia-lista'),
    diaResumen: $('#dia-resumen'),
    diaResumenValor: $('#dia-resumen-valor'),
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
    taskTools: $('#task-tools'),
    taskDelete: $('#task-delete'),
    taskReorder: $('#task-reorder'),
    taskArchive: $('#task-archive'),
    taskMove: $('#task-move'),
    taskMoveUp: $('#task-move-up'),
    taskMoveDown: $('#task-move-down'),
    taskMovePos: $('#task-move-pos'),
    archived: $('#btn-archived'),
    trash: $('#btn-trash'),
    trashDialog: $('#trash-dialog'),
    trashList: $('#trash-list'),
    trashEmpty: $('#trash-empty'),
    trashAll: $('#trash-all'),
    trashRestore: $('#trash-restore'),
    grupoMasiva: $('#grupo-masiva'),
    modeDelete: $('#btn-mode-delete'),
    modeArchive: $('#btn-mode-archive'),
    modeReorder: $('#btn-mode-reorder'),
    modeConfirm: $('#mode-confirm'),
    modeOk: $('#btn-mode-ok'),
    modeCancel: $('#btn-mode-cancel'),
    archivedDialog: $('#archived-dialog'),
    archivedList: $('#archived-list'),
    archivedEmpty: $('#archived-empty'),
    archivedUndo: $('#archived-undo'),
    archivedAll: $('#archived-all'),
    deleteDialog: $('#delete-dialog'),
    deleteForm: $('#delete-form'),
    deleteTitle: $('#delete-title'),
    deleteNote: $('#delete-note'),
    deleteDateField: $('#delete-date-field'),
    deleteDate: $('#delete-date'),
    deleteError: $('#delete-error'),
    archiveDialog: $('#archive-dialog'),
    archiveTitle: $('#archive-title'),
    archiveLabel: $('#archive-label'),
    archiveSubmit: $('#archive-submit'),
    archiveForm: $('#archive-form'),
    archiveNote: $('#archive-note'),
    archiveDate: $('#archive-date'),
    archiveError: $('#archive-error'),
    controls: $('.controls'),
    board: $('#board'),
    legend: $('#legend'),
    drawer: $('#drawer'),
    drawerBackdrop: $('#drawer-backdrop'),
    menu: $('#btn-menu'),
    tabbar: $('#tabbar'),
    grupoTareas: $('#grupo-tareas'),
    mesResumen: $('#mes-resumen'),
    mesResumenValor: $('#mes-resumen-valor'),
    orden: $('#btn-orden'),
    ordenDialog: $('#orden-dialog'),
    grupoGraficos: $('#grupo-graficos'),
    grupoRecordatorio: $('#grupo-recordatorio'),
    grupoDatos: $('#grupo-datos'),
    grupoGuia: $('#grupo-guia'),
    guiaLink: $('#guia-link'),
    guiaTexto: $('#guia-texto'),
    deleteAccount: $('#btn-delete-account'),
    fab: $('#btn-fab'),
    analysis: $('#analysis'),
    todos: $('#todos'),
    main: $('.app-main'),
    pendBarra: $('#pend-barra'),
    pendLista: $('#pend-lista'),
    pendCalendario: $('#pend-calendario'),
    pendVacio: $('#pend-vacio'),
    pendMenu: $('#btn-pend-menu'),
    pendOrden: $('#btn-pend-orden'),
    pendOrdenDialog: $('#pend-orden-dialog'),
    pendOrdenOpciones: $('#pend-orden-opciones'),
    grupoPendientes: $('#grupo-pendientes'),
    pendArchivoBtn: $('#btn-pend-archivo'),
    pendArchivoDialog: $('#pend-archivo-dialog'),
    pendArchivoList: $('#pend-archivo-list'),
    pendArchivoEmpty: $('#pend-archivo-empty'),
    pendArchivoAll: $('#pend-archivo-all'),
    pendArchivoUndo: $('#pend-archivo-undo'),
    pendPapeleraBtn: $('#btn-pend-papelera'),
    pendPapeleraDialog: $('#pend-papelera-dialog'),
    pendPapeleraList: $('#pend-papelera-list'),
    pendPapeleraEmpty: $('#pend-papelera-empty'),
    pendPapeleraAll: $('#pend-papelera-all'),
    pendPapeleraRestore: $('#pend-papelera-restore'),
    pendienteDialog: $('#pendiente-dialog'),
    pendienteDialogTitle: $('#pendiente-dialog-title'),
    pendienteForm: $('#pendiente-form'),
    pendienteName: $('#pendiente-name'),
    pendienteCategoria: $('#pendiente-categoria'),
    pendienteSub: $('#pendiente-subcategoria'),
    pendienteFecha: $('#pendiente-fecha'),
    pendienteComentario: $('#pendiente-comentario'),
    pendienteError: $('#pendiente-error'),
    pendienteTools: $('#pendiente-tools'),
    pendienteDelete: $('#pendiente-delete'),
    pendienteReorder: $('#pendiente-reorder'),
    pendienteArchive: $('#pendiente-archive'),
    pendienteMove: $('#pendiente-move'),
    pendienteMoveUp: $('#pendiente-move-up'),
    pendienteMoveDown: $('#pendiente-move-down'),
    pendienteMovePos: $('#pendiente-move-pos'),
    pendienteSubmit: $('#pendiente-submit'),
    categoriaDialog: $('#categoria-dialog'),
    categoriaDialogTitle: $('#categoria-dialog-title'),
    categoriaForm: $('#categoria-form'),
    categoriaName: $('#categoria-name'),
    categoriaPadre: $('#categoria-padre'),
    categoriaError: $('#categoria-error'),
    categoriaTools: $('#categoria-tools'),
    categoriaDelete: $('#categoria-delete'),
    categoriaReorder: $('#categoria-reorder'),
    categoriaArchive: $('#categoria-archive'),
    categoriaMove: $('#categoria-move'),
    categoriaMoveUp: $('#categoria-move-up'),
    categoriaMoveDown: $('#categoria-move-down'),
    categoriaMovePos: $('#categoria-move-pos'),
    categoriaSubmit: $('#categoria-submit'),
    settings: $('#settings'),
    help: $('#help'),
    charts: $('#charts'),
    templates: $('#btn-templates'),
    reminder: $('#btn-reminder'),
    nudge: $('#reminder-nudge'),
    nudgeSi: $('#nudge-si'),
    nudgeNo: $('#nudge-no'),
    reminderBadge: $('#reminder-badge'),
    reminderDialog: $('#reminder-dialog'),
    reminderForm: $('#reminder-form'),
    reminderOn: $('#reminder-on'),
    reminderTime: $('#reminder-time'),
    reminderTimeField: $('#reminder-time-field'),
    reminderError: $('#reminder-error'),
    reminderHint: $('#reminder-hint'),
    reminderSave: $('#reminder-save'),
    saveTemplate: $('#btn-save-template'),
    saveTemplateDialog: $('#save-template-dialog'),
    saveTemplateForm: $('#save-template-form'),
    saveTemplateName: $('#save-template-name'),
    saveTemplateNote: $('#save-template-note'),
    saveTemplateError: $('#save-template-error'),
    templatesDialog: $('#templates-dialog'),
    templatesList: $('#templates-list'),
    templatesStart: $('#templates-start'),
    templatesStartHint: $('#templates-start-hint'),
    jumpDialog: $('#jump-dialog'),
    jumpTitle: $('#jump-title'),
    jumpLabel: $('#jump-label'),
    jumpGrid: $('#jump-grid'),
  };

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------

  function render() {
    const onHome = ui.page === 'home';
    const onIndicators = ui.page === 'indicators';
    const onHelp = ui.page === 'help';
    const { days } = visibleDays();

    // El selector de mes se muestra en la planilla y en los indicadores: ambos
    // son mensuales. En las otras tres no hay período que elegir, así que la
    // barra de controles entera desaparece — si no, quedaría sola con las
    // flechas de mes.
    /* El calendario de Pendientes es mensual como la planilla, así que usa la
       MISMA línea de mes: dos selectores de mes en la misma app serían dos
       cosas que aprender para lo mismo. */
    const enCalendario = ui.page === 'todos' && ui.vistaPendientes === 'calendario';
    el.controls.hidden = !(onHome || onIndicators || enCalendario);

    /* En el calendario el mes va DEBAJO del par de vistas y no arriba de todo:
       ahí es un control de esa pantalla, no el encabezado de la app. Se MUEVE
       el nodo en vez de tener un segundo botón de mes, que sería un segundo
       lugar donde arreglar lo mismo. Vuelve a su lugar al salir. */
    if (enCalendario) {
      if (el.controls.previousElementSibling !== el.pendBarra) el.pendBarra.after(el.controls);
    } else if (el.controls.parentElement !== el.main) {
      el.main.prepend(el.controls);
    }
    el.monthLabel.textContent = labelDeMes();

    /* El ☰ está donde hay algo que elegir: en Hábitos, lo que se le hace a las
       tareas; en Análisis, qué gráfico se mira. En Pendientes y en Ajustes no
       hay nada sobre lo que obrar, y ahí no está.

       Cada sección muestra lo suyo y comparten lo que es de la app entera: el
       recordatorio, los datos y la guía. */
    el.menu.hidden = !(onHome || onIndicators);

    /* Cada sección abre el cajón con lo suyo y nada más. En Análisis eso es
       elegir qué gráfico se mira; el recordatorio, los datos y la guía son de la
       app entera, pero se llega a ellos desde Hábitos —que es donde se pasa el
       tiempo—, y repetirlos acá obliga a buscar la única entrada que viene al
       caso entre seis que no. */
    el.grupoGraficos.hidden = !onIndicators;
    /* Lo de Pendientes solo en Pendientes: son sus dos listas aparte. */
    el.grupoPendientes.hidden = ui.page !== 'todos';
    // Fuera de Análisis no hay gráfico que ordenar.
    if (!onIndicators) el.orden.hidden = true;
    for (const grupo of [el.grupoRecordatorio, el.grupoDatos]) {
      grupo.hidden = !onHome;
    }

    /* La guía va en las tres secciones que tienen una: cada ☰ ofrece la de su
       pantalla y no un índice de toda la app. El rótulo la nombra porque el
       cajón es UNO SOLO y el mismo nodo sirve a las tres: sin el nombre no se
       sabría cuál se está por abrir. */
    const conGuia = Boolean(NOMBRE_DE_GUIA[ui.page]);
    el.grupoGuia.hidden = !conGuia;
    if (conGuia) {
      el.guiaTexto.textContent = `Cómo usar ${NOMBRE_DE_GUIA[ui.page]}`;
      /* Es un enlace de verdad —abrirlo en otra pestaña tiene que llevar a la
         guía que dice—, así que el destino se arma en cada dibujado y no una
         sola vez al arrancar. */
      el.guiaLink.href = BASE + RUTA_DE_GUIA[ui.page];
    }

    /* Las acciones del mes viven en el cajón, que se abre desde cualquier
       sección; pero operan sobre las tareas del día, así que fuera del Diario
       no hay sobre qué actuar y el apartado entero se va. */
    el.grupoTareas.hidden = !onHome;

    // El carrete y la lista del día son el Diario y solo viven ahí.
    el.board.hidden = !onHome;

    /* «Hoy» solo cuando el carrete está parado en otro día: en hoy no llevaría
       a ningún lado, y un botón que no hace nada es peor que no tenerlo. Va
       ACÁ y no más abajo porque el render corta antes de llegar allá cuando la
       sección no es el Diario, y el botón se quedaba prendido en Análisis. */
    /* «Hoy» y el remate de la postura comparten el lugar de la fila. Con una
       postura puesta manda el remate: volver a hoy en medio de una elección
       movería la lista debajo de lo que se está tildando. */
    el.hoy.hidden = !onHome || Boolean(ui.rowMode) || sameDay(diaActual(), today);
    el.hoy.title = `Volver a hoy, ${fmtFull.format(today)}`;
    el.hoy.setAttribute('aria-label', el.hoy.title);
    renderNudge();
    el.legend.hidden = !onHome;
    el.analysis.hidden = !onIndicators;
    el.todos.hidden = ui.page !== 'todos';
    if (ui.page === 'todos') { renderPendientes(); renderEntradasPendientes(); }
    renderFab();
    el.settings.hidden = ui.page !== 'settings';
    el.help.hidden = !onHelp;
    if (onHelp) renderGuia();

    /* La sección activa se marca en los dos lugares desde donde se navega: la
       barra del pie y lo que quede en el cajón. Por eso el recorrido va sobre
       el documento y no sobre uno de ellos. */
    for (const item of document.querySelectorAll('[data-page]')) {
      item.classList.toggle('is-active', item.dataset.page === ui.page);
      item.setAttribute('aria-current', item.dataset.page === ui.page ? 'page' : 'false');
    }

    if (!onHome) {
      if (onIndicators) {
        renderCharts();
      }
      return;
    }

    // Las flechas mueven el carrete de a una vuelta, en los dos sentidos.
    el.prevRange.title = `Ver los ${CARRETE} días anteriores`;
    el.nextRange.title = `Ver los ${CARRETE} días siguientes`;
    for (const btn of [el.prevRange, el.nextRange]) {
      btn.setAttribute('aria-label', btn.title);
    }

    renderCarrete();
    renderAccionesDelMes();

    /* El aviso de «todavía no hay tareas» mira el DÍA, no el mes: si todas
       arrancan más adelante, ese día no tiene ninguna y decirlo es lo honesto. */
    const hasTasks = tareasDelDia(days[0]).length > 0;
    el.dia.hidden = !hasTasks;
    el.empty.hidden = hasTasks;

    if (hasTasks) renderDia(days[0]);
    else el.diaLista.innerHTML = '';
  }

  // ---------------------------------------------------------
  // El carrete de días
  // ---------------------------------------------------------

  /**
   * La tira de días de arriba: el elegido al medio y tres a cada lado. Cada uno
   * es una ficha con su día de la semana y su número.
   *
   * Los del mes vecino se atenúan pero se pueden elegir: al hacerlo, el mes de
   * trabajo los sigue. Es lo que vuelve continua la navegación sin romper el
   * modelo mensual de las tareas.
   */
  function renderCarrete() {
    const centro = diaActual();
    const frag = document.createDocumentFragment();

    for (const d of diasDelCarrete()) {
      const ficha = boton('carrete-dia', {
        title: capitalizeFirstLetter(fmtFull.format(d)),
        label: capitalizeFirstLetter(fmtFull.format(d)),
      });
      ficha.dataset.date = dateKey(d);

      ficha.append(
        elem('span', 'carrete-dow', fmtDow.format(d).replace('.', '').slice(0, 3)),
        elem('span', 'carrete-num', String(d.getDate())),
      );

      const esCentro = sameDay(d, centro);
      ficha.classList.toggle('is-centro', esCentro);
      // De otro mes: se ve, se elige, y avisa que va a mudar el mes de trabajo.
      ficha.classList.toggle('is-fuera',
        d.getFullYear() !== ui.year || d.getMonth() !== ui.month);
      ficha.classList.toggle('is-today', sameDay(d, today));
      ficha.classList.toggle('is-weekend', isWeekend(d));
      if (esCentro) ficha.setAttribute('aria-current', 'date');

      frag.appendChild(ficha);
    }

    el.carretePista.replaceChildren(frag);
  }

  // ---------------------------------------------------------
  // La lista del día
  // ---------------------------------------------------------

  /**
   * Las tareas que existen ESE día: las del mes que ya empezaron.
   *
   * Una tarea creada el 28 no existía el 27, así que ese día no aparece. Antes
   * se dibujaba con el recuadro apagado —«anterior a la fecha de inicio»—, que
   * es contar una historia que no pasó: la lista de un día tiene que ser lo que
   * había ese día.
   */
  function tareasDelDia(date) {
    return currentTasks().filter(task => !fueraDeVigencia(task, date));
  }

  /**
   * ¿Este día cuenta para esta tarea? Es lo que decide si la tarjeta va
   * encendida o apagada, y hay dos maneras de que cuente:
   *
   * - **la frecuencia lo pide** — una tarea diaria cualquier día, una de días
   *   fijos los suyos;
   * - **está cargado igual** — lo hiciste un día que no tocaba, o es una tarea
   *   sin días propios («8 veces al mes», «una vez por semana»), donde ningún
   *   día es «el» día hasta que se marca.
   *
   * «No requerido» queda afuera de las dos: es justamente eximirse del día.
   * `isRequiredDay` ya lo contempla —devuelve false para el día eximido a mano,
   * para las tareas de período y para las de meta por cuenta—.
   */
  function cuentaHoy(task, date) {
    const marca = getStatus(task, date);
    return isRequiredDay(task, date) || Boolean(marca && marca !== 'skip');
  }

  /**
   * Lo que se carga: una fila por tarea del mes, con el estado de ESE día.
   *
   * Reusa `.task-cell` —el mismo bloque que tenía la columna de tareas de la
   * planilla— para no tener dos marcados distintos del mismo contenido: ahí
   * viven el nombre, la frecuencia, el lápiz y, con una postura puesta, los
   * casilleros o los chevrones.
   */
  function renderDia(date) {
    const tasks = tareasDelDia(date);
    const frag = document.createDocumentFragment();

    /* «Todas» encabeza la lista mientras haya casilleros: elegir todas es lo
       primero que se quiere cuando la acción es sobre varias. */
    if (modoConCasilleros() && tasks.length) {
      const cabecera = elem('li', 'dia-todas');
      const todas = elem('input', 'task-pick');
      todas.type = 'checkbox';
      todas.dataset.pickAll = '';
      todas.title = 'Seleccionar todas las tareas';
      todas.setAttribute('aria-label', 'Seleccionar todas las tareas');
      cabecera.append(todas, elem('span', 'dia-todas-rotulo', 'Todas'));
      frag.appendChild(cabecera);
    }

    tasks.forEach((task, i) => {
      const fila = elem('li', 'dia-fila');
      fila.dataset.taskId = task.id;
      if (ui.selected.has(task.id)) fila.classList.add('is-selected');
      if (!cuentaHoy(task, date)) fila.classList.add('is-optional');

      fila.appendChild(taskCellContent(task, i, tasks.length));

      /* Con una postura puesta no se carga el día: ordenando, en el lugar del
         recuadro de estado van las flechas —que es donde ya está la mano—, y
         eligiendo no va nada. Un recuadro a mano mientras se tilda es un clic
         distraído que marca algo que nadie quiso. */
      if (ui.rowMode === 'reordenar') fila.appendChild(moveStack(task, i, tasks.length));
      else if (!ui.rowMode) fila.appendChild(statusButton(task, date));
      frag.appendChild(fila);
    });

    el.diaLista.replaceChildren(frag);
    renderResumenDelDia(date);
  }

  /** El cumplimiento del día, encabezando la lista. */
  function renderResumenDelDia(date) {
    /* La MISMA cuenta que usa el gráfico de barras: la del día. Antes esta fila
       sumaba por tarea y las dos podían no coincidir —el 30 de agosto decían
       35% y 41%—, que es lo peor que puede pasar con dos números que contestan
       la misma pregunta. */
    const totales = dayCompliance(date);
    const nivel = complianceOf(totales.points, totales.max);

    el.diaResumen.className = `dia-resumen ${nivel ? 'cp-' + nivel.status : 'cp-empty'}`;
    el.diaResumenValor.textContent = nivel ? pct(nivel.ratio) : '—';
    el.diaResumen.title = nivel
      ? `${num(totales.points)} sobre una meta de ${num(totales.max)} `
        + `el ${fmtFull.format(date)}`
      : `Ninguna tarea pide algo el ${fmtFull.format(date)}`;
  }

  /**
   * El botón redondo de la esquina: existe solo en las dos secciones que crean
   * algo, y dice cuál de las dos cosas crea.
   *
   * El «+» no dice nada por sí solo, así que el nombre accesible lo pone el
   * `aria-label` —lo que anuncia un lector de pantalla— y el `title` agrega el
   * atajo, que existe únicamente en Diario.
   */
  /**
   * De las tres tarjetas de «Cómo usar», la de la sección que la abrió.
   *
   * Las tres viven en el mismo documento y se muestra una: son tres textos
   * cortos, y traerlas por separado obligaría a pedir algo por red justo en la
   * pantalla que explica que la app anda sin conexión.
   */
  function renderGuia() {
    for (const tarjeta of el.help.querySelectorAll('[data-guia]')) {
      tarjeta.hidden = tarjeta.dataset.guia !== ui.guia;
    }
    el.help.setAttribute('aria-label', `Cómo usar ${NOMBRE_DE_GUIA[ui.guia]}`);
  }

  function renderFab() {
    const enPendientes = ui.page === 'todos';
    el.fab.hidden = !(ui.page === 'home' || enPendientes);
    if (el.fab.hidden) return;

    const label = enPendientes
      ? (ui.vistaPendientes === 'categorias' ? 'Agregar categoría' : 'Agregar tarea pendiente')
      : 'Agregar tarea';
    el.fab.setAttribute('aria-label', label);
    el.fab.title = enPendientes ? label : 'Crear una tarea nueva (atajo: N)';
  }

  /**
   * El apartado «Tareas» del cajón: qué se puede hacer sobre el mes visible y
   * qué no. Se dibuja con la planilla —es la única sección sobre la que estas
   * acciones operan— aunque el cajón se abra desde cualquier lado.
   */
  function renderAccionesDelMes() {
    /* Dos razones distintas para no poder guardar, y el tooltip dice cuál: sin
       tareas no hay qué guardar, y con los cinco lugares tomados hay que hacer
       lugar antes. Un botón apagado sin decir por qué manda a adivinar. */
    const archivadas = tareasArchivadas();
    el.archived.disabled = archivadas.length === 0;
    el.archived.title = archivadas.length
      ? `Ver ${archivadas.length} ${archivadas.length === 1 ? 'tarea archivada' : 'tareas archivadas'}`
        + ` de ${labelDeMes()}`
      : `Ninguna tarea archivada en ${labelDeMes()}`;

    /* Las tres posturas se apagan sin tareas: no habría sobre qué operar. Y el
       grupo se despliega solo con una puesta, que es donde está su ✓. */
    const sinTareas = currentTasks().length === 0;
    for (const [btn, modo, verbo] of [
      [el.modeDelete, 'eliminar', 'Elegir tareas para eliminar'],
      [el.modeArchive, 'archivar', 'Elegir tareas para archivar'],
      [el.modeReorder, 'reordenar', 'Mostrar los chevrones para reordenar'],
    ]) {
      const activo = ui.rowMode === modo;
      btn.disabled = sinTareas;
      btn.setAttribute('aria-pressed', String(activo));
      btn.classList.toggle('is-active', activo);
      btn.title = sinTareas ? 'No hay tareas en este mes'
        : activo ? 'Volver a las filas limpias' : verbo;
    }
    if (ui.rowMode) el.grupoMasiva.open = true;
    renderModeConfirm();

    const enPapelera = papelera().length;
    el.trash.disabled = enPapelera === 0;
    el.trash.title = enPapelera
      ? `Restaurar algo de lo eliminado (${enPapelera})`
      : 'No hay nada eliminado en los últimos 7 días';

    const motivo = motivoSinGuardar();
    el.saveTemplate.disabled = Boolean(motivo);
    el.saveTemplate.title = motivo
      || `Guardar las ${tareasDelDia(diaActual()).length} tareas `
        + `del ${fmtFull.format(diaActual())} como plantilla`;

  }

  /** Las dos posturas que ELIGEN tareas comparten los casilleros. */
  const modoConCasilleros = () =>
    ui.rowMode === 'eliminar' || ui.rowMode === 'archivar';

  /**
   * El bloque de una tarea: el nombre con su frecuencia, el lápiz y, según la
   * postura, el casillero o los chevrones. Era el contenido de la columna
   * «Tareas» de la planilla y ahora es el de cada fila de la lista del día — el
   * mismo marcado, para no tener dos versiones del mismo contenido.
   */
  function taskCellContent(task, index = 0, total = 1) {
    const wrap = elem('div', 'task-cell');

    /* Casilleros y chevrones se DIBUJAN solo en su postura, no se esconden con
       CSS: un control invisible pero presente sigue estando en el recorrido del
       teclado y en el árbol de accesibilidad. */
    const piezas = [];

    if (modoConCasilleros()) {
      const pick = elem('input', 'task-pick');
      pick.type = 'checkbox';
      pick.dataset.taskId = task.id;
      pick.checked = ui.selected.has(task.id);
      pick.title = `Seleccionar «${task.name}»`;
      pick.setAttribute('aria-label', `Seleccionar ${task.name}`);
      piezas.push(pick);
    }

    const info = elem('div', 'task-info');

    const name = elem('span', 'task-name', task.name);
    name.title = task.name;

    const freq = elem('span', 'task-freq', freqLabel(task));
    // La fecha de inicio no se escribe en la fila para no alargarla; se consulta acá.
    freq.title = task.start
      ? `${freqLabel(task)} — empieza el ${fmtShort.format(parseDateKey(task.start))}`
      : freqLabel(task);

    info.append(name, freq);

    /* El lápiz abre «Editar tarea», que es de donde salen TODAS las acciones
       sobre la tarea: cambiarle los datos, eliminarla, moverla de lugar y
       archivarla. La fila se queda con lo que se carga a diario.

       Con una postura puesta no está: abrir un diálogo interrumpe justo lo que
       se está haciendo —ordenar, o elegir de a varias—, y la fila se queda con
       lo de esa postura y el nombre. */
    if (!ui.rowMode) {
      const actions = elem('div', 'task-actions');
      actions.appendChild(boton('mini-btn', {
        text: '✎',
        action: 'edit',
        title: `Editar «${task.name}»`,
        label: `Editar ${task.name}`,
      }));
      piezas.push(info, actions);
    } else {
      piezas.push(info);
    }

    wrap.append(...piezas);
    return wrap;
  }

  /** Las dos flechas de una fila, en el lugar del recuadro de estado. */
  function moveStack(task, index, total) {
    const move = elem('div', 'move-stack');
    move.append(
      moveButton('up', '▲', index === 0, `Subir «${task.name}»`),
      moveButton('down', '▼', index === total - 1, `Bajar «${task.name}»`),
    );
    return move;
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
    /* El estado lo dice el relleno del recuadro, no un símbolo adentro. El
       nombre accesible sí lo nombra: es lo único que tiene un lector de
       pantalla, que no ve el color. */
    btn.classList.add(status ? `st-${status}` : 'st-none');
    btn.setAttribute('aria-label',
      `${task.name}, ${fmtFull.format(date)}: ${status ? STATUS_LABEL[status] : 'sin cargar'}`);

    return btn;
  }

  /**
   * Puntos que se marcaron ese día, cuenten o no para la meta de cada tarea. Es
   * cuánto se HIZO, sin mirar contra qué.
   *
   * Fue una medida a la vista y se sacó: premiaba al día con más tareas
   * asignadas —el lunes ganaba por tener veinte, no por rendir mejor—. Queda
   * como SEGUNDO criterio del podio, donde no manda: solo ordena a los días que
   * ya empataron en cumplimiento.
   */
  function dayPoints(date) {
    let points = 0;
    for (const task of tasksOf(date.getFullYear(), date.getMonth())) {
      if (fueraDeVigencia(task, date)) continue;
      const s = getStatus(task, date);
      if (s) points += POINTS[s];
    }
    return points;
  }

  /**
   * El cumplimiento de cada día de la semana, promediado sobre los días
   * medibles del rango — ver `diasMedibles`.
   *
   * Es **qué proporción de lo que ese día pedía se cumplió**, y se agrega
   * sumando puntos y techos antes de dividir: promediar los porcentajes
   * diarios le daría el mismo peso a un domingo que pedía una tarea que a un
   * lunes que pedía veinte.
   *
   * Hubo una segunda medida, `tareas`: el promedio de puntos del día, sin mirar
   * contra qué. Medía cuánto se hizo y no cuánto de lo que había que hacer, así
   * que coronaba al día con más tareas asignadas —el lunes ganaba por tener
   * veinte, no por rendir mejor—.
   */
  function weekdayAverages(days) {
    const buckets = new Map();
    for (const d of diasMedibles(days)) {
      const b = buckets.get(d.getDay()) || { points: 0, max: 0, hechas: 0, dias: 0 };
      const c = dayCompliance(d);
      b.points += c.points;
      b.max += c.max;
      b.hechas += dayPoints(d);
      b.dias += 1;
      buckets.set(d.getDay(), b);
    }

    // Se redondea para que comparar promedios iguales no falle por coma flotante.
    const redondo = n => Math.round(n * 1e4) / 1e4;
    return [...buckets].map(([js, b]) => ({
      js,
      pct: b.max > 0 ? redondo((b.points / b.max) * 100) : null,
      // Solo para desempatar el podio; no se muestra.
      tareas: redondo(b.hechas / b.dias),
    }));
  }

  /**
   * Días de uso que hacen falta para comparar días de la semana.
   *
   * Siete es el mínimo con sentido: es lo que tarda cada día de la semana en
   * aparecer una vez. Con menos, el ranking no compara promedios sino qué días
   * cayeron dentro del tramo — un mes recién empezado coronaría al lunes por
   * haber tenido un lunes.
   */
  const MINIMO_DIAS = 7;

  /* Corto a propósito: es lo que el gráfico muestra en lugar de las barras, y
     el porqué de los siete días vive en la guía. */
  function avisoMinimoDias(cuantos) {
    return cuantos
      ? `Hacen falta ${MINIMO_DIAS} días de uso para comparar; van ${cuantos}.`
      : 'Todavía no hay días de uso en este mes.';
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
   * La tarjeta de un gráfico: el dibujo y nada más.
   *
   * Tuvo un título y una bajada. Los dos se fueron: se dibuja UN gráfico por
   * vez y es el menú el que dice cuál —queda marcado ahí—, así que el rótulo
   * repetía arriba de cada tarjeta lo que ya se acababa de elegir. Lo que hay
   * que saber para leerlos vive en la guía, que es donde se lo busca.
   *
   * El nombre sigue estando para quien no ve la pantalla: va en `aria-label`,
   * que es lo que anuncia un lector de pantalla al entrar a la figura.
   */
  function chartCard(title) {
    const card = elem('figure', 'chart-card');
    card.setAttribute('aria-label', title);
    return card;
  }

  // ---- Barras: promedio por día de la semana ---------------------------

  /**
   * La marca del podio, arriba de la barra: una corona sobre el mejor día y una
   * cruz sobre el peor.
   *
   * Es lo que antes decía el color de la barra. Separarlos deja que el color
   * hable de cuánto se cumplió y el dibujo de quién ganó, que son dos preguntas
   * distintas: el mejor día de un mes flojo sigue siendo el mejor, y su barra
   * tiene que poder ser roja.
   */
  function podio(cx, y, cual) {
    const g = svg('g', {
      class: `podio podio-${cual}`,
      transform: `translate(${cx} ${y})`,
    });

    g.appendChild(svg('path', {
      d: cual === 'mejor'
        // Corona: base y tres picos.
        ? 'M-6.5 4 L-6.5 -3.5 L-3 0 L0 -4.5 L3 0 L6.5 -3.5 L6.5 4 Z'
        // Cruz: el último del podio.
        : 'M-4 -4 L4 4 M4 -4 L-4 4',
    }));

    g.appendChild(svg('title')).textContent =
      cual === 'mejor' ? 'El mejor día del mes' : 'El peor día del mes';
    return g;
  }

  function weekdayChart(days) {
    /* Tuvo un botón en la esquina para elegir entre cantidad de tareas y
       porcentaje. Con una sola medida no hay nada que elegir. */
    const card = chartCard('Barras');

    /* El mismo mínimo que las tarjetas de productividad, porque es la misma
       cuenta: si la tarjeta dice que no alcanza, la barra de al lado no puede
       estar coronando al lunes con un solo lunes medido. */
    const medibles = diasMedibles(days);
    if (medibles.length < MINIMO_DIAS) {
      card.appendChild(emptyChart(avisoMinimoDias(medibles.length)));
      return card;
    }

    const averages = weekdayAverages(days);
    const byJs = new Map(averages.map(a => [a.js, a]));
    const data = WEEKDAYS.map(w => ({
      w,
      avg: byJs.get(w.js)?.pct ?? null,
      tareas: byJs.get(w.js)?.tareas ?? 0,
    }));
    const values = data.filter(d => d.avg !== null).map(d => d.avg);

    /* Un día puede no tener nada que medir —ninguna tarea le pedía nada— y viene
       en `null`, así que el vacío se decide sobre los valores que quedaron y no
       sobre la cantidad de días. */
    if (!values.length || values.every(v => v === 0)) {
      card.appendChild(emptyChart('Todavía no hay datos cargados'));
      return card;
    }

    /* El podio compara lo MISMO que se muestra —el porcentaje redondeado— y,
       cuando eso empata, mira cuántas tareas se hicieron en promedio ese día:
       entre dos días que cumplieron igual, rindió más el que hizo más cosas.

       Comparar sobre el promedio con decimales decidía por un dato que la barra
       no muestra: dos días rotulados «75%» podían ser 75,4 y 74,8, y la corona
       caía en uno sin que se viera por qué. */
    const rinde = (a, b) => (Math.round(a.avg) - Math.round(b.avg)) || (a.tareas - b.tareas);

    const medidos = data.filter(d => d.avg !== null);
    const mejor = medidos.reduce((x, y) => (rinde(y, x) > 0 ? y : x));
    const peor = medidos.reduce((x, y) => (rinde(y, x) < 0 ? y : x));

    // La altura sí sale del valor exacto: es una escala, no un ranking.
    const top = Math.max(...values);

    const W = 340, H = 178;
    // El alto de arriba tiene que alcanzar para el número Y para el podio.
    const padX = 10, padTop = 40, padBottom = 26;
    const band = (W - padX * 2) / data.length;
    const barW = Math.min(24, band * 0.55);
    const plotH = H - padTop - padBottom;

    const plot = svg('svg', {
      viewBox: `0 0 ${W} ${H}`,
      class: 'bars',
      role: 'img',
      'aria-label': 'Cumplimiento promedio por día de la semana',
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

      /* Empatar en los dos criterios corona a los dos: ahí no hay diferencia que
         mostrar, y elegir uno sería inventarla. Y sin diferencia entre el mejor
         y el peor no hay podio: el mes está parejo. */
      const esTope = rinde(d, mejor) === 0;
      const esPiso = rinde(d, peor) === 0 && rinde(mejor, peor) !== 0;

      /* El color dice qué tan bien está ese día, con el mismo umbral que el
         resto de la app: verde desde 75, ámbar desde 50, rojo abajo. Antes decía
         cuál era el extremo —verde el más alto, rojo el más bajo—, así que un mes
         malo parejo igual tenía su barra verde. Cuál es el extremo lo dice ahora
         el podio, arriba de la barra. */
      /* La misma paleta que «Puntos» y «Porcentajes»: los tres gráficos de esta
         pantalla se miran de corrido, y con un verde acá y otro allá el mismo
         nivel parecía dos cosas distintas. */
      const nivel = complianceOf(d.avg, 100);
      const bar = svg('path', {
        d: columnPath(cx - barW / 2, y, barW, h),
        fill: `var(--dot-${nivel.status})`,
      });
      bar.appendChild(svg('title')).textContent =
        `${capitalizeFirstLetter(d.w.long)}: ${pct(d.avg)} en promedio`;
      plot.appendChild(bar);

      /* El número va en todas. Estuvo solo en los extremos, cuando el color
         decía cuál era el mejor y cuál el peor y un número por barra era ruido
         encima de eso. Ahora el color dice el nivel y el podio dice el extremo,
         así que el número queda libre para lo suyo: el dato exacto del día. */
      const value = svg('text', {
        x: cx, y: y - 6, 'text-anchor': 'middle', class: 'bar-value',
      });
      value.textContent = pct(d.avg);
      plot.appendChild(value);

      if (esTope || esPiso) plot.appendChild(podio(cx, y - 24, esTope ? 'mejor' : 'peor'));
    });

    card.appendChild(plot);
    return card;
  }

  // ---- Barras horizontales: cumplimiento por tarea ---------------------

  /**
   * La misma forma que «Puntos» —una tarjeta por tarea, con su nombre y su
   * frecuencia— pero con una barra en lugar de los puntos: adónde llegó el mes
   * para esa tarea.
   *
   * Va ordenado de mayor a menor, que es la pregunta que se le hace: cuál va
   * mejor y cuál está flojo. Copió un tiempo el orden de la lista, para poder
   * compararse renglón contra renglón con «Puntos»; esa comparación se paga con
   * un ojo más de trabajo, leer el ranking no.
   *
   * Las que este mes no piden nada no tienen porcentaje que ordenar, así que van
   * al final: arriba ocuparían el lugar de las que sí.
   */
  function taskChart(days) {
    const card = chartCard('Porcentajes');
    card.classList.add('is-plana');

    const filas = tareasOrdenadas(days);
    if (!filas.length) {
      card.appendChild(emptyChart('Todavía no hay tareas este mes'));
      return card;
    }

    const lista = elem('ul', 'dots-list');
    for (const { task, nivel } of filas) {
      const fila = elem('li', 'dots-row');

      const info = elem('div', 'task-info');
      const nombre = elem('span', 'task-name', task.name);
      nombre.title = task.name;
      info.append(nombre, elem('span', 'task-freq', freqLabel(task)));

      fila.append(info, barraDeTarea(task, nivel));
      lista.appendChild(fila);
    }

    card.appendChild(lista);
    return card;
  }

  /**
   * La barra de una tarea: el riel, lo alcanzado y el número al costado.
   *
   * El color sale del NIVEL, con la misma lógica que «Barras»: verde desde 75,
   * ámbar desde 50, rojo abajo. Una tarea sin meta este mes —ninguna de sus
   * fechas cae en él— no tiene adónde llegar, así que va con el riel vacío y un
   * guion en lugar del número.
   */
  function barraDeTarea(task, nivel) {
    const caja = elem('div', 'meter');
    const riel = elem('span', 'meter-track');

    if (nivel) {
      /* El cumplimiento topea en 100%, así que la barra llena es el máximo y la
         escala coincide con el dato: no hace falta recortar nada. */
      const lleno = elem('i', `meter-fill st-${nivel.status}`);
      lleno.style.width = `${nivel.ratio}%`;
      riel.appendChild(lleno);
    }

    caja.append(riel, elem('span', 'meter-value', nivel ? pct(nivel.ratio) : '—'));
    caja.title = nivel
      ? `${task.name}: ${pct(nivel.ratio)} de cumplimiento`
      : `${task.name}: este mes no pide nada`;
    return caja;
  }

  function emptyChart(text) {
    return elem('p', 'chart-empty', text);
  }

  // ---- Puntos: el mes día por día, tarea por tarea ---------------------

  /**
   * Cómo viene el mes: lo hecho sobre lo que las tareas piden.
   *
   * Una cumplida suma un punto y una parcial medio, agregado sobre todas las
   * tareas del mes.
   *
   * Suma los puntos ENTEROS, sin topear cada tarea en su propia meta: lo hecho
   * de más en una compensa lo que falta en otra. Es una decisión distinta a la
   * de la fila de cada tarea —donde el porcentaje sí topea en 100%, porque ahí
   * la pregunta es si ESA tarea se cumplió—; acá la pregunta es cuánto se hizo
   * en el mes contra cuánto se pedía, y para eso todo lo hecho cuenta. Una
   * semanal hecha cuatro veces en una semana tapa un día de la diaria, y así
   * se quiso.
   *
   * El porcentaje sigue sin pasar de 100%: es `complianceOf` el que lo topea,
   * y un cumplimiento del 130% no querría decir nada.
   *
   * `taskTotals` recorta la meta a los días ya vencidos: lo que no transcurrió
   * no se exige, y al día 4 el mes entero por delante no cuenta como
   * incumplido. Y cuenta bien a las de período —una semanal pide cuatro veces
   * en el mes, sin pedir ningún día en particular—, que contadas por «días
   * requeridos» no aportaban nada y dejaban el mes en 100% siempre.
   */
  function cumplimientoMensual(days) {
    let puntos = 0;
    let meta = 0;

    for (const task of currentTasks()) {
      const t = taskTotals(task, days);
      puntos += t.points;
      meta += t.max;
    }
    return { puntos, meta };
  }

  /**
   * El renglón de arriba de Análisis. Se dibuja siempre, también cuando no hay
   * nada que medir: ahí muestra «—», que es lo que dice un mes sin exigencias.
   */
  function renderMesResumen() {
    const days = monthDays(ui.year, ui.month);
    const { puntos, meta } = cumplimientoMensual(days);
    const nivel = complianceOf(puntos, meta);

    el.mesResumen.className = `dia-resumen ${nivel ? 'cp-' + nivel.status : 'cp-empty'}`;
    el.mesResumenValor.textContent = nivel ? pct(nivel.ratio) : '—';
    // El mismo texto que el resumen del día, que hace la misma cuenta.
    el.mesResumen.title = nivel
      ? `${num(puntos)} sobre una meta de ${num(meta)} en ${labelDeMes()}`
      : `Ninguna tarea pidió nada en ${labelDeMes()}`;
  }

  /**
   * Las tareas del mes en el orden elegido. `lista` las deja como están —es el
   * orden que uno armó, el mismo que muestra Hábitos—; los otros dos ordenan por
   * cumplimiento del mes.
   *
   * Las que este mes no piden nada no tienen porcentaje que ordenar, así que van
   * al final en los dos sentidos: arriba ocuparían el lugar de las que sí.
   */
  function tareasOrdenadas(days, criterio = 'pct') {
    const filas = currentTasks().map(task => {
      const t = taskTotals(task, days);
      return { task, puntos: t.points, nivel: complianceOf(t.points, t.max) };
    });

    if (ui.orden === 'lista') return filas;

    const signo = ui.orden === 'desc' ? -1 : 1;
    return [...filas].sort((a, b) => {
      /* Las que este mes no piden nada no tienen porcentaje que comparar, así
         que van al final en cualquiera de los dos órdenes. */
      if (!a.nivel || !b.nivel) return (a.nivel ? 0 : 1) - (b.nivel ? 0 : 1);

      /* Los puntos empatan seguido —media docena de tareas diarias con la misma
         cuenta—, y ahí decide el porcentaje: entre dos que hicieron 20, va
         primero la que con eso cumplió más de lo suyo. */
      if (criterio === 'puntos' && a.puntos !== b.puntos) {
        return signo * (a.puntos - b.puntos);
      }
      return signo * (a.nivel.ratio - b.nivel.ratio);
    });
  }

  /** Los tres órdenes, en el orden en que los ofrece el desplegable. */
  const ORDENES = [
    { clave: 'lista', nombre: 'el predeterminado' },
    { clave: 'desc', nombre: 'de mayor a menor' },
    { clave: 'asc', nombre: 'de menor a mayor' },
  ];

  /**
   * El botón del orden: existe solo donde hay algo que ordenar —«Puntos» y
   * «Porcentajes» listan tareas; «Barras» es por día de la semana, y ahí el
   * orden es el calendario—.
   *
   * Muestra el dibujo del orden PUESTO, como el botón del tema: el control dice
   * dónde está. Cuál se elige lo resuelve el desplegable, donde las tres están a
   * la vista y la puesta se ve.
   */
  function renderOrden() {
    const listaDeTareas = ui.chart === 'puntos' || ui.chart === 'porcentajes';
    el.orden.hidden = !(ui.page === 'indicators' && listaDeTareas);
    if (el.orden.hidden) return;

    const actual = ORDENES.find(o => o.clave === ui.orden) ?? ORDENES[0];

    for (const icono of el.orden.querySelectorAll('.orden-icon')) {
      icono.hidden = icono.dataset.orden !== actual.clave;
    }
    el.orden.title = `Orden: ${actual.nombre}`;
    el.orden.setAttribute('aria-label', `Ordenar. Ahora: ${actual.nombre}`);

    for (const opcion of el.ordenDialog.querySelectorAll('.orden-opcion')) {
      opcion.setAttribute('aria-pressed', String(opcion.dataset.orden === actual.clave));
    }
  }

  el.orden.addEventListener('click', () => {
    abrirDialogo(el.ordenDialog, '#orden-title');
  });

  el.ordenDialog.addEventListener('click', e => {
    const opcion = e.target.closest('.orden-opcion');
    if (!opcion) return;
    ui.orden = opcion.dataset.orden;
    el.ordenDialog.close();
    renderCharts();
  });

  /**
   * El mes entero en puntos: una fila por tarea y un punto por día.
   *
   * Los otros dos gráficos resumen —un número por tarea, un promedio por día de
   * la semana—; este no resume nada, y por eso muestra lo que ninguno puede
   * decir: dónde se cortó una racha, cuántos días seguidos duró, si el bajón fue
   * al principio o al final del mes.
   *
   * Van TODAS las tareas del mes, también las que hoy no se ven —archivadas o
   * eliminadas desde una fecha—: sus días fuera de vigencia salen apagados, que
   * es justamente lo que cuenta su historia.
   */
  function monthDotsChart(days) {
    /* Sin recuadro: no es un dibujo adentro de una caja sino una lista de las
       mismas tarjetas de Hábitos, y envolverla dejaba una caja adentro de otra.
       Sueltas, las filas ocupan el ancho entero, que es lo que los puntos
       necesitan para entrar en menos renglones. */
    const card = chartCard('Puntos');
    card.classList.add('is-plana');

    /* Por PUNTOS, que es lo que esta tarjeta dibuja: ordenarla por porcentaje
       la dejaba ordenada por un número que no muestra. */
    const filas = tareasOrdenadas(days, 'puntos');
    if (!filas.length) {
      card.appendChild(emptyChart('Todavía no hay tareas este mes'));
      return card;
    }

    const lista = elem('ul', 'dots-list');
    for (const { task } of filas) {
      const fila = elem('li', 'dots-row');

      const info = elem('div', 'task-info');
      const nombre = elem('span', 'task-name', task.name);
      nombre.title = task.name;
      info.append(nombre, elem('span', 'task-freq', freqLabel(task)));

      const puntos = elem('div', 'dots');
      for (const d of days) puntos.appendChild(dotOf(task, d));

      fila.append(info, puntos);
      lista.appendChild(fila);
    }

    card.appendChild(lista);
    return card;
  }

  /**
   * El punto de una tarea en un día. Los cuatro estados llevan su color, y hay
   * dos maneras de no llevar ninguno:
   *
   * - **apagado**: el día está fuera de vigencia —antes de empezar, archivada o
   *   eliminada— o todavía no llegó. No hay nada que decir de él.
   * - **vacío**: el día pasó y no se cargó. Eso sí es un dato.
   *
   * Y el día que la frecuencia no pide se atenúa, igual que la tarjeta de la
   * lista del día: una tarea de lunes a viernes no incumple los domingos.
   */
  function dotOf(task, date) {
    const punto = elem('span', 'dot');
    const cuando = fmtFull.format(date);

    /* Los días en que la tarea no estaba viva —antes de su fecha de inicio,
       archivada o eliminada— no pedían nada, que es lo mismo que dice el gris.
       Apagados se confundían con los días que todavía no llegaron, y una tarea
       dada de alta a mitad de mes arrancaba el mes pareciendo pendiente. */
    if (fueraDeVigencia(task, date)) {
      punto.classList.add('st-skip');
      punto.title = `${task.name}, ${cuando}: `
        + (beforeStart(task, date) ? 'todavía no existía' : 'no estaba activa');
      return punto;
    }

    const estado = getStatus(task, date);
    const noPedido = !estado && !isRequiredDay(task, date);

    /* Que un día no se pida NO es un resultado que haya que esperar: se sabe
       desde que se eligió la frecuencia. Por eso el gris se decide antes de
       mirar si el día ya pasó —si no, una tarea de lunes a viernes terminaba el
       mes con los fines de semana vacíos, que se leen como pendientes—. */
    if (noPedido) {
      punto.classList.add('st-skip');
      punto.title = `${task.name}, ${cuando}: no requerido`;
      return punto;
    }

    /* Lo que el futuro sí tiene sin saber es si se va a cumplir, y eso solo
       aplica a los días que se piden. */
    if (!estado && date > today) {
      punto.classList.add('is-off');
      punto.title = `${task.name}, ${cuando}`;
      return punto;
    }

    // El mismo nombre que usa el botón de estado de la lista del día.
    punto.classList.add(estado ? `st-${estado}` : 'st-none');
    punto.title = `${task.name}, ${cuando}: `
      + (estado ? STATUS_LABEL[estado] : 'sin cargar');
    return punto;
  }

  /**
   * Cuál dibuja cada opción del menú, en el orden en que se ofrecen.
   *
   * Se nombran por su FORMA y no por lo que miden: los tres miden cumplimiento
   * del mes, así que «Visualización mensual», «Cumplimiento por tarea» y
   * «Análisis diario» eran tres títulos parecidos que no ayudaban a elegir. Lo
   * que los distingue al elegir es cómo se ven; qué muestran lo dice la bajada
   * de cada uno.
   */
  const GRAFICOS = {
    puntos: { boton: 'btn-chart-puntos', dibuja: monthDotsChart },
    porcentajes: { boton: 'btn-chart-porcentajes', dibuja: taskChart },
    barras: { boton: 'btn-chart-barras', dibuja: weekdayChart },
  };

  /* Uno por vez: los tres apilados obligan a desplazar para llegar al de abajo,
     y casi siempre se quiere mirar uno. Cuál se elige en el cajón. */
  function renderCharts() {
    const days = monthDays(ui.year, ui.month);
    const elegido = GRAFICOS[ui.chart] ?? GRAFICOS.puntos;

    el.charts.innerHTML = '';
    el.charts.appendChild(elegido.dibuja(days));
    renderOrden();
    renderMesResumen();

    for (const [clave, g] of Object.entries(GRAFICOS)) {
      const btn = $(`#${g.boton}`);
      const activo = clave === ui.chart;
      btn.setAttribute('aria-pressed', String(activo));
      btn.classList.toggle('is-active', activo);
    }
  }

  for (const [clave, g] of Object.entries(GRAFICOS)) {
    $(`#${g.boton}`).addEventListener('click', () => {
      ui.chart = clave;
      renderCharts();
    });
  }

  // ---------------------------------------------------------
  // Interacción con la grilla
  // ---------------------------------------------------------

  /**
   * Deslizar de costado para pasar a lo anterior o a lo siguiente.
   *
   * Las dos pantallas que tienen un «antes» y un «después» lo llevan: la lista
   * del día pasa de día y el calendario de Pendientes, de mes. En las dos, lo
   * que se cambia se nombra arriba del todo, así que llegar a las flechas era
   * subir el pulgar, apuntar y volver a bajar; deslizando se hace lo mismo
   * donde la mano ya está.
   *
   * Pide recorrido de sobra y bastante más ancho que alto: sin lo primero
   * cualquier temblor cambia de página, sin lo segundo lo hace desplazar la
   * pantalla con el dedo apenas torcido. Y va solo con el dedo o el lápiz — con
   * mouse están las flechas, y arrastrar para seleccionar texto no tiene por
   * qué cambiar nada.
   *
   * @param {Element} nodo Dónde se escucha el gesto.
   * @param {(paso: number) => void} alPasar Recibe 1 o -1.
   * @param {{ salvo?: string }} [opciones] `salvo` es un selector: un gesto que
   *   arranque ahí adentro no es este, es el otro gesto de esa pantalla — en el
   *   calendario, arrastrar un pendiente de un día a otro.
   * @returns {{ hubo: boolean }} Si el último gesto pasó de página. Lo mira el
   *   clic que llega después: sin eso, deslizar además marcaría una celda o
   *   abriría un alta, y encima sobre lo que quedó debajo del dedo al redibujar.
   */
  function deslizarDeCostado(nodo, alPasar, { salvo = '' } = {}) {
    const MINIMO = 60;
    const estado = { id: /** @type {number|null} */ (null), x: 0, y: 0, hubo: false };

    nodo.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      if (salvo && e.target.closest(salvo)) return;
      Object.assign(estado, { id: e.pointerId, x: e.clientX, y: e.clientY, hubo: false });
    });

    nodo.addEventListener('pointermove', e => {
      if (estado.id !== e.pointerId) return;

      const dx = e.clientX - estado.x;
      const dy = e.clientY - estado.y;
      if (Math.abs(dx) < MINIMO || Math.abs(dx) < Math.abs(dy) * 1.5) return;

      // Uno por gesto: se suelta el puntero para no encadenar sin levantar.
      estado.id = null;
      estado.hubo = true;
      alPasar(dx < 0 ? 1 : -1);
    });

    const cortar = () => { estado.id = null; };
    nodo.addEventListener('pointerup', cortar);
    nodo.addEventListener('pointercancel', cortar);

    return estado;
  }

  /* La lista del día: deslizar pasa UN día, lo mismo que las teclas ← →. Las
     flechas del carrete pasan siete, que es otra cosa —pasar de página—. */
  const deslizDia = deslizarDeCostado(el.board, paso => shiftRangeOrMonth(paso));

  el.diaLista.addEventListener('click', e => {
    // El clic que cierra un deslizamiento no es un toque sobre lo que quedó
    // debajo: la fila que se marcaría ni siquiera es la que se tocó.
    if (deslizDia.hubo) {
      deslizDia.hubo = false;
      return;
    }

    const action = e.target.closest('[data-action]');
    if (action) {
      const taskId = action.closest('.dia-fila').dataset.taskId;
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

  el.diaLista.addEventListener('change', e => {
    // «Todas»: tilda o destilda de una vez y sincroniza los casilleros de fila.
    const all = e.target.closest('[data-pick-all]');
    if (all) {
      ui.selected.clear();
      if (all.checked) for (const t of currentTasks()) ui.selected.add(t.id);
      for (const box of el.diaLista.querySelectorAll('.task-pick')) {
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

  /** Mueve una tarea un lugar y deja el foco sobre el mismo chevrón, ya movido. */
  function moveTask(taskId, delta) {
    const tasks = materialize();
    const from = tasks.findIndex(t => t.id === taskId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= tasks.length) return;

    [tasks[from], tasks[to]] = [tasks[to], tasks[from]];
    save();
    render();

    const action = delta < 0 ? 'move-up' : 'move-down';
    const next = el.diaLista.querySelector(
      `.dia-fila[data-task-id="${CSS.escape(taskId)}"] [data-action="${action}"]`);
    if (next && !next.disabled) next.focus();
  }

  /* Elegir un día del carrete. Los del mes vecino también valen: el mes de
     trabajo los sigue. */
  el.carretePista.addEventListener('click', e => {
    const ficha = e.target.closest('[data-date]');
    if (ficha) irAlDia(parseDateKey(ficha.dataset.date));
  });

  /**
   * Un día pasa a estar cerrado apenas termina. No es un candado duro: se abre
   * confirmando, y el permiso dura hasta la medianoche siguiente. Lo que evita
   * es el clic distraído sobre una columna vieja, que antes pasaba inadvertido.
   */
  function diaCerrado(date) {
    return date < today && !ui.diasEditables.has(dateKey(date));
  }

  function cycleCell(cell, dir) {
    const task = currentTasks().find(t => t.id === cell.dataset.taskId);
    if (!task) return;

    const date = parseDateKey(cell.dataset.date);
    if (beforeStart(task, date)) {
      toast(`«${task.name}» empieza el ${fmtShort.format(parseDateKey(task.start))}`);
      return;
    }

    if (diaCerrado(date)) {
      confirmAction('Día ya transcurrido. ¿Querés modificarlo?', () => {
        ui.diasEditables.add(dateKey(date));
        // La celda sigue en el DOM: el diálogo no vuelve a dibujar la tabla.
        cycleCell(cell, dir);
      }, {
        ok: 'Modificar',
        tono: 'marca',
        note: `${capitalizeFirstLetter(fmtFull.format(date))}.`,
      });
      return;
    }

    const current = getStatus(task, date);

    /* «No requerido» es eximirse de un día que SÍ tocaba. Donde la frecuencia
       no pedía nada, ese día ya estaba fuera de la meta y marcarlo no cambiaría
       una coma: el ciclo se saltea el paso en vez de ofrecer uno que no hace
       nada.

       Si el día YA está eximido, el paso tiene que seguir en el ciclo o no
       habría cómo salir de él: `isRequiredDay` devuelve false justamente porque
       está eximido. */
    const pideElDia = isRequiredDay(task, date) || current === 'skip';
    const ciclo = allowsSkip(task) && pideElDia ? CYCLE_CON_SKIP : CYCLE;
    const next = ciclo[(ciclo.indexOf(current) + dir + ciclo.length) % ciclo.length];

    setStatus(task, date, next);

    // Repintado puntual de la celda + recálculo de totales.
    cell.className = `cell ${next ? 'st-' + next : 'st-none'}`;

    /* La fila acompaña: marcar «no requerido» apaga la tarjeta entera, y
       sacarlo la enciende — salvo que la frecuencia tampoco pida ese día, que
       es un apagado que no depende de la marca. */
    cell.closest('.dia-fila')?.classList.toggle('is-optional', !cuentaHoy(task, date));
    cell.setAttribute('aria-label',
      `${task.name}, ${fmtFull.format(date)}: ${next ? STATUS_LABEL[next] : 'sin cargar'}`);

    refreshTotals();
  }

  // ---------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------

  el.hoy.addEventListener('click', goToToday);

  /* Una vuelta entera: los siete días que se ven, no uno. Al costado de una
     tira, una flecha se lee como «la página anterior»; el paso de a uno lo
     dan las teclas ← → y tocar la ficha vecina, que ya están. */
  el.prevRange.addEventListener('click', () => shiftRangeOrMonth(-CARRETE));
  el.nextRange.addEventListener('click', () => shiftRangeOrMonth(CARRETE));

  /**
   * Cambia de mes. `landing` dice en qué punta caer, que es lo que hace que
   * cruzar de mes con las flechas del carrete no dé un salto: yendo hacia atrás
   * se aterriza en el último día del mes anterior, y no en el primero.
   */
  function goToMonth(delta, landing = 'first') {
    const d = new Date(ui.year, ui.month + delta, 1);
    const dias = monthDays(d.getFullYear(), d.getMonth());
    irAlDia(landing === 'last' ? dias[dias.length - 1] : dias[0]);
  }

  function goToToday() {
    irAlDia(today);
  }

  /**
   * Después de marcar: se repinta el cumplimiento del día. Repintar en vez de
   * volver a dibujar la lista entera mantiene el foco donde estaba, que es el
   * botón que se acaba de tocar.
   */
  function refreshTotals() {
    renderResumenDelDia(diaActual());
  }

  // ---------------------------------------------------------
  // Seleccionar mes
  // ---------------------------------------------------------
  //  Los saltos largos. Los cortos los hace el carrete, que llega a cualquier
  //  día con las flechas y con las teclas ← →.
  //
  //  Tuvo un segundo modo, de DÍAS, que abría «☰ → Ir a una fecha…». Compartían
  //  encabezado y grilla y cambiaba qué celdas se dibujaban. Con el carrete
  //  moviéndose de a siete días, esa entrada era un camino más largo para lo
  //  mismo, y sin ella el modo se quedó sin puerta.

  /** Año que muestra el diálogo, independiente del que está a la vista. */
  let jumpYear = today.getFullYear();

  function openJump() {
    jumpYear = ui.year;
    renderJump();
    el.jumpDialog.showModal();
    // Al título, no a la grilla: si no, el anillo de foco rodea la grilla entera.
    el.jumpTitle.focus();
  }

  function renderJump() {
    el.jumpLabel.textContent = String(jumpYear);
    el.jumpGrid.innerHTML = '';

    for (let m = 0; m < 12; m++) {
      const btn = boton('jump-cell', {
        text: capitalizeFirstLetter(fmtMonthName.format(new Date(jumpYear, m, 1))),
        title: labelDeMes(jumpYear, m),
      });
      btn.dataset.month = String(m);
      /* `is-current` es el mes que se está mirando; `is-today`, el mes real. */
      btn.classList.toggle('is-current', jumpYear === ui.year && m === ui.month);
      btn.classList.toggle('is-today',
        jumpYear === today.getFullYear() && m === today.getMonth());
      el.jumpGrid.appendChild(btn);
    }
  }

  function shiftJump(delta) {
    jumpYear += delta;
    renderJump();
  }

  /**
   * Salta a un mes. Cae en el día 1, salvo que sea el mes de hoy: ahí el
   * destino evidente es hoy, que es donde se carga.
   */
  function jumpToMonth(year, month) {
    const esDeHoy = year === today.getFullYear() && month === today.getMonth();
    irAlDia(esDeHoy ? today : new Date(year, month, 1));
  }

  el.monthLabel.addEventListener('click', openJump);
  $('#jump-prev').addEventListener('click', () => shiftJump(-1));
  $('#jump-next').addEventListener('click', () => shiftJump(1));

  el.jumpGrid.addEventListener('click', e => {
    const btn = e.target.closest('.jump-cell');
    if (!btn) return;
    jumpToMonth(jumpYear, Number(btn.dataset.month));
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
    ui.editingId = taskId;
    const task = taskId ? currentTasks().find(t => t.id === taskId) : null;

    el.taskDialogTitle.textContent = task ? 'Editar tarea' : 'Nueva tarea';

    /* El botón que remata es un tilde, así que su nombre no está en el texto
       sino en el `aria-label`: es lo único que lee un lector de pantalla y lo
       que muestra el tooltip. */
    const rotulo = task ? 'Guardar cambios' : 'Crear tarea';
    el.taskSubmit.title = rotulo;
    el.taskSubmit.setAttribute('aria-label', rotulo);

    /* Las tres acciones obran sobre una tarea que ya existe: en un alta no hay
       ninguna. Las flechas arrancan guardadas cada vez que se abre. */
    el.taskTools.hidden = !task;
    el.taskArchive.textContent = task && tramoAbierto(task) ? 'Desarchivar' : 'Archivar';
    mostrarFlechas(false);
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

  /* ---- selección masiva ---- */

  /**
   * Pone la lista en una postura, o la saca si ya estaba en esa. Elegir una
   * apaga la otra: los casilleros y los chevrones compiten por el mismo lugar
   * de la fila, y tenerlos juntos era lo que llenaba de controles cada renglón.
   */
  function setRowMode(modo) {
    ui.rowMode = ui.rowMode === modo ? null : modo;
    /* Cambiar de postura suelta lo tildado: lo elegido para una acción no puede
       quedar elegido para otra. */
    ui.selected.clear();
    // Se anota de dónde se sale, para que ✕ pueda devolver el orden.
    ui.ordenPrevio = ui.rowMode === 'reordenar' ? currentTasks().map(t => t.id) : null;
    render();
  }

  el.modeDelete.addEventListener('click', () => setRowMode('eliminar'));
  el.modeArchive.addEventListener('click', () => setRowMode('archivar'));
  el.modeReorder.addEventListener('click', () => setRowMode('reordenar'));

  /** Refleja la selección: resalta las filas tildadas y repinta el ✓. */
  function syncSelection() {
    const count = ui.selected.size;
    const total = currentTasks().length;

    for (const fila of el.diaLista.querySelectorAll('.dia-fila')) {
      fila.classList.toggle('is-selected', ui.selected.has(fila.dataset.taskId));
    }

    const all = el.diaLista.querySelector('[data-pick-all]');
    if (all) {
      all.checked = total > 0 && count === total;
      // Estado intermedio cuando hay algunas tildadas pero no todas.
      all.indeterminate = count > 0 && count < total;
    }

    renderModeConfirm();
  }

  /**
   * El ✓ y el ✕ del menú: aparecen con la postura puesta y son el único modo de
   * rematarla. El ✓ queda apagado mientras no haya nada que confirmar, y su
   * rótulo dice qué falta.
   */
  function renderModeConfirm() {
    const modo = ui.rowMode;
    el.modeConfirm.hidden = !modo;
    if (!modo) return;

    const count = ui.selected.size;
    const plural = count === 1 ? 'tarea' : 'tareas';
    const rotulos = {
      eliminar: [
        count ? `Eliminar ${count} ${plural} de ${labelDeMes()}` : 'Tildá las tareas a eliminar',
        'Salir sin eliminar nada',
      ],
      archivar: [
        count ? `Archivar ${count} ${plural}` : 'Tildá las tareas a archivar',
        'Salir sin archivar nada',
      ],
      reordenar: ['Guardar este orden', 'Descartar los cambios de orden'],
    }[modo];

    el.modeOk.disabled = modo !== 'reordenar' && count === 0;
    el.modeOk.title = rotulos[0];
    el.modeOk.setAttribute('aria-label', rotulos[0]);
    el.modeCancel.title = rotulos[1];
    el.modeCancel.setAttribute('aria-label', rotulos[1]);
  }

  /** Sale de la postura sin aplicar nada. */
  function cancelarPostura() {
    if (ui.rowMode === 'reordenar' && ui.ordenPrevio) restaurarOrden(ui.ordenPrevio);
    ui.rowMode = null;
    ui.ordenPrevio = null;
    ui.selected.clear();
    render();
  }

  /** Devuelve las tareas del mes al orden de `ids`, y lo guarda. */
  function restaurarOrden(ids) {
    const tasks = materialize();
    const porId = new Map(tasks.map(t => [t.id, t]));
    const vuelto = ids.map(id => porId.get(id)).filter(Boolean);
    // Lo que se creó o borró mientras tanto se respeta: va detrás.
    for (const t of tasks) if (!ids.includes(t.id)) vuelto.push(t);
    if (vuelto.length !== tasks.length) return;   // algo no cuadra: mejor no tocar
    tasks.length = 0;
    tasks.push(...vuelto);
    save();
  }

  /** Remata la postura puesta, cada una con su pregunta. */
  function confirmarPostura() {
    if (ui.rowMode === 'eliminar') return askDeleteSelected();
    if (ui.rowMode === 'archivar') return archivarSeleccionadas();
    if (ui.rowMode !== 'reordenar') return;

    const tasks = currentTasks();
    const cambio = ui.ordenPrevio && ui.ordenPrevio.join() !== tasks.map(t => t.id).join();
    if (!cambio) return cancelarPostura();   // nada que confirmar

    confirmAction(
      `Se va a guardar este orden para ${labelDeMes()}:`,
      () => {
        // Ya está aplicado; confirmar es quedarse con él y soltar la vuelta atrás.
        ui.rowMode = null;
        ui.ordenPrevio = null;
        render();
        toast('Orden guardado');
      },
      { items: tasks.map(t => t.name), ok: 'Guardar' },
    );
  }

  function askDeleteSelected() {
    abrirBorrado(currentTasks().filter(t => ui.selected.has(t.id)));
  }

  /** Una sola fecha para todas: archivar de a varias es archivar el mismo día. */
  function archivarSeleccionadas() {
    const tasks = currentTasks().filter(t => ui.selected.has(t.id));
    if (!tasks.length) return;
    abrirArchivo(tasks, 'archivar');
  }

  el.modeOk.addEventListener('click', confirmarPostura);
  el.modeCancel.addEventListener('click', cancelarPostura);

  /* ---- las archivadas del mes ---- */

  /** Las del mes visible, en el orden en que están en la lista. */
  function tareasArchivadas() {
    return currentTasks().filter(task => tramoAbierto(task));
  }

  /**
   * Un diálogo de fichas con casillero: la lista, el «Seleccionar todas» y el
   * botón que obra sobre lo tildado.
   *
   * Lo comparten los cuatro que hay —el Archivo y la Papelera de Hábitos, y los
   * de Pendientes—, que se distinguían solo en qué fichas muestran, cómo se
   * llaman los botones y qué hace el remate. Todo lo demás era el mismo código
   * escrito cuatro veces: elegir, contar, apagar el botón y decir por qué.
   *
   * @param {object} nodos    `lista`, `vacio`, `todas` y `remate`
   * @param {() => {clave: string, nombre: string, detalle: string}[]} fichas
   *   qué mostrar, ya listo para dibujar
   * @param {object} textos   `remate(n)`, `sinElegir` y `todas(total)`
   * @param {(claves: string[]) => void} accion  qué hacer con lo tildado
   */
  function listaElegible({ nodos, fichas, textos, accion }) {
    const { lista, vacio, todas, remate } = nodos;

    const elegidas = () => [...lista.querySelectorAll('.arch-pick:checked')]
      .map(c => c.dataset.clave);

    /* Un botón apagado sin decir por qué manda a adivinar, así que el título
       dice qué falta o qué va a hacer. Y «Seleccionar todas» dice qué hace al
       tocarlo: con todo tildado, lo único que queda es soltarlo. */
    function sincronizar() {
      const total = lista.querySelectorAll('.arch-pick').length;
      const cuantas = elegidas().length;

      remate.disabled = cuantas === 0;
      remate.title = cuantas ? textos.remate(cuantas) : textos.sinElegir;

      const todasPuestas = total > 0 && cuantas === total;
      todas.disabled = total === 0;
      todas.textContent = todasPuestas ? 'Quitar la selección' : 'Seleccionar todas';
      todas.title = todasPuestas
        ? 'Destildar las que están elegidas'
        : textos.todas(total);
    }

    /* Se vuelve a llamar después de cada acción: `render()` repinta la pantalla
       de atrás, pero el contenido de un diálogo abierto no lo toca nadie. */
    function dibujar() {
      const items = fichas();
      lista.innerHTML = '';
      for (const ficha of items) lista.appendChild(fichaElegible(ficha));
      vacio.hidden = items.length > 0;
      // Cada dibujado arranca sin nada tildado: las fichas son nuevas.
      sincronizar();
    }

    lista.addEventListener('change', e => {
      if (e.target.closest('.arch-pick')) sincronizar();
    });
    todas.addEventListener('click', () => {
      alternarCasilleros(lista);
      sincronizar();
    });
    remate.addEventListener('click', () => {
      const claves = elegidas();
      if (claves.length) accion(claves);
    });

    return { dibujar };
  }

  /** Una ficha: el casillero con su clave, el nombre y la línea que lo explica. */
  function fichaElegible({ clave, nombre, detalle }) {
    const card = elem('article', 'arch');

    const pick = elem('input', 'arch-pick');
    pick.type = 'checkbox';
    pick.dataset.clave = clave;
    pick.title = `Elegir «${nombre}»`;
    pick.setAttribute('aria-label', `Elegir ${nombre}`);

    const head = elem('header', 'arch-head');
    head.append(pick, elem('h3', 'arch-name', nombre));

    card.append(head, elem('p', 'arch-desc', detalle));
    return card;
  }

  function openArchived() {
    archivo.dibujar();
    abrirDialogo(el.archivedDialog, '#archived-title');
  }

  const archivo = listaElegible({
    nodos: {
      lista: el.archivedList,
      vacio: el.archivedEmpty,
      todas: el.archivedAll,
      remate: el.archivedUndo,
    },
    /* La fecha es el dato que hace falta para entender qué se ve y qué no:
       desde ahí la tarea no aparece, y antes de ahí sigue entera. */
    fichas: () => tareasArchivadas().map(task => ({
      clave: task.id,
      nombre: task.name,
      detalle: `${freqLabel(task)} · archivada desde el `
        + fmtShort.format(parseDateKey(tramoAbierto(task).from)),
    })),
    textos: {
      remate: n => `Volver a pedir ${n} ${n === 1 ? 'tarea' : 'tareas'}`,
      sinElegir: 'Tildá las tareas a desarchivar',
      todas: total => `Elegir las ${total} tareas archivadas`,
    },
    /* Una sola vuelta por el diálogo de fecha para todas las tildadas: la fecha
       de regreso se elige UNA vez. */
    accion: claves => {
      const ids = new Set(claves);
      abrirArchivo(tareasArchivadas().filter(t => ids.has(t.id)), 'desarchivar');
    },
  });

  el.archived.addEventListener('click', () => {
    setDrawer(false);
    openArchived();
  });

  /* ---- la papelera ---- */

  function openTrash() {
    trashUI.dibujar();
    abrirDialogo(el.trashDialog, '#trash-title');
  }

  /** La clave de una entrada de la papelera: qué se borró y cuándo. */
  const claveDePapelera = item => `${item.taskId}|${item.fecha}`;

  const trashUI = listaElegible({
    nodos: {
      lista: el.trashList,
      vacio: el.trashEmpty,
      todas: el.trashAll,
      remate: el.trashRestore,
    },
    /* Tres datos y en este orden: qué era, desde cuándo se borró y cuánto
       queda. Los dos primeros explican qué se recupera; el tercero, hasta
       cuándo se puede. */
    fichas: () => papelera().map(item => {
      const quedan = diasQueQuedan(item);
      return {
        clave: claveDePapelera(item),
        nombre: item.nombre,
        detalle: [
          item.frecuencia,
          `eliminada desde el ${fmtNumerica.format(parseDateKey(item.desde ?? item.fecha))}`,
          quedan === 1 ? 'queda 1 día' : `quedan ${quedan} días`,
        ].filter(Boolean).join(' · '),
      };
    }),
    textos: {
      remate: n => `Restaurar ${n} ${n === 1 ? 'tarea' : 'tareas'}`,
      sinElegir: 'Tildá lo que quieras restaurar',
      todas: total => `Elegir las ${total} eliminadas`,
    },
    /* Restaurar no pregunta nada: la entrada guarda el estado anterior tal cual
       era, así que devolverlo es exacto o no es. No hay fecha que elegir. */
    accion: claves => {
      const items = papelera().filter(item => claves.includes(claveDePapelera(item)));
      for (const item of items) restaurarDePapelera(item);

      save();
      render();
      trashUI.dibujar();
      toast(items.length === 1
        ? `«${items[0].nombre}» restaurada`
        : `${items.length} tareas restauradas`);
    },
  });

  el.trash.addEventListener('click', () => {
    setDrawer(false);
    openTrash();
  });

  /* ---- las tres acciones sobre la tarea que se está editando ---- */

  /** Abre o guarda las flechas de reordenar, y las pinta al abrirlas. */
  /**
   * El control de «Reordenar»: las dos flechas y el «3 de 7» del medio.
   *
   * Lo comparten los tres diálogos que reordenan algo —una tarea, una categoría
   * y una tarea pendiente—, que hacían lo mismo con nodos distintos. Lo único
   * propio de cada uno es de qué lista se trata y cómo se mueve en los datos:
   *
   * @param {object} nodos       `caja`, `boton`, `arriba`, `abajo` y `pos`
   * @param {() => object[]} lista   los hermanos, en el orden en que se ven
   * @param {() => string|null} actual  cuál de ellos está abierto
   * @param {(delta: number) => boolean} mover  mueve en los datos; `false` si
   *   no había a dónde. Guardar y redibujar corre por cuenta de acá.
   */
  function controlDeOrden({ nodos, lista, actual, mover }) {
    const { caja, boton, arriba, abajo, pos } = nodos;

    /** Dónde está y hasta dónde puede ir: es lo que apaga cada flecha. */
    const dibujar = () => {
      const hermanos = lista();
      const i = hermanos.findIndex(x => x.id === actual());
      pos.textContent = i < 0 ? '' : `${i + 1} de ${hermanos.length}`;
      arriba.disabled = i <= 0;
      abajo.disabled = i < 0 || i >= hermanos.length - 1;
    };

    /** Abre o cierra las flechas. Cerradas es como arranca cada vez. */
    const mostrar = abrir => {
      caja.hidden = !abrir;
      boton.setAttribute('aria-pressed', String(abrir));
      if (abrir) dibujar();
    };

    /* Se aplica en el acto: cada paso ya es el resultado y volver atrás es
       tocar la otra flecha, así que no hay nada que confirmar después. */
    const paso = delta => {
      if (!mover(delta)) return;
      save();
      render();
      dibujar();
    };

    boton.addEventListener('click', () => mostrar(caja.hidden));
    arriba.addEventListener('click', () => paso(-1));
    abajo.addEventListener('click', () => paso(1));

    return { mostrar };
  }

  /**
   * Intercambia dos elementos de un arreglo por sus POSICIONES GLOBALES.
   *
   * Los hermanos casi nunca son contiguos —entre dos categorías de primer nivel
   * están sus subcategorías, entre dos tareas de una categoría están las de
   * otra—, así que se mueven ellos dos y lo del medio se queda donde está.
   */
  function intercambiar(arreglo, uno, otro) {
    const a = arreglo.indexOf(uno);
    const b = arreglo.indexOf(otro);
    if (a < 0 || b < 0) return false;
    [arreglo[a], arreglo[b]] = [arreglo[b], arreglo[a]];
    return true;
  }

  /**
   * «Seleccionar todas»: tilda todas, y si ya lo están, las suelta. Es el mismo
   * gesto de ida y vuelta, y lo comparten los cuatro diálogos con casilleros.
   */
  function alternarCasilleros(contenedor) {
    const casillas = [...contenedor.querySelectorAll('.arch-pick')];
    const marcar = casillas.some(c => !c.checked);
    for (const c of casillas) c.checked = marcar;
  }

  /* Las flechas de «Editar tarea». La lista es la del MES, no la del día que se
     ve: el orden guardado es uno solo para todo el mes, y una tarea que hoy no
     aparece —todavía no empezó, o está archivada— igual ocupa su lugar. */
  const flechasDeTarea = controlDeOrden({
    nodos: {
      caja: el.taskMove,
      boton: el.taskReorder,
      arriba: el.taskMoveUp,
      abajo: el.taskMoveDown,
      pos: el.taskMovePos,
    },
    lista: () => currentTasks(),
    actual: () => ui.editingId,
    mover: delta => {
      // `materialize` y no `currentTasks`: si el mes todavía hereda la lista de
      // otro, hay que darle la suya antes de tocarle el orden.
      const tasks = materialize();
      const i = tasks.findIndex(t => t.id === ui.editingId);
      return i >= 0 && Boolean(tasks[i + delta]) && intercambiar(tasks, tasks[i], tasks[i + delta]);
    },
  });
  const mostrarFlechas = flechasDeTarea.mostrar;

  el.taskDelete.addEventListener('click', () => {
    const id = ui.editingId;
    // Se cierra antes de preguntar: dos diálogos encimados esconden la pregunta.
    el.taskDialog.close();
    askDeleteTask(id);
  });

  el.taskArchive.addEventListener('click', () => {
    const task = currentTasks().find(t => t.id === ui.editingId);
    if (!task) return;
    abrirArchivo(task, tramoAbierto(task) ? 'desarchivar' : 'archivar');
  });

  /**
   * Pregunta una fecha. Archivar y desarchivar son la misma operación mirada de
   * los dos lados —abrir un tramo y cerrarlo—, así que comparten el diálogo:
   * una fecha y un botón. Lo único que cambia son las palabras.
   *
   * Trabaja sobre un conjunto: una tarea desde «Editar tarea» o desde el
   * Archivo, varias desde la selección masiva. La fecha es UNA para todas —
   * archivar de a varias es archivarlas el mismo día—.
   */
  function abrirArchivo(tasks, modo) {
    const lista = Array.isArray(tasks) ? tasks : [tasks];
    if (!lista.length) return;

    ui.archivingIds = lista.map(t => t.id);
    ui.archiveMode = modo;
    el.archiveError.hidden = true;

    const archivar = modo === 'archivar';
    const una = lista.length === 1;
    /* Con una, el texto la nombra; con varias, las cuenta. Nombrarlas a todas
       haría un párrafo que nadie lee, y la lista ya está tildada a la vista. */
    const sujeto = una ? `«${lista[0].name}»` : `${lista.length} tareas`;
    const verbo = una ? 'deja' : 'dejan';
    const vuelve = una ? 'vuelve' : 'vuelven';

    el.archiveTitle.textContent = archivar
      ? (una ? 'Archivar tarea' : 'Archivar tareas')
      : (una ? 'Desarchivar tarea' : 'Desarchivar tareas');
    el.archiveLabel.textContent = archivar
      ? 'Archivar desde'
      : (una ? 'Volver a pedirla desde' : 'Volver a pedirlas desde');
    el.archiveSubmit.textContent = archivar ? 'Archivar' : 'Desarchivar';
    el.archiveNote.textContent = archivar
      ? `${sujeto} ${verbo} de pedirse desde el día que elijas. Lo que ya `
        + 'cargaste antes se conserva y se sigue viendo.'
      : `${sujeto} ${vuelve} a pedirse desde el día que elijas. Los días `
        + 'que estuvieron archivadas quedan como están.';

    /* El día en el que está parado el carrete, que es de lo que se está
       hablando. Casi siempre es hoy; cuando no lo es, es porque quien carga
       está mirando otro día a propósito. */
    el.archiveDate.value = dateKey(diaActual());
    el.archiveDialog.showModal();
  }

  /** Muestra el motivo por el que la fecha elegida no sirve. */
  function errorDeArchivo(texto) {
    el.archiveError.textContent = texto;
    el.archiveError.hidden = false;
  }

  /**
   * Por qué esa fecha no le sirve a esa tarea, o null si le sirve. El mensaje
   * nombra la tarea: con varias tildadas, «no se puede» sin decir cuál manda a
   * destildar de a una a ver cuál era.
   */
  function motivoSinArchivar(task, iso) {
    const conNombre = (texto, tope, relacion = 'posterior') =>
      `«${task.name}»: tiene que ser ${relacion} al `
      + `${fmtShort.format(parseDateKey(tope))}, ${texto}`;

    if (ui.archiveMode === 'archivar') {
      /* Archivarla desde antes de que empiece la dejaría sin un solo día vivo,
         que es lo mismo que no haberla creado — y no es lo que archivar
         significa. Y desde antes de la última vuelta, el tramo nuevo se comería
         al anterior: no habría dos idas, habría una sola mal contada. */
      if (task.start && iso <= task.start) {
        return conNombre('que es cuando la tarea empieza.', task.start);
      }
      const tramos = tramosArchivados(task);
      const ultima = tramos[tramos.length - 1]?.to;
      if (ultima) return iso <= ultima
        ? conNombre('que es cuando volvió del archivo anterior.', ultima)
        : null;
      return null;
    }

    const abierto = tramoAbierto(task);
    if (!abierto) return null;
    /* Volver ANTES de haberse ido no describe nada. Volver el mismo día sí: es
       deshacer el archivo, y se resuelve borrando el tramo. */
    return iso < abierto.from
      ? conNombre('que es cuando se archivó.', abierto.from, 'igual o posterior')
      : null;
  }

  el.archiveForm.addEventListener('submit', e => {
    e.preventDefault();
    const vivas = materialize();
    const tasks = ui.archivingIds.map(id => vivas.find(t => t.id === id)).filter(Boolean);
    if (!tasks.length) return el.archiveDialog.close();

    const archivar = ui.archiveMode === 'archivar';
    const iso = RE_DIA.test(el.archiveDate.value) ? el.archiveDate.value : null;
    if (!iso) {
      return errorDeArchivo(archivar
        ? 'Elegí desde qué día se archiva.'
        : 'Elegí desde qué día vuelve a pedirse.');
    }

    /* Se valida ANTES de tocar nada: media tanda archivada y media no sería un
       resultado que nadie pidió. */
    for (const task of tasks) {
      const motivo = motivoSinArchivar(task, iso);
      if (motivo) return errorDeArchivo(motivo);
    }

    for (const task of tasks) {
      if (archivar) task.archived = [...tramosArchivados(task), { from: iso, to: null }];
      else {
        const abierto = tramoAbierto(task);
        if (!abierto) continue;
        /* Vuelve el mismo día en que se fue: el tramo no cubriría ningún día, y
           un tramo vacío en la lista es ruido que hay que explicar cada vez que
           se lee. Se borra: el archivo no llegó a pasar. */
        if (iso === abierto.from) {
          task.archived = tramosArchivados(task).filter(t => t !== abierto);
        } else {
          abierto.to = iso;
        }
      }
    }

    /* Aplicada la acción, la postura ya no tiene sobre qué operar. */
    ui.rowMode = null;
    ui.selected.clear();

    save();
    el.archiveDialog.close();
    /* Desde la lista del archivo se sigue ahí: la ficha tiene que irse de la
       lista, y `render()` no toca el contenido de un diálogo abierto. Desde la
       edición de la tarea, en cambio, ya no queda nada que mirar atrás. */
    if (el.archivedDialog.open) archivo.dibujar();
    else el.taskDialog.close();

    render();
    const fecha = fmtShort.format(parseDateKey(iso));
    const sujeto = tasks.length === 1 ? `«${tasks[0].name}»` : `${tasks.length} tareas`;
    toast(archivar
      ? `${sujeto} ${tasks.length === 1 ? 'archivada' : 'archivadas'} desde el ${fecha}`
      : `${sujeto} ${tasks.length === 1 ? 'vuelve' : 'vuelven'} desde el ${fecha}`);
  });

  el.taskForm.addEventListener('submit', e => {
    e.preventDefault();

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

    /* Dos tareas con el mismo nombre en el mismo mes son indistinguibles en la
       lista, en el gráfico y en el archivo: no hay forma de saber cuál es cuál.
       En otro mes sí se puede, porque ahí no conviven. */
    const repetida = currentTasks()
      .some(t => t.id !== ui.editingId && mismoNombre(t.name, name));
    if (repetida) return showFormError(`Ya hay una tarea llamada «${name}» este mes.`);

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

    materialize(year, month).push({ id: newId(), ...fields });
    save();
    el.taskDialog.close();

    // Se sigue a la tarea hasta el día en que empieza, aunque sea de otro mes.
    irAlDia(inicio);

    toast(`Tarea creada en ${nombreMes}`);
    ui.editingId = null;
  });

  function showFormError(msg) {
    el.taskError.textContent = msg;
    el.taskError.hidden = false;
  }

  /** Borra tareas del mes visible junto con sus estados de ESE mes. */
  /**
   * Borra una tarea DESDE un día: lo anterior queda como estaba y de ahí en
   * adelante no queda nada.
   *
   * `desde` en null es «desde siempre»: la tarea se va entera, con todo lo
   * cargado, como si no hubiera existido.
   *
   * Los meses son listas propias, así que el corte se aplica mes por mes: los
   * posteriores pierden la tarea, el del corte la conserva con `end` puesto —o
   * la pierde también, si el corte cae antes de que la tarea empiece ahí— y los
   * anteriores no se tocan.
   */
  function eliminarDesde(task, desde) {
    /* Lo que se va a cambiar se anota ANTES de cambiarlo: la copia de la tarea
       en cada mes que se toca, con el índice donde estaba, y los estados que se
       van a borrar. Restaurar es poner esto de vuelta, así que lo que se guarda
       no es «la tarea» sino el cambio entero. */
    const entrada = {
      taskId: task.id,
      nombre: task.name,
      frecuencia: freqLabel(task),
      /* Solo para mostrar: la fecha desde la que se borró. Cuando la tarea se
         fue entera es la de su inicio —el primer día que se borró de verdad—,
         que es lo mismo que dice la confirmación. */
      desde: desde ?? inicioDe(task),
      fecha: dateKey(today),
      meses: {},
      estados: {},
    };

    for (const [mes, lista] of Object.entries(state.months)) {
      const primero = `${mes}-01`;
      // Meses enteramente anteriores al corte: intactos.
      if (desde && ultimoDiaDe(mes) < desde) continue;

      const indice = lista.findIndex(t => t.id === task.id);
      if (indice < 0) continue;
      const copia = lista[indice];

      entrada.meses[mes] = {
        indice,
        task: { ...copia, weekdays: [...copia.weekdays] },
      };

      /* El corte cae antes del primer día vivo de la tarea EN ESE MES: no le
         queda nada, así que sale de la lista. */
      const arranca = copia.start && copia.start > primero ? copia.start : primero;
      if (!desde || desde <= arranca) {
        state.months[mes] = lista.filter(t => t.id !== task.id);
      } else {
        copia.end = desde;
      }
    }

    for (const key of Object.keys(state.status)) {
      const [taskId, iso] = key.split('|');
      if (taskId === task.id && (!desde || iso >= desde)) {
        entrada.estados[key] = state.status[key];
        delete state.status[key];
      }
    }

    if (Object.keys(entrada.meses).length) state.trash.push(entrada);
    ui.selected.delete(task.id);
  }

  /* ---- la papelera ---- */

  /** Lo que sigue vivo en la papelera, de lo más reciente a lo más viejo. */
  function papelera() {
    /* Se poda al leer y no con un reloj: la app puede estar cerrada una semana,
       y lo que decide si algo venció es la fecha que tiene anotada, no que
       alguien haya estado mirando. */
    const vivas = state.trash.filter(item => diasDesde(item.fecha) < DIAS_PAPELERA);
    if (vivas.length !== state.trash.length) {
      state.trash = vivas;
      save();
    }
    return [...vivas].reverse();
  }

  /** Días que le quedan a una entrada antes de perderse. */
  function diasQueQuedan(item) {
    return Math.max(0, DIAS_PAPELERA - diasDesde(item.fecha));
  }

  /**
   * Devuelve una eliminación completa: la tarea vuelve al mismo lugar de cada
   * mes, con su misma fecha de corte y con todos sus estados.
   *
   * Se restaura a la fecha en la que se eliminó y no a otra: la entrada guarda
   * el estado anterior tal cual era, así que devolverlo es exacto o no es.
   */
  function restaurarDePapelera(item) {
    for (const [mes, guardado] of Object.entries(item.meses)) {
      const lista = state.months[mes];
      // El mes puede haber desaparecido —importar, cerrar sesión—: se rehace.
      if (!lista) {
        state.months[mes] = [guardado.task];
        continue;
      }
      const actual = lista.findIndex(t => t.id === item.taskId);
      if (actual >= 0) lista[actual] = guardado.task;
      else lista.splice(Math.min(guardado.indice, lista.length), 0, guardado.task);
    }

    for (const [key, value] of Object.entries(item.estados)) state.status[key] = value;

    state.trash = state.trash.filter(t => t !== item);
  }

  /**
   * El primer día en que la tarea existe, para MOSTRAR. Con fecha de inicio es
   * esa; sin ella, el dato más viejo que hay de la tarea —el primero de su mes
   * más antiguo, o su marca más vieja—, que es lo que se va a borrar.
   */
  function inicioDe(task) {
    if (task.start) return task.start;

    const candidatos = [];
    for (const [mes, lista] of Object.entries(state.months)) {
      if (lista.some(t => t.id === task.id)) candidatos.push(`${mes}-01`);
    }
    for (const key of Object.keys(state.status)) {
      const [taskId, iso] = key.split('|');
      if (taskId === task.id && iso) candidatos.push(iso);
    }
    candidatos.sort();
    return candidatos[0] ?? dateKey(today);
  }

  /** El último día de un mes `YYYY-MM`, en clave. */
  function ultimoDiaDe(mes) {
    const [anio, m] = mes.split('-').map(Number);
    const dias = monthDays(anio, m - 1);
    return dateKey(dias[dias.length - 1]);
  }

  /**
   * Desde qué día se elimina cada tarea, según lo que se eligió.
   *
   * «La fecha de inicio» es por tarea —cada una tiene la suya— y equivale a
   * borrarla entera. Con una fecha elegida, una tarea que empieza DESPUÉS
   * tampoco deja nada atrás, así que también se va entera: por eso el plan
   * guarda null y la confirmación lo dice.
   */
  function planDeBorrado(tasks, modo, iso) {
    return tasks.map(task => {
      if (modo === 'inicio') return { task, desde: null };
      const dia = modo === 'hoy' ? dateKey(today) : iso;
      /* Entera solo si el corte cae antes de que la tarea exista. Sin fecha de
         inicio no hay tal cosa: la tarea viene de siempre y el corte la parte
         igual, dejando atrás lo cargado. */
      const entera = Boolean(task.start) && dia <= task.start;
      return { task, desde: entera ? null : dia };
    });
  }

  /** Abre la pregunta de «desde cuándo» para una o varias tareas. */
  function abrirBorrado(tasks) {
    const lista = tasks.filter(Boolean);
    if (!lista.length) return;

    ui.deletingIds = lista.map(t => t.id);
    el.deleteError.hidden = true;
    el.deleteDate.value = dateKey(diaActual());

    const una = lista.length === 1;
    el.deleteTitle.textContent = una ? 'Eliminar tarea' : 'Eliminar tareas';
    el.deleteNote.textContent = una
      ? `«${lista[0].name}» deja de existir desde el día que elijas. Lo cargado `
        + 'antes se conserva; de ahí en adelante no vuelve.'
      : `Las ${lista.length} tareas dejan de existir desde el día que elijas. Lo `
        + 'cargado antes se conserva; de ahí en adelante no vuelve.';

    el.deleteForm.querySelector('input[name="delete-from"][value="hoy"]').checked = true;
    syncBorrado();
    el.deleteDialog.showModal();
  }

  const modoDeBorrado = () =>
    el.deleteForm.querySelector('input[name="delete-from"]:checked')?.value ?? 'hoy';

  /* El campo de fecha existe solo para una de las tres opciones: dibujarlo
     siempre pediría completar algo que en las otras dos no se usa. */
  function syncBorrado() {
    el.deleteDateField.hidden = modoDeBorrado() !== 'fecha';
  }

  el.deleteForm.addEventListener('change', e => {
    if (e.target.name === 'delete-from') syncBorrado();
  });

  el.deleteForm.addEventListener('submit', e => {
    e.preventDefault();
    const vivas = currentTasks();
    const tasks = ui.deletingIds.map(id => vivas.find(t => t.id === id)).filter(Boolean);
    if (!tasks.length) return el.deleteDialog.close();

    const modo = modoDeBorrado();
    const iso = RE_DIA.test(el.deleteDate.value) ? el.deleteDate.value : null;
    if (modo === 'fecha' && !iso) {
      el.deleteError.textContent = 'Elegí desde qué día se elimina.';
      el.deleteError.hidden = false;
      return;
    }

    const plan = planDeBorrado(tasks, modo, iso);
    el.deleteDialog.close();
    confirmarBorrado(plan);
  });

  /* La confirmación nombra cada tarea con SU fecha al lado: con varias elegidas
     y «la fecha de inicio», cada una se va desde un día distinto, y una sola
     frase para todas no podría decirlo. */
  function confirmarBorrado(plan) {
    const una = plan.length === 1;
    confirmAction(
      una
        ? 'Se va a eliminar esta tarea:'
        : `Se van a eliminar estas ${plan.length} tareas:`,
      () => {
        for (const { task, desde } of plan) eliminarDesde(task, desde);
        ui.rowMode = null;
        save();
        render();
        toast(una ? 'Tarea eliminada' : `${plan.length} tareas eliminadas`);
      },
      {
        /* Siempre una fecha, también cuando la tarea se va entera: ahí el día es
           el de su inicio, que es el primero que se borra. Es lo mismo que hay
           que mostrar cuando el corte elegido cae ANTES de que la tarea exista:
           recortar desde antes del inicio no borra nada de más. */
        filas: plan.map(({ task, desde }) => ({
          izquierda: task.name,
          derecha: `desde el ${fmtNumerica.format(parseDateKey(desde ?? inicioDe(task)))}`,
        })),
        note: 'Lo cargado antes de esa fecha se conserva. Lo de ahí en adelante no vuelve.',
      },
    );
  }

  function askDeleteTask(taskId) {
    const task = currentTasks().find(t => t.id === taskId);
    if (task) abrirBorrado([task]);
  }

  /** Claves de estado de esas tareas dentro de un conjunto concreto de días. */
  function statusKeysIn(ids, days) {
    const fechas = new Set(days.map(dateKey));
    return Object.keys(state.status).filter(key => {
      const [taskId, iso] = key.split('|');
      return ids.has(taskId) && fechas.has(iso);
    });
  }

  /** Cómo nombrar en un mensaje lo que está a la vista, que es un día. */
  function rangeLabel(days) {
    return days.length ? spanLabel(days) : '';
  }

  /**
   * @param text  párrafo principal
   * @param onOk  qué hacer al confirmar
   * @param opts  `items` se lista con viñetas debajo; `note` es una aclaración
   *   al pie; `ok` es el rótulo del botón; `tono` lo pinta de rojo ('peligro',
   *   por omisión) o con el color de la marca ('marca'), para lo que confirma
   *   sin destruir nada. Los tres vuelven a su valor al cerrarse el diálogo.
   */
  function confirmAction(text, onOk, opts = {}) {
    el.confirmText.textContent = text;

    /* Dos formas de listar lo afectado: nombres sueltos, o nombre y dato a los
       costados de la misma fila —que es lo que hace falta cuando cada uno tiene
       el suyo, como la fecha desde la que se elimina—. */
    const items = opts.items || [];
    const filas = opts.filas || [];
    el.confirmList.innerHTML = '';
    el.confirmList.classList.toggle('is-pares', filas.length > 0);
    el.confirmList.hidden = !items.length && !filas.length;

    for (const item of items) el.confirmList.appendChild(elem('li', '', item));
    for (const fila of filas) {
      const li = elem('li');
      li.append(elem('span', 'confirm-izq', fila.izquierda),
        elem('span', 'confirm-der', fila.derecha));
      el.confirmList.appendChild(li);
    }

    el.confirmNote.textContent = opts.note || '';
    el.confirmNote.hidden = !opts.note;

    el.confirmOk.textContent = opts.ok || OK_POR_DEFECTO;
    /* El rojo es una advertencia, no una decoración: se guarda para lo que
       borra o reemplaza. Confirmar una corrección sobre un día viejo no
       destruye nada, y pintarla de rojo diría lo contrario. */
    const marca = opts.tono === 'marca';
    el.confirmOk.classList.toggle('btn-danger', !marca);
    el.confirmOk.classList.toggle('btn-brand', marca);

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

  /* Tocar afuera cierra, como la ✕ y como `Esc`.

     El velo de un `<dialog>` no es un elemento aparte: es el fondo del diálogo
     mismo, así que un clic ahí llega con `target` en el propio `<dialog>`. Los
     de adentro caen siempre en algún hijo —`.dialog-form` cubre todo el
     interior—, y por eso la comparación alcanza para distinguirlos. */
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.addEventListener('click', e => {
      if (e.target === dlg) dlg.close();
    });
  }

  /* El botón redondo de la esquina crea lo que corresponda a la sección en la
     que está: una tarea en Hábitos, un pendiente en Pendientes. Es el mismo
     gesto para la misma intención, y por eso es un solo botón y no dos. */
  el.fab.addEventListener('click', () => {
    if (ui.page !== 'todos') return openTaskDialog();

    /* En Pendientes crea lo que la vista muestra: una categoría donde se ven
       las categorías, y una tarea pendiente donde se ven las tareas. Antes
       preguntaba cuál de las dos, que es un paso de más para la respuesta que
       la pantalla ya está dando. */
    if (ui.vistaPendientes === 'categorias') openCategoriaDialog();
    else openPendienteDialog();
  });

  // ---------------------------------------------------------
  // Pendientes
  // ---------------------------------------------------------

  /**
   * Los tres estados, en el orden en que los cicla el botón de la fila.
   *
   * El orden es el del avance —nada, algo, todo—, así que tocar de más no
   * pierde nada: se sigue avanzando hasta volver al principio.
   */
  const ESTADOS_PENDIENTE = [
    { id: 'sin-iniciar', label: 'Sin iniciar' },
    { id: 'en-proceso', label: 'En proceso' },
    { id: 'finalizada', label: 'Finalizada' },
  ];
  /* Lo que entra en una fila sin recortarse con puntos suspensivos en un
     teléfono. Es el mismo tope que el alta de tareas, que lo declara en el
     atributo del campo. */
  const TOPE_NOMBRE = 35;
  /* Los comentarios no son un rótulo sino una nota, así que el tope es otro y
     por otra razón: lo que entra de un vistazo sin que la tarea pendiente se
     convierta en un documento. Una nota que no cabe se termina escribiendo en
     otro lado, y entonces la tarea deja de decir todo lo que hay que saber. */
  const TOPE_COMENTARIO = 200;

  const esEstadoPendiente = v => ESTADOS_PENDIENTE.some(e => e.id === v);
  const labelEstado = id => ESTADOS_PENDIENTE.find(e => e.id === id)?.label ?? '';

  /** El que sigue en el ciclo; después del último vuelve al principio. */
  function siguienteEstado(id) {
    const i = ESTADOS_PENDIENTE.findIndex(e => e.id === id);
    return ESTADOS_PENDIENTE[(i + 1) % ESTADOS_PENDIENTE.length].id;
  }

  /* Lo archivado no desaparece: sale de la lista de todos los días y se junta
     al final, en su propio bloque. Por eso los recorridos de la lista piden las
     vivas y el bloque del final pide las otras. */
  /**
   * Qué órdenes ofrece cada vista.
   *
   * Ordenan cosas distintas —tareas de un lado, categorías del otro—, así que
   * no comparten opciones ni elección. En «Lista» el estado manda siempre y lo
   * que se elige es el desempate; en «Categorías» se elige el orden entero.
   */
  const ORDENES_PEND = {
    lista: [
      { clave: 'personalizado', nombre: 'personalizado' },
      { clave: 'fecha', nombre: 'por fecha' },
      { clave: 'alfabetico', nombre: 'alfabético' },
    ],
    categorias: [
      { clave: 'personalizado', nombre: 'personalizado' },
      { clave: 'alfabetico', nombre: 'alfabético' },
      { clave: 'cantidad', nombre: 'por cantidad de tareas' },
    ],
  };

  /** Compara textos como los lee una persona: sin acentos ni mayúsculas. */
  const porNombre = (a, b) => a.name.localeCompare(b.name, LOCALE, { sensitivity: 'base' });

  const categoriasRaiz = () => state.pendientes.categorias
    .filter(c => !c.padre && !c.archivada);
  const subcategoriasDe = id => state.pendientes.categorias
    .filter(c => c.padre === id && !c.archivada);
  const categoriasArchivadas = () => state.pendientes.categorias.filter(c => c.archivada);

  /** Las hermanas de una categoría, que son entre las que se la puede mover. */
  const hermanasDe = cat => state.pendientes.categorias
    .filter(c => (c.padre ?? null) === (cat.padre ?? null) && !c.archivada);

  /**
   * Si la categoría está guardada, ella o la que la contiene: una subcategoría
   * de una archivada se archiva con ella, aunque su propia marca diga que no.
   */
  function estaArchivada(id) {
    const cat = state.pendientes.categorias.find(c => c.id === id);
    if (!cat) return false;
    return Boolean(cat.archivada) || Boolean(cat.padre && estaArchivada(cat.padre));
  }
  const categoriaPorId = id => state.pendientes.categorias.find(c => c.id === id) ?? null;
  const pendientePorId = id => state.pendientes.items.find(p => p.id === id) ?? null;
  /** Los pendientes de una categoría, SIN los de sus subcategorías. */
  const pendientesDe = id => state.pendientes.items
    .filter(p => p.categoria === id && !p.archivado);

  /** Los guardados, que se ven en el Archivo y en ningún otro lado. */
  const pendientesArchivados = () => state.pendientes.items.filter(p => p.archivado);

  /** Los de su misma categoría, que son entre los que se lo puede mover. */
  const hermanosDe = p => state.pendientes.items
    .filter(o => (o.categoria ?? null) === (p.categoria ?? null) && !o.archivado);

  /* Lo que está en curso: todo menos lo que quedó adentro de una categoría
     guardada. Es lo que mira el calendario —archivar es dejar de verlo, y verlo
     igual ahí sería archivar a medias—. */
  const pendientesVivos = () => state.pendientes.items
    .filter(p => !p.archivado && (!p.categoria || !estaArchivada(p.categoria)));

  /**
   * Cuántos cuelgan de una categoría contando los de sus subcategorías: es lo
   * único que queda a la vista cuando está plegada.
   */
  function cuentaDe(cat) {
    return pendientesDe(cat.id).length
      + subcategoriasDe(cat.id).reduce((n, sub) => n + pendientesDe(sub.id).length, 0);
  }

  /**
   * El botón de orden: qué ofrece y qué dice.
   *
   * Solo en las dos vistas que son listas —el calendario lo ordena el
   * almanaque— y con las opciones de la vista puesta, que ordenan cosas
   * distintas.
   */
  function renderOrdenPendientes() {
    const vista = ui.vistaPendientes;
    const opciones = ORDENES_PEND[vista];
    el.pendOrden.hidden = !opciones;
    if (!opciones) return;

    const actual = opciones.find(o => o.clave === ui.ordenPend[vista]) ?? opciones[0];
    el.pendOrden.title = `Orden: ${actual.nombre}`;
    el.pendOrden.setAttribute('aria-label', `Ordenar. Ahora: ${actual.nombre}`);

    el.pendOrdenOpciones.innerHTML = '';
    for (const opcion of opciones) {
      const btn = elem('button', 'btn orden-opcion', capitalizeFirstLetter(opcion.nombre));
      btn.type = 'button';
      btn.dataset.orden = opcion.clave;
      btn.setAttribute('aria-pressed', String(opcion.clave === actual.clave));
      el.pendOrdenOpciones.appendChild(btn);
    }
  }

  el.pendOrden.addEventListener('click', () => {
    abrirDialogo(el.pendOrdenDialog, '#pend-orden-title');
  });

  el.pendOrdenOpciones.addEventListener('click', e => {
    const opcion = e.target.closest('[data-orden]');
    if (!opcion) return;
    ui.ordenPend[ui.vistaPendientes] = opcion.dataset.orden;
    el.pendOrdenDialog.close();
    renderPendientes();
  });

  /** Dibuja la vista que esté puesta. Las dos leen lo mismo de `state`. */
  function renderPendientes() {
    const vista = ui.vistaPendientes;
    const enCalendario = vista === 'calendario';

    for (const btn of document.querySelectorAll('.pend-vista')) {
      const activa = btn.dataset.vista === vista;
      btn.classList.toggle('is-activa', activa);
      btn.setAttribute('aria-pressed', String(activa));
    }

    /* Las dos primeras vistas son listas y comparten el mismo contenedor: lo
       que cambia es cómo se agrupa lo que va adentro. */
    el.pendLista.hidden = enCalendario;
    el.pendCalendario.hidden = !enCalendario;

    /* El cartel de bienvenida solo en las listas: en el calendario el mes vacío
       ya se ve solo, y el cartel taparía la rejilla. */
    /* «Varios» viene de fábrica, así que no cuenta como algo anotado: con el
       cartel mirando `categorias.length` no aparecía nunca. */
    const { categorias, items } = state.pendientes;
    const propias = categorias.some(c => !esProtegida(c.id));
    el.pendVacio.hidden = enCalendario || propias || items.length > 0;

    renderOrdenPendientes();

    if (vista === 'lista') renderPendientesPlana();
    else if (vista === 'categorias') renderPendientesCategorias();
    else renderPendientesCalendario();
  }

  /**
   * Todo junto, sin categorías, ordenado por fecha de completado.
   *
   * Contesta «qué sigue», que es otra pregunta que «dónde está»: por eso las
   * filas van sueltas y no adentro de la tarjeta de su categoría. Lo que no
   * tiene fecha va al final: sin fecha no hay lugar en una línea de tiempo, y
   * ponerlo primero taparía lo que sí vence pronto.
   */
  function renderPendientesPlana() {
    el.pendLista.innerHTML = '';

    /* El estado manda SIEMPRE, en el orden del avance: primero lo que no
       arrancó, después lo que está en curso y al final lo terminado, que ya no
       pide nada. Lo que se elige en el botón es cómo se desempata adentro de
       cada grupo. */
    const porEstado = p => ESTADOS_PENDIENTE.findIndex(e => e.id === p.estado);
    const orden = ui.ordenPend.lista;

    /* «Personalizado» es el orden del arreglo, que es el que mueven las flechas
       de «Reordenar». Sigue agrupado por estado: eso no lo cambia ningún orden,
       y una tarea terminada no vuelve arriba por haberla movido. */
    const vivos = pendientesVivos();
    const propio = new Map(vivos.map((p, i) => [p.id, i]));

    const items = [...vivos].sort((a, b) => {
      const grupos = porEstado(a) - porEstado(b);
      if (grupos) return grupos;
      if (orden === 'personalizado') return propio.get(a.id) - propio.get(b.id);
      if (orden === 'alfabetico') return porNombre(a, b);

      /* Por fecha: lo que vence antes va primero y lo que no tiene fecha, al
         final —sin fecha no hay lugar en una línea de tiempo—. Con la misma
         fecha decide el nombre, que si no el orden quedaba al azar. */
      if (a.fecha !== b.fecha) {
        if (!a.fecha) return 1;
        if (!b.fecha) return -1;
        return a.fecha < b.fecha ? -1 : 1;
      }
      return porNombre(a, b);
    });
    /* Una tarjeta por estado, siempre las tres y en el orden del avance. El
       estado deja de ser algo que hay que ir leyendo fila por fila: es el
       encabezado del bloque, y lo que no interesa hoy se pliega entero —lo
       terminado, casi siempre—. */
    for (const estado of ESTADOS_PENDIENTE) {
      el.pendLista.appendChild(
        bloqueDeEstado(estado, items.filter(p => p.estado === estado.id)));
    }
  }

  /** Una de las tres tarjetas de «Lista», con lo que hay en ese estado. */
  function bloqueDeEstado(estado, items) {
    const bloque = elem('section', 'pend-bloque pend-nivel-0');
    const plegada = !ui.pendDesplegadas.has(estado.id);

    const cabecera = elem('div', 'pend-cat');

    const flecha = elem('button', 'pend-cat-toggle', plegada ? '▸' : '▾');
    flecha.type = 'button';
    flecha.dataset.plegar = estado.id;
    flecha.setAttribute('aria-expanded', String(!plegada));
    flecha.title = plegada ? `Desplegar «${estado.label}»` : `Plegar «${estado.label}»`;
    flecha.setAttribute('aria-label', flecha.title);

    const cuenta = elem('span', 'pend-grupo-cuenta', String(items.length));
    cuenta.title = items.length === 1 ? '1 tarea pendiente' : `${items.length} tareas pendientes`;

    cabecera.append(flecha, elem('span', 'pend-grupo-nombre', estado.label), cuenta);
    bloque.appendChild(cabecera);
    if (plegada) return bloque;

    /* Vacío se dice, no se esconde: las tres tarjetas están siempre, así que
       una sin nada tiene que explicarse en vez de parecer que no cargó. */
    if (!items.length) {
      bloque.appendChild(elem('p', 'pend-cat-vacia', 'Nada acá todavía'));
      return bloque;
    }
    bloque.appendChild(listaDePendientes(items));
    return bloque;
  }

  function renderPendientesCategorias() {
    el.pendLista.innerHTML = '';
    for (const cat of ordenarCategorias(categoriasRaiz())) {
      el.pendLista.appendChild(bloqueCategoria(cat, 0));
    }

    /* Lo que no está en ninguna categoría va al final, bajo un encabezado que
       no se puede editar ni borrar: no es una categoría más, es su ausencia. */
    const sueltos = state.pendientes.items.filter(p => !p.categoria && !p.archivado);
    if (sueltos.length) {
      const bloque = elem('section', 'pend-bloque');
      bloque.appendChild(elem('h3', 'pend-sueltos', 'Sin categoría'));
      bloque.appendChild(listaDePendientes(sueltos));
      el.pendLista.appendChild(bloque);
    }

  }

  /**
   * Las categorías en el orden elegido. «Personalizado» es el del arreglo, que
   * es el que mueven las flechas de «Reordenar»; los otros dos lo ignoran, y
   * por eso mover algo a mano vuelve a poner este —ver `reordenarCategoria`—.
   */
  function ordenarCategorias(lista) {
    const orden = ui.ordenPend.categorias;
    if (orden === 'personalizado') return lista;
    if (orden === 'alfabetico') return [...lista].sort(porNombre);

    /* Por cantidad, de la más cargada a la más vacía: la cuenta es la misma que
       muestra la categoría —lo suyo más lo de sus subcategorías—, y entre dos
       iguales decide el nombre. */
    return [...lista].sort((a, b) => (cuentaDe(b) - cuentaDe(a)) || porNombre(a, b));
  }

  /**
   * Una categoría con lo suyo adentro: primero sus pendientes y después sus
   * subcategorías, cada una con los propios.
   */
  function bloqueCategoria(cat, nivel, { archivada = false } = {}) {
    const bloque = elem('section', `pend-bloque pend-nivel-${nivel}`);
    const plegada = !ui.pendDesplegadas.has(cat.id);
    if (archivada) bloque.classList.add('is-archivada');

    const cabecera = elem('div', 'pend-cat');

    /* El triángulo pliega. El nombre no hace nada: es el rótulo del bloque, y
       que abriera la edición al tocarlo convertía en un formulario lo que
       parece un título. */
    const flecha = elem('button', 'pend-cat-toggle', plegada ? '▸' : '▾');
    flecha.type = 'button';
    flecha.dataset.plegar = cat.id;
    flecha.setAttribute('aria-expanded', String(!plegada));
    flecha.title = plegada ? `Desplegar «${cat.name}»` : `Plegar «${cat.name}»`;
    flecha.setAttribute('aria-label', flecha.title);

    const nombre = elem('span', 'pend-cat-nombre', cat.name);

    /* El lápiz es la ÚNICA puerta a la edición de la categoría —de ahí salen el
       nombre, dónde vive y el borrado—, igual que en las tarjetas de Hábitos.
       Un solo lugar donde buscarla en las dos pantallas. */
    const lapiz = boton('mini-btn pend-cat-editar', {
      text: '✎',
      title: `Editar «${cat.name}»`,
      label: `Editar ${cat.name}`,
    });
    lapiz.dataset.categoria = cat.id;

    const cuenta = cuentaDe(cat);
    const marca = elem('span', 'pend-cat-cuenta', String(cuenta));
    marca.title = cuenta === 1 ? '1 tarea pendiente' : `${cuenta} tareas pendientes`;

    // El lápiz va pegado a la cuenta, a su izquierda, contra el borde derecho.
    cabecera.append(flecha, nombre, lapiz, marca);
    bloque.appendChild(cabecera);
    if (plegada) return bloque;

    const propios = pendientesDe(cat.id);
    /* Adentro de una archivada se muestran TODAS sus subcategorías: se
       guardaron con ella, no cada una por su cuenta. */
    const subs = ordenarCategorias(archivada
      ? state.pendientes.categorias.filter(c => c.padre === cat.id)
      : subcategoriasDe(cat.id));
    if (propios.length) bloque.appendChild(listaDePendientes(propios));
    for (const sub of subs) bloque.appendChild(bloqueCategoria(sub, nivel + 1, { archivada }));

    // Una categoría recién creada está vacía: se dice, en vez de dejar un
    // encabezado suelto que se lee como algo que no cargó.
    if (!propios.length && !subs.length) {
      bloque.appendChild(elem('p', 'pend-cat-vacia', 'Nada acá todavía'));
    }
    return bloque;
  }

  function listaDePendientes(items) {
    const lista = elem('ul', 'pend-items');
    for (const p of items) lista.appendChild(filaDePendiente(p));
    return lista;
  }

  function filaDePendiente(p) {
    const fila = elem('li', `pend-item est-${p.estado}`);

    /* El estado se cambia tocándolo, con el mismo ciclo que la celda de la
       planilla: es un toque contra abrir un diálogo para mover una cosa.

       Y se dice con todas las letras. Un color pide aprender cuál es cuál antes
       de poder leer la lista; el nombre entra en la fila y no hace falta
       aprender nada. El tooltip agrega adónde lleva el toque siguiente. */
    const estado = elem('button', 'pend-estado', labelEstado(p.estado));
    estado.type = 'button';
    estado.dataset.estado = p.id;
    estado.title = `${labelEstado(p.estado)} — tocar para pasar a `
      + labelEstado(siguienteEstado(p.estado)).toLowerCase();
    estado.setAttribute('aria-label', `${p.name}: ${estado.title}`);

    // El nombre es el rótulo de la fila, no un botón: abrir un formulario al
    // tocarlo convertía en control lo que se lee como un título.
    const nombre = elem('span', 'pend-nombre', p.name);
    nombre.title = p.name;

    /* El lápiz es la ÚNICA puerta a la edición del pendiente —de ahí salen el
       nombre, la categoría, la fecha y el borrado—, igual que en las categorías
       y en las tarjetas de Hábitos. Un solo lugar donde buscarla. */
    const lapiz = boton('mini-btn pend-editar', {
      text: '✎',
      title: `Editar «${p.name}»`,
      label: `Editar ${p.name}`,
    });
    lapiz.dataset.pendiente = p.id;

    /* El nombre primero, que es lo que se busca al recorrer la lista, y contra
       la derecha la fecha, el lápiz y el estado — el mismo orden que la lista
       del día en Hábitos, donde el lápiz precede al recuadro de estado. */
    fila.append(nombre);
    if (p.comentario) fila.appendChild(marcaDeNota(p));
    if (p.fecha) fila.appendChild(chipDeFecha(p));
    fila.append(lapiz, estado);
    return fila;
  }

  /**
   * «Acá hay algo más que el nombre».
   *
   * El comentario NO se despliega en la fila: son hasta 200 caracteres y la
   * fila es una línea, con el nombre ya recortado con puntos suspensivos.
   * Meterlo adentro obligaría a que cada tarea ocupe un párrafo, y la lista
   * dejaría de leerse de un vistazo, que es para lo que sirve.
   *
   * Así que la fila solo avisa y el comentario se lee donde se escribe: en el
   * ✎. El tooltip lo adelanta en pantallas con mouse; en un teléfono no hay
   * tooltip, y ahí la marca dice justamente «tocá el lápiz».
   */
  function marcaDeNota(p) {
    const marca = elem('span', 'pend-nota', '⋯');
    marca.title = p.comentario;
    marca.setAttribute('aria-label', `${p.name}, comentarios: ${p.comentario}`);
    return marca;
  }

  function chipDeFecha(p) {
    const fecha = parseDateKey(p.fecha);
    const chip = elem('span', 'pend-fecha', fmtShort.format(fecha));
    chip.title = `Para el ${fmtFull.format(fecha)}`;

    /* Vencido solo mientras quede algo por hacer: una finalizada con fecha
       pasada no es un problema, es exactamente lo que se esperaba. */
    if (p.estado !== 'finalizada' && p.fecha < dateKey(today)) {
      chip.classList.add('is-vencida');
      chip.title += ' — ya pasó';
    }
    return chip;
  }

  /**
   * El mes visible con lo que cae cada día.
   *
   * Los que no tienen fecha no aparecen: el calendario contesta «cuándo», y de
   * esos no hay respuesta. Se los cuenta al pie para que no parezca que se
   * perdieron al cambiar de vista.
   */
  function renderPendientesCalendario() {
    el.pendCalendario.innerHTML = '';

    const cabecera = elem('div', 'pend-cal-dows');
    for (const dia of ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']) {
      cabecera.appendChild(elem('span', 'pend-cal-dow', dia));
    }
    el.pendCalendario.appendChild(cabecera);

    const porFecha = new Map();
    for (const p of pendientesVivos()) {
      if (!p.fecha) continue;
      if (!porFecha.has(p.fecha)) porFecha.set(p.fecha, []);
      porFecha.get(p.fecha).push(p);
    }

    const rejilla = elem('div', 'pend-cal-rejilla');
    const dias = monthDays();

    /* La rejilla arranca en el lunes de la semana del día 1; si no, los días no
       caerían debajo del nombre que les corresponde. */
    const relleno = (dias[0].getDay() + 6) % 7;
    for (let i = 0; i < relleno; i++) rejilla.appendChild(elem('div', 'pend-cal-hueco'));

    for (const dia of dias) {
      const celda = elem('div', 'pend-cal-dia');
      /* La fecha va en el marcado y no en un índice aparte: la usan las dos
         cosas que se pueden hacer sobre la celda —crear ahí y soltar ahí—. */
      celda.dataset.fecha = dateKey(dia);
      celda.title = `Agregar una tarea para el ${fmtFull.format(dia)}`;
      if (sameDay(dia, today)) celda.classList.add('is-hoy');
      celda.appendChild(elem('span', 'pend-cal-num', String(dia.getDate())));

      for (const p of porFecha.get(dateKey(dia)) ?? []) {
        /* Etiqueta y no botón: acá no se edita —para eso está el lápiz de la
           lista—, se ve qué cae ese día y se arrastra a otro. */
        const chip = elem('span', `pend-cal-item est-${p.estado}`, p.name);
        chip.dataset.pendiente = p.id;
        chip.title = `${p.name} — ${labelEstado(p.estado)}`;
        celda.appendChild(chip);
      }
      rejilla.appendChild(celda);
    }
    el.pendCalendario.appendChild(rejilla);

    const sinFecha = pendientesVivos().filter(p => !p.fecha).length;
    if (!sinFecha) return;
    el.pendCalendario.appendChild(elem('p', 'pend-cal-nota',
      sinFecha === 1
        ? '1 tarea sin fecha; está en la lista'
        : `${sinFecha} tareas sin fecha; están en la lista`));
  }

  /**
   * Llena un desplegable con una lista de categorías y una opción vacía.
   *
   * Las subcategorías se nombran por su camino completo donde conviven con las
   * de primer nivel —dos pueden llamarse igual colgando de madres distintas—;
   * donde ya se sabe de cuál cuelgan, alcanza con su nombre.
   */
  function llenarSelect(select, lista, elegida, vacia, conCamino = false) {
    select.innerHTML = '';
    const ninguna = elem('option', '', vacia);
    ninguna.value = '';
    select.appendChild(ninguna);

    for (const cat of lista) {
      const madre = cat.padre ? categoriaPorId(cat.padre) : null;
      const op = elem('option', '', conCamino && madre ? `${madre.name} › ${cat.name}` : cat.name);
      op.value = cat.id;
      select.appendChild(op);
    }
    select.value = elegida ?? '';
  }

  /** Todas, con las subcategorías nombradas por su camino. Es la del diálogo de categoría. */
  function opcionesDeCategoria(select, elegida, vacia) {
    const todas = categoriasRaiz().flatMap(cat => [cat, ...subcategoriasDe(cat.id)]);
    llenarSelect(select, todas, elegida, vacia, true);
  }

  /**
   * El segundo paso: las subcategorías de la principal elegida.
   *
   * Se apaga cuando no hay de dónde elegir —sin categoría, o con una que no
   * tiene subcategorías—, y el título dice cuál de las dos cosas pasa: un
   * desplegable apagado y mudo manda a adivinar.
   */
  function opcionesDeSubcategoria(madre, elegida) {
    const hijas = madre ? subcategoriasDe(madre) : [];
    llenarSelect(el.pendienteSub, hijas, elegida, 'Ninguna');

    el.pendienteSub.disabled = hijas.length === 0;
    el.pendienteSub.title = hijas.length
      ? ''
      : (madre ? 'Esta categoría no tiene subcategorías' : 'Elegí una categoría primero');
  }

  /**
   * @param {string|null} id  el pendiente que se edita, o nada para uno nuevo
   * @param {{ fecha?: string }} [opciones] `fecha` precarga el campo en un alta:
   *   es lo que hace que tocar un día del calendario cree justo ahí.
   */
  function openPendienteDialog(id = null, { fecha = '' } = {}) {
    const p = id ? pendientePorId(id) : null;
    ui.editandoPendiente = p ? p.id : null;

    el.pendienteDialogTitle.textContent = p
      ? 'Editar tarea pendiente'
      : 'Nueva tarea pendiente';
    const rotulo = p ? 'Guardar cambios' : 'Crear tarea pendiente';
    el.pendienteSubmit.title = rotulo;
    el.pendienteSubmit.setAttribute('aria-label', rotulo);

    // Las tres acciones obran sobre algo que ya existe: en un alta no hay nada.
    el.pendienteTools.hidden = !p;
    el.pendienteArchive.textContent = p?.archivado ? 'Desarchivar' : 'Archivar';
    mostrarFlechasPendiente(false);
    el.pendienteError.hidden = true;

    el.pendienteName.value = p ? p.name : '';

    /* Lo guardado es UNA categoría, que puede ser de cualquiera de los dos
       niveles; los dos desplegables la parten en madre e hija para mostrarla. */
    const suya = p ? categoriaPorId(p.categoria) : null;
    /* Sin categoría no se puede: un alta arranca en «Varios», que es donde cae
       lo que no se ordena en otro lado. Por eso el desplegable tampoco tiene
       una opción vacía. */
    const madre = suya?.padre ?? suya?.id ?? VARIOS;
    llenarSelect(el.pendienteCategoria, categoriasRaiz(), madre, '');
    el.pendienteCategoria.querySelector('option[value=""]')?.remove();
    opcionesDeSubcategoria(madre, suya ? (suya.padre ? suya.id : '') : VARIOS_SUB);
    const estado = p ? p.estado : 'sin-iniciar';
    el.pendienteForm
      .querySelector(`input[name="pendiente-estado"][value="${estado}"]`).checked = true;
    el.pendienteFecha.value = p ? (p.fecha ?? '') : fecha;
    el.pendienteComentario.value = p ? (p.comentario ?? '') : '';
    estirarComentario();

    el.pendienteDialog.showModal();
    el.pendienteName.focus();
    el.pendienteName.select();
  }

  /**
   * El campo de comentarios mide lo que ocupa lo escrito.
   *
   * Vacío tiene que ser el mismo recuadro de una línea que el del nombre; con
   * tres renglones anotados, esconder dos detrás de una barra de desplazamiento
   * sería peor que ocupar el lugar. Así que ni fijo ni con agarradera: se
   * acomoda solo, hasta el techo que le pone el CSS.
   *
   * El `auto` de la primera línea es lo que le permite ACHICARSE: sin él,
   * `scrollHeight` nunca baja de la altura que el campo ya tiene, y borrar
   * texto dejaba el hueco.
   */
  function estirarComentario() {
    const campo = el.pendienteComentario;
    campo.style.height = 'auto';
    /* Sin motor de maquetado —los tests— no hay altura que medir, y lo que sale
       de acá es un 0 que aplastaría el campo. Se lo deja como lo dejó el CSS. */
    if (!campo.scrollHeight) {
      campo.style.height = '';
      return;
    }
    const bordes = campo.offsetHeight - campo.clientHeight;
    campo.style.height = `${campo.scrollHeight + bordes}px`;
  }

  el.pendienteComentario.addEventListener('input', estirarComentario);

  function openCategoriaDialog(id = null) {
    const cat = id ? categoriaPorId(id) : null;
    ui.editandoCategoria = cat ? cat.id : null;

    el.categoriaDialogTitle.textContent = cat ? 'Editar categoría' : 'Nueva categoría';
    const rotulo = cat ? 'Guardar cambios' : 'Crear categoría';
    el.categoriaSubmit.title = rotulo;
    el.categoriaSubmit.setAttribute('aria-label', rotulo);
    el.categoriaTools.hidden = !cat;

    /* «Varios» y su subcategoría se pueden renombrar, pero no sacar de en
       medio: son el piso que sostiene que ninguna tarea quede sin categoría.
       Borrarlas dejaría huérfano a lo que cuelga de ellas, y archivarlas
       escondería la categoría en la que caen las tareas nuevas. */
    const protegida = Boolean(cat && esProtegida(cat.id));
    el.categoriaDelete.disabled = protegida;
    el.categoriaDelete.title = protegida
      ? 'Esta categoría no se puede eliminar: es donde caen las tareas sin otra'
      : '';
    el.categoriaError.hidden = true;
    el.categoriaName.value = cat ? cat.name : '';

    /* El mismo botón dice las dos cosas, según cómo esté: es una decisión que
       se toma y se deshace en el mismo lugar. */
    el.categoriaArchive.textContent = cat?.archivada ? 'Desarchivar' : 'Archivar';
    /* Una subcategoría guardada con su madre no se desarchiva sola: primero
       vuelve la madre. Sin esto quedaba suelta adentro de un bloque guardado. */
    const heredada = Boolean(cat && !cat.archivada && cat.padre && estaArchivada(cat.padre));
    el.categoriaArchive.disabled = heredada || protegida;
    el.categoriaArchive.title = protegida
      ? 'Esta categoría no se puede archivar: es donde caen las tareas sin otra'
      : (heredada ? 'Está guardada con su categoría: desarchivá esa primero' : '');
    mostrarFlechasCategoria(false);

    /* Solo las de primer nivel pueden ser padre —el anidado llega hasta ahí— y
       una no puede colgar de sí misma. Con subcategorías propias tampoco puede
       mudarse adentro de otra: dejaría un tercer nivel colgando. */
    opcionesDeCategoria(el.categoriaPadre, cat?.padre ?? '', 'Ninguna (primer nivel)');
    for (const op of [...el.categoriaPadre.options]) {
      if (!op.value) continue;
      const otra = categoriaPorId(op.value);
      const prohibida = otra.padre
        || (cat && (otra.id === cat.id || subcategoriasDe(cat.id).length > 0));
      if (prohibida) op.remove();
    }
    el.categoriaPadre.value = cat?.padre ?? '';

    el.categoriaDialog.showModal();
    el.categoriaName.focus();
    el.categoriaName.select();
  }

  // --- lo que se toca -------------------------------------------------------

  for (const btn of document.querySelectorAll('.pend-vista')) {
    btn.addEventListener('click', () => {
      ui.vistaPendientes = /** @type {'lista'|'calendario'} */ (btn.dataset.vista);
      render();
    });
  }

  /* Un solo oyente para toda la lista: las filas se redibujan enteras en cada
     cambio, y colgar oyentes de cada botón los volvería a colgar cada vez. */
  el.pendLista.addEventListener('click', e => {
    const boton = e.target.closest('button');
    if (!boton) return;

    if (boton.dataset.plegar) {
      /* Todas arrancan plegadas, así que alcanza con anotar cuáles se abrieron.
         Antes arrancaban abiertas y hacían falta dos conjuntos —uno para las
         que se cerraron y otro para las que se abrieron—, porque las archivadas
         arrancaban al revés que el resto. */
      const id = boton.dataset.plegar;
      if (ui.pendDesplegadas.has(id)) ui.pendDesplegadas.delete(id);
      else ui.pendDesplegadas.add(id);
      renderPendientes();
      return;
    }
    if (boton.dataset.categoria) return openCategoriaDialog(boton.dataset.categoria);
    if (boton.dataset.pendiente) return openPendienteDialog(boton.dataset.pendiente);
    if (boton.dataset.estado) return ciclarEstado(boton.dataset.estado);
  });

  el.pendCalendario.addEventListener('click', e => {
    /* El clic que cierra un arrastre no es un toque: sin esto, soltar un
       pendiente sobre un día vacío abría además el alta. Lo mismo con el que
       cierra un deslizamiento, que además cae sobre la rejilla del mes nuevo:
       el día que abriría el alta no es ni siquiera el que se tocó. */
    if (arrastre.hubo || desliz.hubo) {
      arrastre.hubo = false;
      desliz.hubo = false;
      return;
    }
    // Soltar sobre un pendiente tampoco crea nada.
    if (e.target.closest('[data-pendiente]')) return;

    // Tocar el día crea ahí: la fecha es el dato que el calendario ya sabe.
    const celda = e.target.closest('.pend-cal-dia');
    if (celda) openPendienteDialog(null, { fecha: celda.dataset.fecha });
  });

  /* ---- arrastrar para cambiar de día ------------------------------------

     Con eventos de puntero y no con el arrastre nativo de HTML5: el nativo no
     existe en el teléfono, que es donde se usa esto. El arrastre arranca recién
     después de moverse un poco, así que un toque sigue siendo un toque y abre
     el diálogo.

     No es el único camino para cambiar la fecha —el campo del diálogo hace lo
     mismo—, y eso es lo que lo deja al alcance de quien no puede arrastrar. */
  const UMBRAL = 6;
  const arrastre = {
    id: /** @type {string|null} */ (null),
    origen: /** @type {Element|null} */ (null),
    destino: /** @type {Element|null} */ (null),
    x: 0,
    y: 0,
    activo: false,
    /** Hubo arrastre de verdad: lo mira el clic que viene después. */
    hubo: false,
  };

  /** La celda que está debajo del puntero, si es que hay alguna. */
  function celdaEn(x, y) {
    const nodo = document.elementFromPoint?.(x, y);
    return nodo?.closest?.('.pend-cal-dia') ?? null;
  }

  function marcarDestino(celda) {
    if (arrastre.destino === celda) return;
    arrastre.destino?.classList.remove('is-destino');
    arrastre.destino = celda;
    celda?.classList.add('is-destino');
  }

  function soltarArrastre() {
    arrastre.origen?.classList.remove('is-llevado');
    arrastre.destino?.classList.remove('is-destino');
    Object.assign(arrastre, { id: null, origen: null, destino: null, activo: false });
  }

  el.pendCalendario.addEventListener('pointerdown', e => {
    const chip = e.target.closest('[data-pendiente]');
    if (!chip || (e.button ?? 0) !== 0) return;

    /* `hubo` se apaga acá y no después de mirarlo: si el navegador no manda el
       clic que cierra un arrastre —soltando afuera, o en algunos toques—, la
       marca quedaría puesta y se comería el toque siguiente. */
    Object.assign(arrastre, {
      id: chip.dataset.pendiente,
      origen: chip,
      x: e.clientX,
      y: e.clientY,
      activo: false,
      hubo: false,
    });
    // Con el puntero capturado el arrastre sobrevive a salirse del chip.
    chip.setPointerCapture?.(e.pointerId);
  });

  el.pendCalendario.addEventListener('pointermove', e => {
    if (!arrastre.id) return;

    if (!arrastre.activo) {
      const lejos = Math.abs(e.clientX - arrastre.x) > UMBRAL
        || Math.abs(e.clientY - arrastre.y) > UMBRAL;
      if (!lejos) return;   // todavía puede ser un toque
      arrastre.activo = true;
      arrastre.origen?.classList.add('is-llevado');
    }

    e.preventDefault();
    marcarDestino(celdaEn(e.clientX, e.clientY));
  });

  el.pendCalendario.addEventListener('pointerup', e => {
    if (!arrastre.id) return;

    const { id, activo } = arrastre;
    const destino = arrastre.destino ?? celdaEn(e.clientX, e.clientY);
    soltarArrastre();
    if (!activo) return;   // fue un toque: lo atiende el clic

    arrastre.hubo = true;
    if (destino) moverPendiente(id, destino.dataset.fecha);
  });

  // Soltar afuera, o que el sistema corte el gesto, deja todo como estaba.
  el.pendCalendario.addEventListener('pointercancel', () => {
    if (arrastre.id) arrastre.hubo = arrastre.activo;
    soltarArrastre();
  });

  /* El calendario pasa de MES, y su otro gesto —arrastrar un pendiente de un
     día a otro— es lo único que no puede confundirse con este: por eso queda
     afuera. Los dos son un dedo moviéndose, y lo que los separa es dónde
     arrancan. */
  const desliz = deslizarDeCostado(el.pendCalendario, paso => goToMonth(paso),
    { salvo: '[data-pendiente]' });

  function moverPendiente(id, fecha) {
    const p = pendientePorId(id);
    if (!p || !RE_DIA.test(fecha ?? '') || p.fecha === fecha) return;

    p.fecha = fecha;
    save();
    renderPendientes();
    toast(`«${p.name}» pasó al ${fmtFull.format(parseDateKey(fecha))}`);
  }

  /* Las flechas del diálogo de categoría. Se mueve entre HERMANAS: las de
     primer nivel entre las de primer nivel y una subcategoría adentro de su
     madre. Cambiar de nivel es otra cosa, y eso lo hace «Dentro de». */
  const flechasDeCategoria = controlDeOrden({
    nodos: {
      caja: el.categoriaMove,
      boton: el.categoriaReorder,
      arriba: el.categoriaMoveUp,
      abajo: el.categoriaMoveDown,
      pos: el.categoriaMovePos,
    },
    lista: () => {
      const cat = categoriaPorId(ui.editandoCategoria);
      return cat ? hermanasDe(cat) : [];
    },
    actual: () => ui.editandoCategoria,
    mover: delta => {
      const cat = categoriaPorId(ui.editandoCategoria);
      if (!cat) return false;
      const hermanas = hermanasDe(cat);
      const vecina = hermanas[hermanas.indexOf(cat) + delta];
      if (!vecina || !intercambiar(state.pendientes.categorias, cat, vecina)) return false;

      /* Mover a mano ES elegir el orden personalizado: con otro puesto, la
         flecha guardaba el cambio y la pantalla no se movía, que se lee como
         que el botón está roto. */
      ui.ordenPend.categorias = 'personalizado';
      return true;
    },
  });
  const mostrarFlechasCategoria = flechasDeCategoria.mostrar;

  /* Archivar no pregunta nada ni pierde nada: guarda la categoría con todo lo
     suyo al final de la lista y el mismo botón la trae de vuelta. Por eso no
     tiene confirmación, a diferencia de eliminar. */
  el.categoriaArchive.addEventListener('click', () => {
    const cat = categoriaPorId(ui.editandoCategoria);
    if (!cat) return;

    cat.archivada = !cat.archivada;
    ui.pendDesplegadas.delete(cat.id);
    save();
    el.categoriaDialog.close();
    render();
    toast(cat.archivada
      ? `«${cat.name}» quedó guardada al final`
      : `«${cat.name}» volvió a la lista`);
  });

  /** Avanza al estado siguiente y vuelve al principio después del último. */
  function ciclarEstado(id) {
    const p = pendientePorId(id);
    if (!p) return;
    p.estado = siguienteEstado(p.estado);
    save();
    renderPendientes();
  }

  el.categoriaName.addEventListener('blur', () => {
    el.categoriaName.value = capitalizeFirstLetter(el.categoriaName.value.trim());
  });

  /* Las flechas del diálogo de una tarea pendiente. Se mueve entre las de su
     misma categoría; ese orden se ve en «Categorías», y en «Lista» solo con el
     orden personalizado puesto —que es justamente el que deja puesto mover—. */
  const flechasDePendiente = controlDeOrden({
    nodos: {
      caja: el.pendienteMove,
      boton: el.pendienteReorder,
      arriba: el.pendienteMoveUp,
      abajo: el.pendienteMoveDown,
      pos: el.pendienteMovePos,
    },
    lista: () => {
      const p = pendientePorId(ui.editandoPendiente);
      return p ? hermanosDe(p) : [];
    },
    actual: () => ui.editandoPendiente,
    mover: delta => {
      const p = pendientePorId(ui.editandoPendiente);
      if (!p) return false;
      const hermanos = hermanosDe(p);
      const vecino = hermanos[hermanos.indexOf(p) + delta];
      if (!vecino || !intercambiar(state.pendientes.items, p, vecino)) return false;

      ui.ordenPend.lista = 'personalizado';
      return true;
    },
  });
  const mostrarFlechasPendiente = flechasDePendiente.mostrar;

  /* Archivar no pregunta nada ni pierde nada: lo guarda en ☰ → Archivo y el
     mismo botón lo trae de vuelta. Por eso no confirma, a diferencia de
     eliminar. */
  el.pendienteArchive.addEventListener('click', () => {
    const p = pendientePorId(ui.editandoPendiente);
    if (!p) return;

    p.archivado = !p.archivado;
    save();
    el.pendienteDialog.close();
    render();
    toast(p.archivado ? `«${p.name}» quedó guardado` : `«${p.name}» volvió a la lista`);
  });

  /* Elegir otra categoría cambia de qué subcategorías se está hablando, así que
     la segunda lista se rehace y lo elegido antes deja de valer. */
  el.pendienteCategoria.addEventListener('change', () => {
    opcionesDeSubcategoria(el.pendienteCategoria.value, '');
  });

  el.pendienteForm.addEventListener('submit', e => {
    e.preventDefault();

    const name = el.pendienteName.value.trim().slice(0, TOPE_NOMBRE);
    if (!name) {
      el.pendienteError.textContent = 'Escribí qué hay que hacer.';
      el.pendienteError.hidden = false;
      el.pendienteName.focus();
      return;
    }

    const datos = {
      name,
      categoria: categoriaPorId(el.pendienteSub.value)?.id
        ?? categoriaPorId(el.pendienteCategoria.value)?.id
        ?? VARIOS,
      estado: el.pendienteForm
        .querySelector('input[name="pendiente-estado"]:checked').value,
      fecha: RE_DIA.test(el.pendienteFecha.value) ? el.pendienteFecha.value : null,
      /* `trim` sí, capitalizar no: un nombre es un rótulo y empieza en
         mayúscula, pero una nota de varias líneas no, y forzársela se ve mal. */
      comentario: el.pendienteComentario.value.trim().slice(0, TOPE_COMENTARIO),
    };

    const actual = ui.editandoPendiente ? pendientePorId(ui.editandoPendiente) : null;

    /* Únicas adentro de su categoría. «Comprar filtros» puede estar en Cocina y
       en Auto: son dos cosas distintas que se llaman igual, y el lugar las
       distingue. Dos veces en la misma lista, no. */
    const repetida = state.pendientes.items.some(p => p.id !== actual?.id
      && p.categoria === datos.categoria && mismoNombre(p.name, datos.name));
    if (repetida) {
      el.pendienteError.textContent = 'Ya hay una tarea con ese nombre en esa categoría.';
      el.pendienteError.hidden = false;
      el.pendienteName.focus();
      return;
    }

    if (actual) Object.assign(actual, datos);
    else state.pendientes.items.push({ id: newId(), ...datos, archivado: false });

    save();
    el.pendienteDialog.close();
    render();
  });

  el.pendienteDelete.addEventListener('click', () => {
    const p = ui.editandoPendiente ? pendientePorId(ui.editandoPendiente) : null;
    if (!p) return;
    el.pendienteDialog.close();

    confirmAction('Se elimina esta tarea pendiente.', () => {
      /* Antes de sacarlo se anota dónde estaba: la papelera lo guarda siete
         días y restaurarlo lo devuelve a ese lugar. */
      const indice = state.pendientes.items.indexOf(p);
      aPapelera({ tipo: 'pendiente', nombre: p.name, indice, dato: { ...p } });

      state.pendientes.items = state.pendientes.items.filter(i => i.id !== p.id);
      save();
      render();
      toast('Tarea pendiente eliminada');
    }, {
      items: [p.name],
      ok: 'Eliminar',
      note: `Queda ${DIAS_PAPELERA} días en la papelera, en ☰ → Papelera.`,
    });
  });

  el.categoriaForm.addEventListener('submit', e => {
    e.preventDefault();

    const name = capitalizeFirstLetter(el.categoriaName.value.trim().slice(0, TOPE_NOMBRE));
    if (!name) {
      el.categoriaError.textContent = 'Poné un nombre.';
      el.categoriaError.hidden = false;
      el.categoriaName.focus();
      return;
    }

    const padre = categoriaPorId(el.categoriaPadre.value)?.id ?? null;
    const actual = ui.editandoCategoria ? categoriaPorId(ui.editandoCategoria) : null;

    /* Únicas entre sus hermanas y no en toda la app: dos «Compras» colgando de
       madres distintas se distinguen por dónde están, y esa es justamente la
       razón de tener subcategorías. Dos de primer nivel con el mismo nombre no
       se distinguirían por nada. */
    const hermana = state.pendientes.categorias.some(c => c.id !== actual?.id
      && (c.padre ?? null) === padre && mismoNombre(c.name, name));
    if (hermana) {
      el.categoriaError.textContent = padre
        ? `Esa categoría ya tiene una subcategoría llamada «${name}».`
        : `Ya hay una categoría llamada «${name}».`;
      el.categoriaError.hidden = false;
      el.categoriaName.focus();
      return;
    }
    if (actual) Object.assign(actual, { name, padre });
    else {
      /* Las nuevas van ANTES de «Varios»: es el cajón de sastre y su lugar es el
         final. Como el orden que se ve es el del arreglo —eso es lo que mueven
         las flechas—, ponerla acá es lo mismo que ponerla en su lugar. */
      const nueva = { id: newId(), name, padre, archivada: false };
      const piso = state.pendientes.categorias.findIndex(c => c.id === VARIOS);
      state.pendientes.categorias.splice(piso < 0 ? state.pendientes.categorias.length : piso, 0, nueva);
    }

    save();
    el.categoriaDialog.close();
    render();
  });

  /* Borrar una categoría NO borra lo que tiene adentro: los pendientes quedan
     sueltos y las subcategorías pasan a primer nivel. Perder trabajo anotado
     por reordenar carpetas sería un precio absurdo, y el aviso lo dice. */
  el.categoriaDelete.addEventListener('click', () => {
    const cat = ui.editandoCategoria ? categoriaPorId(ui.editandoCategoria) : null;
    if (!cat) return;
    el.categoriaDialog.close();

    const subs = subcategoriasDe(cat.id);
    const dentro = pendientesDe(cat.id).length
      + subs.reduce((n, sub) => n + pendientesDe(sub.id).length, 0);

    confirmAction('Se elimina la categoría.', () => {
      /* Se anota el cambio entero: dónde estaba, qué subcategorías quedaron de
         primer nivel por su culpa y qué pendientes quedaron sueltos. Restaurar
         deshace las tres cosas. */
      const hijas = new Set(state.pendientes.categorias
        .filter(c => c.padre === cat.id).map(c => c.id));
      const sueltos = state.pendientes.items
        .filter(p => p.categoria === cat.id).map(p => p.id);
      aPapelera({
        tipo: 'categoria',
        nombre: cat.name,
        indice: state.pendientes.categorias.indexOf(cat),
        dato: { ...cat },
        hijas: [...hijas],
        sueltos,
      });

      state.pendientes.categorias = state.pendientes.categorias
        .filter(c => c.id !== cat.id)
        .map(c => (hijas.has(c.id) ? { ...c, padre: null } : c));
      for (const p of state.pendientes.items) {
        if (p.categoria === cat.id) p.categoria = VARIOS;
      }
      ui.pendDesplegadas.delete(cat.id);
      save();
      render();
      toast('Categoría eliminada');
    }, {
      items: [cat.name],
      ok: 'Eliminar',
      note: dentro || subs.length
        ? 'Lo que tiene adentro no se borra: las tareas pasan a «Varios»'
          + ' y las subcategorías, a primer nivel.'
        : '',
    });
  });

  // ---------------------------------------------------------
  // Baja de la cuenta
  // ---------------------------------------------------------

  /**
   * Borra de ESTE aparato todo lo del usuario que se va.
   *
   * Incluye la copia sin dueño —`STORAGE_BASE`—, que es la que `adoptarDatosPrevios`
   * le ofrece al que entre después: sin borrarla, el próximo que inicie sesión
   * en este navegador heredaría los datos del que se dio de baja.
   */
  function borrarDatosLocales() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(`${STORAGE_KEY}/pendiente`);
      localStorage.removeItem(STORAGE_BASE);
      localStorage.removeItem(`${STORAGE_BASE}/pendiente`);
    } catch { /* sin almacenamiento no hay nada que borrar */ }
  }

  /**
   * Da de baja la cuenta: borra al usuario en la base y todo lo suyo con él.
   *
   * El borrado lo hace `eliminar_cuenta` en Supabase —una función `security
   * definer` que borra de `auth.users` al que la llama— porque desde el
   * navegador no hay manera: la clave anónima no puede tocar usuarios, y darle
   * ese poder al cliente sería darle el poder de borrar cualquier cuenta. Las
   * tablas cuelgan de `auth.users` con `on delete cascade`, así que con el
   * usuario se van sus tareas, sus suscripciones al push y su recordatorio.
   *
   * Si la función no está instalada, se dice qué falta en vez de fallar en
   * silencio: es un paso de puesta en marcha, no un error del usuario.
   */
  async function eliminarCuenta() {
    if (!window.supabaseClient) {
      toast('Sin conexión con la base no se puede dar de baja la cuenta');
      return;
    }

    const { error } = await window.supabaseClient.rpc('eliminar_cuenta');
    if (error) {
      const falta = /function .*eliminar_cuenta|not find the function|404/i
        .test(`${error.message} ${error.code ?? ''}`);
      toast(falta
        ? 'Falta instalar db/eliminar-cuenta.sql en Supabase'
        : 'No se pudo eliminar la cuenta. Probá de nuevo.');
      return;
    }

    /* Primero lo local y después la sesión: si se hiciera al revés y la salida
       fallara, quedarían los datos de una cuenta que ya no existe. */
    borrarDatosLocales();
    try {
      await window.supabaseClient.auth.signOut();
    } catch { /* el token ya no vale: la recarga limpia igual */ }

    /* Recargar y no solo cerrar sesión: con el usuario borrado, el cliente
       tiene en mano un token de alguien que ya no existe. Desde cero vuelve la
       puerta de entrada, limpia. */
    location.reload();
  }

  el.deleteAccount.addEventListener('click', () => {
    confirmAction(
      'Se elimina tu cuenta y todo lo que cargaste. No se puede deshacer.',
      eliminarCuenta,
      {
        items: [currentUserEmail || 'Tu cuenta'],
        ok: 'Eliminar cuenta',
        note: 'Se borran las tareas de todos los meses, las tareas pendientes, las '
          + 'plantillas propias y el recordatorio. Si querés conservar una copia, '
          + 'salí de acá y usá ☰ → Exportar antes.',
      },
    );
  });

  // ---------------------------------------------------------
  // Pendientes: Archivo y Papelera
  // ---------------------------------------------------------

  /** Lo borrado que todavía se puede restaurar. */
  const papeleraPendientes = () => state.pendientes.papelera
    .filter(entrada => diasDesde(entrada.fecha) < DIAS_PAPELERA);

  /**
   * Las dos entradas del cajón, con su estado y su porqué.
   *
   * Apagadas cuando no hay nada que mostrar, y el título dice cuánto hay: un
   * botón apagado sin explicación manda a adivinar.
   */
  function renderEntradasPendientes() {
    const guardadas = categoriasArchivadas().filter(c => !c.padre).length
      + pendientesArchivados().length;
    el.pendArchivoBtn.disabled = guardadas === 0;
    el.pendArchivoBtn.title = guardadas
      ? `Ver ${guardadas} ${guardadas === 1 ? 'cosa guardada' : 'cosas guardadas'}`
      : 'No hay nada guardado';

    const borrados = papeleraPendientes().length;
    el.pendPapeleraBtn.disabled = borrados === 0;
    el.pendPapeleraBtn.title = borrados
      ? `${borrados} ${borrados === 1 ? 'cosa borrada' : 'cosas borradas'} en los últimos `
        + `${DIAS_PAPELERA} días`
      : 'No hay nada borrado que restaurar';
  }

  /* ---- Archivo ---- */

  /**
   * Las categorías guardadas, para elegir cuáles vuelven.
   *
   * Se listan solo las de primer nivel: una subcategoría se guardó CON su
   * madre y vuelve con ella, así que ofrecerla por separado prometería algo
   * que no pasa —ver `estaArchivada`—.
   */
  /* El Archivo mezcla dos cosas, así que la clave dice de cuál se trata: sin el
     prefijo, una categoría y una tarea con el mismo id serían la misma ficha. */
  const pendArchivo = listaElegible({
    nodos: {
      lista: el.pendArchivoList,
      vacio: el.pendArchivoEmpty,
      todas: el.pendArchivoAll,
      remate: el.pendArchivoUndo,
    },
    /* Primero las categorías y después las tareas sueltas: guardar una
       categoría se lleva más cosas, y conviene verlas antes. */
    fichas: () => [
      ...categoriasArchivadas().filter(c => !c.padre).map(cat => {
        /* Qué se lleva guardado: sus subcategorías y todo lo anotado adentro.
           Es lo que vuelve al desarchivarla, así que conviene verlo antes. */
        const subs = state.pendientes.categorias.filter(c => c.padre === cat.id);
        const dentro = pendientesDe(cat.id).length
          + subs.reduce((n, sub) => n + pendientesDe(sub.id).length, 0);
        const partes = ['Categoría'];
        if (subs.length) {
          partes.push(subs.length === 1 ? '1 subcategoría' : `${subs.length} subcategorías`);
        }
        partes.push(dentro === 1 ? '1 tarea' : `${dentro} tareas`);

        return { clave: `cat:${cat.id}`, nombre: cat.name, detalle: partes.join(' · ') };
      }),
      ...pendientesArchivados().map(p => {
        const partes = ['Tarea pendiente', labelEstado(p.estado)];
        if (p.fecha) partes.push(`para el ${fmtNumerica.format(parseDateKey(p.fecha))}`);
        return { clave: `pend:${p.id}`, nombre: p.name, detalle: partes.join(' · ') };
      }),
    ],
    textos: {
      remate: n => `Devolver ${n === 1 ? 'lo elegido' : `las ${n} cosas elegidas`} a la lista`,
      sinElegir: 'Elegí al menos una',
      todas: total => `Elegir las ${total} guardadas`,
    },
    accion: claves => {
      const cats = new Set(claves.filter(c => c.startsWith('cat:')).map(c => c.slice(4)));
      const items = new Set(claves.filter(c => c.startsWith('pend:')).map(c => c.slice(5)));

      for (const cat of state.pendientes.categorias) {
        if (cats.has(cat.id)) cat.archivada = false;
      }
      for (const p of state.pendientes.items) {
        if (items.has(p.id)) p.archivado = false;
      }

      save();
      render();
      pendArchivo.dibujar();
      // Sin nada que mostrar, el diálogo ya no tiene de qué hablar.
      if (!categoriasArchivadas().length && !pendientesArchivados().length) {
        el.pendArchivoDialog.close();
      }
      toast(claves.length === 1 ? 'Devuelto a la lista' : 'Devueltos a la lista');
    },
  });

  el.pendArchivoBtn.addEventListener('click', () => {
    setDrawer(false);
    pendArchivo.dibujar();
    abrirDialogo(el.pendArchivoDialog, '#pend-archivo-title');
  });

  /* ---- Papelera ---- */

  /**
   * Anota en la papelera lo que se está por borrar.
   *
   * Guarda el CAMBIO y no solo la cosa: el lugar que ocupaba y, en una
   * categoría, quiénes quedaron sueltos por su culpa. Es lo que permite que
   * restaurar la devuelva a su lugar con lo suyo, en vez de dejarla al final y
   * vacía.
   */
  function aPapelera(entrada) {
    state.pendientes.papelera.unshift({ fecha: dateKey(today), ...entrada });
  }

  const pendPapeleraUI = listaElegible({
    nodos: {
      lista: el.pendPapeleraList,
      vacio: el.pendPapeleraEmpty,
      todas: el.pendPapeleraAll,
      remate: el.pendPapeleraRestore,
    },
    /* Qué era, cuándo se borró y cuánto le queda: lo mismo que dice la papelera
       de Hábitos, que es la misma pregunta sobre otras cosas. La clave es la
       posición en la lista, que se rehace entera en cada dibujado. */
    fichas: () => papeleraPendientes().map((entrada, i) => {
      const quedan = Math.max(0, DIAS_PAPELERA - diasDesde(entrada.fecha));
      return {
        clave: String(i),
        nombre: entrada.nombre,
        detalle: [
          entrada.tipo === 'categoria' ? 'Categoría' : 'Tarea pendiente',
          `borrada el ${fmtNumerica.format(parseDateKey(entrada.fecha))}`,
          quedan === 1 ? 'queda 1 día' : `quedan ${quedan} días`,
        ].join(' · '),
      };
    }),
    textos: {
      remate: n => `Restaurar ${n === 1 ? 'lo elegido' : `las ${n} cosas elegidas`}`,
      sinElegir: 'Elegí al menos una',
      todas: total => `Elegir las ${total} borradas`,
    },
    accion: claves => {
      const elegidas = new Set(claves.map(Number));
      const vuelven = papeleraPendientes().filter((_, i) => elegidas.has(i));
      for (const entrada of vuelven) restaurarDePendientes(entrada);

      state.pendientes.papelera = state.pendientes.papelera
        .filter(entrada => !vuelven.includes(entrada));

      save();
      render();
      pendPapeleraUI.dibujar();
      if (!papeleraPendientes().length) el.pendPapeleraDialog.close();
      toast(vuelven.length === 1 ? 'Restaurado' : `${vuelven.length} restaurados`);
    },
  });

  el.pendPapeleraBtn.addEventListener('click', () => {
    setDrawer(false);
    pendPapeleraUI.dibujar();
    abrirDialogo(el.pendPapeleraDialog, '#pend-papelera-title');
  });

  /**
   * Devuelve una entrada a su lugar.
   *
   * Un pendiente vuelve al lugar que tenía, y si su categoría ya no existe
   * queda suelto en vez de perderse. Una categoría vuelve con su marca de
   * archivada y se lleva de vuelta a las subcategorías y los pendientes que
   * habían quedado sueltos cuando se la borró — pero solo si siguen existiendo:
   * lo que se borró después de eso no revive por esta puerta.
   */
  function restaurarDePendientes(entrada) {
    const { categorias, items } = state.pendientes;

    if (entrada.tipo === 'pendiente') {
      const item = { ...entrada.dato };
      if (item.categoria && !categorias.some(c => c.id === item.categoria)) item.categoria = null;
      items.splice(Math.min(entrada.indice, items.length), 0, item);
      return;
    }

    const cat = { ...entrada.dato };
    // El padre pudo haberse borrado mientras tanto: vuelve de primer nivel.
    if (cat.padre && !categorias.some(c => c.id === cat.padre)) cat.padre = null;
    categorias.splice(Math.min(entrada.indice, categorias.length), 0, cat);

    for (const id of entrada.hijas) {
      const sub = categorias.find(c => c.id === id);
      if (sub && !sub.padre) sub.padre = cat.id;
    }
    for (const id of entrada.sueltos) {
      const item = items.find(p => p.id === id);
      if (item && (!item.categoria || item.categoria === VARIOS)) item.categoria = cat.id;
    }
  }

  // ---------------------------------------------------------
  // Plantillas
  // ---------------------------------------------------------

  /**
   * Las plantillas a la vista: las de fábrica que siguen en pie, más las
   * propias. Las de fábrica van primero porque son las que estaban desde el
   * principio; las guardadas se agregan al final, en el orden en que se
   * guardaron.
   */
  function plantillasVisibles() {
    const borradas = new Set(state.removedTemplates);
    return [
      ...TEMPLATES.filter(t => !borradas.has(t.id)).map(t => ({ ...t, propia: false })),
      ...state.templates.map(t => ({ ...t, propia: true })),
    ];
  }

  function hayLugarParaPlantilla() {
    return plantillasVisibles().length < MAX_PLANTILLAS;
  }

  /**
   * Pasa las tareas de un mes a la forma de plantilla: nombre y frecuencia, y
   * solo el campo que esa frecuencia usa.
   *
   * Lo que se descarta importa tanto como lo que se guarda. El `id` no va
   * porque la plantilla crea tareas nuevas cada vez que se aplica —si viajara,
   * dos meses compartirían id y sus estados—, y la fecha de inicio tampoco: la
   * elige quien la aplica, en el campo del diálogo.
   */
  function tareasComoPlantilla(tasks) {
    return tasks.map(t => ({
      name: t.name,
      freq: t.freq,
      ...(isCountMode(t) ? { target: t.target }
        : t.freq === 'custom' ? { weekdays: [...t.weekdays] } : {}),
    }));
  }

  function openTemplates() {
    /* Cada apertura vuelve a hoy. No recuerda la fecha anterior a propósito:
       esa fecha decide a qué mes van las tareas, y arrastrarla mandaría la
       próxima plantilla a un mes que nadie volvió a elegir.

       Ojo: la fecha, no el mes que se está mirando, es lo que fija el destino.
       Con el valor por omisión, abrir el diálogo parado en otro mes propone
       igual el mes actual — lo dice la ayuda debajo del campo. */
    el.templatesStart.value = dateKey(today);

    el.templatesList.innerHTML = '';
    for (const tpl of plantillasVisibles()) el.templatesList.appendChild(templateCard(tpl));

    syncTemplatesTarget();
    abrirDialogo(el.templatesDialog, '#templates-title');
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

    /* El nombre del mes viene en minúscula del locale, y así va bien en medio
       de una oración. Donde la abre hay que capitalizarlo a mano: el encabezado
       se apoya en un `text-transform` del CSS que acá no alcanza. */
    /* Con una fecha válida no se dice nada: el botón ya nombra a dónde van las
       tareas. La ayuda queda para el único caso en el que está apagado. */
    el.templatesStartHint.textContent = destino
      ? ''
      : 'Elegí la fecha en la que arrancan las tareas.';

    // Vacío no alcanza: el `gap` de .field dejaría un escalón bajo el campo.
    el.templatesStartHint.hidden = !el.templatesStartHint.textContent;

    /* Sin fecha no hay a dónde agregar: el botón se apaga en vez de dejar que
       el clic falle, y el diálogo dice por qué antes de que nadie lo intente. */
    for (const btn of el.templatesList.querySelectorAll('.tpl-add')) {
      btn.disabled = !destino;
      btn.title = destino ? `Agregar a ${nombre}` : 'Elegí primero una fecha de inicio';
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

  /**
   * Borra una plantilla. Las de fábrica no se pueden tocar —viven en una
   * constante—, así que de esas se guarda el id en `removedTemplates` y se las
   * saltea al listar; las propias se sacan de la lista.
   */
  function borrarPlantilla(tpl) {
    confirmAction(
      `Se va a borrar la plantilla «${tpl.name}».`,
      () => {
        if (tpl.propia) {
          state.templates = state.templates.filter(t => t.id !== tpl.id);
        } else if (!state.removedTemplates.includes(tpl.id)) {
          state.removedTemplates = [...state.removedTemplates, tpl.id];
        }
        save();
        // Borrar libera un lugar: la entrada de «Opciones» vuelve a encenderse.
        render();

        // El diálogo sigue abierto: se redibuja la lista sin cerrarlo.
        el.templatesList.innerHTML = '';
        for (const t of plantillasVisibles()) el.templatesList.appendChild(templateCard(t));
        syncTemplatesTarget();
        toast(`Plantilla «${tpl.name}» borrada`);
      },
      {
        note: tpl.propia
          ? 'Las tareas que ya agregaste desde ella no se tocan.'
          : 'Es una de las que trae la app. Se puede volver a tener creándola a mano.',
      },
    );
  }

  // ---- Guardar el mes como plantilla -----------------------------------

  /** Por qué no se puede guardar el mes visible, o `''` si sí se puede. */
  function motivoSinGuardar() {
    if (!tareasDelDia(diaActual()).length) return 'Este día no tiene tareas para guardar';
    if (!hayLugarParaPlantilla()) {
      return `Ya hay ${MAX_PLANTILLAS} plantillas: borrá una para guardar otra`;
    }
    return '';
  }

  function openSaveTemplate() {
    const cuantas = tareasDelDia(diaActual()).length;
    el.saveTemplateNote.textContent =
      `Se guardan las ${cuantas} tareas del ${fmtFull.format(diaActual())}, `
      + 'con su frecuencia.';

    el.saveTemplateName.value = '';
    mostrarErrorPlantilla('');
    el.saveTemplateDialog.showModal();
    el.saveTemplateName.focus();
  }

  function mostrarErrorPlantilla(texto) {
    el.saveTemplateError.textContent = texto;
    el.saveTemplateError.hidden = !texto;
  }

  el.saveTemplateForm.addEventListener('submit', e => {
    e.preventDefault();

    const nombre = capitalizeFirstLetter(el.saveTemplateName.value.trim().slice(0, 40));
    if (!nombre) return mostrarErrorPlantilla('Poné un nombre para la plantilla.');

    /* Se vuelve a mirar el lugar y las tareas: entre abrir el diálogo y
       confirmar puede haber pasado cualquier cosa, y el que sobra es el caso
       raro que deja el estado en algo que la interfaz no permite crear. */
    const motivo = motivoSinGuardar();
    if (motivo) return mostrarErrorPlantilla(`${motivo}.`);

    const repetido = plantillasVisibles()
      .some(t => t.name.toLowerCase() === nombre.toLowerCase());
    if (repetido) return mostrarErrorPlantilla('Ya hay una plantilla con ese nombre.');

    state.templates = [...state.templates, {
      id: newId(),
      name: nombre,
      // La descripción se arma sola: pedirla sería un campo más para algo que
      // la app sabe. Dice de dónde salió, que es lo que se olvida.
      // De qué día salió, que es de donde se tomaron las tareas.
      description: `Guardada desde el ${fmtShort.format(diaActual())}`,
      tasks: tareasComoPlantilla(tareasDelDia(diaActual())),
    }];
    save();
    // Redibuja para que «Guardar como plantilla» refleje el lugar que queda:
    // con los cinco tomados tiene que quedar apagado.
    render();

    el.saveTemplateDialog.close();
    toast(`Plantilla «${nombre}» guardada`);
  });

  // El desplegable se cierra solo al elegir: lo hace el listener de
  // `#actions-options`, que cubre todo lo que abre un diálogo.
  el.saveTemplate.addEventListener('click', openSaveTemplate);

  function templateCard(tpl) {
    const card = elem('article', 'tpl');

    /* Con el relleno de la marca, igual que «Opciones»: es la acción principal
       de la ficha, y las dos son la entrada a lo mismo — sumar tareas al mes. */
    const add = boton('btn btn-brand tpl-add', { text: 'Agregar' });
    add.addEventListener('click', () => applyTemplate(tpl));

    /* Borrar vale para TODAS, también para las de fábrica: el tope es sobre el
       total, así que sin poder sacarlas los cinco lugares estarían casi llenos
       de entrada. Lo que se guarda de una de fábrica es su ausencia — ver
       `removedTemplates`. */
    const borrar = boton('btn icon-btn tpl-del', {
      text: '✕',
      title: `Borrar la plantilla «${tpl.name}»`,
      label: `Borrar la plantilla ${tpl.name}`,
    });
    borrar.addEventListener('click', () => borrarPlantilla(tpl));

    const head = elem('header', 'tpl-head');
    head.append(elem('h3', 'tpl-name', tpl.name), add, borrar);

    // Una plantilla propia puede no traer descripción: ahí el renglón queda
    // solo con la cuenta de tareas, en vez de terminar en un « · » suelto.
    const desc = elem('p', 'tpl-desc', [
      `${tpl.tasks.length} ${tpl.tasks.length === 1 ? 'tarea' : 'tareas'}`,
      tpl.description,
    ].filter(Boolean).join(' · '));

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

    const tasks = materialize(year, month);

    /* Se comparan contra los nombres que YA estaban EN ESE MES, con el mismo
       criterio que el alta —sin distinguir mayúsculas ni acentos—: dos tareas
       con el mismo nombre en un mes son indistinguibles, venga la segunda de
       una plantilla o del formulario.

       La lista crece con cada una que entra: una plantilla que repite un nombre
       adentro suyo tampoco puede meterlo dos veces. */
    const puestos = tasks.map(t => t.name);
    const afuera = [];

    let agregadas = 0;
    for (const item of tpl.tasks) {
      const task = templateTask(item, start);
      if (puestos.some(nombre => mismoNombre(nombre, task.name))) {
        afuera.push(task.name);
        continue;
      }
      tasks.push({ id: newId(), ...task });
      puestos.push(task.name);
      agregadas += 1;
    }
    save();
    el.templatesDialog.close();

    /* Se sigue a las tareas hasta donde fueron. Quedarse en el mes anterior
       dejaría un aviso de «6 tareas agregadas» sobre una pantalla en la que no
       cambió nada, que es indistinguible de un error. */
    // La fecha es obligatoria, así que siempre hay un día al que ir.
    irAlDia(parseDateKey(start));
    irA('home');

    /* El aviso nombra las que quedaron afuera en vez de contarlas: «2 ya
       estaban» obliga a ir a buscar cuáles, y con dos o tres nombres entra en
       la misma línea. */
    const cuales = afuera.length <= 3
      ? afuera.map(n => `«${n}»`).join(', ')
      : `${afuera.slice(0, 2).map(n => `«${n}»`).join(', ')} y ${afuera.length - 2} más`;

    if (!agregadas) {
      toast(`No se agregó ninguna: ${cuales} ya ${afuera.length === 1 ? 'estaba' : 'estaban'}`
        + ` en ${nombreMes}`);
    } else {
      toast(`${agregadas} tarea(s) agregadas a ${nombreMes}`
        + ` desde el ${fmtShort.format(parseDateKey(start))}`
        + (afuera.length
          ? ` · ${cuales} no, ${afuera.length === 1 ? 'ya estaba' : 'ya estaban'}`
          : ''));
    }
  }

  // ---------------------------------------------------------
  // Menú lateral
  // ---------------------------------------------------------

  function setDrawer(open) {
    /* Sin cambio no se toca el foco. Varios caminos cierran el cajón y a
       continuación abren un diálogo; un segundo cierre —el del manejador
       general de abajo— devolvería el foco al ☰ y se lo sacaría al diálogo
       recién abierto. Y desde la barra del pie sería mandarlo al otro extremo
       de la pantalla sin que nadie lo haya pedido. */
    if (open === document.body.classList.contains('drawer-open')) return;

    document.body.classList.toggle('drawer-open', open);
    el.menu.setAttribute('aria-expanded', String(open));
    if (open) $('#btn-menu-close').focus();
    else el.menu.focus();
  }

  /* Elegir algo del cajón lo cierra: todo lo que hay adentro abre un diálogo o
     pone la lista en una postura, y en los dos casos hay que ver lo que quedó
     atrás. */
  el.drawer.addEventListener('click', e => {
    /* El resumen de «Selección masiva» abre el grupo: cerrar el cajón ahí
       escondería justo lo que se acaba de desplegar. */
    if (e.target.closest('summary')) return;
    if (e.target.closest('.drawer-item')) setDrawer(false);
  });

  el.menu.addEventListener('click', () => setDrawer(true));
  el.pendMenu.addEventListener('click', () => setDrawer(true));
  $('#btn-menu-close').addEventListener('click', () => setDrawer(false));
  el.drawerBackdrop.addEventListener('click', () => setDrawer(false));

  /* Cambiar de sección es el mismo gesto venga de donde venga —la barra del pie
     o el cajón—, así que las dos zonas comparten manejador. */
  function navegarSeccion(e) {
    const item = e.target.closest('[data-page]');
    if (!item) return;

    // Son enlaces de verdad: ctrl/cmd/rueda abren la sección en otra pestaña.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    /* La guía es una por sección, y la que se abre es la de la sección desde la
       que se tocó. Hay que anotarlo ANTES de cambiar de página: después
       `ui.page` ya es 'help' y no queda de dónde vino. */
    if (item.dataset.page === 'help' && NOMBRE_DE_GUIA[ui.page]) ui.guia = ui.page;

    e.preventDefault();
    setDrawer(false);
    irA(item.dataset.page);
  }

  el.tabbar.addEventListener('click', navegarSeccion);
  el.drawer.addEventListener('click', navegarSeccion);

  el.templates.addEventListener('click', () => {
    setDrawer(false);
    openTemplates();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('drawer-open')) setDrawer(false);
  });

  // ---------------------------------------------------------
  // Recordatorio diario
  // ---------------------------------------------------------
  //  Una notificación del sistema a la hora elegida, todos los días.
  //
  //  El aviso lo manda un servidor —una Edge Function que dispara `pg_cron`
  //  cada cinco minutos— y no la app: una página web, aunque esté instalada,
  //  NO PUEDE DESPERTARSE SOLA a una hora fija. La API que servía para eso
  //  (Notification Triggers) fue un experimento de Chrome que se retiró. Por
  //  eso todo esto es una suscripción de Web Push y no un temporizador.
  //
  //  Acá vive la mitad del cliente: pedir permiso, suscribirse y guardar la
  //  preferencia. La otra mitad está en `supabase/functions/recordatorios/`.

  /** A qué hora se propone avisar mientras nadie elija otra cosa. */
  const HORA_POR_OMISION = '22:00';

  /** Preferencia tal como está en la base. `null` mientras no se leyó. */
  let recordatorio = null;

  /** Ya se consultó la base. Evita repetir la lectura en cada render. */
  let recordatorioLeido = false;

  const soportaPush = () => 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

  const clavePublica = () => {
    const v = window.VAPID_PUBLIC_KEY;
    return typeof v === 'string' && v && !v.startsWith('PEGAR') ? v : null;
  };

  /** base64url → Uint8Array, que es lo que pide `applicationServerKey`. */
  function claveComoBytes(b64) {
    const normal = b64.replace(/-/g, '+').replace(/_/g, '/');
    const crudo = atob(normal.padEnd(normal.length + ((4 - (normal.length % 4)) % 4), '='));
    return Uint8Array.from(crudo, c => c.charCodeAt(0));
  }

  /**
   * Por qué no se puede usar el recordatorio, o `''` si sí se puede.
   * Cada motivo se dice entero: «no disponible» a secas manda a adivinar.
   */
  function motivoSinRecordatorio() {
    if (!soportaPush()) {
      return 'Este navegador no admite notificaciones. En iPhone hay que '
        + 'instalar la app desde Safari («Compartir → Agregar a inicio»).';
    }
    if (!clavePublica()) {
      return 'Falta configurar la clave VAPID en config.js. '
        + 'Se genera con «npm run vapid».';
    }
    if (!window.supabaseClient || !currentUserId) {
      return 'Hay que iniciar sesión para programar el recordatorio.';
    }
    if (Notification.permission === 'denied') {
      return 'Bloqueaste las notificaciones para este sitio. Hay que '
        + 'habilitarlas desde los ajustes del navegador.';
    }
    return '';
  }

  async function leerRecordatorio() {
    if (!window.supabaseClient || !currentUserId) return null;
    try {
      const { data, error } = await window.supabaseClient
        .from('push_reminders')
        .select('activo, hora')
        .eq('user_id', currentUserId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { activo: false, hora: HORA_POR_OMISION };
    } catch (err) {
      console.error('No se pudo leer el recordatorio', err);
      return null;
    }
  }

  /**
   * Registra este dispositivo para recibir push.
   *
   * La suscripción es POR NAVEGADOR: activar el recordatorio en el teléfono no
   * lo activa en la computadora, y por eso la tabla guarda un endpoint por
   * dispositivo mientras que la hora es una sola, del usuario.
   */
  async function suscribirDispositivo() {
    const reg = await navigator.serviceWorker.ready;

    /* `userVisibleOnly` es obligatorio en Chrome: promete que cada push va a
       mostrar algo. Es también la razón por la que el service worker SIEMPRE
       llama a `showNotification`. */
    const sub = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveComoBytes(clavePublica()),
      });

    const json = sub.toJSON();
    const { error } = await window.supabaseClient
      .from('push_subscriptions')
      .upsert({
        user_id: currentUserId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      }, { onConflict: 'endpoint' });

    if (error) throw error;
  }

  /**
   * Guarda la preferencia. El desfase horario se reescribe SIEMPRE, no solo al
   * activar: si la persona viaja o entra el horario de verano, la hora que ve
   * en su reloj tiene que seguir siendo la que recibe.
   */
  async function guardarRecordatorio(activo, hora) {
    const { error } = await window.supabaseClient
      .from('push_reminders')
      .upsert({
        user_id: currentUserId,
        activo,
        hora,
        utc_offset: new Date().getTimezoneOffset(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw error;
    recordatorio = { activo, hora };
  }

  function mostrarErrorRecordatorio(texto) {
    el.reminderError.textContent = texto;
    el.reminderError.hidden = !texto;
  }

  /** El campo de hora solo tiene sentido con el recordatorio activo. */
  function syncRecordatorioForm() {
    el.reminderTimeField.hidden = !el.reminderOn.checked;
  }

  el.reminderOn.addEventListener('change', syncRecordatorioForm);

  async function openReminder() {
    mostrarErrorRecordatorio('');
    el.reminderHint.hidden = true;

    const motivo = motivoSinRecordatorio();
    el.reminderOn.disabled = Boolean(motivo);
    el.reminderSave.disabled = Boolean(motivo);
    if (motivo) mostrarErrorRecordatorio(motivo);

    if (!motivo) {
      recordatorio = await leerRecordatorio();
      if (!recordatorio) {
        mostrarErrorRecordatorio('No se pudo leer la configuración. Revisá la conexión.');
        el.reminderSave.disabled = true;
      }
    }

    el.reminderOn.checked = Boolean(recordatorio?.activo);
    // La hora viene de Postgres como `HH:MM:SS`; el campo quiere `HH:MM`.
    el.reminderTime.value = String(recordatorio?.hora ?? HORA_POR_OMISION).slice(0, 5);
    syncRecordatorioForm();

    el.reminderDialog.showModal();
  }

  el.reminderForm.addEventListener('submit', async e => {
    e.preventDefault();
    mostrarErrorRecordatorio('');

    const activo = el.reminderOn.checked;
    const hora = el.reminderTime.value;
    if (activo && !/^\d{2}:\d{2}/.test(hora)) {
      return mostrarErrorRecordatorio('Elegí una hora.');
    }

    el.reminderSave.disabled = true;
    const rotulo = el.reminderSave.textContent;
    el.reminderSave.textContent = 'Un momento…';

    try {
      if (activo) {
        /* El permiso se pide RECIÉN ACÁ, cuando ya se sabe que la persona lo
           quiere. Pedirlo al abrir la app es la forma más rápida de que lo
           rechacen para siempre. */
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') {
          mostrarErrorRecordatorio(permiso === 'denied'
            ? 'Bloqueaste las notificaciones. Hay que habilitarlas desde los ajustes del navegador.'
            : 'Hace falta permitir las notificaciones para activar el recordatorio.');
          return;
        }
        await suscribirDispositivo();
      }

      await guardarRecordatorio(activo, hora.slice(0, 5));
      el.reminderDialog.close();
      renderReminderBadge();
      toast(activo
        ? `Te vamos a recordar completar el día a las ${hora.slice(0, 5)}`
        : 'Recordatorio desactivado');
    } catch (err) {
      console.error('No se pudo guardar el recordatorio', err);
      mostrarErrorRecordatorio('No se pudo guardar. Revisá la conexión y probá de nuevo.');
    } finally {
      el.reminderSave.disabled = false;
      el.reminderSave.textContent = rotulo;
    }
  });

  // ---- El ofrecimiento, una sola vez por aparato -------------------------

  /**
   * Se ofrece cuando se puede aceptar y todavía no está resuelto: con soporte,
   * con sesión, sin haberlo ofrecido antes acá, sin el permiso ya denegado y
   * sin un recordatorio ya activo.
   *
   * Mientras `recordatorio` sea `null` no se muestra: es lo que se está
   * leyendo de la base al arrancar, y ofrecer algo que quizás ya esté activo
   * sería preguntar dos veces.
   */
  function puedeOfrecerRecordatorio() {
    return !state.recordatorioOfrecido
      && !motivoSinRecordatorio()
      && recordatorio !== null
      && !recordatorio.activo;
  }

  function renderNudge() {
    /* Si todavía no se sabe qué hay guardado, se pide. El arranque ya lo
       intenta, pero puede haber salido temprano —sin sesión resuelta, sin red—
       y sin este reintento la insignia del menú quedaría vacía para siempre y
       el recordatorio no se ofrecería nunca. Se intenta UNA vez: dispararlo en
       cada render sería una consulta por cada clic de la planilla. */
    if (!recordatorioLeido && !motivoSinRecordatorio()) void cargarRecordatorio();

    el.nudge.hidden = !(ui.page === 'home' && puedeOfrecerRecordatorio());
  }

  /** Se ofreció y ya está: no se vuelve a preguntar en este aparato. */
  function cerrarNudge() {
    state.recordatorioOfrecido = true;
    savePrefs();
    renderNudge();
  }

  el.nudgeNo.addEventListener('click', cerrarNudge);

  el.nudgeSi.addEventListener('click', async () => {
    el.nudgeSi.disabled = true;
    try {
      /* El permiso se pide con el clic, que es el gesto que el navegador
         exige y el momento en que la persona ya dijo que sí. */
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        // Si lo rechaza, no se insiste: se cierra igual que con «Ahora no».
        cerrarNudge();
        toast('Sin permiso no se puede avisar. Se puede activar más tarde desde el menú.');
        return;
      }

      await suscribirDispositivo();
      await guardarRecordatorio(true, HORA_POR_OMISION);
      cerrarNudge();
      renderReminderBadge();
      toast(`Listo: te avisamos a las ${HORA_POR_OMISION}`);
    } catch (err) {
      console.error('No se pudo activar el recordatorio', err);
      toast('No se pudo activar. Probá desde el menú, en «Recordatorio diario».');
    } finally {
      el.nudgeSi.disabled = false;
    }
  });

  /**
   * Lee la preferencia al arrancar, sin bloquear nada.
   *
   * Sirve para dos cosas: decidir si ofrecer el recordatorio, y llenar la
   * insignia del menú — que antes quedaba vacía hasta abrir el diálogo, aunque
   * el recordatorio estuviera activo.
   */
  async function cargarRecordatorio() {
    if (motivoSinRecordatorio() || recordatorioLeido) return;

    // Se marca ANTES de la lectura: si no, los renders que ocurran durante el
    // `await` dispararían una consulta cada uno.
    recordatorioLeido = true;
    recordatorio = await leerRecordatorio();

    // Una lectura fallida no deja el intento hecho: se puede volver a probar
    // en el próximo render, que es cuando la red pudo haber vuelto.
    if (!recordatorio) recordatorioLeido = false;

    renderReminderBadge();
    renderNudge();
  }

  /** La hora, junto a la entrada del menú, para no tener que abrir el diálogo. */
  function renderReminderBadge() {
    const activo = Boolean(recordatorio?.activo);
    el.reminderBadge.textContent = activo
      ? String(recordatorio.hora).slice(0, 5)
      : '';
    el.reminderBadge.hidden = !activo;
  }

  el.reminder.addEventListener('click', () => {
    setDrawer(false);
    void openReminder();
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
    el.confirmOk.classList.add('btn-danger');
    el.confirmOk.classList.remove('btn-brand');
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
    /* Cuál de los dos dibujos se ve lo decide la hoja, con `data-theme`. Acá
       queda lo que no es de la hoja: cómo se nombra. */
    el.theme.title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    el.theme.setAttribute('aria-label', el.theme.title);

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
    savePrefs();
    applyTheme();
  });

  // ---------------------------------------------------------
  // Atajos de teclado
  // ---------------------------------------------------------

  document.addEventListener('keydown', e => {
    /* Con el cajón abierto los atajos quedan en suspenso: mover el día por
       detrás del menú es desconcertante. Esc lo cierra, más arriba.

       `matches?.` porque el blanco de un keydown no siempre es un elemento: sin
       nada enfocado puede ser el propio `document`, que no tiene ese método. */
    if (e.target.matches?.('input, textarea') || document.querySelector('dialog[open]')
      || document.body.classList.contains('drawer-open')) return;

    if (e.key === 'ArrowLeft') { shiftRangeOrMonth(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { shiftRangeOrMonth(1); e.preventDefault(); }
    // Dar de alta una tarea solo tiene sentido con la lista a la vista.
    else if ((e.key === 'n' || e.key === 'N') && ui.page === 'home') {
      openTaskDialog();
      e.preventDefault();
    } else if (e.key === 't' || e.key === 'T') { goToToday(); e.preventDefault(); }
  });

  /* Mueve el día elegido. Las teclas ← → mandan ±1 y las flechas del carrete
     ±CARRETE, que es pasar de página. */
  function shiftRangeOrMonth(delta) {
    // Fuera del Diario no hay carrete que mover: ahí las teclas cambian de mes,
    // y ahí el salto es de UN mes venga el delta que venga.
    if (ui.page !== 'home') goToMonth(Math.sign(delta));
    else irAlDia(addDays(diaActual(), delta));
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
      months: {}, status: {}, trash: [],
      pendientes: { categorias: conVarios([]), items: [], papelera: [] },
      theme: state.theme,   // el tema es de la pantalla, no del usuario
    };
  }

  window.Habitos = {
    /** Llamado por auth.js cuando hay sesión. */
    async start(user) {
      adoptarDatosPrevios();
      await hydrateStateForUser(user);
      applyTheme();

      // Se abre en hoy, que es el día que se va a cargar.
      ui.year = today.getFullYear();
      ui.month = today.getMonth();
      ui.day = dateKey(today);
      ui.selected.clear();
      ui.diasEditables.clear();
      programarMedianoche();

      // Los enlaces de sección se apuntan acá —barra del pie y cajón—: `BASE`
      // solo se conoce en runtime.
      for (const item of document.querySelectorAll('a[data-page]')) {
        item.href = urlDe(item.dataset.page);
      }

      /* Respeta la sección que pide la URL, así un enlace compartido abre donde
         corresponde. `reemplazar` normaliza de paso el desvío de `404.html`.

         La guía primero: son tres, una por sección, y de cuál se trata lo dice
         la ruta. Sin esto, entrar por `/comousar-pendientes` abría la de
         Hábitos, que es el valor con el que arranca. */
      ui.guia = guiaDeUrl();
      irA(pageDeUrl(), { reemplazar: true });

      /* Sin `await`: la planilla ya está dibujada y esto solo decide si se
         ofrece el recordatorio y qué dice la insignia del menú. Que tarde, o
         que falle por falta de red, no puede demorar el arranque. */
      void cargarRecordatorio();
    },

    /** Llamado al cerrar sesión: no queda nada del usuario anterior en memoria. */
    stop() {
      clearTimeout(relojDia);
      currentUserId = null;
      currentUserEmail = null;
      sombraRemota = null;
      state = estadoVacio();
      ui.selected.clear();
      ui.diasEditables.clear();
      el.diaLista.innerHTML = '';
      el.charts.innerHTML = '';
      STORAGE_KEY = STORAGE_BASE;
    },
  };
})();
