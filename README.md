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
├── manifest.webmanifest  ← se instala como app — ver «En el teléfono»
├── sw.js                 ← el service worker: sin conexión y el recordatorio
├── pwa.js                ← lo registra
├── iconos/               ← PNG del launcher, generados por tools/
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

**2b. Habilitar la baja de cuenta.** Copiar [`db/eliminar-cuenta.sql`](db/eliminar-cuenta.sql) en el
*SQL Editor* y ejecutarlo. Crea `eliminar_cuenta()`, la función que usa el botón **Eliminar cuenta**
de Ajustes. Es opcional: sin ella la app funciona igual y el botón avisa que falta instalarla.

**2c. Habilitar la sincronización incremental.** Copiar
[`db/sincronizacion-incremental.sql`](db/sincronizacion-incremental.sql) en el *SQL Editor* y
ejecutarlo. Crea `merge_app_state`, que mezcla los parches del lado de la base. También es
opcional: sin ella la app sube el estado entero, como hacía antes.

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

## Recordatorio diario

Una **notificación del sistema** a la hora que elijas, todos los días: *«Recordá completar tu día»*. Se configura desde el menú lateral, en **🔔 Recordatorio diario**, y se apaga desde el mismo lugar.

> **Por qué esto necesita un servidor.** Una web —aunque esté instalada como app— **no puede despertarse sola a una hora fija**. La API que servía para eso, *Notification Triggers*, fue un experimento de Chrome que se retiró y nunca se lanzó. Un `setTimeout` solo corre mientras la página está viva, así que con la app cerrada no hay nada que dispare.
>
> Por eso el aviso lo manda un servidor: una **Edge Function** que `pg_cron` dispara cada cinco minutos y que le manda un **Web Push** a quien le toque. Es la única forma de que suene con la app cerrada.

La app es la única parte que **no** decide cuándo avisar: solo registra el dispositivo y guarda la hora.

### Puesta en marcha

Son cuatro pasos y **hay que hacerlos a mano**, en tu proyecto de Supabase.

**1. Generar el par de claves VAPID.** Identifican a este servidor ante los servicios de push:

```sh
npm run vapid
```

Imprime dos claves. La **pública** va en [`config.js`](config.js) —es pública por diseño, como la anon key— y la **privada nunca al repositorio**: va como secreto de la Edge Function. Se generan **una sola vez**: regenerarlas invalida todas las suscripciones activas y cada persona tendría que volver a activar el recordatorio.

**2. Crear las tablas y el reloj.** Copiar [`db/notificaciones.sql`](db/notificaciones.sql) entero en el *SQL Editor*. Antes de ejecutarlo hay que reemplazar `<PROYECTO>` y `<SERVICE_KEY>` en la definición del cron. Termina con una consulta que tiene que devolver **tres filas**; si devuelve menos, algo no quedó creado — y como con `app_state`, sin RLS la base rechaza todo.

**3. Publicar la Edge Function** con sus secretos:

```sh
supabase functions deploy recordatorios
supabase secrets set VAPID_PRIVATE_KEY="…"   # la privada del paso 1
supabase secrets set VAPID_PUBLIC_KEY="…"    # la pública, la misma de config.js
supabase secrets set VAPID_SUBJECT="mailto:tu-correo@ejemplo.com"
```

**4. Probar.** Activar el recordatorio en la app con una hora a cinco minutos de ahora, y mirar los logs de la función. Si algo falla, el diálogo de la app dice qué falta antes de dejar activarlo: navegador sin soporte, clave VAPID sin configurar, sesión cerrada o permiso bloqueado.

### Cómo está armado

| Pieza | Dónde |
|---|---|
| Genera el par VAPID | [`tools/generar-vapid.mjs`](tools/generar-vapid.mjs) — se autoverifica antes de imprimir |
| Tablas, RLS y el cron | [`db/notificaciones.sql`](db/notificaciones.sql) |
| Quién recibe el aviso y cuándo | [`supabase/functions/recordatorios/index.ts`](supabase/functions/recordatorios/index.ts) |
| La firma y el cálculo de la hora | [`supabase/functions/recordatorios/vapid.mjs`](supabase/functions/recordatorios/vapid.mjs) |
| Mostrar la notificación | `push` y `notificationclick` en [`sw.js`](sw.js) |
| Permiso, suscripción y preferencia | Sección *Recordatorio diario* de [`app.js`](app.js) |

**Son dos tablas porque son dos cosas distintas.** `push_subscriptions` es **por dispositivo** —cada navegador donde actives el recordatorio deja su endpoint, y podés tener el teléfono y la computadora—; `push_reminders` es **por usuario**: a qué hora querés que te avisen. Guardar la hora por dispositivo obligaría a configurarla en cada uno.

**El push va sin contenido.** Mandar texto obliga a cifrar el cuerpo con la clave del navegador —ECDH, HKDF y AES-GCM—, y acá el texto es siempre el mismo. Sin payload, todo lo que hace falta es la firma VAPID, que son unas pocas líneas de `crypto.subtle`. El texto lo pone el service worker al recibirlo. Las claves de cifrado se guardan igual, para que mandar texto variable más adelante no obligue a que todos vuelvan a suscribirse.

**La hora se guarda en local, con el desfase aparte.** Es la que ves en tu reloj; el servidor la lleva a UTC con `utc_offset`. Ese desfase **se reescribe en cada guardado**, así que si viajás o entra el horario de verano, el aviso sigue llegando a la hora que elegiste.

> **La ventana del disparo va hacia adelante, no a los dos lados.** El cron corre cada cinco minutos, así que una ventana simétrica mediría diez —el doble— y **dos disparos seguidos caerían adentro: el recordatorio llegaría repetido**. Con la ventana hacia adelante cae exactamente uno, sea cual sea el minuto elegido. `npm run check` lo comprueba simulando los 288 disparos de un día sobre cuatro combinaciones de hora y zona, incluida la que cruza la medianoche.

### Cómo se ofrece

La app lo **propone una vez por aparato**: una franja sobre la planilla que dice *«¿Te avisamos para completar el día?»* con dos botones. *Activar* pide el permiso, registra el dispositivo y lo deja andando a las 22 de un clic; *Ahora no* lo cierra y no vuelve a preguntar.

Es una franja y no un diálogo a propósito: interrumpir la pantalla al abrir para pedir un permiso que nadie pidió es la forma más rápida de que lo rechacen **para siempre** —un permiso denegado no se puede volver a pedir desde la web—.

Solo aparece cuando se puede aceptar: con soporte del navegador, con sesión, sin el permiso ya denegado y sin un recordatorio ya activo.

> **Que se haya ofrecido se guarda por aparato**, junto al zoom y al tema, aunque parezca una decisión del usuario y no una preferencia de pantalla. Es a propósito: la suscripción al push también es por navegador, así que ofrecerlo de nuevo en el teléfono cuando se activó en la computadora es lo correcto — ahí todavía no está activo.

**No se puede activar por todos desde la base.** Hace falta una suscripción en `push_subscriptions`, y esa solo la crea el navegador de cada persona al aceptar el permiso. Un `update ... set activo = true` dejaría a la función buscándolos todos los días para no mandarle nada a nadie, y en la base figurarían como activos. La hora sí se puede mover para quien nunca configuró nada — ver el final de [`db/notificaciones.sql`](db/notificaciones.sql).

### Lo que hay que saber antes de confiar en él

- **El plan gratuito de Supabase pausa los proyectos inactivos.** Si el proyecto se pausa, el cron muere y los recordatorios **dejan de llegar sin avisar**, que es la peor forma de fallar para un recordatorio.
- **La suscripción es por dispositivo.** Activarlo en el teléfono no lo activa en la computadora.
- **En iPhone hay que instalar la app primero.** Safari solo admite notificaciones en webs agregadas a la pantalla de inicio.
- **Desactivarlo no borra la suscripción del dispositivo**, a propósito: volver a activarlo no vuelve a pedir permiso, y un permiso que se pide dos veces es un permiso que se niega.
- El permiso se pide **recién al activar**, nunca al abrir la app. Pedirlo de entrada es la forma más rápida de que lo rechacen para siempre.

## En el teléfono

La app es una **PWA instalable**: se agrega al launcher como cualquier otra, abre a pantalla completa y **arranca sin conexión**.

**Para instalarla en Android**, abrila en Chrome y elegí *Instalar aplicación* en el menú de tres puntos. Si no aparece, es que falta alguna de las condiciones de abajo. En iPhone es Safari → *Compartir* → *Agregar a inicio*; iOS no lee el manifest, así que la pantalla completa y el ícono los piden los `<meta name="apple-*">` de `index.html`.

Hacen falta tres cosas, y las tres ya están resueltas:

| | Dónde |
|---|---|
| **HTTPS** | Lo dan Vercel, Netlify y GitHub Pages. En `localhost` también cuenta, así que se puede probar en local |
| **Manifest** | [`manifest.webmanifest`](manifest.webmanifest) — nombre, íconos, `display: standalone` y los atajos a *Diario* y *Análisis* |
| **Service worker** | [`sw.js`](sw.js), registrado por [`pwa.js`](pwa.js) |

Las rutas del manifest son **relativas**, no absolutas: así se instala igual servida en la raíz del dominio que en un subdirectorio, que es el caso de GitHub Pages. `npm run check` falla si alguna se vuelve absoluta.

### Qué se guarda para andar sin conexión

El service worker precachea el **armazón**: el HTML, el CSS, los tres scripts, el cliente de Supabase y los íconos. Con eso la app dibuja aunque no haya red.

**Los datos no se cachean ahí.** Ya viven en `localStorage`, que es local, y en Supabase. Las llamadas a la base ni se tocan: una respuesta vieja de `app_state` servida desde el caché sería *peor* que un error, porque la app la tomaría por buena y subiría encima. Sin red, `hydrateStateForUser` cae en la copia local y avisa que no está sincronizando — el mismo camino de siempre.

| Qué pide la app | Qué hace el service worker |
|---|---|
| Una ruta (`/diario`, `/analisis`) | Red primero; sin red, el `index.html` cacheado |
| CSS, scripts, íconos | Del caché, y se refresca de fondo |
| Cualquier cosa que no sea GET, o de otro origen | Pasa derecho — ahí adentro está Supabase |

Como los recursos salen del caché, **una versión nueva entra recién en la carga siguiente**: la primera visita después de publicar todavía muestra la anterior. Es el precio de que abrir sea instantáneo.

> **Al publicar cambios hay que subir `VERSION` en `sw.js`.** Es lo que invalida el caché viejo; si se olvida, los navegadores que ya tienen la app instalada siguen sirviendo el armazón anterior. La lista `ARMAZON` la verifica `npm run check`, que falla si nombra un archivo que no existe o si `index.html` carga un `vendor/` que el service worker no precachea.

### Íconos

Los PNG de `iconos/` se generan con [`tools/generar-iconos.mjs`](tools/generar-iconos.mjs) —`npm run iconos`— a partir del mismo logo que el favicon. El PNG se codifica a mano con `zlib`, que viene en Node: la app no tiene dependencias y el [`.npmrc`](.npmrc) bloquea los scripts de instalación, así que arrastrar una librería de imágenes para tres archivos que casi nunca cambian no valía la pena. **Los PNG se versionan**; el script existe para rehacerlos si cambia el logo, no para correr en cada build — la app sigue sin tener build.

