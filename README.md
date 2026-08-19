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

Al cambiar de proyecto hay que actualizar también el `connect-src` de la CSP, en
[`vercel.json`](vercel.json) y [`_headers`](_headers): si no, el navegador bloquea las llamadas a
la base nueva. `npm run check` lo verifica contra `config.js` y avisa si quedaron desalineados.

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
- **Vercel** → `vercel.json`. El rewrite es `/(.*)` a secas y alcanza: los rewrites se evalúan
  *después* de buscar el archivo en disco, así que `styles.css`, `app.js` y compañía se sirven
  normalmente y solo las rutas que no existen caen en `index.html`.
  **No lleva comentarios**: el esquema de Vercel rechaza cualquier propiedad que no reconozca,
  incluida la clave `"//"` que suele usarse para eso, y el deploy falla entero.
- **GitHub Pages** → `404.html`, que no sabe reescribir y rebota a la raíz pasando la ruta como
  parámetro; el router la traduce y limpia la URL.

En un subdirectorio (`usuario.github.io/repo/`) también funciona: la app deduce su carpeta de la
URL de `app.js`, así que las rutas quedan `/repo/diario` y compañía.

## Pruebas

La app sigue sin build ni dependencias en tiempo de ejecución: `package.json` existe **solo**
para las pruebas, y nada de `node_modules` llega al navegador.

```sh
npm ci            # instala exactamente lo del package-lock.json
npm run check     # sintaxis, codificación de los fuentes y CSP al día
npm test          # snapshots del DOM + casos de comportamiento
npm run casos     # solo los casos; acepta filtros: npm run casos -- zoom plegado
npm run snapshot  # regraba la referencia (solo si el cambio es intencional)
```

`npm ci` y no `npm install`: instala exactamente lo que fija el `package-lock.json`, sin volver a
resolver rangos ni traer una versión que nadie eligió. Y el [`.npmrc`](.npmrc) del repositorio
bloquea los scripts de instalación de todos los paquetes, que es la vía por la que funcionan casi
todos los ataques de cadena de suministro de npm. Hoy ningún paquete del árbol los necesita, así
que la protección sale gratis.

Conviene tener presente el alcance real: **nada de `node_modules` llega al navegador**. La única
dependencia es `jsdom`, y es de desarrollo. Un paquete comprometido acá compromete la máquina que
instala, no a quien usa la app.

`check` termina buscando el carácter de reemplazo `U+FFFD` en todos los fuentes. Aparece cuando
un archivo se guardó con la codificación equivocada: el carácter original se perdió y queda esa
lápida en su lugar. Nunca es intencional, así que encontrarlo es siempre un error — y es un error
que el snapshot **no puede** ver, porque compara contra una referencia que grabó ya rota. Pasó
exactamente eso con un ícono de la guía, que nació mal y sobrevivió a los 18 escenarios.

`npm test` monta la app entera dentro de jsdom —el `index.html` real, el `app.js` real— con el
reloj congelado y datos sembrados, y compara el HTML que produce contra una referencia guardada.
Son 18 escenarios: las tres vistas, los cuatro modos de la columna Estatus, análisis, guía, mes
bloqueado, sin tareas, selección múltiple, los diálogos, y dos de datos corruptos que ejercen las
guardas de `normalize()`.

Sirve para refactorizar: si el HTML sale igual, el comportamiento no cambió. No reemplaza probar
en el navegador —no cubre CSS, gestos ni la sesión—, pero atrapa las regresiones de render.

La referencia vive versionada en `test/__snapshots__/dom.json`, así que `npm test` corre recién
clonado el repositorio. Cuando un cambio de markup es intencional, `npm run snapshot` la regraba y
**el diff resultante entra en el commit**: ahí se lee exactamente qué se movió en el HTML.

### Casos de comportamiento

Los snapshots dicen *qué cambió*; los casos de `test/casos/` dicen *si sigue funcionando*. Son
**433 comprobaciones** repartidas en quince archivos, cada uno sobre una funcionalidad:

| Caso | Qué cubre |
|---|---|
| `plantillas` | Fecha obligatoria, mes destino, bloqueo, duplicados |
| `tarea-fecha` | Alta y edición: valor por omisión, validación, no mudar de mes al editar |
| `tope-100` | Ninguna tarea aporta más que su meta a los promedios |
| `ir-a` | Los dos calendarios: el nombre del mes y «Ir a…» |
| `zoom` | Los tres niveles, alto de fila y ancho de columna uniformes, ancho para el nombre |
| `plegado` | «Análisis» en el encabezado, el armazón de alto fijo y el plegado de controles |
| `boton-alta` | El alta dentro del desplegable de acciones y su estado bloqueado |
| `color-marca` | Los rellenos con el color de la marca y su contraste AA en ambos temas |
| `vendor` | La app arranca con el cliente local y su `integrity` |
| `red` | Qué primitivas de red toca el cliente real: ningún WebSocket |
| `landing` | Pantalla partida de la puerta de sesión, apilado en móvil y contraste sobre el degradado |
| `recuperacion` | El ciclo completo de «olvidaste tu contraseña», con el cliente instrumentado |
| `migracion` | Un estado guardado por la versión anterior abre sin perder nada |
| `sincronizacion` | Cómo se sube: agrupado, de a uno, con reintento y sin las preferencias |
| `vista` | Los dos desplegables: vista con sus flechas y saltos, y acciones del mes |

