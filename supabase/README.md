# Configuración de Supabase

## Variables de entorno

1. Copia `.env.example` a `.env.local`.
2. En Supabase, copia la URL del proyecto y la **publishable key** a:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. En GitHub Actions, configura esas mismas variables como secrets del build para el sitio publicado.

La secret/service-role key nunca va en variables `VITE_*`, en el frontend ni en GitHub. Supabase la entrega dentro del entorno de Edge Functions. JWKS no se configura en el cliente.

## Desplegar el esquema y funciones

Con Supabase CLI instalado y el proyecto creado:

```powershell
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
npx supabase secrets set APP_ORIGIN=https://TU_USUARIO.github.io/TU_REPOSITORIO
npx supabase functions deploy create-order
npx supabase functions deploy validate-ticket
npx supabase functions deploy create-payment-preference
npx supabase functions deploy mercadopago-webhook
npx supabase functions deploy get-order-tickets
```

`APP_ORIGIN` debe coincidir exactamente con el origen del sitio publicado. La migración crea perfiles al registrar usuarios, catálogo, órdenes, reservas temporales, entradas y las políticas RLS.

## Probar la aplicación publicada

1. Aplica la migración del catálogo y bucket:

   ```powershell
   npx supabase db push --remote
   ```

2. Despliega las funciones y configura el origen exacto del sitio publicado. Para el dominio estándar del repositorio GitHub Pages, usa el origen (sin `/tickeven/`):

   ```powershell
   npx supabase secrets set APP_ORIGIN=https://alfredoma12.github.io
   npx supabase functions deploy create-order
   npx supabase functions deploy validate-ticket
   ```

   Si Pages usa un dominio personalizado, reemplaza `APP_ORIGIN` por ese origen.

3. En GitHub, configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como secrets del repositorio. El workflow `.github/workflows/deploy-pages.yml` los pasa a `npm run build` y publica `dist`. En Settings → Pages, selecciona **GitHub Actions** como fuente. El build configura la base `/tickeven/`, adecuada para la URL estándar del repositorio; si usas un dominio personalizado, cambia `VITE_BASE_PATH` del workflow a `/`.
4. En Supabase Auth → URL Configuration, agrega la URL del sitio GitHub Pages a las redirect URLs. La confirmación de correo puede requerirse al registrar productores.

## Alcance del flujo conectado

- Los eventos destacados se leen desde Supabase. La migración del catálogo agrega eventos de ejemplo y tipos de entrada para poder probar la página inicialmente.
- El login/registro de productores usa Supabase Auth. Las fichas y fotos se guardan en la base de datos y el bucket `event-media`.
- Productores y colaboradores se registran con nombre, RUT chileno, correo, teléfono y contraseña. El registro queda en estado pendiente; solo una cuenta aprobada puede publicar eventos o validar entradas.
- Las rutas `/admin/login` y `/colaboradores/login` abren los accesos administrativos y de validación. El administrador aprueba/rechaza solicitudes y asigna colaboradores a eventos. El escáner requiere permiso de cámara y un contexto HTTPS; el código de seguridad funciona como alternativa manual.
- Para provisionar el primer administrador, crea un usuario en Supabase Auth con sus metadatos `full_name`, `rut` válido y `phone`. Luego, desde el SQL Editor de Supabase, identifica su UUID en `auth.users` y asígnale el rol:

  ```sql
  update public.profiles
  set role = 'admin', status = 'approved'
  where id = 'UUID_DEL_USUARIO_ADMIN';
  ```

  No uses una clave fija como `1234` ni guardes credenciales administrativas en el frontend. La autenticación se verifica con Supabase Auth y los permisos con el rol del perfil.
- La migración `20261105020000_account_approval_and_staff.sql` incorpora las aprobaciones, asignaciones y autorización de validación; ya está aplicada en el proyecto de producción enlazado. Para futuras migraciones, revísalas con `npx supabase db push --remote --dry-run` y solicita confirmación antes de aplicarlas.
- La migración `20261105030000_fix_chilean_rut_validation.sql` corrige la validación del RUT en el alta de usuarios para evitar que el trigger de perfil rechace RUT válidos.
- **Mercado Pago Checkout Pro** es el método de pago integrado. El comprador paga en Mercado Pago y vuelve a TickEven; solo el webhook firmado del servidor confirma el pago y emite entradas. El navegador nunca recibe el Access Token ni puede marcar órdenes como pagadas.
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
  npx supabase secrets set MERCADOPAGO_ACCESS_TOKEN=TOKEN_DE_PRUEBA MERCADOPAGO_WEBHOOK_SECRET=... MERCADOPAGO_CHECKOUT_MODE=test TICKET_CREDENTIALS_ENCRYPTION_KEY=... APP_PUBLIC_URL=https://alfredoma12.github.io/tickeven
  ```

  `TOKEN_DE_PRUEBA` se copia desde las credenciales de prueba de la aplicación de Mercado Pago. No identifiques el entorno solo por el prefijo: la documentación de Checkout Pro muestra credenciales de prueba con prefijo `APP_USR`. `MERCADOPAGO_CHECKOUT_MODE=test` selecciona la URL sandbox; para cobros reales se requiere cambiar explícitamente a `production` junto con las credenciales de producción. `APP_PUBLIC_URL` debe ser la URL base exacta del sitio, incluyendo `/tickeven` para GitHub Pages. `APP_ORIGIN` continúa siendo solo el origen `https://alfredoma12.github.io`. Opcionalmente, configura `MERCADOPAGO_COLLECTOR_ID` con el ID de vendedor que debe recibir los pagos.

  Para el procedimiento y casos de prueba, consulta [MERCADOPAGO_TESTING.md](MERCADOPAGO_TESTING.md).
- Una vez aplicada la migración de pagos, despliega las funciones:

  ```powershell
  npx supabase functions deploy create-payment-preference
  npx supabase functions deploy mercadopago-webhook
  npx supabase functions deploy get-order-tickets
  ```

  Prueba primero con credenciales TEST y usuarios/tarjetas de prueba proporcionados por Mercado Pago. Cambia a credenciales de producción solo después de comprobar el pago aprobado, el rechazo, el retorno a TickEven, la recepción del webhook y la descarga de los PDF. Nunca uses tarjetas reales para pruebas.
- Las credenciales de entradas se cifran en Supabase y solo se entregan al navegador que conserva la clave aleatoria de esa compra cuando el pago ya aparece como `paid`. Actualmente el PDF se descarga al volver al checkout; el envío por correo requiere configurar un proveedor de correo por separado.
- El carrito vive solo en memoria durante la navegación; no persiste en el navegador. Al crear la orden, el backend guarda comprador y líneas y recalcula precios e inventario.
- La migración `20261105040000_mercadopago_checkout.sql` agrega campos de preferencia, almacén cifrado de credenciales y una función transaccional para completar pagos aprobados; ya está aplicada en producción. Las Edge Functions de Mercado Pago todavía deben configurarse con secretos y desplegarse.
- `src/data/ticketPdf.js` genera el PDF solo después de recuperar credenciales de tickets emitidos por un webhook de pago aprobado.
