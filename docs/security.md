# Seguridad: auditoría del Security Advisor (2026-11-05)

Resultado inicial: 4 avisos. Qué son, qué se hace con cada uno y por qué.

| # | Aviso | Decisión |
|---|---|---|
| 1 | `public.rls_auto_enable()` ejecutable por **PUBLIC** | **Corregido** (migración 4) |
| 2 | `public.rls_auto_enable()` ejecutable por **authenticated** | **Corregido** (migración 4) |
| 3 | `public.is_owner()` ejecutable por **authenticated** | **Aceptado**, documentado abajo |
| 4 | Leaked Password Protection desactivada | **Aceptado con mitigaciones** (función de plan de pago) |

## 1–2. `rls_auto_enable()`
Función de Supabase (no es de PrintForge) que activa RLS en las tablas nuevas de `public` mediante un *event trigger*.
Es `SECURITY DEFINER`: expuesta como RPC permitiría a cualquiera ejecutarla con los privilegios de su dueño. No es necesaria para nadie salvo para el event trigger.

- Los permisos `EXECUTE` de una función de event trigger se comprueban **al crear el trigger**, no al dispararlo. Por eso quitárselos a `PUBLIC`, `anon` y `authenticated` **no rompe** el automatismo. Está probado en `supabase/tests/security.test.ts` (tabla nueva creada por un rol sin privilegios especiales → queda con RLS).
- La migración no elimina ni modifica la función ni el event trigger: sólo `REVOKE`. Va protegida con `to_regprocedure` por si el entorno no la trae.
- Reversible: `grant execute on function public.rls_auto_enable() to public, anon, authenticated;`

## 3. `is_owner()` — aviso aceptado
`EXECUTE` para `authenticated` es **necesario**: las políticas RLS la evalúan con el rol del usuario y la app la llama (`rpc('is_owner')`) para validar la sesión tras el login. Es seguro mantenerlo porque:
- No recibe argumentos (no se puede preguntar por otro usuario) y no usa SQL dinámico.
- `SECURITY DEFINER` con `search_path = ''` y todo cualificado (`private.app_owner`, `auth.uid()`): sin secuestro de rutas de búsqueda.
- Sólo devuelve un booleano sobre el **propio** llamante. Un usuario ajeno obtiene `false` y sigue sin ver ninguna fila (RLS).
- `PUBLIC` y `anon` no pueden ejecutarla (verificado con peticiones reales: 401 `42501`).
- No hay vía de elevación: no escribe nada y `private.app_owner` no es accesible para los roles de la API.

Alternativa descartada: pasar a `SECURITY INVOKER` exigiría dar `SELECT` sobre `private.app_owner` a `authenticated` (peor). Mover la función a `private` eliminaría el aviso pero obligaría a cambiar la comprobación de sesión de la app; no compensa.

## 4. Leaked Password Protection
Comprueba contraseñas contra HaveIBeenPwned; es una función de plan de pago y **no se contrata sólo por esto**. Riesgo real aquí: bajo (un único usuario, registro desactivado, sin enlaces mágicos ni OAuth). Mitigaciones:
- Usa una contraseña larga y única generada por un gestor (≥ 16 caracteres).
- Authentication → *Policies / Password*: sube la longitud mínima (≥ 12) y exige tipos de carácter (disponible en el plan gratuito).
- Mantén **Allow new users to sign up** desactivado (más el trigger que impide un segundo usuario).
- Opcional a futuro: MFA TOTP (gratuito en Supabase); requeriría una pantalla de verificación en la app, fuera del alcance de esta auditoría.

## Regresión
`supabase/tests/security.test.ts` falla si: reaparece EXECUTE para PUBLIC/anon en cualquier función de `public`, aparece una nueva función `SECURITY DEFINER` en `public`, una RPC de la app pasa a `SECURITY DEFINER`, o queda una tabla de `public` sin RLS.
