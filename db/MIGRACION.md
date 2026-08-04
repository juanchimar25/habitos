# Migración a Supabase — plan por etapas

Objetivo: login con usuarios y datos en Postgres, manteniendo el uso desde varios dispositivos.

El plan está armado para que **cada etapa deje la app funcionando**. Se puede parar después de
cualquiera de ellas y tener algo usable.

## Dónde estamos

| Etapa | Estado |
|---|---|
| 0 — Preparar el terreno | ✅ hecha |
| 1 — Hosting | ✅ hecha (Vercel, con fallbacks para Netlify y GitHub Pages) |
| 2 — Login | ✅ hecha ([`auth.js`](../auth.js)) |
| 3 — Persistencia contra Postgres | ⏳ **a medias** — ver abajo |
| 4 — Offline | ⏸ sin empezar |

La etapa 3 se resolvió por un **atajo**: en vez de las tablas de [`schema.sql`](schema.sql), hoy
existe una sola tabla `app_state` ([`supabase-app-state.sql`](supabase-app-state.sql)) con una
fila por usuario y todo el estado en un `jsonb`. `save()` sigue volcando el estado completo, solo
que ahora también contra la red.

Eso ya da lo que importaba —los datos sobreviven a cambiar de navegador o de equipo—, y por eso
no urge terminar. Lo que queda pendiente es lo que el atajo no resuelve:

- **Cada clic sube el estado entero.** Con pocos meses es imperceptible; el problema crece con
  el historial, no con el uso.
- **Entre dispositivos gana el último que escribe**, y pisa el mes entero, no la celda.
  Sin `updated_at` por fila no hay forma de mezclar.

`schema.sql` es el destino de esa etapa. Está escrito y comentado, pero **ninguna de sus tablas
se usa todavía**: `app.js` no las conoce.

---

## Etapa 0 — Preparar el terreno (sin tocar la app)

1. Crear el proyecto en Supabase.
2. Ejecutar el esquema en el SQL Editor. Para poner la app en marcha hoy, el que hace falta es
   [`supabase-app-state.sql`](supabase-app-state.sql); [`schema.sql`](schema.sql) es el destino de
   la etapa 3 y todavía no lo consulta nadie.
3. **Probar RLS con dos cuentas reales.** Registrar dos usuarios, cargar datos con cada uno y
   verificar desde el cliente que ninguno ve los del otro. No alcanza con leer las policies:
   el error clásico —omitir `with check`— no se nota leyendo, se nota cuando alguien inserta
   una fila con el `user_id` ajeno.
4. Anotar la URL del proyecto y la **anon key**. Es pública por diseño: puede ir en el HTML.
   La `service_role` key **nunca** va al cliente.

> **Nada de esto toca el código.** Si la etapa 0 sale mal, no perdiste nada.

---

## Etapa 1 — Hosting

`file://` deja de alcanzar: los redirects de autenticación y CORS exigen `http(s)`.

- Publicar en Netlify, Vercel o GitHub Pages. Los tres son gratis y sirven estáticos tal cual.
- Registrar la URL en Supabase → Authentication → URL Configuration.

Después de esta etapa la app sigue funcionando igual que hoy, solo que servida.

---

## Etapa 2 — Login

Nuevo archivo `auth.js`, sin build step:

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

Cambios en la app:

- Pantalla de login antes de renderizar la planilla (email + contraseña, o link mágico).
- **"Cerrar sesión" en el menú lateral**, junto a Exportar / Importar.
- El arranque pasa a ser asíncrono: hoy es `load(); applyTheme(); render();` y necesita un
  estado intermedio de "cargando" mientras se resuelve la sesión.

Al terminar esta etapa hay login pero los datos siguen en `localStorage`, por usuario.
Ya es útil: podés separar tus datos de los de otra persona en la misma máquina.

---

## Etapa 3 — Persistencia contra Postgres

**Esta es la etapa grande.** El resto son horas; esta son días.

> **Hecha a medias, por un atajo.** Hoy el estado sí viaja a Postgres, pero entero y a una sola
> tabla `app_state`. Todo lo que sigue describe el trabajo que queda para llegar a `schema.sql`.