Corren en **procesos separados** a propósito: cada uno instala su propio jsdom con reloj,
almacenamiento y globals sustituidos, y compartir proceso haría que un caso viera el entorno del
anterior. El costo es arrancar Node quince veces; a cambio cada archivo se ejecuta a mano —
`node test/casos/verificar-zoom.mjs`—, que es como se depuran.

> `sincronizacion` monta además un **reloj de temporizadores propio**, para no esperar de verdad
> los 800 ms de la agrupación ni los 5 s del primer reintento. El caso adelanta el reloj a mano y
> comprueba qué se escribió en cada tramo.

Cuando un caso falla, el runner imprime su salida completa al final, después del resumen: no hay
que buscarla entre la de los que pasaron.

## Código de terceros y CSP

El cliente de Supabase se sirve **desde este mismo dominio**, en
[`vendor/`](vendor/README.md), y no desde un CDN. La diferencia importa porque ese código sí
corre en el navegador de cada visitante, con acceso completo a su sesión: importarlo de un CDN
significaba versión no fijada (`@2` es «cualquier 2.x»), sin verificación de integridad —los
`import` de módulos ES no admiten `integrity`— y a merced de que el CDN sirviera lo que
corresponde.

Ahora la versión es exacta, el `<script>` lleva su hash y la
**Content-Security-Policy no necesita permitir ningún origen externo**:

| Directiva | |
|---|---|
| `default-src 'none'` | nada está permitido salvo lo que se habilita abajo |
| `script-src 'self' <3 hashes>` | solo scripts propios; los inline, por hash y **sin** `'unsafe-inline'` |
| `connect-src 'self' <proyecto>.supabase.co` | la app solo puede hablar con su propia base |
| `frame-ancestors 'none'` | no se puede embeber en un iframe ajeno |

Autorizar los inline por hash es lo estricto —un script inyectado no se ejecuta— pero acopla el
hash al código: editar una línea del script anti-parpadeo lo invalida, y el navegador lo bloquea
en producción, en silencio. Por eso `npm run check` recalcula los hashes desde `index.html`,
verifica el `integrity` de `vendor/` contra el archivo, controla que `connect-src` corresponda a
`config.js` y que [`_headers`](_headers) (Netlify) declare la política idéntica a
[`vercel.json`](vercel.json). Es lo que vuelve mantenible al hash.

> **GitHub Pages no admite cabeceras propias.** Publicado ahí, el sitio queda sin CSP. Es una
> limitación del hosting; Vercel y Netlify sí la sirven.

## Sesión

La app pide iniciar sesión antes de mostrar nada. Se puede **crear cuenta** desde la misma
pantalla; si el proyecto tiene la confirmación por mail activada, avisa que hay que revisar el
correo. Los mensajes de error de Supabase se muestran traducidos.

Esa puerta ocupa la pantalla completa **partida al medio**: en la mitad derecha, un panel con los
degradados violeta de la marca que cuenta qué hace la app y por qué llevar el registro sirve; en
la izquierda, el formulario flotando centrado. En menos de 860px las mitades se apilan y el
formulario queda arriba.

> El formulario va **primero en el orden del documento** aunque en pantalla ancha ocupe la mitad
> izquierda. Es la acción principal, y así al apilarse queda arriba sin invertir nada con `order`:
> el orden de lectura y el visual no se separan, y quien ya tiene cuenta entra sin scrollear.

> El texto del panel va sobre un degradado, así que su contraste se mide contra **cada parada**:
> la más clara es la que manda. Blanco puro da 5,43:1 ahí y el texto de apoyo 4,63:1 — los dos
> pasan AA. Por debajo del 86% de blanco se cae, y por eso el pie no usa un velo más tenue: su
> jerarquía la dan el cuerpo más chico y una línea de separación.

### Recuperar la contraseña

Debajo del formulario hay un **«¿Olvidaste tu contraseña?»** que pide solo el email y manda un
correo con un enlace. Al volver desde ese enlace la app pide directamente la contraseña nueva.

El mismo formulario tiene cuatro modos —entrar, crear cuenta, pedir el correo y elegir la
contraseña nueva—, y en cada uno se muestran solo los campos que hacen falta.

> **La puerta sigue cerrada durante la recuperación.** El enlace del correo deja una sesión
> válida, así que sin una guarda explícita la app se abriría y la pantalla para cambiar la
> contraseña no llegaría a verse nunca: quien entró por haberla olvidado quedaría adentro sin
> haberla cambiado. Recién se abre cuando `updateUser` confirma la nueva.

> **El aviso no dice si la cuenta existe.** Responde «si hay una cuenta con ese email, te llega un
> correo», y no «no encontramos esa cuenta». Lo segundo convertiría la pantalla en un verificador
> de quién está registrado, disponible sin iniciar sesión.

Para que el enlace vuelva a la app, su dirección tiene que estar declarada en Supabase →
*Authentication → URL Configuration*. Si no está, el correo redirige al *Site URL* del proyecto.

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

**Si la base no contesta al abrir, la app no escribe.** Se queda en modo local, avisa en pantalla
y no sincroniza hasta que recargues. Es a propósito: subir el estado que quedó en memoria sin
haber podido leer el remoto reemplazaría datos del servidor a ciegas.