Hay tres: 192 y 512 con fondo transparente, y un **maskable** de 512. Ese último lo recorta el launcher a la forma que quiera —círculo, gota, redondeado—, así que lleva fondo opaco y el logo dentro de la zona segura, el 80% central. Sin él, Android encierra el ícono en un cuadrado blanco.

### Lo que una PWA no da

No hay **widgets** en la pantalla de inicio ni **notificaciones programadas** para recordarte una tarea. Eso pide una app nativa, que significaría reescribir la interfaz y —más caro— duplicar toda la lógica de cálculo: metas por período, períodos partidos, días transcurridos. Dos implementaciones que tienen que dar el mismo número, o el teléfono y la computadora se contradicen.

Tampoco está en Play Store. Se puede empaquetar como TWA con Bubblewrap —lo de acá es requisito de eso, así que no hay trabajo tirado—, pero adentro seguiría siendo esta misma app.

## Rutas

Cada sección tiene dirección propia, se puede compartir y responde a los botones de atrás y
adelante del navegador:

| Sección | Dirección |
| --- | --- |
| Hábitos | `/diario` |
| Análisis | `/analisis` |
| Pendientes | `/pendientes` |
| Ajustes | `/ajustes` |
| Cómo usar Hábitos | `/comousar` |
| Cómo usar Análisis | `/comousar-analisis` |
| Cómo usar Pendientes | `/comousar-pendientes` |

Sigue siendo **una sola página**: `app.js` reescribe la URL con la History API y muestra la
sección correspondiente. Cualquier ruta desconocida cae en Diario.

**La guía es una por sección, y cada paso es un dibujo y una frase.** El ☰ de Hábitos, el de
Análisis y el de Pendientes ofrecen cada uno *Cómo usar* **su** pantalla, y ninguna habla de las
otras. Antes era un solo texto que las recorría todas: para entender Pendientes había que atravesar
Hábitos y Análisis, y cada cosa nueva lo hacía más largo sin hacerlo más útil.

Adentro, cada paso es **el dibujo de lo que hay que tocar y una frase de lo que hace** — el **+**, el
✎, los cuatro cuadrados de color, el ☰ —. Antes eran párrafos que explicaban por qué cada cosa es
como es: cierto todo, pero *Cómo usar* no se abre para leer, se abre con una duda concreta y con la
app delante. La de Hábitos pasó de **3.941 caracteres a 477**.

> Los dibujos son los controles **de verdad**: el `+` de la guía es el mismo `path` que dibuja el
> botón de la esquina, y los cuadrados llevan las mismas clases que la leyenda del pie. Un ícono
> parecido pero propio sería una cosa más que aprender antes de encontrar el botón, y se
> desincronizaría sin que nadie se entere — hay un caso que compara los dos.
>
> **El recuadro de estado se recorre solo**: vacío → cumplido → a medias → no cumplido → no
> requerido, diez segundos la vuelta, un segundo quieto y un segundo fundiendo en el siguiente. Es
> la única manera de *mostrar* lo que la frase tendría que explicar; con el recuadro quieto hay que
> decir «cada toque pasa al siguiente» y aun así imaginarse el resto. Los colores son los mismos
> `--*-bg` que la lista, y hay un caso que lo comprueba: la guía no puede quedar enseñando un verde
> que ya no existe.
>
> Ese ciclo lleva un `animation-duration: 10s !important` que **le gana al freno de «reducir
> movimiento»** — la regla del final de `styles.css` que le pone `.01ms` a toda animación. Esa regla
> está para que nada se sacuda, pero a un ciclo infinito lo deja girando cien mil veces por segundo,
> que no es quieto: es un color embarrado, y el paso queda mostrando un solo estado de los cinco.
> Acá no se mueve nada —un recuadro cambia de color en su lugar— y ese cambio no es adorno sino el
> contenido del paso. También hay un caso, porque sin él la próxima vez que alguien toque la regla
> general el recuadro se vuelve a clavar en un color y nadie se entera.
>
> Otro caso pone un techo al largo: 1.200 caracteres por guía, 200 por frase y ningún subtítulo. No
> está para pulir la redacción, sino para que la guía no vuelva a convertirse en un manual sin que
> nadie lo note.
>
> El porqué de cada decisión no se perdió: está acá, en el README, que es donde se lo busca.

> Las tres caen en la misma pantalla —`ui.page === 'help'`— y se distinguen por `ui.guia`, que sale
> de la ruta. Por eso hay tres direcciones y no una con un parámetro en memoria: recargar o
> compartir el enlace abre la que se estaba mirando. `/comousar` a secas sigue valiendo y abre la de
> Hábitos, que es donde estaba.
>
> Las tres viven en el mismo documento y se muestra una. Traerlas por separado obligaría a pedir
> algo por red justo en la pantalla que explica que la app anda sin conexión.
>
> El cajón es **uno solo** —el mismo nodo en las tres pantallas—, así que la entrada dice cuál abre:
> *Cómo usar Hábitos*, *Cómo usar Análisis*, *Cómo usar Pendientes*. Con el rótulo a secas, la misma
> entrada en tres lugares parecería llevar siempre al mismo lado. El `href` se arma en cada dibujado
> por lo mismo: es un enlace de verdad, y abrirlo en otra pestaña tiene que llevar a lo que promete.
>
> **Ajustes no tiene guía**: no es una pantalla que se explique, es una lista de cosas que se tocan
> una vez. Lo que se decía ahí —cerrar sesión, eliminar la cuenta, instalar la app, bajar una copia—
> salió de la guía con el reparto: no era de ninguna de las tres secciones. Lo que sí era de Hábitos
> y estaba enterrado en esos pasos se quedó donde corresponde: el día que se cierra solo, y el
> recordatorio, que es una entrada de ese mismo ☰.

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
npm run check     # sintaxis, nombres repetidos, codificación, CSP, PWA y firma del push
npm test          # snapshots del DOM + casos de comportamiento
npm run casos     # solo los casos; acepta filtros: npm run casos -- zoom plegado
npm run snapshot  # regraba la referencia (solo si el cambio es intencional)
npm run medir     # cronometra la app con distintos volúmenes de datos
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
Son 17 escenarios: las tres vistas, los cuatro modos de la columna Estatus, análisis, guía, sin
tareas, selección múltiple, los diálogos, y dos de datos corruptos que ejercen las guardas de
`normalize()`.

Sirve para refactorizar: si el HTML sale igual, el comportamiento no cambió. No reemplaza probar
en el navegador —no cubre CSS, gestos ni la sesión—, pero atrapa las regresiones de render.

La referencia vive versionada en `test/__snapshots__/dom.json`, así que `npm test` corre recién
clonado el repositorio. Cuando un cambio de markup es intencional, `npm run snapshot` la regraba y
**el diff resultante entra en el commit**: ahí se lee exactamente qué se movió en el HTML.

### Casos de comportamiento

Los snapshots dicen *qué cambió*; los casos de `test/casos/` dicen *si sigue funcionando*. Son
**728 comprobaciones** repartidas en veinte archivos, cada uno sobre una funcionalidad:

| Caso | Qué cubre |
|---|---|
| `plantillas` | Fecha obligatoria, mes destino, duplicados |
| `guardar-plantillas` | Guardar el mes como plantilla, borrarlas y el tope de cinco |
| `recordatorio` | Cuándo se puede configurar el recordatorio, cuándo se ofrece solo, y qué se dice cuando no |
| `tarea-fecha` | Alta y edición: valor por omisión, validación, no mudar de mes al editar |
| `tope-100` | Ninguna tarea aporta más que su meta, y qué entra en el techo de cada día |
| `periodos-parciales` | A un período partido por el borde del mes o de la vista se le pide solo la parte visible, y a un día que no transcurrió no se le pide nada |
| `indicadores` | El mínimo de días de uso, los dos rankings de días productivos, las dos medidas del «Análisis diario» y la forma de las otras dos tarjetas |
| `ir-a` | Los dos calendarios: el nombre del mes y «Ir a…» |
| `zoom` | Los tres niveles, alto de fila y ancho de columna uniformes, ancho para el nombre |
| `plegado` | «Análisis» en el encabezado, el armazón de alto fijo y el plegado de controles |
| `boton-alta` | Los tres accesos al alta: el desplegable, el + de la planilla y el estado vacío |
| `color-marca` | Los rellenos con el color de la marca y su contraste AA en ambos temas |
| `vendor` | La app arranca con el cliente local y su `integrity` |
| `red` | Qué primitivas de red toca el cliente real: ningún WebSocket |
| `landing` | Pantalla partida de la puerta de sesión, apilado en móvil y contraste sobre el degradado |
| `recuperacion` | El ciclo completo de «olvidaste tu contraseña», con el cliente instrumentado |
| `migracion` | Un estado guardado por la versión anterior abre sin perder nada |
| `sincronizacion` | Cómo se sube: agrupado, de a uno, con reintento y sin las preferencias |
| `vista` | Los dos desplegables, y las posturas de la fila que abre «Opciones» |
| `dia-cerrado` | El cierre automático de los días transcurridos y la vuelta de medianoche |
| `guias` | Las tres guías: que cada ☰ ofrezca la suya, que se abra la que dice y que cada una hable solo de su pantalla |

Corren en **procesos separados** a propósito: cada uno instala su propio jsdom con reloj,
almacenamiento y globals sustituidos, y compartir proceso haría que un caso viera el entorno del
anterior. El costo es arrancar Node veinte veces; a cambio cada archivo se ejecuta a mano —
`node test/casos/verificar-zoom.mjs`—, que es como se depuran.

> `sincronizacion` monta además un **reloj de temporizadores propio**, para no esperar de verdad
> los 800 ms de la agrupación ni los 5 s del primer reintento. El caso adelanta el reloj a mano y
> comprueba qué se escribió en cada tramo.

Cuando un caso falla, el runner imprime su salida completa al final, después del resumen: no hay
que buscarla entre la de los que pasaron.

### Nombres repetidos

[`test/declaraciones.mjs`](test/declaraciones.mjs) falla si un archivo declara **dos veces el mismo
nombre en el mismo ámbito**. Para el lenguaje eso es legal —la segunda gana, en silencio—; en un
archivo de miles de líneas es demoledor.

No es un chequeo teórico: `moverPendiente(delta)`, escrita para las flechas de reordenar, pisó a
`moverPendiente(id, fecha)`, que movía una tarea de día en el calendario. Arrastrar dejó de
funcionar y `node --check` no dijo nada, porque no hay error de sintaxis. Lo agarraron las pruebas
de comportamiento; esta guarda lo agarra antes y dice exactamente qué línea pisa a cuál.

Es lo que un ámbito por archivo daría gratis, y está puesta justamente porque `app.js` todavía es
uno solo.

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

En **Ajustes** aparecen el **email de la sesión**, desde cuándo sos miembro y las dos salidas:

- **Cerrar sesión** — no destruye nada, se vuelve a entrar. Por eso va de contorno y no rellena.
- **Eliminar cuenta** — borra al usuario y, con él, todo lo suyo. Va en rojo relleno, que en esta
  app se guarda para lo que no tiene vuelta.

