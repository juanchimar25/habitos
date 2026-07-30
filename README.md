# Tareas diarias

Webapp responsive para llevar un seguimiento mensual de tareas/hábitos en una planilla de doble entrada: **las filas son las tareas y las columnas los días del mes**.

Sin dependencias, sin build, sin backend: HTML + CSS + JavaScript puro. Se abre haciendo doble clic en `index.html`.

## Cómo usarla

```
tareas-diarias/
├── index.html
├── styles.css
├── app.js       ← la planilla y todo lo que la rodea
├── auth.js      ← la sesión (Supabase Auth)
├── config.js    ← ⚠ acá van tus credenciales
├── db/
│   ├── supabase-app-state.sql  ← la tabla que la app usa hoy
│   ├── schema.sql              ← el esquema por tablas (etapa futura)
│   └── MIGRACION.md
└── README.md
```

> **La app ya no se abre con doble clic.** `auth.js` es un módulo ES y el navegador los
> bloquea sobre `file://`. Hay que servirla por http(s) — ver abajo.

## Puesta en marcha

**1. Crear el proyecto en Supabase.** En [supabase.com](https://supabase.com), proyecto nuevo.

**2. Crear la tabla de datos.** Copiar [`db/supabase-app-state.sql`](db/supabase-app-state.sql)
entero en el *SQL Editor* y ejecutarlo. **Este paso es obligatorio**: es la tabla donde la app
guarda tus tareas. El script termina con una consulta de comprobación que tiene que devolver
**una fila**; si devuelve cero, la política de Row Level Security no quedó creada y la base va a
rechazar todo, incluso al dueño de los datos.

[`db/schema.sql`](db/schema.sql) es otra cosa: el esquema normalizado por tablas de la
**etapa 3** de [`db/MIGRACION.md`](db/MIGRACION.md), que la app todavía no usa. No hace falta
cargarlo para que funcione.

**3. Pegar las credenciales.** En *Project Settings → API* están la **URL** y la **anon key**.
Van en `config.js`:

```js
window.SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

La *anon key* es pública por diseño y puede vivir en el navegador: lo que protege los datos es
Row Level Security. La **service role key nunca va acá**.

**4. Servirla.** En local, `npx serve . --single` y abrir la URL que imprime. Para usarla de
verdad, publicarla en Netlify, Vercel o GitHub Pages —los tres gratis— y registrar esa URL en
*Authentication → URL Configuration* de Supabase.

El `--single` importa: cada sección tiene su propia dirección (ver **Rutas**) y el servidor
tiene que devolver `index.html` en todas.

Si `config.js` sigue con los valores de ejemplo, la pantalla de login lo dice en lugar de fallar
en silencio.

## Rutas

Las tres secciones tienen dirección propia, se pueden compartir y responden a los botones de
atrás y adelante del navegador:

| Sección | Dirección |
| --- | --- |
| Diario | `/diario` |
| Análisis | `/analisis` |
| Cómo usar | `/comousar` |

Sigue siendo **una sola página**: `app.js` reescribe la URL con la History API y muestra la
sección correspondiente. Cualquier ruta desconocida cae en Diario.

Eso obliga al servidor a devolver `index.html` ante cualquier ruta, porque los archivos
`/diario` y `/analisis` no existen en disco. Ya viene resuelto para los tres hostings del paso 4:

- **Netlify** → `_redirects`
- **Vercel** → `vercel.json`
- **GitHub Pages** → `404.html`, que no sabe reescribir y rebota a la raíz pasando la ruta como
  parámetro; el router la traduce y limpia la URL.

En un subdirectorio (`usuario.github.io/repo/`) también funciona: la app deduce su carpeta de la
URL de `app.js`, así que las rutas quedan `/repo/diario` y compañía.

## Sesión

La app pide iniciar sesión antes de mostrar nada. Se puede **crear cuenta** desde la misma
pantalla; si el proyecto tiene la confirmación por mail activada, avisa que hay que revisar el
correo. Los mensajes de error de Supabase se muestran traducidos.

Al pie del menú lateral aparecen el **email de la sesión** y **Cerrar sesión**.

Si ya tenías un diario cargado de antes de que existiera el login, la primera cuenta que entre
lo adopta en lugar de empezar vacía.

## Dónde viven los datos

Se guardan en **dos lados a la vez**:

- **Supabase**, tabla `app_state`: una fila por usuario con todo el estado en un `jsonb`. Es la
  copia buena, la que sobrevive a cambiar de navegador, de equipo o de dominio.
- **localStorage**, bajo `tareas-diarias/v1/<id de usuario>`: copia local, atada al navegador
  **y al dominio**. Dos cuentas en la misma máquina no comparten diario.

Al iniciar sesión se lee Supabase primero. Si la cuenta no tiene nada allá, sube la copia local.

**Si la base no contesta, la app no escribe.** Se queda en modo local, avisa en pantalla y no
sincroniza hasta que recargues. Es a propósito: subir el estado que quedó en memoria sin haber
podido leer el remoto reemplazaría datos del servidor a ciegas.

> Ese aviso importa. Antes, un fallo de Supabase solo dejaba un `console.error` y la app seguía
> como si nada, guardando únicamente en el navegador. Al cambiar de dominio o de navegador, esos
> datos quedaban fuera de alcance sin que nada lo hubiera advertido.

La causa más probable de que la base rechace todo es que **falte la política de RLS** — ver la
consulta de comprobación al final de [`db/supabase-app-state.sql`](db/supabase-app-state.sql).

> **Todavía falta el paso grande.** Hoy la sesión es real pero los datos son locales: entrar
> desde otro dispositivo muestra un diario vacío. Llevar los datos a Postgres es la
> **Etapa 3** de [`db/MIGRACION.md`](db/MIGRACION.md), y es la más costosa: obliga a convertir el
> guardado de «volcar todo el estado» a operaciones puntuales.

## Funcionalidad

### Tareas

Cada tarea tiene **nombre** y **frecuencia**.

El nombre se guarda con la **primera letra en mayúscula**, sin importar qué venga antes: `hola` queda como `Hola` y `134+ hola` como `134+ Hola`. La transformación se aplica al salir del campo y al guardar, y también a los nombres que vengan de un archivo importado.

> **La frecuencia define la meta, no una restricción.** Cualquier día del mes se puede marcar, para cualquier tarea y las veces que haga falta. Si un día hacés algo que no estaba planificado, lo cargás igual y suma.

| Frecuencia | Meta en el mes |
|---|---|
| Diaria | Un punto por día |
| Lunes a viernes | Un punto por día hábil |
| Semanal | Un punto por semana (de lunes a domingo): 4 a 6 según el mes |
| Quincenal | Un punto por quincena — del 1 al 15 y del 16 a fin de mes: 2 |
| Mensual | Un punto en todo el mes: 1 |
| Personalizado | Según el submodo, ver abajo |

**Personalizado** tiene dos formas de medirse:

- **Días fijos de la semana** — elegís los días (L M X J V S D) y la meta es un punto por cada uno que caiga en el mes.
- **Meta mensual, sin días fijos** — cargás un número (*12 veces al mes*) y no indicás días. Ningún día queda como requerido: hacés la tarea cuando puedas y la marcás ahí.

  En vistas más chicas la meta se reparte proporcionalmente entre los días elegibles: 12 al mes son `12 × 7/31 ≈ 2,7` en una semana. En la vista mensual siempre muestra el número exacto que cargaste.

### Fecha de inicio

Cada tarea puede tener una **fecha de inicio** opcional. Antes de esa fecha la tarea no existe:

- Los días anteriores **no se pueden marcar** y aparecen como no requeridos.
- No cuentan para la meta: una tarea diaria que arranca el 15 de julio tiene meta 17, no 31.
- Si el inicio cae en un mes posterior al que estás mirando, la tarea no tiene meta ahí y su cumplimiento muestra `sin meta`.

Si ya habías marcado días que después quedan antes del inicio, dejan de mostrarse y de sumar, pero **el dato no se borra**: si corrés la fecha hacia atrás o la quitás, vuelven a aparecer.

La fecha de inicio no se escribe en la fila de la tarea para no alargarla; se ve al pasar el mouse sobre la frecuencia y al editar la tarea.

Como marcar de más está permitido, **los puntos pueden superar la meta**: una tarea semanal marcada tres veces en una semana suma 3, y su cumplimiento da 300%.

Cada fila tiene, en la columna de tareas: un **casillero** para seleccionarla, los chevrones **▲ ▼** para subir o bajar la tarea de posición y **✎** para editarla. El orden se guarda junto con los datos.

También se puede **arrastrar una tarea tomándola del nombre** para reordenarla. Una línea de acento marca dónde va a caer según de qué lado del medio de la fila esté el puntero. La fila solo se vuelve arrastrable mientras el puntero apoya sobre el nombre: si no, arrastrar desde una celda de estado movería la tarea sin querer. Los chevrones siguen ahí porque el arrastre no funciona en pantallas táctiles. Al pie de la planilla hay siempre una fila **+ Agregar tarea**, además del botón del encabezado. Para borrar se usa el casillero (ver abajo).

### Acciones sobre varias tareas

Al tildar **una o más** casillas las filas quedan resaltadas y aparecen dos botones en la barra de acciones del mes, junto a *Copiar tareas del mes anterior*:

| Botón | Qué hace |
|---|---|
| **🗑 Eliminar N tareas** | Saca esas tareas del mes visible junto con sus estados de ese mes |
| **↺ Resetear estados** | Deja en «sin cargar» las celdas de esas filas **dentro del rango visible**, sin tocar las tareas |

El casillero junto al encabezado **Tareas** selecciona o deselecciona todas de una vez, y queda en estado intermedio si hay algunas tildadas pero no todas. Los dos botones piden confirmación y listan las tareas afectadas.

**El alcance de cada una es distinto, a propósito.** Eliminar saca la tarea del mes, así que borra sus estados de todo el mes. Resetear opera sobre **lo que estás viendo**: en vista semanal borra solo esa semana, en diaria solo ese día, en mensual el mes entero. El diálogo nombra el rango antes de confirmar y el tooltip del botón lo anticipa.

Ambas respetan el aislamiento entre meses. La selección se limpia al cambiar de mes, al bloquear el período y al completar cualquiera de las dos acciones.

### Estados y puntaje

Cada celda se cambia haciendo **clic**, que cicla entre los cuatro estados:

| Estado | Color | Puntos |
|---|---|---|
| Sin cargar | — | 0 |
| Cumplido ✓ | Verde | **1** |
| Parcial ~ | Amarillo | **0,5** |
| No cumplido ✕ | Rojo | **0** |
| No requerido – | Gris | sale de la meta |

### No requerido

El último estado del ciclo **saca ese día de la meta** en lugar de contarlo como fallado. Es para los días en que la tarea legítimamente no correspondía: un feriado en el que no trabajás ni estudiás, una licencia, un viaje.

Es un estado que **elegís**, no la ausencia de uno. Esa distinción es la que mantiene sana la métrica: si bastara con dejar la celda vacía para no ser penalizado, el ✕ pasaría a ser un botón que baja el promedio y la forma de llegar al 100% sería no anotar los fallos.

Solo aparece en las frecuencias donde **un día concreto carga la obligación**: *Diaria*, *Lunes a viernes* y *Personalizado por días fijos*. En *Semanal*, *Quincenal*, *Mensual* y *Meta mensual* no se habilita, porque ahí un feriado no quita nada — la obligación es del período y se corre a otro día sin tocar el promedio.

Se ve con el mismo gris que los días que la frecuencia no pide, más un **guion**, que distingue la decisión propia del tinte automático.

Todas las celdas son clickeables, sin importar la frecuencia de la tarea. Los días que la frecuencia **no** pide llevan un tinte gris suave para distinguirlos de un vistazo: en una tarea *Lunes a viernes* son los fines de semana, en una *Personalizado* los días que no elegiste, y en las tareas *Semanal*, *Quincenal* y *Mensual* la fila entera —porque ningún día puntual es obligatorio, sirve cualquiera del período.

El tinte de fin de semana se mantiene en el encabezado de días y en la fila `Tareas Diarias Completadas`, como referencia de calendario.

**Shift + clic** retrocede en el ciclo (útil si te pasaste de estado).

Además del color, cada estado tiene un símbolo, así la planilla sigue siendo legible en impresión blanco y negro o para daltonismo.

### Totales

- **Por fila** (columna `Estatus` a la derecha): porcentaje alcanzado sobre la meta de esa tarea en el rango visible, con un símbolo que resume el nivel:

  | Cumplimiento | Símbolo | Color |
  |---|---|---|
  | 75% o más | ✓ | Verde |
  | Entre 45% y 74% | ~ | Amarillo |
  | Menos de 45% | ✕ | Rojo |

  La meta se cuenta **por período**, así que se ajusta a lo que estés mirando: una tarea semanal se mide contra 5 puntos en un mes de cinco semanas y contra 1 en la vista semanal.

  Además se mide **solo contra lo transcurrido**, de los dos lados de la cuenta: si vas por el 14 de julio, una tarea diaria compara los puntos cargados hasta el 14 contra una meta de 14, y no contra 31. Los días futuros que hayas marcado no entran en el porcentaje —si no, marcar mañana daría más de 100%— pero sí suman a los puntos del período. El cumplimiento así no arranca el mes en rojo y va subiendo solo. Las tareas por período cuentan un período apenas empieza, igual que un día cuenta desde que amanece: el 13 de julio ya hay tres semanas en la cuenta. Al cerrar el mes, meta a hoy y meta al cierre coinciden. El tooltip muestra las dos.

  Casos sin nada que medir: si la frecuencia no pide ningún día del rango —una *Lunes a viernes* en la vista diaria de un sábado— muestra `—` y `sin meta`; si el rango todavía no empezó (un mes futuro), `—` y `a futuro`.
- **Por columna** (fila `Tareas Diarias Completadas` al pie): suma de puntos de todas las tareas ese día.
- **Esquina inferior derecha**: cumplimiento global del rango visible, con el mismo criterio.

**Clic en el encabezado `Estatus`** para ciclar entre cuatro formas de mostrarlo. El modo activo se lee debajo del rótulo de la columna:

| Modo | Qué muestra |
|---|---|
| `iconos` | Solo los símbolos ✓ ~ ✕ |
| `%` | Solo el porcentaje |
| `iconos + %` | Ambos |
| `oculto` | Nada, con el mismo gris de los días no requeridos |

Los tres primeros conservan el color del nivel, tanto en el texto como en el fondo de la celda. El modo elegido queda guardado.
- **Gran total** en la esquina inferior derecha.
## Menú

El botón **☰** del encabezado abre un menú lateral con:

- **Diario** — la planilla de tareas.
- **Análisis** — las cuatro tarjetas, sin la planilla.
- **Plantillas** — listas de tareas listas para incorporar.
- **Exportar / Importar** — copia de seguridad de los datos.

### Plantillas

Abren un diálogo con listas predefinidas. Cada una muestra sus tareas antes de aplicarla, y **Agregar** las suma al mes visible.

| Plantilla | |
|---|---|
| **Hábitos básicos** | Seis para empezar, sin abrumarse (6 tareas) |
| **Salud e higiene** | El cuidado del cuerpo, de lo diario a lo esporádico (10) |
| **Limpieza del hogar** | Lo de todos los días y lo que se posterga (10) |
| **Día completo** | La rutina entera, de levantarse a acostarse (22) |

Cada entrada declara nombre y frecuencia, y para *Personalizado* agrega `weekdays` (días fijos, como `L · X · V`) o `target` (meta mensual, como *8 veces al mes*).

Se **agregan**, no reemplazan: lo que ya tenías en el mes queda. Las tareas cuyo nombre ya exista se omiten (sin distinguir mayúsculas), así aplicar dos veces la misma plantilla no duplica nada. El aviso final dice cuántas entraron y cuántas se saltearon.

Las tareas de una plantilla se crean con ids nuevos, así que no arrastran estados de ningún lado, y respetan el bloqueo del período igual que cualquier otra alta.

Se cierra con el botón **✕**, con `Esc` o haciendo clic fuera. El selector de mes sigue visible en la sección de Análisis, porque las tarjetas son mensuales; el selector de vista y la navegación por semana/día solo aparecen en el Diario.

Al lado del selector de mes hay además un botón que alterna entre las dos secciones sin abrir el menú: dice **◔ Análisis** en la planilla y **▦ Diario** en la sección de análisis.

### Análisis

La sección tiene dos paneles plegables, **Indicadores** y **Gráficos**. Ambos recuerdan si los dejaste cerrados. Todo lo que muestran **describe el mes completo**: un promedio por día de la semana no significa nada dentro de una sola semana.

#### Gráficos

Son SVG dibujados a mano, sin librerías, para no romper la regla de cero dependencias.

| Gráfico | Qué responde |
|---|---|
| **Reparto de estados** (torta) | De lo que va del mes, cuánto marcaste y cómo. El centro indica qué proporción llegaste a registrar |
| **Promedio por día de la semana** (barras) | Qué días rendís mejor. El mejor va en verde y el peor en rojo, con su valor rotulado; los demás quedan neutros |
| **Cumplimiento por tarea** (barras horizontales) | Qué tareas están flojas, ordenadas de mejor a peor |

Notas de lectura:

- Los colores son **los mismos estados del tablero**, para que una celda verde y su porción del gráfico se lean como lo mismo. Se usan pasos un punto más oscuros en modo claro para que todos superen 3:1 de contraste contra la tarjeta, y pasos propios —no un volteo automático— en modo oscuro.
- Verde y amarillo **no se distinguen por tono** bajo protanopia. Por eso en la torta cada color viaja con su símbolo (✓ ~ ✕) y su palabra en la leyenda, y en el de tareas cada barra lleva su porcentaje al lado: la identidad nunca depende del color solo.
- En *Cumplimiento por tarea* la barra se topea en la meta. Si una tarea llega al 600%, escalar a ese máximo aplastaría a todas las demás y el rango que importa —45 a 100%— dejaría de leerse; el número al costado conserva el valor exacto y la barra que se pasa termina en escuadra contra el borde.

#### Indicadores

| Indicador | Qué muestra |
|---|---|
| **Necesitan tu atención** | Cuántas tareas del mes están en rojo (cumplimiento menor al 45%), con sus nombres |
| **Días más productivos** | El día de la semana con mayor promedio de puntos — *martes*, si todos los martes del mes promedian más alto que el resto |
| **Días menos productivos** | Lo mismo, con el promedio más bajo |
| **Mes actual vs mes pasado** | Diferencia en puntos porcentuales entre el cumplimiento del mes visible y el del mes anterior, en verde si subió y en rojo si bajó |

Los promedios por día de la semana usan solo los días ya transcurridos: los futuros valen 0 y hundirían el promedio de su día. Si no hay datos suficientes, o si todos los días promedian igual, las dos tarjetas de productividad muestran `—`.

Los totales siempre se calculan sobre el **rango visible**, así que cambian al pasar de vista semanal a mensual.

### Vistas

- **Diario** — un día por vez, en una columna ancha
- **Semanal** — 7 días, de lunes a domingo
- **Mensual** — todos los días del mes

Las semanas se alinean al lunes y todas las vistas se recortan a los límites del mes, para que ningún total mezcle datos de dos meses distintos. Las flechas `‹ ›` del bloque de la derecha mueven la ventana; al llegar al borde saltan al mes contiguo.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `←` `→` | Período anterior / siguiente (en Análisis, mes anterior / siguiente) |
| `T` | Ir a hoy |
| `N` | Nueva tarea (solo en el Diario) |
| `Esc` | Cerrar el menú o el diálogo abierto |

## Independencia por mes

Cada mes tiene su propia lista de tareas, pero no hay que volver a cargarlas todos los meses:

- Un mes **hereda** la lista del mes anterior mientras no se lo toque. Por eso las tareas se trasladan solas al período siguiente.
- La primera vez que agregás, editás, eliminás o reordenás una tarea en un mes, ese mes se queda con **su propia copia** de la lista. A partir de ahí es independiente.
- Eliminar una tarea en septiembre no la borra de agosto ni de julio, y solo borra los estados cargados **en septiembre**. Lo mismo vale para renombrarla o cambiarle la frecuencia.
- Los meses posteriores a uno modificado heredan de él, así el cambio sí se propaga hacia adelante.
- Los meses anteriores a la primera tarea que hayas creado aparecen vacíos.

Ejemplo: creás *Leer* y *Correr* en julio. Agosto y septiembre las muestran solas. En agosto eliminás *Correr*: julio la conserva, y septiembre —que hereda de agosto— deja de mostrarla.

### Copiar tareas del mes anterior

El botón **⧉ Copiar tareas del mes anterior** reemplaza la lista del mes visible por una copia de la del mes anterior. Pide confirmación porque es destructivo: las tareas que no estén en el mes anterior desaparecen de este mes junto con los estados que hayas cargado en él.

Las tareas que sobreviven a la copia conservan sus estados de este mes, así que sirve para volver a alinear un mes que quedó desprolijo sin perder lo ya marcado. Los meses anteriores nunca se tocan. El botón queda deshabilitado si el mes anterior no tiene tareas o si el período está bloqueado.

### Bloquear y desbloquear el período

**🔒 Bloquear período** deja el mes en solo lectura, para que no se modifique por accidente una vez terminado:

- Las celdas conservan sus colores y puntajes, pero dejan de responder al clic.
- No se pueden agregar, editar, eliminar ni reordenar tareas, y desaparece la fila *+ Agregar tarea*.
- Un aviso ámbar sobre la planilla indica que el período está bloqueado.

Es reversible: el mismo botón pasa a decir **Desbloquear período**. El bloqueo es por mes, así que podés tener bloqueado julio y seguir cargando agosto.

## Datos

El estado completo va a Supabase y al `localStorage`, bajo la clave `tareas-diarias/v1/<id de usuario>` — ver [Dónde viven los datos](#dónde-viven-los-datos). Lo que sigue describe la forma de ese estado, que es la misma en los dos lados.

Las tareas se guardan en `months`, indexadas por `YYYY-MM`; solo aparecen los meses que fueron modificados. Los estados van aparte, en `status`, con clave `idDeTarea|YYYY-MM-DD`. Los meses bloqueados están en `locked` y la preferencia de indicadores en `showSummary`. Si tenías datos del formato anterior (una única lista global), se migran solos al mes más antiguo con estados cargados, así los meses siguientes lo heredan y no se pierde nada.

- **Exportar** descarga un `.json` con tareas y estados.
- **Importar** reemplaza los datos actuales por los del archivo (pide confirmación).

Usá exportar/importar para hacer backup o para pasar los datos a otro dispositivo.

> Si editás la frecuencia de una tarea y algunos días dejan de aplicar, esos estados quedan guardados pero no se cuentan. Si volvés a la frecuencia anterior, reaparecen. Eliminar la tarea borra sus estados de ese mes definitivamente (ver [Independencia por mes](#independencia-por-mes)).

## Responsive

- **Escritorio**: planilla completa; la columna de tareas y la de totales quedan fijas al hacer scroll horizontal.
- **Mobile**: la tabla scrollea en horizontal con la columna de tareas siempre visible; celdas de 46 px de alto para que sean cómodas al tacto.
- Tema **claro/oscuro** automático según el sistema, con toggle manual que se recuerda.
- Hoja de estilos de impresión: oculta controles y deja solo la planilla.

## Compatibilidad

Navegadores modernos (Chrome/Edge 105+, Firefox 121+, Safari 15.4+). Usa `<dialog>`, `:has()` y `color-mix()`.