> Ese aviso importa. Antes, un fallo de Supabase solo dejaba un `console.error` y la app seguía
> como si nada, guardando únicamente en el navegador. Al cambiar de dominio o de navegador, esos
> datos quedaban fuera de alcance sin que nada lo hubiera advertido.

### Cómo se sube

En `localStorage` se escribe en el acto, en cada cambio. A la base **no**:

- **Las ráfagas se agrupan.** Marcar una fila entera son diez o quince clics seguidos; el primero
  arma un temporizador de 800 ms y los demás viajan con él, en una sola escritura. El temporizador
  **no se reinicia** con cada cambio: si se reiniciara, alguien marcando sin parar postergaría la
  subida indefinidamente.
- **Nunca hay dos escrituras en vuelo.** Lo que se marque mientras una está sin resolver se sube
  en la vuelta siguiente. Lanzarlas en paralelo dejaba que la respuesta de una vieja pisara a una
  nueva, que es un desorden que no se nota hasta que faltan datos.
- **Un fallo se reintenta solo**, con una espera que crece —5 s, 10 s, 20 s, 40 s, y de ahí cada
  minuto— para no castigar una base caída con un intento por cada clic. También se reintenta al
  recuperar la conexión y al volver a la pestaña. Antes el aviso quedaba en pantalla y no se
  volvía a intentar hasta recargar.
- **Al irse de la pestaña se sube en el acto**, sin esperar el temporizador.

Agrupar abre una ventana de hasta 800 ms con cambios guardados acá y todavía no en la base. Si la
pestaña muere justo ahí —un cierre forzado, quedarse sin batería—, esos cambios quedan anotados en
`tareas-diarias/v1/<id>/pendiente`, con la hora en que se hicieron. Al volver a entrar esa marca
se compara contra el `updated_at` de la fila remota: **si lo local es más nuevo, gana lo local** y
se sube. Sin esa comparación, la lectura remota pisaba en silencio justo lo último que se hizo.

> Las dos marcas las escribe un cliente, así que se comparan como instantes y no como texto: el
> `updated_at` de Postgres vuelve con offset (`+00:00`) y el nuestro con `Z`, y ordenadas como
> cadena esas dos formas mienten.

### Lo que no se sincroniza

El tema, el zoom, el plegado de controles, los paneles del análisis y el modo de la columna
*Estatus* describen cómo se ve la app **en este aparato**, no qué hizo el usuario. Se guardan solo
en `localStorage` —en `tareas-diarias/prefs`, y el tema además en `tareas-diarias/theme`, que es
la que lee el script anti-parpadeo antes de que exista `app.js`— y quedan fuera del payload.

Antes iban en el mismo `jsonb` que los datos, con dos consecuencias: elegir tema claro en la
computadora lo cambiaba también en el teléfono, y cada una de esas preferencias subía el diario
entero para guardarse.

La causa más probable de que la base rechace todo es que **falte la política de RLS** — ver la
consulta de comprobación al final de [`db/supabase-app-state.sql`](db/supabase-app-state.sql).

> **Sobre el esquema de la base.** El repositorio trae dos archivos SQL y solo uno está en uso:
> [`db/supabase-app-state.sql`](db/supabase-app-state.sql), el de la tabla `app_state` que
> describe esta sección. [`db/schema.sql`](db/schema.sql) es un diseño relacional —tareas, meses
> y estados en tablas propias— al que la app **todavía no habla**: es el destino de la **Etapa 3**
> de [`db/MIGRACION.md`](db/MIGRACION.md). Correrlo crea tablas vacías que nadie consulta.
>
> Lo que falta de esa etapa es cambiar el guardado de «volcar todo el estado» a operaciones
> puntuales. Hoy cada subida lleva el estado entero —agrupada, pero entera— y entre dos
> dispositivos gana el último que escribe, pisando el mes completo en vez de la celda.

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

  En vistas más chicas la meta se reparte proporcionalmente sobre los días del mes y se **redondea hacia arriba a acciones enteras**: 12 al mes son `12 × 7/31 ≈ 2,7` en una semana, o sea **3**. En la vista mensual siempre muestra el número exacto que cargaste.

  > **Por qué se redondea.** Estas metas se cumplen con actos indivisibles: «socializar» se hace o no se hace, no existe hacer 0,26 de socializar. Sin redondear, la meta de un solo día quedaba en fracciones —`8/31 = 0,26`— y una única marca contra esa meta daba **388%**: aritmética correcta sobre una unidad que no existe.

  Cuando la ventana es tan chica que ni siquiera llega a pedir una acción —el caso de la vista diaria—, **no hay obligación que incumplir**: ahí el cumplimiento lo fija lo que hiciste. Cumplido da 100%, parcial 50% y un día en blanco muestra `—`, no 0%. Un cero acusaría de incumplida a una tarea que ese día no debía nada.

  El reparto se hace sobre los **días del mes**, no sobre los que la tarea tiene disponibles. Es lo que hace que empezar tarde reduzca lo que se espera en vez de amontonarlo: una tarea de 8 al mes que arranca el día 31 no pide las 8 acciones ese día — pide una, y hacerla da 100%.

### Fecha de inicio

Cada tarea tiene una **fecha de inicio obligatoria**. Antes de esa fecha la tarea no existe:

- Los días anteriores **no se pueden marcar** y aparecen como no requeridos.
- No cuentan para la meta: una tarea diaria que arranca el 15 de julio tiene meta 17, no 31.
- Si el inicio cae en un mes posterior al que estás mirando, la tarea no tiene meta ahí y su cumplimiento muestra `sin meta`.

Si ya habías marcado días que después quedan antes del inicio, dejan de mostrarse y de sumar, pero **el dato no se borra**: si corrés la fecha hacia atrás, vuelven a aparecer.

Al **crear** una tarea el campo llega precargado con **hoy**, que es cuando suele empezar un hábito que estás dando de alta. Y esa fecha **decide a qué mes va la tarea**, sin importar en qué mes estés parado: darla de alta desde un mes viejo la crea igual en el mes de su fecha, y la app te lleva ahí. Es la misma regla que en las plantillas.

Como el destino puede no ser el mes visible, el **bloqueo que se comprueba es el del mes destino**: con septiembre bloqueado, crear una tarea que arranca ahí se rechaza con un error en el formulario aunque estés parado en un julio editable.

Al **editar** gana la fecha que ya tenga la tarea, y cambiarla **no la muda de mes**: la tarea vive en la lista del mes donde está, y mudarla partiría su historial en dos. Correr un inicio unos días es algo que se hace seguido y no debería tener ese efecto.

Si una tarea no tiene fecha —por ser anterior a que el campo fuera obligatorio—, al editarla se propone el **día 1 del mes visible** y no hoy: proponer hoy recortaría el historial, porque guardar sin tocar nada apagaría los días ya cargados anteriores a la fecha y dejarían de contar para la meta. El día 1 es justamente lo que significaba no tener fecha, así que completarla no cambia nada.

La fecha de inicio no se escribe en la fila de la tarea para no alargarla; se ve al pasar el mouse sobre la frecuencia y al editar la tarea.

Como marcar de más está permitido, **los puntos pueden superar la meta**: una tarea semanal marcada tres veces en una semana suma 3 contra una meta de 1. Pero **el cumplimiento topea en 100%** — cumplir es cumplir, y de ahí no se sube. Los números crudos siguen a la vista en el tooltip de la celda (*«3 sobre una meta de 1»*), así que hacer de más se ve igual sin inflar la medida.

El tope no es solo de presentación: **cada tarea aporta como mucho su propia meta** a los promedios. Sin eso, hacer una tarea de lunes a viernes también el sábado compensaba el incumplimiento de otra tarea, y el total del rango subía sin que nada se hubiera cumplido mejor. Vale para el total del rango, para el gráfico de cumplimiento por tarea y para la comparación mensual.

Cada fila tiene, en la columna de tareas: un **casillero** para seleccionarla, los chevrones **▲ ▼** para subir o bajar la tarea de posición y **✎** para editarla. El orden se guarda junto con los datos.

También se puede **arrastrar una tarea tomándola del nombre** para reordenarla. Una línea de acento marca dónde va a caer según de qué lado del medio de la fila esté el puntero. La fila solo se vuelve arrastrable mientras el puntero apoya sobre el nombre: si no, arrastrar desde una celda de estado movería la tarea sin querer. Los chevrones siguen ahí porque el arrastre no funciona en pantallas táctiles. El alta vive en **+ Agregar tarea**, primero del apartado *Tareas* del desplegable **Acciones** (ver abajo). Para borrar se usa el casillero (ver abajo).

### Acciones del mes

Todo lo que se puede hacer sobre el mes vive en un botón **Acciones**, agrupado por lo que toca:

| Apartado | Qué hay |
|---|---|
| **Tareas** | *+ Agregar tarea*, *Copiar tareas del mes anterior*, y —con filas tildadas— *Eliminar N tareas* y *Resetear estados* |
| **Visualización** | El zoom de la planilla. Solo en móvil: en escritorio la planilla entra y el apartado entero no existe |
| **Período** | *Bloquear período* |

> **Antes eran seis botones sueltos en una fila.** Agruparlos muestra una distinción que la fila plana no podía: ahí *Resetear estados* y *Bloquear período* se leían como vecinos del mismo rango, cuando uno borra marcas de tareas y el otro congela el mes entero.
>
> El menú **se cierra al elegir**, porque casi todo lo que hay adentro abre un diálogo. La excepción es el zoom: cicla tres niveles, así que se queda abierto para poder recorrerlos sin volver a desplegar.
>
> Es el mismo mecanismo que el desplegable de vista —cierra con `Esc`, con un clic afuera, y devuelve el foco al botón— y **abrir uno cierra al otro**.
>
> El relleno con el color de la marca pasó de *+ Agregar tarea* a **Acciones**: es la entrada a todas, y dejar el color adentro del menú lo escondía. El alta sigue siendo lo primero del primer apartado, y la pantalla de «sin tareas» conserva su propio botón, así que dar de alta la primera tarea sigue estando a un clic.

### Acciones sobre varias tareas

Al tildar **una o más** casillas las filas quedan resaltadas y aparecen dos entradas más en el apartado *Tareas* del desplegable **Acciones**, debajo de *Copiar tareas del mes anterior*:

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

La **leyenda al pie de la planilla** nombra los cuatro estados del ciclo, con los mismos rótulos que la guía y sin el puntaje al lado: eso lo explica *Cómo usar*, y repetirlo en cada renglón alargaba las entradas sin agregar nada que se consulte de un vistazo. Tampoco lista *Sin cargar*, que es la ausencia de estado y no uno de ellos — la celda vacía ya se lee sola.