La baja la hace `eliminar_cuenta()` en Supabase —ver [Puesta en marcha](#puesta-en-marcha)— y no el
navegador: la clave anónima no puede tocar `auth.users`, y darle ese permiso al cliente sería darle
el poder de borrar **cualquier** cuenta. La función es `security definer` con `search_path` fijo y
adentro solo puede borrar una fila, la de `auth.uid()`. Todo lo demás se va con ella por
`on delete cascade`: `app_state`, `push_subscriptions` y `push_reminders`.

Del lado del navegador se borra también la copia local —incluida la copia **sin dueño**, que es la
que adopta el próximo que inicie sesión en ese mismo navegador— y se recarga la página: con el
usuario borrado, el cliente tiene en mano un token de alguien que ya no existe.

Antes de borrar nada se pide confirmación, con el email a la vista y un recordatorio de que
**☰ → Exportar** guarda una copia.

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
- **Viaja solo lo que cambió.** Ver abajo.

### Qué viaja en cada escritura

Hasta acá cada escritura llevaba **el estado entero**. Con 24 tareas eso son unos 40 KB, y crece con
el historial: cerca de 1 MB a los tres años, por cada tanda de clics. El tamaño no dependía de lo
que hubieras cambiado sino de cuánto llevabas acumulado, que es exactamente al revés de lo que
conviene.

Ahora el cliente manda **un parche**: la diferencia entre el estado actual y lo último que la base
confirmó tener. Marcar una celda son **34 bytes**, y siguen siendo 34 bytes con diez años de
historial encima.

El formato es [JSON Merge Patch (RFC 7386)](https://www.rfc-editor.org/rfc/rfc7386): las claves que
cambian traen su valor nuevo, las que se borran traen `null`, y lo que no cambió no viaja. Del otro
lado lo mezcla `merge_app_state`, una función SQL que hay que instalar una vez
—[`db/sincronizacion-incremental.sql`](db/sincronizacion-incremental.sql)—.

```js
// desmarcar una celda y renombrar una tarea, en la misma tanda
{ "status": { "t1|2026-08-05": null },
  "months": { "2026-08": [ /* el mes entero: un arreglo se reemplaza, no se mezcla */ ] } }
```

> **La fila y el formato del payload no cambian.** Sigue siendo el mismo `jsonb` en `app_state`, así
> que un cliente que todavía no se actualizó lo lee y lo escribe como siempre. Es lo que permite
> hacer este cambio sin coordinar todos los dispositivos a la vez.

Tres cosas que sostienen que el parche sea correcto:

- **La sombra.** El cliente guarda en memoria lo último que la base confirmó tener y calcula contra
  eso. Se llena al leer al abrir la app y en cada escritura exitosa.
- **Sin sombra, va todo.** La primera escritura de una cuenta vacía, y cualquiera después de un
  error, mandan el estado completo: tras un fallo no se sabe qué quedó del otro lado, y el volcado
  entero es el camino que no depende de saberlo.
- **Sin la función instalada, va todo.** Si `merge_app_state` no está, el cliente lo detecta en el
  primer intento, vuelve al `upsert` de siempre y no insiste. Instalarla es un paso de puesta en
  marcha, no un requisito.

Un efecto lateral útil: como el parche se calcula contra lo que la base tiene *tal cual*, la primera
escritura contra una fila vieja **la normaliza** —borra con `null` las claves de versiones
anteriores— sin necesidad de una migración aparte.

> **Lo que esto no resuelve.** Entre dos dispositivos sigue ganando el último que escribe, solo que
> ahora pisa lo que tocó y no el estado entero: dos aparatos editando meses distintos ya no se
> borran mutuamente. La mezcla fina por celda necesita una fila por marca, que es la
> [etapa 3 de la migración](db/MIGRACION.md).

Agrupar abre una ventana de hasta 800 ms con cambios guardados acá y todavía no en la base. Si la
pestaña muere justo ahí —un cierre forzado, quedarse sin batería—, esos cambios quedan anotados en
`tareas-diarias/v1/<id>/pendiente`, con la hora en que se hicieron. Al volver a entrar esa marca
se compara contra el `updated_at` de la fila remota: **si lo local es más nuevo, gana lo local** y
se sube. Sin esa comparación, la lectura remota pisaba en silencio justo lo último que se hizo.

> Las dos marcas las escribe un cliente, así que se comparan como instantes y no como texto: el
> `updated_at` de Postgres vuelve con offset (`+00:00`) y el nuestro con `Z`, y ordenadas como
> cadena esas dos formas mienten.

### Lo que no se sincroniza

El tema, el zoom, el plegado de controles, los paneles del análisis, el modo de la columna
*Estatus* y la medida del *Análisis diario* describen cómo se ve la app **en este aparato**, no
qué hizo el usuario. Se guardan solo
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
| Semanal | Un punto por semana entera (de lunes a domingo) que el mes contenga: **3 o 4** según el mes |
| Quincenal | Un punto por quincena — del 1 al 15 y del 16 a fin de mes: 2 |
| Mensual | Un punto en todo el mes: 1 |
| Personalizado | Según el submodo, ver abajo |

> **Semanas enteras, no calendarios tocados.** Un mes toca cinco o seis semanas, pero solo contiene tres o cuatro completas: el resto son tramos partidos que siguen en el mes vecino. La meta cuenta las enteras, y a los tramos les pide la parte proporcional — que casi nunca llega a pedir una vez. Marcar en un tramo partido igual te acredita. El detalle está en [Períodos partidos](#períodos-partidos).

**Personalizado** tiene dos formas de medirse:

- **Días fijos de la semana** — elegís los días (L M X J V S D) y la meta es un punto por cada uno que caiga en el mes.
- **Meta mensual, sin días fijos** — cargás un número (*12 veces al mes*) y no indicás días. Ningún día queda como requerido: hacés la tarea cuando puedas y la marcás ahí.

  En vistas más chicas la meta se reparte proporcionalmente sobre los días del mes y se **redondea hacia arriba a acciones enteras**: 12 al mes son `12 × 7/31 ≈ 2,7` en una semana, o sea **3**. En la vista mensual siempre muestra el número exacto que cargaste.

  > **Por qué se redondea.** Estas metas se cumplen con actos indivisibles: «socializar» se hace o no se hace, no existe hacer 0,26 de socializar. Sin redondear, la meta de un solo día quedaba en fracciones —`8/31 = 0,26`— y una única marca contra esa meta daba **388%**: aritmética correcta sobre una unidad que no existe.

  Cuando la ventana es tan chica que ni siquiera llega a pedir una acción —el caso de la vista diaria—, **no hay obligación que incumplir**: ahí el cumplimiento lo fija lo que hiciste. Cumplido da 100%, parcial 50% y un día en blanco muestra `—`, no 0%. Un cero acusaría de incumplida a una tarea que ese día no debía nada.

  El reparto se hace sobre los **días del mes**, no sobre los que la tarea tiene disponibles. Es lo que hace que empezar tarde reduzca lo que se espera en vez de amontonarlo: una tarea de 8 al mes que arranca el día 31 no pide las 8 acciones ese día — pide una, y hacerla da 100%.

  > Esta ya no es una regla propia de la meta mensual: es **la** regla, y la comparten todas las frecuencias — ver [Períodos partidos](#períodos-partidos). Lo único particular de este submodo es que su período es el mes entero y pide el número que cargaste, en vez de una vez.

### Nombres únicos

Dos cosas con el mismo nombre en la misma lista son indistinguibles: no hay forma de saber cuál es
cuál en la lista, en el gráfico ni en el archivo. Por eso el nombre es único **donde conviven**, y
se puede repetir donde no:

| | Único entre | Se puede repetir en |
|---|---|---|
| Tarea de Hábitos | las del mes | otro mes |
| Categoría de Pendientes | las de primer nivel | — |
| Subcategoría | las de su misma madre | otra categoría |
| Tarea pendiente | las de su misma categoría | otra categoría |

La comparación es como la leería una persona —sin distinguir mayúsculas ni acentos, y sin los
espacios de los bordes—: «Correr» y «correr» son el mismo hábito escrito de dos maneras. Al editar,
el nombre propio no cuenta como repetido, así que guardar sin tocar nada sigue funcionando.

Las **plantillas** siguen la misma regla: al aplicar una, las tareas cuyo nombre ya está en el mes
quedan afuera y el aviso las **nombra** —«2 ya estaban» obligaba a ir a buscar cuáles—. Vale también
para una plantilla que repita un nombre adentro suyo: entra una sola vez.

### Fecha de inicio

Cada tarea tiene una **fecha de inicio obligatoria**. Antes de esa fecha la tarea no existe:

- Los días anteriores **no se pueden marcar** y aparecen como no requeridos.
- No cuentan para la meta: una tarea diaria que arranca el 15 de julio tiene meta 17, no 31.
- Si el inicio cae en un mes posterior al que estás mirando, la tarea no tiene meta ahí y su cumplimiento muestra `sin meta`.

Si ya habías marcado días que después quedan antes del inicio, dejan de mostrarse y de sumar, pero **el dato no se borra**: si corrés la fecha hacia atrás, vuelven a aparecer.

Al **crear** una tarea el campo llega precargado con **hoy**, que es cuando suele empezar un hábito que estás dando de alta. Y esa fecha **decide a qué mes va la tarea**, sin importar en qué mes estés parado: darla de alta desde un mes viejo la crea igual en el mes de su fecha, y la app te lleva ahí. Es la misma regla que en las plantillas.

Al **editar** gana la fecha que ya tenga la tarea, y cambiarla **no la muda de mes**: la tarea vive en la lista del mes donde está, y mudarla partiría su historial en dos. Correr un inicio unos días es algo que se hace seguido y no debería tener ese efecto.

Si una tarea no tiene fecha —por ser anterior a que el campo fuera obligatorio—, al editarla se propone el **día 1 del mes visible** y no hoy: proponer hoy recortaría el historial, porque guardar sin tocar nada apagaría los días ya cargados anteriores a la fecha y dejarían de contar para la meta. El día 1 es justamente lo que significaba no tener fecha, así que completarla no cambia nada.

La fecha de inicio no se escribe en la fila de la tarea para no alargarla; se ve al pasar el mouse sobre la frecuencia y al editar la tarea.

Como marcar de más está permitido, **los puntos pueden superar la meta**: una tarea semanal marcada tres veces en una semana suma 3 contra una meta de 1. Pero **el cumplimiento topea en 100%** — cumplir es cumplir, y de ahí no se sube. Los números crudos siguen a la vista en el tooltip de la celda (*«3 sobre una meta de 1»*), así que hacer de más se ve igual sin inflar la medida.

**El cumplimiento del día cuenta por día, no por tarea.** Entra en la cuenta lo que ese día se pidió y lo que se hizo aunque no se pidiera, un punto de meta por cada uno: es exactamente lo que la lista muestra encendido. Una tarea de lunes a viernes hecha un domingo cuenta **1 de 1** ese domingo — hacer de más nunca puede empeorar el día.

> Antes esta cuenta se hacía por tarea y con el tope de la meta de cada una, así que esa misma fila se veía cumplida y valía **0 de 0**: la tarea no pedía nada el domingo, y su punto no tenía dónde entrar. El resultado era que el día decía un porcentaje en la lista y otro en el gráfico de barras —que siempre contó por día—. El 30 de agosto de 2026 llegaron a decir **35%** y **41%** sobre las mismas marcas. Ahora es una sola cuenta.
>
> Marcar ✕ un día que no tocaba sigue sin restar: no se puede incumplir lo que no se pidió.

> **El cumplimiento del MES no lleva ese tope.** Ahí se suman los puntos enteros: lo hecho de más en una tarea compensa lo que falta en otra, que es lo que se pidió expresamente. La pregunta que contesta ese número es cuánto se hizo en el mes contra cuánto se pedía, no si cada tarea por separado se cumplió — eso lo contesta la barra de cada una, que sí topea en 100%. El porcentaje del mes tampoco pasa de 100%: un cumplimiento del 130% no querría decir nada.

**En reposo cada fila muestra solo el nombre, la frecuencia y ✎ para editarla.** Los casilleros y los chevrones **▲ ▼** aparecen recién al pedirlos, desde *Opciones* — ver [Posturas de la fila](#posturas-de-la-fila). El orden se guarda junto con los datos.

También se puede **arrastrar una tarea tomándola del nombre** para reordenarla. Una línea de acento marca dónde va a caer según de qué lado del medio de la fila esté el puntero. La fila solo se vuelve arrastrable mientras el puntero apoya sobre el nombre: si no, arrastrar desde una celda de estado movería la tarea sin querer. Los chevrones siguen ahí porque el arrastre no funciona en pantallas táctiles. Para borrar se usa el casillero (ver abajo).

**El alta tiene tres accesos**, que abren el mismo diálogo:

| Dónde | Cuándo se usa |
|---|---|
| **+ Agregar tarea** | Primero del apartado *Tareas* del desplegable **Opciones** |
| El **+** de la esquina inferior izquierda | Al pie de la columna *Tareas*: es donde está la mano después de recorrer la lista |
| El botón de la pantalla de «sin tareas» | Cuando el mes está vacío y no hay planilla que dibujar |

El **+** de la planilla lleva el mismo relleno de marca que *Opciones*, y mide lo mismo que las flechas que mueven el período porque comparte su clase `icon-btn` — no porque el número esté copiado. Va sangrado a la vertical de los nombres de las tareas.

**No agrega ninguna fila:** ocupa la celda del pie que antes tenía el rótulo `Cumplimiento diario`. Así la planilla no crece y el botón queda igual de cerca de la última tarea.

> Ese rótulo desaparece de la vista pero **no del árbol de accesibilidad**: sigue en el `aria-label` de la celda, que es lo que un lector de pantalla anuncia antes de leer los porcentajes de cada día. Sin él, esa fila pasaría a llamarse *«Agregar tarea»* — que es el botón, no la fila.

### Opciones del mes

Todo lo que se puede hacer sobre el mes vive en un botón **Opciones**, agrupado por lo que toca:

| Apartado | Qué hay |
|---|---|
| **Tareas** | *+ Agregar tarea*; las tres posturas —*Eliminar tareas*, *Reordenar tareas* y *Resetear estados*—; y al final *Copiar tareas del mes anterior* y *Guardar como plantilla* |
| **Visualización** | El zoom de la planilla. Solo en móvil: en escritorio la planilla entra y el apartado entero no existe |

> **Antes eran seis botones sueltos en una fila.** Agruparlos muestra una distinción que la fila plana no podía: ahí *Resetear estados* y *Copiar tareas del mes anterior* se leían como vecinos del mismo rango, cuando uno borra marcas y el otro reemplaza la lista entera.
>
> **El orden dentro del apartado también dice algo.** Arriba, el alta y las tres posturas: lo que se usa a diario y opera sobre las tareas que elegís. Abajo, separadas, las dos que trabajan sobre la **lista completa** del mes — una la reemplaza y la otra la guarda.
>
> Los íconos van en una **ranura de ancho fijo**: los glifos no miden lo mismo —un emoji es bastante más ancho que una flecha—, así que sin ranura cada renglón arrancaba su texto en un lugar distinto. Con ella quedan centrados en una columna y los siete rótulos empiezan en la misma vertical. El `+` del alta pasó a ser un ícono más, en vez de vivir dentro del texto.
>
> El menú **se cierra al elegir**, porque casi todo lo que hay adentro abre un diálogo. La excepción es el zoom: cicla tres niveles, así que se queda abierto para poder recorrerlos sin volver a desplegar.
>
> Es el mismo mecanismo que el desplegable de vista —cierra con `Esc`, con un clic afuera, y devuelve el foco al botón— y **abrir uno cierra al otro**.
>
> El relleno con el color de la marca pasó de *+ Agregar tarea* a **Opciones**: es la entrada a todas, y dejar el color adentro del menú lo escondía. El alta sigue siendo lo primero del primer apartado, y además tiene el **+** de la esquina inferior izquierda y el botón de la pantalla de «sin tareas», así que dar de alta una tarea sigue estando a un clic — ver [Tareas](#tareas).

### Posturas de la fila

En reposo las filas van limpias. Tres entradas del apartado *Tareas* las ponen en una **postura**, que hace aparecer en cada una los controles de esa operación:

| Entrada | Qué aparece en cada fila |
|---|---|
| **🗑 Eliminar tareas** | El **casillero**, más el de *todas* junto al encabezado |
| **↺ Resetear estados** | El **casillero**, igual que arriba |
| **⇅ Reordenar tareas** | Los chevrones **▲ ▼**, uno al lado del otro |

Con una postura puesta aparecen **✓ y ✕** en la barra, entre el selector de vista y *Opciones*. El **✓** remata la acción —siempre pasando por un diálogo de confirmación que nombra lo afectado— y el **✕** sale sin aplicar nada. El ✓ queda **apagado mientras no haya nada que confirmar**, y su tooltip dice qué falta: *«Tildá las tareas a eliminar»*.

Elegir una postura **apaga las otras** —compiten por el mismo lugar de la fila— y volver a elegir la que está puesta devuelve las filas a su estado limpio. Sin tareas en el mes las tres se apagan, porque no habría sobre qué operar.

> **Reordenar es el caso raro.** Los chevrones aplican en el acto: hay que ver el movimiento para saber si quedó bien. Lo que lo vuelve cancelable es que al entrar se anota el orden de partida, así el ✕ puede devolverlo. Confirmar es quedarse con lo que ya está aplicado y soltar esa vuelta atrás.
>
> **La confirmación está en la barra y no en el menú.** Antes eran dos entradas más del desplegable —*Eliminar N tareas*, *Resetear N tareas*—, que obligaban a volver a abrirlo para rematar lo que ya se había empezado, justo cuando la mirada estaba en las filas tildadas.
>
> **Cualquier cambio de postura suelta lo tildado.** Eliminar y resetear comparten los casilleros, y arrastrar una selección de una a la otra es exactamente el descuido que termina borrando lo que se quería limpiar.

> **Antes estaban siempre.** Cada renglón cargaba con un casillero y un par de chevrones que casi nunca se usan, apretados contra el nombre y a media opacidad para que estorbaran poco. Sacándolos de ahí, el nombre respira y los chevrones pueden ser grandes y horizontales cuando por fin hacen falta — que es justo cuando hay que apuntarles con el dedo.
>
> Los controles **no se esconden con CSS: no se dibujan**. Uno invisible pero presente sigue estando en el recorrido del teclado y en el árbol de accesibilidad.

### Sobre varias tareas a la vez

Con una postura de selección puesta, al tildar **una o más** casillas las filas quedan resaltadas y el **✓** de la barra se habilita. Qué hace depende de la postura:

| Postura | Qué hace el ✓ |
|---|---|
| **Eliminar tareas** | Saca esas tareas del mes visible junto con sus estados de ese mes |
| **Resetear estados** | Deja en «sin cargar» las celdas de esas filas **dentro del rango visible**, sin tocar las tareas |

El casillero junto al encabezado **Tareas** selecciona o deselecciona todas de una vez, y queda en estado intermedio si hay algunas tildadas pero no todas. Las dos piden confirmación y listan las tareas afectadas; hecha la acción, la postura **se cierra sola**.

**El alcance de cada una es distinto, a propósito.** Eliminar saca la tarea del mes, así que borra sus estados de todo el mes. Resetear opera sobre **lo que estás viendo**: en vista semanal borra solo esa semana, en diaria solo ese día, en mensual el mes entero. El diálogo nombra el rango antes de confirmar, y el tooltip del ✓ lo anticipa.

Ambas respetan el aislamiento entre meses. La selección se limpia al cambiar de mes y al completar cualquiera de las dos acciones.

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

El tinte de fin de semana se mantiene en el encabezado de días y en la fila de cumplimiento del pie, como referencia de calendario.

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

  La meta se cuenta **por período**, así que se ajusta a lo que estés mirando: una tarea semanal se mide contra 4 puntos en un mes de cuatro semanas y contra 1 en la vista semanal.

  **Lo que no transcurrió no se exige.** La meta cuenta los días del rango que ya vencieron; los que todavía no llegaron quedan afuera, porque en ellos no se incumplió nada. El 20 de agosto, una tarea diaria marcada los veinte días va **20 de 20 — 100%**, no 20 de 31.

  > **Antes el porcentaje medía el avance del mes, no el cumplimiento.** La meta era la del rango entero, así que el 4 de agosto esa misma tarea sin faltar un día marcaba 4 de 31: **13%**, pintado de rojo. La columna decía llamarse cumplimiento y estaba midiendo otra cosa.
  >
  > Lo que se perdió con el cambio es poder leer *cuánto del mes llevás hecho* de un vistazo: para eso ahora hay que mirar los números crudos del tooltip —*«20 sobre una meta de 20»*— en vez del porcentaje. A cambio, un mes al día se ve al día en cualquier momento.

  **Lo hecho por adelantado sí suma.** Es el mismo criterio de la fila `Cumplimiento diario`: lo hecho es lo hecho; lo que no se cuenta es un incumplimiento que todavía no ocurrió. Un día futuro marcado entra con meta propia —cae en el redondeo a acciones enteras de [Períodos partidos](#períodos-partidos), donde la meta la fija lo que hiciste—, así que da *«31 sobre una meta de 31»* y no *«31 sobre 30»*, que insinuaría haberse pasado. Un ✕ adelantado, en cambio, no agrega nada: cero puntos y cero meta.

  Dentro de un período ya vencido, la meta sigue siendo la del **período completo**: una tarea de lunes, miércoles y viernes vista en una semana terminada apunta a 3, y hacerla dos veces da 67%.

  Si la frecuencia no pide ningún día del rango —una *Lunes a viernes* en la vista diaria de un sábado— no hay nada que medir y muestra `—`. Un mes entero por venir tampoco exige nada, así que sus filas abren en `—` en lugar de en rojo.

#### Períodos partidos

Los meses no terminan en domingo y las vistas no se alinean con las semanas, así que casi siempre hay períodos de los que solo se ve un pedazo. **A un período partido se le pide solo la parte que se ve**, prorrateada y redondeada hacia arriba a acciones enteras — la misma regla que las tareas de *meta mensual* (ver [Tareas](#tareas)).

Agosto de 2026 arranca sábado, así que toca seis semanas:

| Semana | Días en el mes | Le pide a una tarea semanal |
|---|---|---|
| 1–2 ago | 2 de 7 | `2/7 = 0,29` → nada |
| 3–9 · 10–16 · 17–23 · 24–30 | 7 de 7 | 1 cada una |
| 31 ago | 1 de 7 | `1/7 = 0,14` → nada |

La meta del mes es **4**, que es la cantidad de semanas que el mes contiene de verdad. Hecha una vez por semana, da 100%.

> **Antes bastaba con que un día del período estuviera a la vista para exigirlo entero**, y eso distorsionaba todos los bordes. Esa misma tarea marcaba **4 sobre 6 — 67%**, pintado de amarillo, habiéndola cumplido todas las semanas del mes. Hacia abajo era peor: en la vista semanal una tarea *Mensual* pedía su única vez en cada una de las seis semanas —0% en cinco de ellas—, y una *Quincenal* pedía **dos** en la semana que cruza el día 15.
>
> Las quincenas nunca tuvieron el problema en la vista mensual: se cortan por día del mes (1 al 15 y 16 a fin de mes), así que siempre son dos completas.

Cuando la parte visible **ni llega a pedir una acción**, no hay obligación que incumplir: ahí la meta la fija lo que hiciste. Sin marcar muestra `—` y no un 0%, y marcando te acredita — una semanal hecha el 1 de agosto va 1 sobre 1, no queda invisible.

> **Esa meta improvisada nunca pasa de lo que pide el período completo.** Una tarea de *una vez por semana* no puede pedir dos en media semana por haberla hecho dos veces. Sin el tope, hacerla de más se cobraba a sí mismo: las dos marcas levantaban una meta de 2 y se gastaban en llenarla, así que una tarea hecha **dos veces** en la semana en curso medía **igual** que otra hecha una sola vez. El tope es el del período, no un 1 fijo: una de *dos veces al mes* puede improvisar hasta 2.

Por eso el guion de la columna `Estatus` tiene ahora **dos motivos distintos**, y el tooltip dice cuál:

| Guion | Cuándo |
|---|---|
| *La frecuencia no pide ningún día del rango* | Una *Lunes a viernes* mirada un sábado |
| *El rango es solo una parte del período* | Una *Semanal* en el tramo del 1–2 de agosto |

Empezar a mitad de período funciona igual: una tarea semanal que arranca el jueves 20 tiene 4 de los 7 días de esa semana, así que esa semana no le pide nada. Es la misma idea de siempre — empezar tarde reduce lo que se espera, no lo amontona.
- **Por columna** (la fila del pie, cuya esquina izquierda ocupa el botón de alta): cumplimiento de ese día, con el mismo símbolo y los mismos umbrales que la columna `Estatus` — el símbolo arriba y el porcentaje debajo.

  El día cuenta **lo que pedía, más lo que hiciste sin que lo pidiera**. Cada una suma uno al techo:

  | Entra | Cuándo |
  |---|---|
  | Las que el día **pide** | Siempre, se hayan hecho o no |
  | Las que **no pedía** | Solo si se hicieron —cumplida o parcial— |

  Lo que queda afuera es lo que ni se pedía ni se hizo: una *Semanal* sin tocar ese día, una *Lunes a viernes* en sábado, una *Personalizado* fuera de sus días, o una marcada a mano como *no requerido*. Una ✕ en un día que no la pedía tampoco entra — no hacer algo que nadie pidió no es un incumplimiento.

  > **Hacer de más suma, no resta.** Una tarea semanal marcada un martes agrega 1 al techo y 1 a lo hecho: el día tuvo una cosa más para mostrar. Es la diferencia con la fila y el total del rango, donde `aporte` topea cada tarea en su meta — ahí lo de más compensaría el incumplimiento de otra, y acá no hay nada que compensar.
  >
  > **Los días que no transcurrieron muestran `—`.** Nada venció todavía, así que no hay techo: un 0% ahí acusaría de incumplido un día que no llegó. Lo que se haya marcado por adelantado sí se ve —lo hecho es lo hecho—; lo que no se muestra es un incumplimiento inventado. Es el mismo criterio con el que los promedios por día de la semana ya descartaban el futuro.
  >
  > Antes el techo eran **todas las tareas iniciadas**, pidiera el día o no. Con 18 tareas de las que el lunes pedía 11, hacer 8 daba **44%** cuando la cuenta es 8 sobre 11: **73%**. Si el día no pide nada y no se hizo nada, muestra `—`, no 0%.

  > Antes mostraba la suma cruda de puntos —«1,5»—, que no decía contra cuánto se medía: 1,5 puede ser excelente con dos tareas y flojo con ocho. El porcentaje ya trae esa comparación hecha y el símbolo la resume de un vistazo.
  >
  > Los dos se ven **siempre**. El modo que cicla el encabezado `Estatus` gobierna esa columna, no el pie, así que estas piezas no llevan las clases que ese modo esconde.
  >
  > Van apilados y no uno al lado del otro porque la columna de un día mide 29px en móvil, y 23,8 en *Compacto*: es el mismo apilado del encabezado, donde el nombre del día va sobre el número. El cuerpo del porcentaje sigue al zoom — con cuerpo fijo, «100%» pide 24px y en *Compacto* se desbordaba por dos décimas.
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

Los nombres duplicados también se comparan contra el mes destino, no contra el visible.

Las tareas de una plantilla se crean con ids nuevos, así que no arrastran estados de ningún lado.

#### Guardar y borrar plantillas

Además de las cuatro que trae la app, se pueden **guardar las tareas de un mes como plantilla propia**, desde *Opciones → 🔖 Guardar como plantilla*. Pide un nombre y guarda cada tarea con su frecuencia.

Lo que **no** se guarda importa tanto como lo que sí:

- El **id**, porque la plantilla crea tareas nuevas cada vez que se aplica. Si viajara, dos meses compartirían id y con él sus estados.
- La **fecha de inicio**, porque la elige quien la aplica, en el campo del diálogo — igual que en las de fábrica.

La **descripción se arma sola** (*«Guardada desde julio 2026»*): pedirla sería un campo más para algo que la app ya sabe, y de dónde salió una plantilla es justo lo que se olvida.

**Para borrar**, cada ficha del diálogo de *Plantillas* tiene su **✕**. Pide confirmación nombrando la plantilla.

##### El tope de cinco

Se pueden tener **cinco plantillas en total, contando las de fábrica**. Con los cinco lugares tomados, la entrada de *Opciones* queda apagada y el tooltip dice por qué — igual que cuando el mes no tiene tareas que guardar, que es la otra razón para no poder.

**Las de fábrica también se borran**, y eso es lo que le da sentido al límite: sin poder sacarlas, cuatro de los cinco lugares estarían tomados de entrada y guardar una propia sería casi siempre reemplazar la anterior. Borrás las que no usás y las reemplazás por las tuyas.

> De una plantilla de fábrica borrada se guarda **su ausencia** —el id en `removedTemplates`— y no la lista completa. Copiar las cuatro al payload las congelaría en la versión que tuvieran el día que alguien tocó cualquier cosa, y dejarían de mejorar con la app. Un id que ya no exista en `TEMPLATES` se descarta al leer: si mañana se renombra o se quita una, su id no puede quedar marcado como borrado para siempre.
>
> **No hay vuelta atrás para las de fábrica.** Borrar las cuatro es definitivo; se recuperan creándolas a mano. El diálogo lo avisa antes de confirmar.

Las plantillas propias son **datos tuyos**, no una preferencia de pantalla: van en el payload junto a las tareas y los estados, así que están en la computadora y en el teléfono, y entran en *Exportar* e *Importar*. Un estado guardado por la versión anterior abre igual — sin la clave, arranca con las cuatro de fábrica.

Lo que llega de afuera se sanea con las mismas reglas: una plantilla sin tareas no describe nada y se descarta entera, los nombres repetidos se descartan sin distinguir mayúsculas, las frecuencias inventadas caen en *Diaria*, y un archivo con veinte plantillas se recorta al tope en vez de dejar la app en un estado que su propia interfaz no permite crear.

Se cierra con el botón **✕**, con `Esc` o haciendo clic fuera. El selector de mes sigue visible en la sección de Análisis, porque las tarjetas son mensuales; el selector de vista y la navegación por semana/día solo aparecen en el Diario.

En el **encabezado**, junto al cambio de tema, hay un botón que alterna entre las dos secciones sin abrir el menú: dice **◔ Análisis** en la planilla y **▦ Diario** en la sección de análisis. En móvil se queda solo con el icono, porque el ancho no da para el rótulo.

### Análisis

La sección tiene dos paneles plegables, **Indicadores** y **Gráficos**. Ambos recuerdan si los dejaste cerrados. Todo lo que muestran **describe el mes completo**: un promedio por día de la semana no significa nada dentro de una sola semana.

#### Gráficos

Son SVG dibujados a mano, sin librerías, para no romper la regla de cero dependencias.

| Gráfico | Qué responde |
|---|---|
| **Reparto de estados** (torta) | De lo que va del mes, cuánto marcaste y cómo. El centro indica qué proporción llegaste a registrar |
| **Análisis diario** (barras) | Qué días rendís mejor, con la medida que elijas — ver abajo. El mejor va en verde y el peor en rojo, con su valor rotulado; los demás quedan neutros. Respeta el [mínimo de siete días](#el-mínimo-de-siete-días) |
| **Cumplimiento por tarea** (barras horizontales) | Qué tareas están flojas, ordenadas de mejor a peor |

Notas de lectura:

- Los colores son **los mismos estados del tablero**, para que una celda verde y su porción del gráfico se lean como lo mismo. Se usan pasos un punto más oscuros en modo claro para que todos superen 3:1 de contraste contra la tarjeta, y pasos propios —no un volteo automático— en modo oscuro.
- Verde y amarillo **no se distinguen por tono** bajo protanopia. Por eso en la torta cada color viaja con su símbolo (✓ ~ ✕) y su palabra en la leyenda, y en el de tareas cada barra lleva su porcentaje al lado: la identidad nunca depende del color solo.
- En *Análisis diario*, el botón de la **esquina superior derecha** alterna las dos medidas de un día — las mismas dos que muestran las tarjetas de productividad:

  | Botón | Qué miden las barras |
  |---|---|
  | `123` | Cantidad de tareas hechas por día, en promedio |
  | `%` | Porcentaje de cumplimiento de cada día |

  El botón muestra la medida **activa**, no la siguiente, igual que el de zoom muestra el nivel puesto; el tooltip nombra las dos. La elección se guarda como [preferencia de pantalla](#lo-que-no-se-sincroniza), junto al zoom y al plegado: describe cómo mirás la app en este aparato, así que no viaja a la base.

  Las dos medidas coronan días distintos y por eso conviene poder ver las dos: el lunes suele ganar por cantidad porque tiene más tareas asignadas, no porque rindas mejor. Con `%` un día puede quedar **sin barra** si ninguna tarea le pedía nada — ahí no hay nada que medir, y no es lo mismo que un cero.
- En *Cumplimiento por tarea* la barra se topea en la meta. Si una tarea llega al 600%, escalar a ese máximo aplastaría a todas las demás y el rango que importa —45 a 100%— dejaría de leerse; el número al costado conserva el valor exacto y la barra que se pasa termina en escuadra contra el borde.

#### Indicadores

En el orden en que aparecen:

| Indicador | Qué muestra |
|---|---|
| **Días más productivos** | El día de la semana que rinde mejor, medido de las dos maneras — ver abajo |
| **Días menos productivos** | Lo mismo, en el otro extremo |
| **Necesitan tu atención** | Cuántas tareas del mes están en rojo (cumplimiento menor al 45%), con sus nombres |
| **Mes actual vs mes pasado** | Diferencia en puntos porcentuales entre el cumplimiento del mes visible y el del mes anterior, en verde si subió y en rojo si bajó. Los dos se miden sobre sus días vencidos, así que un mes a medio andar se compara por cómo viene y no pierde de entrada contra uno cerrado |

##### Las dos medidas de un día productivo

«Productivo» significa dos cosas distintas, y las dos tarjetas muestran las dos porque suelen coronar días **distintos**:

| Medida | Qué promedia | A quién favorece |
|---|---|---|
| **Cantidad** | Puntos del día: cuántas tareas hiciste, sin mirar contra qué | Al lunes, que tiene más tareas asignadas |
| **Completitud** | Qué proporción de lo que ese día pedía se cumplió | Al domingo, que cumple el 100% de las pocas que le tocan |

La completitud se agrega sumando puntos y techos **antes** de dividir, igual que la comparación mensual: promediar los porcentajes de cada día le daría el mismo peso a un domingo que pedía una tarea que a un lunes que pedía veinte.

Cada medida ocupa **su propia subtarjeta** dentro de la tarjeta, con el criterio a la izquierda y el resultado a la derecha:

```
DÍAS MÁS PRODUCTIVOS
┌──────────────────────────────────────┐
│  · Por cantidad:     Viernes · Sábado│
│                          2,9 tareas  │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  · Porcentualmente:         Domingo  │
│                                 79%  │
└──────────────────────────────────────┘
```

El día es el dato, así que se lleva el cuerpo grande y el color del extremo —verde el mejor, rojo el peor—; el criterio y la cifra lo acompañan en gris. Los empates dentro de una medida se listan separados por `·`.

Encerrar cada medida separa las dos lecturas de un vistazo: en una lista corrida se leían como cuatro renglones sueltos. Las subtarjetas usan `--bg-sunken`, el token de superficie hundida, que queda apenas más gris que el blanco de la tarjeta en tema claro y apenas más negro en oscuro — la jerarquía se sostiene en los dos sin definir colores nuevos.

Dos detalles de alineación que el diseño necesita:

- **La columna del criterio mide lo mismo en las dos subtarjetas** (`--rank-criterio`), así los días quedan alineados entre sí en lugar de arrancar cada uno donde termine su rótulo — *Por cantidad* y *Porcentualmente* no miden igual. Es un ancho fijo y no `subgrid`, que lo resolvería sin número pero pide Chrome 117 cuando la app declara soporte desde el 105; es la misma razón por la que `.month-nav` lleva su propia rejilla.
- **Las subtarjetas se centran en el alto sobrante**, como el contenido de cualquier tarjeta — ver abajo.

Si el criterio y el resultado no entran en la misma línea —una tarjeta angosta en móvil, o un empate de varios días— el resultado baja solo y queda centrado a lo ancho, y los días siguen alineados entre sí.

Los dos renglones aparecen **aunque las dos medidas coronen al mismo día**: ahí cada uno lo dice bajo un criterio distinto y con su propio número, así que no hay repetición que ahorrar. Lo que sí desaparece es el renglón de una medida que no distingue nada —todos los días empatados—; si ninguna de las dos distingue, la tarjeta muestra `—` y *«Todos los días parejos»*.

##### El mínimo de siete días

Las tarjetas y el gráfico de *Promedio por día de la semana* **no muestran nada hasta que el mes tenga 7 días de uso**; en su lugar va un aviso que dice cuántos van.

Siete es el mínimo con sentido: es lo que tarda cada día de la semana en aparecer una vez. Con menos, el ranking no compara promedios sino qué días cayeron dentro del tramo — un mes recién empezado coronaría al lunes por haber tenido un lunes.

Un **día de uso** es un día del mes visible que:

- ya **transcurrió** — los futuros valen 0 y hundirían el promedio de su día;
- y no es anterior a tu **primera marca cargada**, que es lo que la app toma como comienzo de uso. Esos días tampoco son días flojos: son días en los que la app no existía para vos, y contarlos como ceros pintaría de rojo al día de la semana que le tocó al arranque.

> **El comienzo de uso es la primera marca, no la fecha de inicio de las tareas.** El `start` se declara y no se observa: dar de alta hoy un hábito con inicio en enero no significa que haya siete meses de datos. Con la primera marca, un alta retroactiva no adelanta nada.

El aviso también aparece en un mes **anterior** a tu primer uso, y en una cuenta sin ninguna marca.

##### Cómo se acomodan las tarjetas

Las cuatro comparten tratamiento, así la fila se lee pareja:

- **Todo va centrado horizontalmente**: el rótulo, el valor grande y el texto de abajo.
- Las **listas cortas** —los dos meses de la comparación— se miden por su contenido y se centran **como bloque**, no ítem por ítem. Así las viñetas quedan alineadas entre sí en lugar de dejar los renglones en diagonal; es el mismo criterio que la leyenda del pie en móvil.
- La **lista de nombres** de *Necesitan tu atención* es la excepción: ocupa el ancho entero. Puede tener veinte entradas y scrollear, y centrada como bloque la barra de scroll caía al final del texto —en el medio de la tarjeta, encima del nombre más largo— en vez de contra el borde derecho. Los nombres arrancan pegados al margen izquierdo y la barra queda a la derecha.
- **El contenido se centra en el alto sobrante.** En la grilla del panel todas las tarjetas miden lo que la más alta, así que a casi todas les sobra alto; sin esto el contenido queda clavado bajo el rótulo y el hueco entero cae abajo. El rótulo se queda arriba y lo que sigue se reparte el resto — el valor lleva `margin-top: auto` y lo que va debajo `margin-bottom: auto`, de modo que el espacio libre se divide en partes iguales a los dos lados sin separar el valor de su explicación.
- *Mes actual vs mes pasado* lleva su contenido dentro de **una caja hundida** (`.tile-box`), hermana de las subtarjetas de productividad: mismo fondo, mismo borde y mismo radio. Se estira hasta llenar el alto que queda bajo el rótulo, así la tarjeta se lee con el mismo lenguaje que sus vecinas en vez de como texto suelto. Vale para los tres estados de la tarjeta, incluido el de *«todavía no tiene meta»*.

Los gráficos llevan el título y su bajada centrados con el mismo criterio.

Los totales siempre se calculan sobre el **rango visible**, así que cambian al pasar de vista semanal a mensual.

### Vistas

- **Diario** — un día por vez, en una columna ancha
- **Semanal** — 7 días, de lunes a domingo
- **Mensual** — todos los días del mes

Se eligen en un **botón que muestra la vista activa** y despliega las otras. Las flechas `◀ ▶` lo abrazan y mueven la ventana de esa vista: un día, una semana o —en la mensual, donde no hay ventana que correr dentro del mes— un mes. Al llegar al borde saltan al mes contiguo.

> Los punteros de la app son todos **triángulos sólidos**: las flechas del rango, las del calendario, el del plegado y los `▲ ▼` de reordenar. Van a cuerpo reducido —`.62rem` contra el `1rem` del resto de los glifos— porque rellenos pesan mucho más que los `‹ ›` que reemplazaron, y a cuerpo pleno se comían el botón.

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
> **La línea del mes es un solo control.** Antes eran tres —un icono de calendario, `‹` y `›`— para una misma cosa. Lleva el mismo recuadro que el selector de vista: los dos abren algo, y conviene que se lean como lo que son. Lo propio suyo es el cuerpo y el peso, que lo mantienen como título de la barra. Sin indicador de desplegable: el recuadro ya dice que es un control, y el `aria-haspopup="dialog"` avisa que abre un diálogo.
>
> El paso a paso no se pierde: las flechas cruzan al mes contiguo al llegar al borde, y están las teclas `←` `→`.

Elegir un día lleva a la **ventana que lo contiene** según la vista activa: en semanal cae en su semana, en diaria en ese día. En los dos calendarios, el día o mes **de hoy** va relleno con el color de la marca y el que ya estás mirando queda contorneado. Navegar dentro del diálogo no mueve la planilla: recién cambia al elegir, y *Cancelar* la deja como estaba.

**El desplegable es el mismo en las tres vistas.** En la mensual *Ir a…* sigue estando: ahí el mes entero es una sola ventana, así que elegir un día lleva a **su** mes, que es un salto tan válido como los otros. Las flechas también quedan — es donde pasan a mover de mes en mes.

> Un menú que muda de opciones según dónde estés obliga a recordar cuáles hay en cada una, y hace que una desaparezca justo cuando se la fue a buscar.

### Plegar los controles

A la derecha de la línea del mes hay un botón que **pliega la fila que hay entre el mes y la planilla**: el selector de vista con sus flechas, y *Opciones*.

Es un **triángulo que gira**: apunta hacia abajo con los controles a la vista y hacia la izquierda cuando están plegados — el giro dice hacia dónde se fueron. **Recuerda cómo lo dejaste.** Funciona en cualquier ancho, no solo en móvil. Solo aparece en la planilla: en la sección de análisis esas zonas ya están ocultas y no habría sobre qué actuar.

> Sigue siendo SVG y no el glifo `▼`: girando una sola forma, las dos posiciones son idénticas y la transición sale gratis.

> **La barra son dos filas, en todos los anchos:**
>
> ```
>                 Agosto 2026                        ⌄
>   ◀ Semanal ▶                        ✓ ✕   Opciones
> ```
>
> El mes va **centrado de verdad**: su fila es una rejilla de `1fr auto 1fr`, así que el rótulo queda al medio sin importar cuánto ocupe el plegado de la derecha. Debajo, las dos entradas a todo lo demás quedan una en cada punta.
>
> Para poder compartir fila, `#month-bar` pasó a vivir **dentro** de `.controls`. La rejilla del mes es propia y **no `subgrid`**: eso pide Chrome 117 y la app declara soporte desde el 105.
>
> **Lo único que cambia con el ancho es dónde cae el ✓ ✕.** En escritorio se apoya contra *Opciones*, que es donde termina la mirada al recorrer una fila larga. En móvil va **centrado en el hueco** que queda entre el selector de vista y *Opciones*, sin pegarse a ninguno: ahí ese hueco es chico, y apoyarlo contra un extremo lo hacía leer como parte de él. Por eso es hijo directo de la rejilla y no del grupo de vista: desde adentro del grupo no habría forma de moverlo.
>
> **El selector de vista mide siempre lo mismo de ancho.** Los tres rótulos no miden igual —«Diario» 38,2px de texto contra 53,9 de «Semanal»—, así que sin un piso el botón cambiaba de tamaño al cambiar de vista y arrastraba a las flechas que lo abrazan. El piso queda apenas por encima del más ancho: **84px** para 81,1 de contenido. Va en `em` y no en `px`, para que se mida contra la tipografía del propio botón y la reserva acompañe un cambio de cuerpo.
>
> **Ninguno de los dos lleva indicador de desplegable.** El recuadro ya dice que son controles, y sin él los anchos se ajustaron: el selector de vista bajó de 105 a 84px —los 7,5em anteriores estaban dimensionados *con* el chevron que llevaban antes, y dejaban 24px de aire adentro— y el del mes perdió su piso, que con 93px nunca llegaba a atar nada (el mes más corto, «mayo 2026», ya mide 112).
>
> **Todos los controles de la barra miden lo mismo de alto**, por `--ctl-h`. Antes convivían cuatro alturas en la misma fila —30,8px las flechas y el plegado, 32,3 *Opciones*, 36,4 el mes y 38,3 la vista— porque cada uno lo resolvía con su propio padding. En una fila esa diferencia se lee como jerarquía, y acá no la hay: son todos pares.
>
> **Cada desplegable ancla del lado en que está su botón** —y ahora en todos los anchos, porque la disposición es una sola—. El de vista queda contra el borde izquierdo y el de opciones contra el derecho, así que crecen hacia adentro y ninguno se sale de la pantalla. Esa regla va **por id**: el menú de opciones comparte la clase `.view-options`, cuya regla base lo centra, y acotarla por clase le pisaba el ancla y lo dejaba cortado.

> El plegado va por una clase en el `body` y no por el atributo `hidden`, que ya lo usa el router para ocultar esas mismas zonas según la sección. Así las dos condiciones conviven sin pisarse.

### Zoom de la planilla (solo móvil)

En pantallas angostas aparece el apartado **Visualización** del desplegable **Opciones**, con un control que cambia la densidad de la planilla. Cicla tres niveles y recuerda el elegido.

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

## Pendientes

**Tareas pendientes**: lo que hay que hacer **una vez**. No tiene frecuencia ni puntaje y **no entra en ningún cálculo**:
ni en el cumplimiento del día, ni en el del mes, ni en los gráficos. Es la otra mitad de lo que se
anota —lo que se repite va en Hábitos— y por eso vive en su propia sección y en su propia rama del
estado (`state.pendientes`), no entre las tareas.

### Qué es un pendiente

| Campo | Qué guarda |
|---|---|
| Nombre | Qué hay que hacer (hasta 35 caracteres, como el de una tarea) |
| Categoría | Dónde va. Se elige en dos pasos: la principal y, si tiene, su subcategoría |
| Estado | `sin-iniciar`, `en-proceso` o `finalizada` |
| Calendarizar | Qué día hay que hacerlo, o ninguno |
| Comentarios | Lo que no entra en el nombre (hasta 200 caracteres), o nada |

El **lápiz** de cada fila es la única puerta a su edición —nombre, categoría, fecha, comentarios— y a sus tres
acciones, las mismas que las de una tarea o una categoría: **Eliminar**, **Reordenar** —entre los de
su misma categoría; ese orden se ve en *Categorías*, porque *Lista* ordena por fecha— y
**Archivar**, que lo guarda en ☰ → Archivo junto a las categorías guardadas. El nombre es el rótulo de la fila y no
abre nada; en el **calendario** los pendientes son etiquetas que se arrastran, y editarlos sale de
la lista.

El **estado** se cambia tocando el botón del extremo derecho de la fila —donde la lista del día de
Hábitos lleva el suyo—, que cicla los tres en orden y vuelve al
principio: el mismo gesto que la celda de la planilla. El botón **dice el nombre del estado** en vez
de cifrarlo en un color —un color obliga a aprender cuál es cuál antes de poder leer la lista— y el
tooltip anticipa adónde lleva el toque siguiente. Los tres van del mismo ancho: con el ancho del
texto, los nombres de al lado bailaban de lugar cada vez que se tocaba uno.

La **fecha es opcional** a propósito. No todo lo que hay que hacer tiene día, y obligar a inventarle
uno llenaría el calendario de fechas falsas. En la lista se muestra como una etiqueta, y **en rojo
si ya pasó** — salvo que esté finalizada, donde una fecha vieja es exactamente lo que se esperaba.

Los **comentarios** son para lo que no entra en un nombre de 35 caracteres: un teléfono al que
llamar, qué papeles llevar, dónde quedó anotado el número de trámite. Topean en **200** porque son
una nota y no un documento — y porque una nota que no cabe se termina escribiendo en otro lado, y
entonces la tarea deja de decir todo lo que hay que saber.

**No se despliegan en la fila.** La fila es una línea, con el nombre ya recortado con puntos
suspensivos: meter 200 caracteres ahí obligaría a que cada tarea ocupe un párrafo y la lista dejaría
de leerse de un vistazo, que es para lo que sirve. Así que la fila solo **avisa** con un **⋯** tenue
al lado del nombre, y el comentario se lee donde se escribe: en el ✎. Con mouse, el tooltip del ⋯ lo
adelanta; en un teléfono no hay tooltip, y ahí el ⋯ dice justamente *tocá el lápiz*.

**Es el mismo recuadro que el del nombre** —relleno, borde, radio, tipografía— y mide **el doble de
alto**, que es lo que lo distingue de un campo de rótulo. El `calc` lo dice con esas palabras: la
altura de un campo de una línea —relleno arriba y abajo, los dos bordes, un interlineado—
multiplicada por dos. Escrito así sigue siendo el doble exacto si mañana cambia el cuerpo de la
letra o el relleno de los campos, cosa que un número suelto de píxeles no puede prometer.

> El doble de la **caja** no es el doble de **renglones**: el relleno y los bordes no se duplican
> con el texto, así que adentro entran casi tres líneas.

Desde ahí **crece con lo que se tipea**, hasta un techo; pasado ese punto se desplaza por dentro,
porque una nota larga empujaba el botón de guardar fuera de la pantalla. Sin agarradera en la
esquina: se acomoda solo, y esa agarradera era justamente lo que lo distinguía del resto de los
campos a simple vista.

> Es el **único campo de varios renglones de la app**, así que es el único que podía quedarse sin
> estilo: el bloque que pinta los campos los lista por tipo —`input[type="text"]`, `[type="date"]`…—
> para no alcanzar a los radios ni a las casillas, y un `textarea` no es ninguno de esos. Lleva
> regla propia con las mismas declaraciones, una por una — hay un caso que las compara. Y
> `display: block`, porque un `textarea` se apoya en la línea de base y deja abajo un hueco que
> ningún `input` tiene.
>
> El saneador lo acepta **solo si es texto**. Con los otros campos alcanza `String(...)` porque
> después se los valida —una fecha pasa por `RE_DIA`, un estado por su lista—, pero un comentario es
> texto libre y lo que salga de `String()` se guarda tal cual: un objeto en un archivo importado
> terminaba escrito como `[object Object]` adentro de la tarea.

### Categorías y subcategorías

El anidado llega a **dos niveles**: una categoría, y adentro subcategorías. Con una cadena libre
habría que dibujar una sangría sin fondo, y un padre que apunte a un descendiente dejaría el árbol
sin poder recorrerse. Por eso el desplegable *Dentro de* solo ofrece categorías de primer nivel, y
una que ya tiene subcategorías no puede mudarse adentro de otra.

**Toda tarea pendiente tiene categoría.** La que viene puesta es **Varios**, con su subcategoría del
mismo nombre: existen desde la primera vez, van últimas en la lista y **no se pueden eliminar ni
archivar**, porque son lo que sostiene que nada quede huérfano. El nombre sí se cambia —lo que las
identifica es su id, no el rótulo—, y siguen siendo las de por defecto después de renombrarlas.

Ahí cae lo que no se ordenó en otro lado: una tarea creada sin tocar la categoría, una que venía sin
ninguna en un archivo importado, y las que quedan cuando se borra la categoría que las contenía.

### Qué se le puede hacer a una categoría

El **lápiz** de su encabezado es la única puerta, como en las tarjetas de Hábitos, y adentro están
las mismas tres acciones que las de una tarea:

- **Eliminar** — ver más abajo.
- **Reordenar** — dos flechas que la mueven un lugar **entre sus hermanas**: las de primer nivel
  entre las de primer nivel, y una subcategoría adentro de su madre. Cambiar de nivel es otra cosa,
  y eso lo hace *Dentro de*. Se aplica en el acto, sin nada que confirmar después.
- **Archivar** — la guarda con todo lo suyo. Sale de la lista y **del calendario** —archivar es
  dejar de verlo, y verlo igual ahí sería archivar a medias— y pasa a **☰ → Archivo**. No pregunta
  nada porque no pierde nada, y vuelve entera desde ahí o desde el mismo botón.

> Una subcategoría guardada **con su madre** no se desarchiva sola: primero vuelve la madre. Si no,
> quedaría suelta adentro de un bloque guardado.

> **Borrar una categoría no borra lo que tiene adentro.** Los pendientes quedan sueltos y las
> subcategorías pasan a primer nivel. Perder trabajo anotado por reordenar carpetas sería un precio
> absurdo, y el aviso de confirmación lo dice antes de que pase.

Lo mismo hace `cleanPendientes` con lo que entra de afuera —de la base o de un archivo importado—:
una categoría cuyo padre no existe, o cuyo padre ya es subcategoría, **queda de primer nivel** en
vez de descartarse, y un pendiente que apunta a una categoría que no está queda suelto. Solo se
tira lo que no se puede leer: sin nombre, sin id o con el id repetido.

### El orden de cada vista

El botón de la derecha de la fila cambia el orden de lo que se está mirando, con las opciones que le
tocan a cada vista —ordenan cosas distintas—. En el calendario no aparece: ahí ordena el almanaque.

| Vista | Qué ofrece |
|---|---|
| **Lista** | *Personalizado*, *por fecha* o *alfabético*. El **estado manda siempre**, en el orden del avance: primero lo que no arrancó, después lo que está en curso y al final lo terminado, que ya no pide nada. Lo que se elige es cómo se desempata adentro de cada grupo. |
| **Categorías** | *Personalizado*, *alfabético* o *por cantidad de tareas*, de la más cargada a la más vacía. |

**Personalizado** es el orden del arreglo, que es el que mueven las flechas de *Reordenar*. Mover
algo a mano **lo elige solo**: con un orden automático puesto, la flecha guardaba el cambio y la
pantalla no se movía, que se lee como que el botón está roto.

Cada vista se acuerda de lo suyo, y no se persiste: es una postura de pantalla, como el orden de
Análisis.

### El ☰ de Pendientes

A la izquierda del par de vistas, y abre el **mismo cajón** que el de Hábitos con lo suyo adentro:
acá no hay línea de mes donde ponerlo —solo aparece en el calendario—, así que vive en esa fila.

| Entrada | Qué hay adentro |
|---|---|
| **Archivo** | Lo guardado: las categorías —con sus subcategorías y sus pendientes— y los pendientes sueltos. Se tilda lo que vuelve y un botón lo devuelve a la lista. De las categorías solo se listan las de primer nivel: una subcategoría se guardó *con* su madre y vuelve con ella. |
| **Papelera** | Lo borrado en los últimos 7 días, lo último arriba. |

Las dos se apagan cuando no hay nada que mostrar, y el título dice cuánto hay.

La papelera guarda **el cambio y no solo la cosa**: de un pendiente, el lugar que ocupaba; de una
categoría, además, qué subcategorías quedaron de primer nivel por su culpa y qué pendientes quedaron
sueltos. Restaurarla deshace las tres cosas. Lo que ya no exista al restaurar no revive por esa
puerta: un pendiente cuya categoría se borró después vuelve suelto en vez de perderse.

### Las tres vistas

Son la **misma lista** mirada de tres maneras, y por eso el cambio son tres botones y no tres
secciones distintas. Van arriba, centrados y del mismo ancho —son alternativas de la misma
pregunta, y una más ancha parecería la principal—, con el **☰** de la sección a su izquierda. En el
calendario aparece **debajo** la línea del mes.

> Esa línea del mes es la misma de Hábitos: en el calendario el nodo se **muda** adentro de la
> sección, debajo del par de vistas, y vuelve a su lugar al salir. Un segundo botón de mes sería un
> segundo lugar donde arreglar lo mismo.

- **Lista** — sin categorías, en **tres tarjetas plegables**: *Sin iniciar*, *En proceso* y
  *Finalizada*, siempre las tres y en el orden del avance. Contesta «qué sigue», que es otra
  pregunta que «dónde está»: el estado deja de ser algo que hay que leer fila por fila y pasa a ser
  el encabezado del bloque, y lo que no interesa hoy —lo terminado, casi siempre— se pliega entero.
  Adentro de cada tarjeta manda el orden elegido; por fecha, lo que no tiene fecha va al final.
- **Categorías** — el árbol: cada categoría es una tarjeta con sus pendientes y sus subcategorías
  adentro. Cada encabezado se pliega y deja a la vista la cuenta de lo que tiene, contando lo de sus
  subcategorías.

**Las dos abren plegadas.** Lo primero que se ve es el mapa —los tres estados, las categorías— con
su cuenta al costado, y se abre lo que se quiere mirar. Con unas pocas tareas daba igual; con
treinta, entrar a Pendientes era caer en el medio de un muro de filas y tener que plegar a mano para
poder mirar algo. La cuenta es lo que hace que plegado no sea lo mismo que vacío.

> Se anota **cuáles se abrieron**, no el estado de cada una: son las menos, y una categoría recién
> creada no necesita que nadie la marque para verse como las demás. Antes arrancaban abiertas y
> hacían falta **dos** conjuntos —uno para las que se habían cerrado y otro para las que se habían
> abierto—, porque las archivadas arrancaban al revés que el resto; ahora todo arranca igual y queda
> uno solo. Es una postura de pantalla: no se guarda ni viaja a la base.
- **Calendario** — por fecha. La rejilla del mes con lo que cae cada día. Los que no tienen fecha no
  entran en la rejilla, así que se los **cuenta al pie**: si no, cambiar de vista parecería haberlos
  perdido.

  Ahí el calendario también se edita: **tocar un día** abre el alta con esa fecha puesta, y
  **arrastrar un pendiente a otro día** se la cambia. Y **deslizando de costado se cambia de mes**:
  a la izquierda el siguiente, a la derecha el anterior. El calendario ocupa la pantalla y el nombre
  del mes queda arriba del todo, así que pasar de mes era subir el pulgar, apuntar a una flecha y
  volver a bajar.

  > Los dos gestos son un dedo moviéndose y no se pisan porque **arrancan en lugares distintos**: el
  > arrastre solo empieza sobre un chip y el deslizamiento solo fuera de uno. Pide **60 px de
  > recorrido y ser vez y media más ancho que alto** — sin lo primero cualquier temblor cambia de
  > mes, sin lo segundo lo hace desplazar la pantalla con el dedo apenas torcido—. Va **solo con el
  > dedo o el lápiz**: con mouse están las flechas, y arrastrar para seleccionar texto no tiene por
  > qué cambiar de mes.
  >
  > Es el mismo gesto que el del Diario y la misma función, `deslizarDeCostado`: las dos pantallas
  > tienen un «antes» y un «después», y en las dos lo que se cambia se nombra arriba del todo. Lo
  > único propio de cada una es qué pasa —un mes acá, un día allá— y qué gesto tiene que quedar
  > afuera.
  >
  > El contenedor lleva `touch-action: pan-y`: sin eso el navegador se queda con el gesto horizontal
  > y el deslizamiento no llega nunca; con `none` la pantalla dejaría de desplazarse ahí adentro. Y
  > el clic que cierra el gesto se descarta, como el que cierra un arrastre — si no, deslizar abriría
  > además el alta, y encima con el día de la rejilla **nueva**, que no es el que se tocó. El arrastre va con eventos de puntero y no con
  el arrastre nativo de HTML5, que en el teléfono no existe — y arranca recién después de moverse
  unos pixeles, así que un toque sigue siendo un toque y abre el diálogo. Los chips llevan
  `touch-action: none` para que arrastrar con el dedo no desplace además la pantalla; el resto del
  calendario se sigue desplazando como siempre.

  > Arrastrar no es el único camino: el campo de fecha del diálogo hace lo mismo. Eso es lo que lo
  > deja al alcance de quien no puede arrastrar.

El calendario es mensual como la planilla y usa **la misma línea de mes**: dos selectores de mes en
la misma app serían dos cosas que aprender para lo mismo.

### El «+»

El botón redondo de la esquina crea **lo que la vista muestra**: una tarea en Hábitos, una **tarea
pendiente** en *Lista* y en *Calendario*, y una **categoría** en *Categorías*. Sin paso intermedio:
la pantalla ya está contestando cuál de las dos cosas se quiere, y preguntarlo de nuevo era un paso
de más. El rótulo del botón lo dice en cada vista.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `←` `→` | Período anterior / siguiente (en Análisis, mes anterior / siguiente) |
| `T` | Ir a hoy |
| `N` | Nueva tarea (solo en el Diario) |
| `Esc` | Cerrar el menú o el diálogo abierto |

## Rendimiento

Medido con [`tools/medir.mjs`](tools/medir.mjs), que corre la app real dentro del arnés con
distintos volúmenes de datos. Son tiempos de **jsdom**, entre 3 y 10 veces más lento que un
navegador: sirven para comparar escenarios y para ver si un cambio empeoró algo, no como el número
que ve alguien usando la app.

| Escenario | Peso | Marcar una celda | Cambiar de mes | Abrir Análisis |
|---|--:|--:|--:|--:|
| Hoy (24 tareas, 4 meses) | 77 KB | 3 ms | 12 ms | 14 ms |
| A 3 años (24 tareas, 40 meses) | 770 KB | 13 ms | 24 ms | 86 ms |
| A 3 años con 100 tareas | 3,2 MB | 34 ms | 26 ms | 149 ms |

Lo que importa de esa tabla no son los valores sino **qué crece con el historial**:

- **Marcar una celda ya es puntual**: no redibuja la lista, repinta la celda y su fila y recalcula
  el total del día. Lo único que crece ahí es `JSON.stringify(state)` para guardar en
  `localStorage` — a 3 años son 13 de esos 13 ms, o sea **casi todo**.
- **Cambiar de mes y abrir Análisis** redibujan la sección entera, y eso está bien: son cambios
  estructurales, no gestos que se repitan diez veces por minuto.

> **Cuándo volver al tema.** Si marcar una celda pasa de unos 5 ms en el navegador —hoy está muy
> por debajo—, el paso siguiente es **agrupar la escritura local** como ya se agrupa la de red: un
> temporizador corto y un volcado inmediato al ocultar la pestaña. No está hecho porque hoy no se
> nota, y porque cambiar «lo local se escribe en el acto» tiene un costo real: es la garantía de
> que un cierre forzado no pierde el último clic.

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

Las tareas que sobreviven a la copia conservan sus estados de este mes, así que sirve para volver a alinear un mes que quedó desprolijo sin perder lo ya marcado. Los meses anteriores nunca se tocan. El botón queda deshabilitado si el mes anterior no tiene tareas.

### Días cerrados

Un día **se cierra solo apenas termina**. No hay botón que apretar: a partir de las 00:00, todos los días transcurridos quedan cerrados, incluido el que acaba de concluir.

Cerrado no quiere decir intocable. Un clic sobre una celda de un día viejo no marca: abre un pedido de confirmación —*«Día ya transcurrido. ¿Querés modificarlo?»*, con la fecha completa al pie— y recién al aceptar se aplica el mismo clic que se había hecho. Cancelar deja todo como estaba. El botón de aceptar va con el color de la marca y no con el rojo del resto de las confirmaciones: acá no se destruye nada, y el rojo diría lo contrario.

El permiso que da esa confirmación es **de ese día y de nadie más**: destrabado el martes, el miércoles sigue preguntando. Y **no se persiste**: vale mientras dure la sesión y se pierde en la medianoche siguiente, junto con el día que en ese momento deja de ser hoy.

- **Hoy** se marca sin preguntar, todas las veces que haga falta.
- Los **días por venir** también: adelantar una marca sigue siendo válido, y el cumplimiento del día ya lo contempla.
- El cierre alcanza **solo a las celdas**. Agregar, editar, eliminar, reordenar o copiar tareas no depende de ninguna fecha.

> **Por qué se reemplazó al bloqueo por mes.** Antes había un *🔒 Bloquear período* que dejaba el mes entero en solo lectura, y había que acordarse de apretarlo. Lo que protegía —no ensuciar sin querer un período ya cerrado— es exactamente lo que hace falta todos los días, no una vez por mes; y lo que costaba era que un mes bloqueado también apagaba el alta de tareas y las tres posturas de la fila, que no tenían nada que ver.
>
> **La vuelta de medianoche es real, no un efecto del recargado.** Con la pestaña abierta toda la noche, la fecha del navegador avanza igual: un temporizador apunta a las 00:00 siguientes y, al llegar, relee el día, vacía los permisos y redibuja. Un equipo suspendido no dispara temporizadores a tiempo, así que la misma comprobación corre también al volver a la pestaña.

## Datos

El estado completo va al `localStorage`, bajo la clave `tareas-diarias/v1/<id de usuario>`, y a Supabase — ver [Dónde viven los datos](#dónde-viven-los-datos). La forma es la misma de los dos lados salvo por las preferencias de pantalla, que **solo existen en la copia local** (ver [Lo que no se sincroniza](#lo-que-no-se-sincroniza)).

Las tareas se guardan en `months`, indexadas por `YYYY-MM`; solo aparecen los meses que fueron modificados. Los estados van aparte, en `status`, con clave `idDeTarea|YYYY-MM-DD`, y los paneles del análisis en `panels`. El cierre por día no se guarda: se deduce de la fecha, así que no hay nada que sincronizar ni que pueda quedar desfasado entre dispositivos. Un estado viejo que traiga el `locked` del bloqueo por mes se descarta al abrirlo. Si tenías datos del formato anterior (una única lista global), se migran solos al mes más antiguo con estados cargados, así los meses siguientes lo heredan y no se pierde nada.

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