### El problema

`save()` serializa **el estado completo** y lo escribe. Contra `localStorage` es instantáneo y
no importa. Contra la red, mandar más de un megabyte cada vez que hacés clic en una celda es
inviable — y es exactamente lo que hace hoy `syncToSupabase()`, que es la deuda que esta etapa
viene a pagar.

### El refactor

La capa de persistencia pasa de "volcar todo" a **operaciones**:

| Hoy | Después |
|---|---|
| `save()` tras mutar `state` | `upsertEntry(taskId, day, status)` |
| | `deleteEntries(taskIds, month)` |
| | `saveTasks(month, tasks)` |
| | `setLocked(month, bool)` |
| | `savePreferences({...})` |

Los ~15 puntos de mutación hoy modifican `state` y llaman a `save()`; tienen que además
expresar **qué** cambió.

La buena noticia: `save()`, `load()` y `normalize()` son un cuello de botella único —
toda la I/O pasa por ahí— así que la superficie a tocar está acotada.

### UI optimista

No poner `await` delante de cada clic. El patrón:

1. Mutar el estado local y repintar **ya**.
2. Encolar la escritura.
3. Si falla, revertir y avisar con el toast que ya existe.

`localStorage` deja de ser la base de datos y pasa a ser caché + cola de pendientes.

### Migrar los datos que ya tenés

Sale gratis: `normalize()` y el JSON de exportación ya resuelven el formato. El importador
existente sirve tal cual como camino de migración — se exporta desde la versión vieja y se
importa en la nueva, que escribe contra Postgres en lugar de `localStorage`.

Con el atajo ya en marcha hay un camino todavía más corto: el `payload` de `app_state` **es** ese
mismo JSON, así que la conversión puede hacerse de una vez y del lado del servidor, leyendo cada
fila y repartiéndola en las tablas de `schema.sql`, sin pedirle a nadie que exporte nada.

Conversiones a tener en cuenta:

| Cliente | Postgres |
|---|---|
| `"2026-07"` | `'2026-07-01'::date` |
| `"idTarea\|2026-07-15"` | fila en `entries` con `task_id` y `day` |
| `months["2026-11"] = []` | fila en `months` con `materialized = true` y cero `tasks` |
| `locked["2026-07"] = true` | `months.locked = true` |

La tercera fila de esa tabla es la que produce un bug silencioso si se pasa por alto: sin la
bandera `materialized`, un mes vaciado a propósito vuelve a heredar las tareas del anterior.

---

## Etapa 4 — Offline (opcional, y probablemente después)

Un diario de hábitos se marca en el celular, a veces sin señal.

- Cola de operaciones pendientes en `localStorage`, drenada al recuperar conexión.
- Conflictos: **gana la última escritura** por `updated_at` (el trigger ya está en el esquema).
  En este dominio alcanza, porque las entradas están claveadas por (tarea, día) y las ediciones
  son puntuales e idempotentes. No es una afirmación general sobre sincronización: es que este
  modelo de datos tiene la suerte de comportarse casi como un CRDT.

**Sugerencia: no hacer esta etapa hasta que moleste.** Puede que nunca moleste.

---

## Esfuerzo estimado

| Etapa | |
|---|---|
| 0 — Esquema y RLS probados | ~medio día |
| 1 — Hosting | ~1 hora |
| 2 — Login | ~1 día |
| 3 — **Persistencia** | **2–4 días** |
| 4 — Offline | 1–2 días |

---

## Riesgos, ordenados por gravedad

1. **RLS mal configurada.** Es la única barrera entre usuarios. Se prueba con dos cuentas, no
   leyendo el SQL.
2. **El refactor de persistencia toca todos los puntos de mutación.** Es donde se cuelan los
   bugs de "guardé pero no se ve" o "se ve pero no se guardó".
3. **El proyecto gratuito de Supabase se pausa tras 7 días sin actividad** y hay que reactivarlo
   a mano. Para una app que abrís todos los días es irrelevante, pero conviene saberlo antes de
   depender de ella.
4. **Se pierde `file://`.** La app deja de funcionar con doble clic; siempre necesita estar
   publicada. Es el costo real de la migración.