En un teléfono las cuatro entradas van **en dos columnas**, así ocupan dos renglones y no cuatro. Las columnas se miden por su contenido y el par va centrado como bloque, de modo que los rótulos arrancan alineados entre sí en lugar de quedar cada uno centrado por su cuenta.

### No requerido

El último estado del ciclo **saca ese día de la meta** en lugar de contarlo como fallado. Es para los días en que la tarea legítimamente no correspondía: un feriado en el que no trabajás ni estudiás, una licencia, un viaje.

Es un estado que **elegís**, no la ausencia de uno. Esa distinción es la que mantiene sana la métrica: si bastara con dejar la celda vacía para no ser penalizado, el ✕ pasaría a ser un botón que baja el promedio y la forma de llegar al 100% sería no anotar los fallos.

Solo aparece en las frecuencias donde **un día concreto carga la obligación**: *Diaria*, *Lunes a viernes* y *Personalizado por días fijos*. En *Semanal*, *Quincenal*, *Mensual* y *Meta mensual* no se habilita, porque ahí un feriado no quita nada — la obligación es del período y se corre a otro día sin tocar el promedio.

Se ve con el mismo gris que los días que la frecuencia no pide, más un **guion**, que distingue la decisión propia del tinte automático.

Todas las celdas son clickeables, sin importar la frecuencia de la tarea. Los días que la frecuencia **no** pide llevan un tinte gris suave para distinguirlos de un vistazo: en una tarea *Lunes a viernes* son los fines de semana, en una *Personalizado* los días que no elegiste, y en las tareas *Semanal*, *Quincenal* y *Mensual* la fila entera —porque ningún día puntual es obligatorio, sirve cualquiera del período.

El tinte de fin de semana se mantiene en el encabezado de días y en la fila `Tareas completadas`, como referencia de calendario.

**El día de hoy se marca solo en el encabezado**, con la píldora del número. Antes su columna llevaba además un filete vertical del color de la marca a los dos lados, que competía con los colores de estado —que son los que hay que leer— y recortaba el verde o el rojo de cada celda. Saber qué día es hoy es contexto; qué se cumplió y qué no es el dato.

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

  La meta es la del **período completo de la vista**, no la de la parte transcurrida. Una tarea de lunes, miércoles y viernes vista en la semana apunta a 3, esté la semana empezada o terminada, y hacerla dos veces da 67%. En la vista mensual, esas mismas dos veces se miden contra los 13 días L·X·V del mes: 15%.

  > **El porcentaje es un avance, no un ritmo.** Un período recién empezado muestra números bajos aunque no falte nada: el 4 de agosto, una tarea diaria marcada los cuatro días va 4 de 31 en la vista mensual, o sea 13%, y con los umbrales de arriba eso se pinta en rojo. Para leer «cómo voy hoy» sirve la vista diaria o la semanal, donde el período es corto; la mensual dice cuánto del mes llevás hecho.

  Si la frecuencia no pide ningún día del rango —una *Lunes a viernes* en la vista diaria de un sábado— no hay nada que medir y muestra `—`.
- **Por columna** (fila `Tareas completadas` al pie): suma de puntos de todas las tareas ese día.
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

#### Fecha de inicio

Arriba de la lista hay un campo de **fecha de inicio, obligatorio**, que hace dos cosas:

1. **Fija el `start` de todas las tareas** que agregue la plantilla, como si lo hubieras cargado a mano en cada una. Antes de esa fecha las celdas quedan apagadas y no cuentan para la meta, así arrancar a mitad de mes no deja los días previos como incumplidos.
2. **Decide a qué mes van.** Las tareas se agregan al mes de esa fecha, **sin importar en qué mes estés parado**: elegir el 15 de septiembre desde julio las crea en septiembre. Al aplicar, la app te lleva ahí — quedarse en julio mostraría un aviso de «6 tareas agregadas» sobre una pantalla en la que no cambió nada.

El campo abre en **hoy**, así que la plantilla apunta por omisión al mes actual — **aunque estés mirando otro mes**. El botón *Agregar* nombra el mes destino al pasarle el mouse. Si borrás la fecha, los botones se apagan: sin ella no hay mes al que agregar.

El campo **no recuerda el valor anterior**: vuelve a hoy en cada apertura, así ninguna plantilla sale disparada a un mes que ya nadie eligió.

Como el destino puede no ser el mes visible, el **bloqueo que se comprueba es el del mes destino**: con septiembre bloqueado los botones aparecen apagados y el diálogo dice por qué, aunque estés parado en un julio perfectamente editable. Y al revés — un julio bloqueado ya no impide agregar tareas a septiembre. Los nombres duplicados también se comparan contra el mes destino.

Las tareas de una plantilla se crean con ids nuevos, así que no arrastran estados de ningún lado, y respetan el bloqueo del período igual que cualquier otra alta.

Se cierra con el botón **✕**, con `Esc` o haciendo clic fuera. El selector de mes sigue visible en la sección de Análisis, porque las tarjetas son mensuales; el selector de vista y la navegación por semana/día solo aparecen en el Diario.

En el **encabezado**, junto al cambio de tema, hay un botón que alterna entre las dos secciones sin abrir el menú: dice **◔ Análisis** en la planilla y **▦ Diario** en la sección de análisis. En móvil se queda solo con el icono, porque el ancho no da para el rótulo.

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

