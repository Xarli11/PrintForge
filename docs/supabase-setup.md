# Configuración de Supabase (acceso de un único usuario)

## 1. Crear el proyecto
1. En <https://supabase.com> crea un proyecto (plan Free vale).
2. **Project Settings → API**: copia `Project URL` y la clave `anon`/`publishable`. Son públicas por diseño.
   **Nunca** uses ni copies la clave `service_role` en este repo ni en GitHub.

## 2. Bloquear el registro público
**Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**
(y deja desactivados el resto de proveedores). Alternativa en `config.toml`: `[auth] enable_signup = false`. Desactiva también *Confirm email* si no quieres depender de SMTP.

La migración añade una segunda barrera: un trigger en `auth.users` que rechaza crear más de un usuario.

## 3. Crear tu usuario
**Authentication → Users → Add user → Create new user**: tu correo + contraseña larga, marca *Auto Confirm User*.
Copia su **UUID** (columna *User UID*).

## 4. Aplicar migraciones
**Vía recomendada (sin CLI ni Docker):** abre **SQL Editor**, pega el contenido de cada fichero de `supabase/migrations/` en orden y ejecútalo.

**Vía CLI (opcional, v3):** desde la v3 los comandos apuntan al stack **local** por defecto; para el proyecto alojado hay que indicar `--remote`:
```bash
supabase init                 # una vez, crea supabase/config.toml
supabase link --project-ref <ref>
supabase db push --yes --remote
```
Un `supabase db push` sin `--remote` intenta usar Docker local. `--yes` es obligatorio en CI/agentes (el valor por defecto de la confirmación es «no»).

Aplica **en orden** `20261104000001_core.sql` y `20261104000002_files_materials.sql`. La segunda crea el bucket privado `printforge` (límite 50 MB), las tablas de la biblioteca y las políticas de Storage del propietario.

La migración concede privilegios de forma **explícita** (`grant ... to authenticated`) porque Supabase está retirando los privilegios automáticos en `public`; funciona con cualquiera de las dos configuraciones del Data API.

## 5. Registrar el UUID del propietario (una sola vez)
```sql
insert into private.app_owner (user_id) values ('<TU-UUID>');
```
Todas las políticas RLS comparan `auth.uid()` con este UUID (`public.is_owner()`).
Si algún día recreas tu usuario, actualiza el UUID: `update private.app_owner set user_id = '<nuevo>';`.
Cualquier otro usuario autenticado ve 0 filas y no puede escribir; `anon` no tiene permisos.
El esquema `private` no está expuesto por la API.

## 6. Variables de entorno
Local: copia `.env.example` a `.env.local` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
GitHub: repo → *Settings → Secrets and variables → Actions → **Variables*** con los mismos nombres.

## 7. Verificar
- Iniciar sesión con tu usuario funciona.
- Con un segundo usuario creado manualmente (borra el trigger temporalmente solo para probar) la app muestra «cuenta no autorizada».
- `curl <URL>/rest/v1/jobs -H "apikey: <anon>"` devuelve 401/403 o `[]`, nunca datos.
