/* ============================================================
   Configuración de Supabase
   ------------------------------------------------------------
   Pegá acá los dos valores de tu proyecto y guardá el archivo.
   Los encontrás en: supabase.com → tu proyecto →
   Project Settings → API

   La ANON KEY es pública por diseño: puede vivir en el navegador.
   Lo que protege los datos es Row Level Security, que ya viene
   configurada en db/schema.sql. La SERVICE ROLE key NUNCA va acá.
   ============================================================ */

window.SUPABASE_URL = "https://kbeqyhsblsczhhtqwfrj.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_EmyuRqVYZH4LoM2NE-vT3g_cKTl2SSI";

/* Clave pública VAPID, para el recordatorio diario por notificación.
   Se genera con `npm run vapid`, que imprime también la privada — esa va
   como secreto de la Edge Function y NUNCA acá.

   Es pública por diseño, igual que la anon key: el navegador la necesita
   para suscribirse. Sin ella el recordatorio queda apagado y la app lo dice
   en su diálogo, en vez de fallar en silencio. */
window.VAPID_PUBLIC_KEY = "BLBbcOLHcdH24UYB_5YM1sJkEm_u52jdH6wBvY1MjoIz7kEpj7G6a2f49cS1L7mmANEFoqa2BdYzeQTbRMu9nZ4";
