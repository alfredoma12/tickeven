# Guia de pruebas: Mercado Pago Checkout Pro

**Alcance:** Checkout Pro para web, usando la API de preferencias. Esta guía no cubre Checkout Pro Orders, Checkout Bricks, Checkout API ni pagos QR presenciales. Documentación oficial consultada el 5 de noviembre de 2026.

## 1. Control de pruebas

### Requisitos oficiales

- Crear una aplicación en [Tus integraciones](https://www.mercadopago.cl/developers/panel/app) y seleccionar Checkout Pro para pagos online.
- Preparar el backend con las credenciales de prueba de la aplicación. La documentación de Checkout Pro indica que la cuenta de vendedor de prueba se crea con la aplicación y que sus credenciales se usan para probar.
- Probar con una cuenta compradora de prueba y con tarjetas de prueba; no usar tarjetas reales para simular compras.
- Usar HTTPS y una URL pública con dominio para las `back_urls`. La documentación desaconseja `localhost` y `127.0.0.1` como URLs de retorno.
- Configurar una notificación de pagos y validar su firma en el servidor. La redirección al sitio no sustituye la notificación ni la consulta del pago.

### Prueba y producción

| Aspecto | Prueba | Producción |
| --- | --- | --- |
| Credencial del backend | Access Token de las credenciales de prueba de la aplicación | Access Token de producción |
| Checkout | Usar `sandbox_init_point` de la preferencia | Usar `init_point` de la preferencia |
| Comprador | Cuenta compradora de prueba; tarjeta o medio de prueba documentado | Comprador real y medios habilitados para producción |
| Notificaciones | Configurar y revisar la URL/eventos de prueba | Configurar y revisar la URL/eventos de producción |
| Riesgo financiero | Simulación; no usar tarjetas reales | Procesa pagos reales |

**No deduzcas el ambiente solo por el prefijo del token.** La documentación oficial de Checkout Pro indica que las credenciales de la cuenta vendedora de prueba pueden tener prefijo `APP_USR`, el mismo prefijo que aparece en ejemplos de la API. Confirma que copiaste el token desde la sección de credenciales de prueba. En esta aplicación, el ambiente se selecciona explícitamente con `MERCADOPAGO_CHECKOUT_MODE`.

La referencia oficial muestra la creación de preferencias en `https://api.mercadopago.com/checkout/preferences` y ambas URLs de checkout en la respuesta. Esta guía no supone un host de API de prueba distinto.

## 2. Cuentas de prueba

La [documentación de cuentas de prueba](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/test-accounts) establece que se necesita, como mínimo, una cuenta vendedora y una compradora. Para probar dentro de Chile, elige Chile como país de operación; si se crean cuentas manualmente, vendedor y comprador deben pertenecer al mismo país. El país no se puede cambiar después.

| Tipo | País | Etiqueta sugerida | Propósito |
| --- | --- | --- | --- |
| Vendedor de prueba | Chile | `Seller - Checkout Pro test` | Configurar la aplicación y usar las credenciales de prueba que crean las preferencias. La cuenta vendedora de prueba se genera al crear la aplicación. |
| Comprador de prueba | Chile | `Buyer - Checkout Pro test` | Iniciar sesión en Checkout Pro y simular compras sin usar una cuenta compradora real. |

La etiqueta es una descripción elegida al crear la cuenta. Mercado Pago genera el usuario, contraseña y, si corresponde, un código de verificación. Consúltalos dentro del panel; no los incluyas en el repositorio ni los compartas en chats. Al iniciar sesión, usa la cuenta compradora de prueba. Mercado Pago recomienda realizar la prueba en una ventana incógnita.

El panel permite indicar un saldo ficticio si lo solicita el formulario de creación. La documentación lo describe como saldo de referencia utilizable en simulaciones, pero esta guía no presupone que haga falta un saldo para pagar con tarjeta. Los detalles y restricciones de cada medio deben verificarse en la documentación vigente de [pruebas de compra](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/integration-test/test-purchases).

## 3. Preparar esta aplicación

Estos nombres de secretos, la base de datos de órdenes y la emisión de entradas son específicos de este repositorio; no son variables definidas por Mercado Pago.

1. En Supabase, configura los secretos de Edge Functions:
   - `MERCADOPAGO_ACCESS_TOKEN`: Access Token de prueba del vendedor de prueba.
   - `MERCADOPAGO_WEBHOOK_SECRET`: secreto de firma generado al configurar Webhooks en la aplicación de Mercado Pago.
   - `MERCADOPAGO_CHECKOUT_MODE`: `test` durante las pruebas. Para producción, se cambia explícitamente a `production` junto con las credenciales de producción.
   - `APP_ORIGIN`: `https://tickeven.cl`, el origen exacto del frontend.
   - `APP_PUBLIC_URL`: `https://tickeven.cl`, base de las URLs de retorno.
   - `TICKET_CREDENTIALS_ENCRYPTION_KEY`: clave de 32 bytes codificada en Base64, requerida por esta aplicación para cifrar credenciales de entradas y productos. No es una credencial de Mercado Pago.
   - `BREVO_API_KEY`: clave API transaccional de Brevo.
   - `BREVO_SENDER_EMAIL`: dirección verificada como remitente en Brevo.
   - `BREVO_SENDER_NAME`: opcional; por defecto se usa `TickEven`.
2. En la aplicación de Mercado Pago, configura Webhooks para el evento **Pagos** (`payment`) y una URL HTTPS que apunte a la Edge Function. La documentación recomienda configurar por separado URL de prueba y URL de producción. Esta integración procesa pagos; notificaciones de otros recursos, como `topic_merchant_order_wh`, se confirman con HTTP 200 y se ignoran, no emiten entradas ni actualizan órdenes.
3. Aplica primero las migraciones pendientes de Supabase —incluida `20261113000000_product_redemption_qr_codes.sql`— y luego despliega las funciones que componen este flujo. La migración y las funciones deben quedar coordinadas antes de aceptar compras con productos:

   ```powershell
   npx supabase db push
   npx supabase functions deploy create-order
   npx supabase functions deploy create-payment-preference
   npx supabase functions deploy mercadopago-webhook
   npx supabase functions deploy send-ticket-email
   npx supabase functions deploy get-order-tickets
   ```

4. Antes de probar en una base compartida, considera que las compras de prueba de esta aplicación crean órdenes de prueba en el proyecto Supabase configurado. No uses datos de clientes reales para la simulación.

## 4. Simular un pago paso a paso

| Paso | Dónde | Acción y propósito | API o recurso |
| --- | --- | --- | --- |
| 1. Crear la orden local | Backend de la aplicación | El checkout envía las líneas de compra; el backend guarda la orden y calcula total e inventario. Esto crea la referencia interna que se vinculará al pago. | Supabase Edge Function `create-order` y RPC local `create_pending_order`; no es una API de Mercado Pago. |
| 2. Crear preferencia | Backend de la aplicación | El servidor carga la orden y construye los ítems. `external_reference` vincula la preferencia con el identificador de orden. El Access Token se envía solo desde el servidor. | `POST https://api.mercadopago.com/checkout/preferences` (API oficial). |
| 3. Elegir URL de checkout | Backend y luego frontend | En modo `test`, esta aplicación debe usar `sandbox_init_point`; en modo `production`, `init_point`. En test no debe hacerse fallback silencioso a la URL de producción si falta la URL sandbox. El navegador recibe solo la URL de checkout. | Respuesta de Create preference: `id`, `init_point` y `sandbox_init_point`. |
| 4. Completar la compra | Comprador y Checkout Pro | Inicia sesión con el comprador de prueba en una ventana incógnita y utiliza un medio de prueba admitido. Esto simula la interacción del comprador en el checkout alojado por Mercado Pago. | Checkout Pro y [test cards](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/integration-test/test-purchases). |
| 5. Notificar el pago | Mercado Pago hacia backend | Mercado Pago envía el evento `payment` a la URL de Webhooks configurada. El backend valida `x-signature` y el identificador de pago; no confía en datos enviados por el navegador. Otros tipos de notificación se reconocen y se ignoran. | Webhooks de Mercado Pago; firma HMAC descrita en la [documentación oficial](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/additional-content/notifications/webhooks). |
| 6. Consultar el pago | Backend de la aplicación | Después de validar la firma, consulta el recurso oficial y verifica el estado real del pago. La documentación de notificaciones indica consultar el pago por ID. | `GET https://api.mercadopago.com/v1/payments/{id}`. |
| 7. Completar la orden | Backend de la aplicación | En este repositorio solo un pago `approved`, con moneda e importe coincidentes, completa la orden y emite un QR individual por cada entrada y unidad de producto. Un retorno del navegador no emite códigos. | Supabase RPC `complete_mercadopago_order`; lógica local, no endpoint de Mercado Pago. |
| 8. Enviar tickets | Backend de la aplicación | El webhook llama a la función privada; esta verifica de nuevo el pago, recupera los QR existentes, genera un PDF por entrada o unidad de producto y envía adjuntos Base64 a Brevo. | Edge Function `send-ticket-email` y `POST https://api.brevo.com/v3/smtp/email`. |
| 9. Volver y comprobar | Frontend y backend | Mercado Pago retorna a una `back_url`; el frontend vuelve a consultar Supabase por el estado y muestra/descarga entradas solo si el backend confirma que la orden está pagada. | `back_urls` en la preferencia y Edge Function `get-order-tickets`. |

### Casos de tarjeta documentados

La tabla oficial de [compras de prueba](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/integration-test/test-purchases) permite simular resultados con datos del titular. Por ejemplo, documenta Visa `4998 4704 7065 8262`, vencimiento `11/30` y CVV `123`; el titular `APRO` simula aprobación y `OTHE` un rechazo general. Sigue la tabla oficial para los demás casos y no uses estos datos fuera del entorno de prueba.

### Verificación de resultados

- **Aprobado:** Webhooks muestra la notificación; el backend valida la firma y consulta `GET /v1/payments/{id}`; la orden local pasa a pagada y se emite un código QR individual por cada entrada y unidad de producto. El PDF de entradas debe poder descargarse al regresar al checkout.
- **Correo:** verifica que llegue un PDF independiente por entrada y por producto; en `public.ticket_email_deliveries` la orden debe quedar como `sent`, con `sent_at` y `brevo_message_id`. Revisa los logs de `send-ticket-email` si Brevo no acepta el mensaje.
- **Retiro de productos:** escanea cada QR de producto en el mismo validador del evento. El primero debe autorizar el retiro y un segundo intento con el mismo código debe indicar que ya fue utilizado.
- **Entrada gratuita:** también debe llegar el correo, pero no se activa mediante el webhook de Mercado Pago. `register-free-order` invoca la misma función privada después de emitir las entradas; la orden debe tener `payment_reference = 'free:<order_id>'`.
- **Idempotencia:** reenvía la misma notificación desde el panel de Webhooks. Debe mantenerse un registro por `order_id` y no enviarse otro correo si ya figura `sent`. Si Brevo falla, se guarda el error y el webhook devuelve fallo para permitir el reintento.
- **Rechazado o pendiente:** no se deben emitir entradas ni códigos de producto. La pantalla de retorno no es la fuente de verdad; vuelve a consultar el estado del servidor.
- **Notificación con error:** revisa que el evento configurado sea **Pagos** y no `topic_merchant_order_wh`, además del detalle de entrega, el log de la Edge Function y el estado de la orden. Las notificaciones que no son de pago se confirman con HTTP `200` pero no procesan órdenes. Mercado Pago espera una respuesta HTTP `200` o `201` para confirmar la recepción y puede reintentar notificaciones no confirmadas, según su [guía de Webhooks](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/additional-content/notifications/webhooks).

**QR:** Checkout Pro es un checkout redirigido. Este flujo no genera un QR de pago de Mercado Pago ni requiere escaneo externo. La aplicación emite códigos de un solo uso después de confirmar el pago aprobado: entradas para acceso y productos para retiro.

## 5. Límites y guardrails

- Nunca pongas Access Tokens o secretos de Webhooks en variables `VITE_*`, frontend, repositorio o mensajes. En esta arquitectura residen en los secretos de Supabase Edge Functions.
- No marques una orden como pagada por visitar `back_urls`, por `status` de query string ni por una respuesta del navegador. La verificación se hace en backend consultando el recurso de pago.
- En modo de prueba, si la preferencia no trae `sandbox_init_point`, detén la prueba y revisa credenciales y configuración. No sustituyas automáticamente por `init_point`.
- Las tarjetas y usuarios de prueba no son medios válidos para validar una compra real. Al pasar a producción se deben cambiar, de forma coordinada, Access Token, firma/URL de notificación y `MERCADOPAGO_CHECKOUT_MODE`.
- Esta integración no prueba split payments, varios medios en una compra, reembolsos, contracargos ni pagos QR presenciales. Consulta las secciones oficiales específicas antes de habilitarlos.
- Mercado Pago recomienda probar en producción solo después de comprobar el flujo de prueba y completar los requisitos de producción, incluido SSL. La aprobación final requiere una revisión humana del vendedor y su configuración.

## 6. Lista de validación humana

- [ ] Confirmar en el panel que el Access Token procede de las credenciales de prueba de la aplicación correcta.
- [ ] Confirmar que `MERCADOPAGO_CHECKOUT_MODE=test` y que el checkout abierto es `sandbox_init_point`.
- [ ] Confirmar que vendedor y comprador de prueba son de Chile y que el comprador puede iniciar sesión.
- [ ] Confirmar la entrega del webhook firmado para un pago aprobado y para casos no aprobados.
- [ ] Confirmar que solo una aprobación verificada emite entradas y que la orden se puede recuperar de manera segura.
- [ ] Antes de abrir pagos reales, revisar las [instrucciones oficiales para producción](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/go-to-production), cambiar explícitamente el modo y credenciales, revisar Webhooks de producción y probar con los controles de lanzamiento del equipo. No hacer pruebas de producción con tarjetas reales sin autorización.

## Fuentes oficiales de Mercado Pago

- [Checkout Pro: visión general](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/overview)
- [Crear una aplicación](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/create-application)
- [Cuentas de prueba](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/test-accounts)
- [Pruebas de integración y compra](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/integration-test/introduction)
- [Crear una preferencia: API reference](https://www.mercadopago.cl/developers/en/reference/online-payments/checkout-pro-preferences/preferences/create-preference/post)
- [Configurar URLs de retorno](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/configure-back-urls)
- [Configurar notificaciones de pagos](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/payment-notifications)
- [Webhooks](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/additional-content/notifications/webhooks)
- [Pasar a producción](https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/go-to-production)

> Base documental, no garantía de aceptación ni certificación de producción. Valida el flujo y las políticas vigentes en el panel y la documentación de Mercado Pago antes del lanzamiento. La responsabilidad final de QA y despliegue corresponde al equipo técnico.
