/* Datos de prueba: un mes cargado a mano que ejerza todas las ramas
   del render —frecuencias distintas, los cuatro estados, fecha de
   inicio, mes anterior con datos para el indicador comparativo. */

const MES = '2026-07';
const MES_PREVIO = '2026-06';

const TAREAS = [
  { id: 't1', name: 'Leer', freq: 'daily', customMode: 'weekdays', weekdays: [], target: 12, start: null },
  { id: 't2', name: 'Correr', freq: 'weekly', customMode: 'weekdays', weekdays: [], target: 12, start: null },
  { id: 't3', name: 'Inglés', freq: 'custom', customMode: 'weekdays', weekdays: [1, 3, 5], target: 12, start: null },
  { id: 't4', name: 'Gimnasio', freq: 'custom', customMode: 'count', weekdays: [], target: 8, start: null },
  { id: 't5', name: 'Meditar', freq: 'daily', customMode: 'weekdays', weekdays: [], target: 12, start: '2026-07-10' },
];

/** Estados repartidos para que aparezcan los cuatro glifos y varios niveles. */
function estados() {
  const s = {};
  const ciclo = ['done', 'done', 'partial', 'missed', null, 'done'];
  for (let dia = 1; dia <= 29; dia++) {
    const iso = `${MES}-${String(dia).padStart(2, '0')}`;
    TAREAS.forEach((t, i) => {
      const v = ciclo[(dia + i) % ciclo.length];
      if (v) s[`${t.id}|${iso}`] = v;
    });
  }
  // Un "no requerido" explícito sobre una tarea que lo admite.
  s['t3|2026-07-06'] = 'skip';
  // Mes anterior, para que el indicador comparativo tenga con qué comparar.
  for (let dia = 1; dia <= 30; dia++) {
    const iso = `${MES_PREVIO}-${String(dia).padStart(2, '0')}`;
    if (dia % 3) s[`t1|${iso}`] = 'done';
    if (dia % 4 === 0) s[`t2|${iso}`] = 'partial';
  }
  return s;
}

export const ESTADO_LLENO = {
  months: {
    [MES_PREVIO]: [TAREAS[0], TAREAS[1]],
    [MES]: TAREAS,
  },
  status: estados(),
  locked: {},
  complianceMode: 'glyph',
  panels: { tiles: true, charts: true },
  theme: 'light',
};

export const ESTADO_VACIO = {
  months: {}, status: {}, locked: {},
  complianceMode: 'glyph',
  panels: { tiles: true, charts: true },
  theme: 'light',
};

export const ESTADO_BLOQUEADO = {
  ...ESTADO_LLENO,
  locked: { [MES]: true },
};

/* Formato viejo: una única lista global de tareas, sin `months`. normalize()
   la ancla al mes más antiguo que aparezca en los estados. */
export const ESTADO_LEGADO = {
  tasks: [TAREAS[0], TAREAS[1], TAREAS[2]],
  status: {
    't1|2026-06-02': 'done',
    't1|2026-07-15': 'partial',
    't2|2026-07-16': 'missed',
  },
  locked: {},
  theme: 'light',
};

/* Basura deliberada: tipos equivocados en cada campo. Sirve para verificar
   que las guardas de normalize() sigan descartando exactamente lo mismo. */
export const ESTADO_SUCIO = {
  months: {
    '2026-07': [
      TAREAS[0],
      null,
      { name: '   ' },                                    // nombre vacío
      { name: 'Sin id', freq: 'inventada', target: 999 }, // frecuencia y meta fuera de rango
      { name: 'Custom sin días', freq: 'custom', customMode: 'weekdays', weekdays: [] },
      { name: 'Días raros', freq: 'custom', customMode: 'weekdays', weekdays: [9, -1, 2, 2] },
    ],
    'mes-invalido': [TAREAS[1]],
    '2026-08': 'no es una lista',
  },
  status: ['done', 'partial'],        // arreglo donde iba un diccionario
  locked: ['2026-07'],                // idem
  complianceMode: 'inventado',
  panels: 'tampoco es un objeto',
  theme: 'fucsia',
};
