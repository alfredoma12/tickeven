# Configuración de Supabase

## Variables de entorno

1. Copia `.env.example` a `.env.local`.
2. En Supabase, copia la URL del proyecto y la **publishable key** a:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_APP_URL` (URL base pública; en local puedes usar `http://localhost:5173`)
3. En GitHub Actions, configura las dos variables de Supabase como secrets; el workflow define `VITE_APP_URL=https://tickeven.cl`.

La secret/service-role key nunca va en variables `VITE_*`, en el frontend ni en GitHub. Supabase la entrega dentro del entorno de Edge Functions. JWKS no se configura en el cliente.

## Desplegar el esquema y funciones

Con Supabase CLI instalado y el proyecto creado:

```powershell
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase secrets set APP_ORIGIN=https://tickeven.cl APP_PUBLIC_URL=https://tickeven.cl
npx supabase functions deploy create-order
npx supabase functions deploy register-free-order
npx supabase functions deploy validate-ticket
npx supabase functions deploy create-payment-preference
npx supabase functions deploy mercadopago-webhook
npx supabase functions deploy send-ticket-email
npx supabase functions deploy get-order-tickets
```

`APP_ORIGIN` debe coincidir exactamente con `https://tickeven.cl`. `APP_PUBLIC_URL` es la base de las URLs de retorno de Mercado Pago. La migración crea perfiles al registrar usuarios, catálogo, órdenes, reservas temporales, entradas y las políticas RLS.

## Probar la aplicación publicada

1. Aplica la migración del catálogo y bucket:

   ```powershell
   npx supabase db push --dry-run
   npx supabase db push
   ```

2. Despliega las funciones y configura el origen y URL base del dominio oficial:

   ```powershell
   npx supabase secrets set APP_ORIGIN=https://tickeven.cl APP_PUBLIC_URL=https://tickeven.cl
   npx supabase functions deploy create-order
   npx supabase functions deploy validate-ticket
   ```

3. En GitHub, configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como secrets del repositorio. El workflow `.github/workflows/deploy-pages.yml` publica `dist` en GitHub Pages con base `/`, conserva `public/CNAME` y genera `404.html` para que las rutas SPA funcionen al recargar. En Settings → Pages, selecciona **GitHub Actions** como fuente y establece `tickeven.cl` como Custom domain.
4. En Supabase Auth → URL Configuration, fija Site URL en `https://tickeven.cl` y agrega `https://tickeven.cl/**` como redirect URL. Conserva `http://localhost:5173/**` solo si necesitas callbacks de desarrollo. Las confirmaciones de correo de productores y colaboradores regresan a sus respectivas pantallas de acceso en el dominio canónico.
5. En el proveedor DNS, elimina registros A/AAAA en conflicto y configura:

   | Tipo | Host | Valor |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `alfredoma12.github.io` |

   GitHub Pages debe tener `tickeven.cl` como Custom domain; con ambos hosts configurados, Pages redirige `www` al dominio canónico. Espera la propagación DNS, verifica el dominio en Settings → Pages y activa **Enforce HTTPS** cuando el certificado esté disponible.
6. Para evitar respuestas HTTP `404` al abrir o recargar rutas como `/colaboradores/login`, crea en Cloudflare una regla **Rules → Transform Rules → URL Rewrite** para el host `tickeven.cl`:

   - Expresión: `http.host eq "tickeven.cl" and http.request.uri.path ne "/" and not starts_with(http.request.uri.path, "/assets/") and http.request.uri.path ne "/tickevenlogo.png" and http.request.uri.path ne "/favicon.svg" and http.request.uri.path ne "/robots.txt" and http.request.uri.path ne "/sitemap.xml" and http.request.uri.path ne "/CNAME" and http.request.uri.path ne "/404.html"`
   - Reescribe la ruta a `/index.html` y conserva la query string.

   Así Cloudflare entrega el shell de la SPA con HTTP 200 para rutas internas, sin alterar la ruta que ve el navegador. El fallback `404.html` del workflow permanece como respaldo si se accede a GitHub Pages sin pasar por esta regla.
