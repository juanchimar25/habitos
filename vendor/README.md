# vendor/

Código de terceros servido desde nuestro propio dominio. **No se edita a mano.**

## `supabase-js-2.111.0.js`

Cliente de Supabase. Antes se importaba en runtime desde `https://esm.sh/@supabase/supabase-js@2`.

| | |
|---|---|
| Paquete | `@supabase/supabase-js` |
| Versión | `2.111.0` |
| Archivo de origen | `dist/umd/supabase.js` dentro del paquete publicado en npm |
| Tamaño | 210.547 bytes |
| SHA-256 | `7396012594aa6d23bb373ebc25d1080bf3672fa847c3713f756520b40fd13453` |
| SRI (usado en `index.html`) | `sha384-faMlYZUtkJj+Sh6Bmu/L0GzPcraRWN6CW+9RH3GUrK/Z0WS9tgaNNt0tHiLxsbdb` |

Es el build UMD que **publica Supabase**, no uno rearmado por un empaquetador de terceros, y es
autocontenido: no tiene un solo `import` ni `require` hacia afuera. Expone el global `supabase`,
del que `auth.js` toma `createClient`.

### Por qué está acá y no en un CDN

Un `import` desde un CDN se descarga y **se ejecuta en el navegador de cada visitante**, en cada
visita. Eso implicaba tres cosas a la vez:

1. La versión no estaba fija: `@2` es «cualquier 2.x», y lo que sirvieran hoy podía no ser lo de
   ayer.
2. Los `import` de módulos ES **no admiten `integrity`**, así que el navegador ejecutaba lo que
   llegara sin compararlo contra ningún hash conocido.
3. Un compromiso del CDN habría corrido código con acceso completo a la sesión de Supabase de
   cualquiera que abriera la app.

Servido desde acá, la versión es exactamente esta, el `<script>` lleva `integrity`, y la CSP
puede limitar `script-src` a `'self'` sin excepciones para terceros.

### Cómo actualizarlo

```sh
npm pack @supabase/supabase-js@<version>      # baja el tarball, sin instalar ni ejecutar nada
tar -xzf supabase-supabase-js-<version>.tgz
cp package/dist/umd/supabase.js vendor/supabase-js-<version>.js

node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('vendor/supabase-js-<version>.js');console.log('sha384-'+c.createHash('sha384').update(b).digest('base64'))"
```

Después hay que tocar `index.html` en dos lugares —el `src` y el `integrity`—, borrar el archivo
viejo y actualizar esta tabla. Que el nombre lleve la versión es a propósito: obliga a que la
actualización pase por el HTML y quede visible en el diff, en vez de cambiar sola.
