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
- El carrito vive solo en memoria durante la navegación; no persiste en el navegador. Al crear la orden, el backend guarda comprador y líneas y recalcula precios e inventario.
- Aún no se ha seleccionado una pasarela. No hay cobro, confirmación de pago ni emisión automática: `issue_paid_order_tickets` solo debe invocarse desde una función servidor después de verificar una confirmación auténtica del proveedor.
- `src/data/ticketPdf.js` prepara el PDF a partir de credenciales de una entrada ya emitida. No se genera para órdenes pendientes.