7. El dominio usa Cloudflare y la página carga un beacon opcional de Browser Insights. Si el navegador no puede resolver `static.cloudflareinsights.com`, desactiva Browser Insights/Web Analytics en Cloudflare o permite ese host en el DNS/red del navegador; ese fallo no corresponde a una API ni bloquea el funcionamiento de TickEven.

## Alcance del flujo conectado

- Los eventos destacados se leen desde Supabase. La migración del catálogo agrega eventos de ejemplo y tipos de entrada para poder probar la página inicialmente.
- El login/registro de productores usa Supabase Auth. Las fichas y fotos se guardan en la base de datos y el bucket `event-media`.
- Productores y colaboradores se registran con nombre, RUT chileno, correo, teléfono y contraseña. El registro queda en estado pendiente; solo una cuenta aprobada puede publicar eventos o validar entradas. En `/admin/login`, entra como administrador y revisa **Solicitudes de cuenta** en el panel; la lista se actualiza cada 20 segundos y muestra el correo de contacto.
- Las rutas `/admin/login` y `/colaboradores/login` abren los accesos administrativos y de validación. El administrador aprueba/rechaza solicitudes y asigna colaboradores a eventos. El escáner requiere permiso de cámara y un contexto HTTPS; el código de seguridad funciona como alternativa manual.
- Para provisionar el primer administrador, crea un usuario en Supabase Auth con sus metadatos `full_name`, `rut` válido y `phone`. Luego, desde el SQL Editor de Supabase, identifica su UUID en `auth.users` y asígnale el rol:

  ```sql
  update public.profiles
  set role = 'admin', status = 'approved'
  where id = 'UUID_DEL_USUARIO_ADMIN';
  ```

  No uses una clave fija como `1234` ni guardes credenciales administrativas en el frontend. La autenticación se verifica con Supabase Auth y los permisos con el rol del perfil.
