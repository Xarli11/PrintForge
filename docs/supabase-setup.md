# Configuración de Supabase (acceso de un único usuario)

## 1. Crear el proyecto
1. En <https://supabase.com> crea un proyecto (plan Free vale).
2. **Project Settings → API**: copia `Project URL` y la clave `anon`/`publishable`. Son públicas por diseño.
   **Nunca** uses ni copies la clave `service_role` en este repo ni en GitHub.

## 2. Bloquear el registro público
**Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**
(y deja desactivados el resto de proveedores). Desactiva también *Confirm email* si no quieres depender de SMTP.

La migración añade una segunda barrera: un trigger en `auth.users` que rechaza crear más de un usuario.

## 3. Crear tu usuario
**Authentication → Users → Add user → Create new user**: tu correo + contraseña larga, marca *Auto Confirm User*.
Copia su **UUID** (columna *User UID*).

## 4. Aplicar migraciones
Con la CLI (`npm i -g supabase`, `supabase link --project-ref <ref>`, `supabase db push`)
o pegando en **SQL Editor**, en orden, cada fichero de `supabase/migrations/`.

## 5. Registrar el UUID del propietario (una sola vez)
```sql
insert into private.app_owner (user_id) values ('<TU-UUID>');
```
Todas las políticas RLS comparan `auth.uid()` con este UUID (`public.is_owner()`).
Cualquier otro usuario autenticado ve 0 filas y no puede escribir; `anon` no tiene permisos.
El esquema `private` no está expuesto por la API.

## 6. Variables de entorno
Local: copia `.env.example` a `.env.local` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
GitHub: repo → *Settings → Secrets and variables → Actions → **Variables*** con los mismos nombres.

## 7. Verificar
- Iniciar sesión con tu usuario funciona.
- Con un segundo usuario creado manualmente (borra el trigger temporalmente solo para probar) la app muestra «cuenta no autorizada».
- `curl <URL>/rest/v1/jobs -H "apikey: <anon>"` devuelve 401/403 o `[]`, nunca datos.