Se eligen en un **botón que muestra la vista activa** y despliega las otras. Las flechas `‹ ›` lo abrazan y mueven la ventana de esa vista: un día, una semana o —en la mensual, donde no hay ventana que correr dentro del mes— un mes. Al llegar al borde saltan al mes contiguo.

Son los **tres únicos controles** de esa zona: todo lo demás —ir a hoy, saltar a un día— vive en el desplegable. Qué ventana se está mirando no lo dice un rótulo aparte sino los números de las columnas, que ya están ahí.

Las semanas se alinean al lunes y todas las vistas se recortan a los límites del mes, para que ningún total mezcle datos de dos meses distintos.

> **Antes eran dos filas y siete controles**: un carril con «Hoy», *Diario*, *Semanal* y *Mensual*, y debajo otra fila con `‹`, el rótulo, `›` y el calendario. Todo eso decía dos cosas —en qué ventana estoy y cómo me muevo entre ventanas—, así que ahora van juntas: el rótulo pasó a ser el subtítulo de su propio control en vez de una fila aparte.
>
> **El salto bajó al desplegable**, al final y detrás de un separador. No es una vista sino una acción, y así se lee: las tres vistas son `menuitemradio` y esa es un `menuitem`.
>
> El desplegable es propio y no un `<select>`: sus opciones no se pueden estilar y el nativo de Android se abre a pantalla completa. Cierra con `Esc`, con un clic afuera o al elegir, y devuelve el foco al botón. Mientras está abierto los atajos de teclado quedan en suspenso, para que las flechas no muevan el período por detrás del menú.

### Ir a una fecha

Hay dos calendarios para saltar sin recorrer mes por mes:

| Se abre desde | Abre | Qué muestra |
|---|---|---|
| El **nombre del mes**, que es un botón | *Seleccionar mes* | Los doce meses de un año, sin días. Las flechas cambian de año |
| **Ir a…**, en el desplegable de vista | *Seleccionar día* | El calendario del mes, alineado al lunes. Las flechas cambian de mes |

> **Ninguno de los dos es ya un icono.** La barra no tiene un solo calendario suelto: el de meses es el propio nombre del mes y el de días bajó al desplegable. Los dos son saltos largos —de julio a marzo, del 30 al 8— y ninguno es algo que se haga a cada rato, así que no necesitaban un control permanente ocupando la fila.
>
> **«Ir a hoy» e «Ir a un día…» eran el mismo gesto**, así que son una sola entrada: *Ir a…*. Hoy no es un destino aparte sino uno más del calendario —y ya venía marcado ahí con el color de la marca—, solo que el más frecuente.
>
> Por eso el diálogo tiene ahora un botón **Hoy**, junto a *Cancelar*: sin él, volver al mes actual con el puntero obligaba a paginar hasta encontrarlo, y la tecla `T` no sirve en un teléfono. Funciona en los dos modos del diálogo, el de días y el de meses.
>
> **La línea del mes es un solo control.** Antes eran tres —un icono de calendario, `‹` y `›`— para una misma cosa. Sigue leyéndose como el título de la barra —mismo cuerpo y mismo peso que cuando era texto— y el fondo que lo delata como control aparece recién al pasarle el mouse. El chevron `▾` lo pone el CSS, así que ningún lector de pantalla lo anuncia: el nombre accesible es el mes, y el `aria-haspopup="dialog"` avisa que abre un diálogo.
>
> El paso a paso no se pierde: las flechas cruzan al mes contiguo al llegar al borde, y están las teclas `←` `→`.

Elegir un día lleva a la **ventana que lo contiene** según la vista activa: en semanal cae en su semana, en diaria en ese día. En los dos calendarios, el día o mes **de hoy** va relleno con el color de la marca y el que ya estás mirando queda contorneado. Navegar dentro del diálogo no mueve la planilla: recién cambia al elegir, y *Cancelar* la deja como estaba.

**El desplegable es el mismo en las tres vistas.** En la mensual *Ir a…* sigue estando: ahí el mes entero es una sola ventana, así que elegir un día lleva a **su** mes, que es un salto tan válido como los otros. Las flechas también quedan — es donde pasan a mover de mes en mes.

> Un menú que muda de opciones según dónde estés obliga a recordar cuáles hay en cada una, y hace que una desaparezca justo cuando se la fue a buscar.

### Plegar los controles (solo móvil)

A la derecha de la línea del mes hay un botón que **pliega la fila que hay entre el mes y la planilla**: el selector de vista con sus flechas, y *Acciones*.

Dice `–` cuando está desplegado y `+` cuando no, y **recuerda cómo lo dejaste**. Solo aparece en la planilla: en la sección de análisis esas zonas ya están ocultas y no habría sobre qué actuar.