- La migración `20261105020000_account_approval_and_staff.sql` incorpora las aprobaciones, asignaciones y autorización de validación; ya está aplicada en el proyecto de producción enlazado. Para futuras migraciones, revisa el estado con `npx supabase migration list`, previsualiza con `npx supabase db push --dry-run` y confirma las migraciones pendientes antes de ejecutar `npx supabase db push`.
- La migración `20261105030000_fix_chilean_rut_validation.sql` corrige la validación del RUT en el alta de usuarios para evitar que el trigger de perfil rechace RUT válidos.
- **Mercado Pago Checkout Pro** es el método de pago integrado. El comprador paga en Mercado Pago y vuelve a TickEven; solo el webhook firmado del servidor confirma el pago y emite entradas. El navegador nunca recibe el Access Token ni puede marcar órdenes como pagadas.
- Los productores pueden publicar tipos de entrada gratuitos con precio `$0`. En la ficha del evento, la persona registra sus datos y recibe sus entradas QR sin pasar por el carrito ni Mercado Pago. La emisión valida disponibilidad en el servidor y requiere `TICKET_CREDENTIALS_ENCRYPTION_KEY`, igual que la entrega de entradas pagadas.
- Para crear la aplicación, entra al [panel de desarrolladores de Mercado Pago](https://www.mercadopago.cl/developers/panel), inicia sesión, crea una aplicación para **pagos online** y selecciona **Checkout Pro**. Configura la URL del webhook:

  ```text
  https://redjwyymgnjsxbnruboh.supabase.co/functions/v1/mercadopago-webhook
  ```

  Activa las notificaciones de **Pagos** y guarda el **Access Token de prueba** y el **secreto de firma del webhook** en un lugar seguro. No los incluyas en archivos `VITE_*`, en el frontend ni en GitHub.
- Antes de activar la integración, crea la clave de cifrado de credenciales para los QR y códigos de seguridad:

  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  Configura los secretos de las Edge Functions (usa tus credenciales de prueba primero):

  ```powershell
  npx supabase secrets set MERCADOPAGO_ACCESS_TOKEN=TOKEN_DE_PRUEBA MERCADOPAGO_WEBHOOK_SECRET=... MERCADOPAGO_CHECKOUT_MODE=test TICKET_CREDENTIALS_ENCRYPTION_KEY=... BREVO_API_KEY=... BREVO_SENDER_EMAIL=correo-verificado@tickeven.cl APP_ORIGIN=https://tickeven.cl APP_PUBLIC_URL=https://tickeven.cl
  ```

  `TOKEN_DE_PRUEBA` se copia desde las credenciales de prueba de la aplicación de Mercado Pago. No identifiques el entorno solo por el prefijo: la documentación de Checkout Pro muestra credenciales de prueba con prefijo `APP_USR`. `MERCADOPAGO_CHECKOUT_MODE=test` selecciona la URL sandbox; para cobros reales se requiere cambiar explícitamente a `production` junto con las credenciales de producción. `APP_PUBLIC_URL` y `APP_ORIGIN` deben ser `https://tickeven.cl`; el webhook de Mercado Pago sigue apuntando a la Edge Function de Supabase, no al sitio. Opcionalmente, configura `MERCADOPAGO_COLLECTOR_ID` con el ID de vendedor que debe recibir los pagos.

  `BREVO_API_KEY` es la clave API transaccional de Brevo. `BREVO_SENDER_EMAIL` debe ser la dirección verificada en Brevo (por ejemplo, `correo-verificado@tickeven.cl`), y `BREVO_SENDER_NAME` define el nombre visible, opcional y predeterminado a `TickEven`. Si se configura `BREVO_SENDER_EMAIL` con el formato `TickEven<correo@dominio.cl>`, la función separa el nombre de la dirección antes de llamar a Brevo. Nunca guardes estas credenciales en variables `VITE_*`.

  Para el procedimiento y casos de prueba, consulta [MERCADOPAGO_TESTING.md](MERCADOPAGO_TESTING.md).
- Aplica la migración nueva con `npx supabase db push --dry-run` y `npx supabase db push`; luego despliega las funciones:

  ```powershell
  npx supabase functions deploy create-payment-preference
  npx supabase functions deploy mercadopago-webhook
  npx supabase functions deploy send-ticket-email
  npx supabase functions deploy get-order-tickets
  npx supabase functions deploy register-free-order
  ```

  Prueba primero con credenciales TEST y usuarios/tarjetas de prueba proporcionados por Mercado Pago. Cambia a credenciales de producción solo después de comprobar el pago aprobado, el rechazo, el retorno a TickEven, la recepción del webhook y la descarga de los PDF. Nunca uses tarjetas reales para pruebas.
- Las credenciales de entradas se cifran en Supabase y el envío de correo reutiliza los QR ya almacenados. Las compras pagadas se envían desde el webhook de Mercado Pago y las inscripciones gratuitas desde `register-free-order`. Cada orden tiene un registro idempotente en `ticket_email_deliveries`; los reintentos no crean entradas ni QR nuevos y la función de envío es privada.
- La exportación CSV del panel devuelve una fila por entrada vendida e incluye datos de contacto del comprador. La función `get_producer_ticket_sales_export` solo permite a productores aprobados exportar eventos de su propiedad; trata los archivos descargados como datos personales.
- El carrito vive solo en memoria durante la navegación; no persiste en el navegador. Al crear la orden, el backend guarda comprador y líneas y recalcula precios e inventario.
- La migración `20261105040000_mercadopago_checkout.sql` agrega campos de preferencia, almacén cifrado de credenciales y una función transaccional para completar pagos aprobados; `20261110010000_ticket_email_delivery.sql` agrega el registro idempotente del correo y `20261110020000_free_ticket_email_delivery.sql` permite la entrega de órdenes gratuitas ya confirmadas.
- `src/data/ticketPdf.js` genera el PDF solo después de recuperar credenciales de tickets emitidos por un webhook de pago aprobado.
