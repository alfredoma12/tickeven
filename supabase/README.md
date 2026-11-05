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

## Estado actual

- El checkout crea órdenes pendientes y el servidor recalcula precio, administración (10%) e inventario. El catálogo debe existir en Supabase antes de vender; hoy los eventos de ejemplo y los publicados por el portal siguen almacenados localmente y no se sincronizan automáticamente.
- No se ha seleccionado una pasarela. No hay cobro, confirmación de pago ni emisión automática: `issue_paid_order_tickets` solo debe invocarse desde una función servidor después de verificar una confirmación auténtica del proveedor.
- La función de validación exige una sesión de productor Supabase y solo permite validar entradas de sus propios eventos. El login/dashboard actual del frontend continúa siendo una demostración local.
- `src/data/ticketPdf.js` prepara el PDF a partir de las credenciales de una entrada ya emitida. La entrega del PDF debe conectarse al flujo de confirmación de pago; no se genera para órdenes pendientes.