> **En móvil la barra son dos filas**, no tres como antes:
>
> ```
>              Agosto 2026 ▾                –
>   ‹ Semanal ▾ ›                    Acciones
> ```
>
> El mes va **centrado de verdad**: su fila es una rejilla de `1fr auto 1fr`, así que el rótulo queda al medio sin importar cuánto ocupe el plegado de la derecha. Debajo, las dos entradas a todo lo demás quedan una en cada punta.
>
> Para poder compartir fila, `#month-bar` pasó a vivir **dentro** de `.controls`. En escritorio sigue en una fila propia y contra la izquierda, igual que cuando era una sección hermana — lo consigue con `grid-column: 1 / -1`.
>
> La rejilla del mes es propia y **no `subgrid`**: eso pide Chrome 117 y la app declara soporte desde el 105.
>
> **El selector de vista mide siempre lo mismo de ancho.** Los tres rótulos no miden igual —«Diario» 85,5px contra 98,3 de «Semanal» y 98,1 de «Mensual»—, así que sin un piso el botón cambiaba de tamaño al cambiar de vista y arrastraba a las flechas que lo abrazan. El piso va en `em`, por encima del más ancho: se mide contra la tipografía del propio botón, así que si cambia el cuerpo la reserva lo acompaña.
>
> **Todos los controles de la barra miden lo mismo de alto**, por `--ctl-h`. Antes convivían cuatro alturas en la misma fila —30,8px las flechas y el plegado, 32,3 *Acciones*, 36,4 el mes y 38,3 la vista— porque cada uno lo resolvía con su propio padding. En una fila esa diferencia se lee como jerarquía, y acá no la hay: son todos pares.
>
> **Cada desplegable ancla del lado en que está su botón.** El de vista queda contra el borde izquierdo y el de acciones contra el derecho, así que crecen hacia adentro y ninguno se sale de la pantalla. Esa regla va **por id**: el menú de acciones comparte la clase `.view-options`, y acotarla por clase le pisaba el ancla y lo dejaba cortado.

> El plegado va por una clase en el `body` y no por el atributo `hidden`, que ya lo usa el router para ocultar esas mismas zonas según la sección. Así las dos condiciones conviven sin pisarse.

### Zoom de la planilla (solo móvil)

En pantallas angostas aparece el apartado **Visualización** del desplegable **Acciones**, con un control que cambia la densidad de la planilla. Cicla tres niveles y recuerda el elegido.

No toca solo el ancho de las columnas: baja también el **alto de las filas** y el **cuerpo del nombre de la tarea**.

| Nivel | Días visibles | Alto de fila | Nombre | Caracteres del nombre |
|---|---|---|---|---|
| **Cómodo** | ~3 | 66,3px | 15,3px | ~24 |
| **Normal** | ~5 | 55,3px | 12,3px | ~24 |
| **Compacto** | ~7 | 47,4px | 10px | ~26 |

*(vista mensual sobre un viewport de 390px, con la raíz en 14px; los caracteres son estimados)*

**Todas las filas miden lo mismo**, entre el nombre en una línea o en dos. La celda de tareas usa `height` y no `min-height`: con un mínimo, un nombre largo empujaba su fila y la planilla quedaba escalonada. El alto se arma con las mismas piezas que ocupa la celda —dos líneas de nombre, una de frecuencia y el padding—, así que sigue al zoom sin números sueltos que se desincronicen. En pantallas de menos de 380px la frecuencia se oculta y el alto deja de reservarle lugar.

**Y todas las columnas también**, por la misma razón y con el mismo remedio del lado del ancho: la tabla es `table-layout: fixed`, así que los anchos los fija la primera fila y el contenido de las celdas no los mueve.

> Con el `auto` que traen las tablas por omisión, el ancho de cada columna lo decide lo que tiene adentro, y una celda con glifo (`✓ ~ ✕ –`) mide más que una vacía. Mientras la tabla entra en la pantalla no se nota —el espacio sobrante se reparte y empareja todo—, pero apenas desborda, que es lo normal en un teléfono, marcar unos días dejaba la planilla con columnas de **cinco anchos distintos**: 29, 29,77, 31, 32,5 y 34,28px donde tenía que haber un solo 29.
>
> En escritorio nunca se vio porque ahí la columna de día mide 38px en la vista mensual y el glifo entra sin empujar. En móvil son 29px, y en *Compacto* 23,8: el contenido siempre empuja. Es un bug que aparece **al usar la app**, no al abrirla, porque hace falta marcar celdas para que las columnas se desalineen.

**Zoom out gana días sin comerse el nombre**, y eso descansa en dos decisiones:

- **El nombre se parte en dos líneas** en vez de cortarse con puntos suspensivos. En un teléfono sobra alto y falta ancho: con una sola línea, el ellipsis se comía la mitad del nombre por más que la columna creciera.
- **Hay dos multiplicadores, no uno.** La columna de tareas se mueve mucho menos que las celdas de día (±6% contra ±18%). Si se movieran al mismo ritmo, zoom out volvería a recortar los nombres — que es justo lo que hay que evitar. Como la columna casi no se achica, una tipografía más chica entra **más** texto, no menos.

En *Compacto* la fila queda en 37,7px: por encima del mínimo de 24px que pide WCAG 2.5.8, pero por debajo de los 44px que recomienda el criterio AAA para objetivos táctiles.

> El nombre completo sigue en el `title` de la celda, pero al tacto no hay hover que lo muestre: por eso el objetivo es que entre en la fila.

El punto de partida en móvil es un escalón más chico que antes, porque en un teléfono entraban tres días y poco más. *Cómodo* recupera el tamaño anterior, por si el texto de las tareas queda demasiado recortado.

En escritorio el botón **no existe**: ahí la planilla entra y no hay nada que resolver. Por eso el nivel se aplica dentro del breakpoint angosto y fuera de él el atributo no cambia nada.

> Los niveles multiplican las medidas del breakpoint en vez de fijar las suyas. Si fijaran medidas propias le ganarían por especificidad al bloque de 380px, y el ajuste para pantallas muy angostas quedaría sin efecto en dos de los tres niveles.

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
- No se pueden agregar, editar, eliminar ni reordenar tareas, y *+ Agregar tarea* queda deshabilitado.
- Un aviso ámbar sobre la planilla indica que el período está bloqueado.

Es reversible: el mismo botón pasa a decir **Desbloquear período**. El bloqueo es por mes, así que podés tener bloqueado julio y seguir cargando agosto.

## Datos

El estado completo va al `localStorage`, bajo la clave `tareas-diarias/v1/<id de usuario>`, y a Supabase — ver [Dónde viven los datos](#dónde-viven-los-datos). La forma es la misma de los dos lados salvo por las preferencias de pantalla, que **solo existen en la copia local** (ver [Lo que no se sincroniza](#lo-que-no-se-sincroniza)).

Las tareas se guardan en `months`, indexadas por `YYYY-MM`; solo aparecen los meses que fueron modificados. Los estados van aparte, en `status`, con clave `idDeTarea|YYYY-MM-DD`. Los meses bloqueados están en `locked`, y los paneles del análisis en `panels`. Si tenías datos del formato anterior (una única lista global), se migran solos al mes más antiguo con estados cargados, así los meses siguientes lo heredan y no se pierde nada.

- **Exportar** descarga un `.json` con tareas y estados.
- **Importar** reemplaza los datos actuales por los del archivo (pide confirmación).

Usá exportar/importar para hacer backup o para pasar los datos a otro dispositivo.

> Si editás la frecuencia de una tarea y algunos días dejan de aplicar, esos estados quedan guardados pero no se cuentan. Si volvés a la frecuencia anterior, reaparecen. Eliminar la tarea borra sus estados de ese mes definitivamente (ver [Independencia por mes](#independencia-por-mes)).

## Responsive

- **La app ocupa la ventana y no desplaza: desplaza la planilla.** Quedan quietos el encabezado, la barra de controles, el encabezado de días de la planilla y la leyenda del pie; las filas de tareas pasan por debajo. En un mes cargado eso deja siempre a la vista qué día es cada columna, que es justo lo que hace falta mientras se recorren las tareas.

  > **Por qué el armazón y no `sticky`.** `.table-wrap` ya desplazaba en horizontal, y al fijar un eje el otro deja de ser `visible`: el contenedor **es** un contenedor de scroll, así que un `sticky` de adentro se ancla a él y no a la ventana. Con la página como scroller, el encabezado de la planilla se empujaba hacia abajo hasta el medio de la tabla en vez de quedarse arriba.
  >
  > Dándole el scroll a `.table-wrap` y el alto sobrante por `flex`, ese mismo `sticky` se pega a su borde superior y funciona. Y las otras dos bandas dejan de necesitar `sticky`: el armazón les da su franja y nada pasa por debajo.
  >
  > La pieza que no se ve venir es **`min-height: 0`** en la cadena `.app-main` → `.board` → `.table-wrap`. Sin eso los hijos flex se niegan a bajar de su alto natural, no hay nada que recortar y el desborde reaparece abajo de todo.
  >
  > El alto es `100dvh` con `100vh` de reserva: sin `dvh`, la barra del navegador en el teléfono deja un trozo de app fuera de la pantalla.
  >
  > **En papel el armazón se suelta.** La hoja de impresión devuelve los altos a `auto` y quita el `overflow`, o se imprimiría solo lo que entraba en una ventana.
  >
  > **El tablero encierra su apilado** con `isolation: isolate`. Sus capas internas —el encabezado de días, las columnas fijas— competían de igual a igual con las de la barra de controles; al empatar decidía el orden del documento, y como el tablero va después, el encabezado de la tabla tapaba los desplegables. Encerrarlo es más sólido que subirle el número a la barra, que solo mueve el empate de lugar.
  >
  > El encabezado de la planilla se pega **un píxel por encima** del borde del contenedor, no pegado a él. Ese contenedor no siempre cae en una posición entera —medido: 178,97px—, y ahí lo pegado y lo que desplaza por detrás se rasterizan en bordes de píxel distintos: por esa costura de subpíxel asomaban las filas. El fondo estirado la tapa, y el píxel de más queda recortado contra el borde, donde no se ve.

- El encabezado va **por debajo del velo del menú lateral** en el orden de apilado. Si estuviera por encima, abrir el menú lo dejaría iluminado y clickeable sobre un velo que atenúa todo lo demás.

- **Análisis** y **Cómo usar** desplazan por dentro, que es lo que les corresponde: son largas y no tienen una planilla que se quede con el alto.

- **Escritorio**: planilla completa; la columna de tareas y la de totales quedan fijas al hacer scroll horizontal.
- **Mobile**: la tabla scrollea en horizontal con la columna de tareas siempre visible; celdas de 46 px de alto para que sean cómodas al tacto, y un **botón de zoom** para elegir cuántos días entran (ver arriba).
- Tema **claro/oscuro** automático según el sistema, con toggle manual que se recuerda.
- Hoja de estilos de impresión: oculta controles y deja solo la planilla.

## Compatibilidad

Navegadores modernos (Chrome/Edge 105+, Firefox 121+, Safari 15.4+). Usa `<dialog>`, `:has()` y `color-mix()`.
