-- PrintForge · migración 4: endurecimiento tras la revisión del Security Advisor.
-- Mínimamente invasiva: sólo REVOKE de permisos y un comentario. No cambia funciones, tablas, políticas ni datos.

-- 1. public.rls_auto_enable(): función de Supabase (event trigger que activa RLS en tablas nuevas).
--    No debe ser invocable por la API (RPC) ni por usuarios: sólo la dispara el event trigger.
--    El permiso EXECUTE se comprueba al CREAR el event trigger, no al dispararlo, así que el automatismo se conserva
--    (verificado en supabase/tests/security.test.ts). Protegida con to_regprocedure por si un entorno local no la trae.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

-- 2. public.is_owner(): el EXECUTE para `authenticated` es NECESARIO (las políticas RLS la evalúan con el rol del
--    usuario y la app la llama por RPC para validar la sesión). Es segura: sin argumentos, sin SQL dinámico,
--    search_path vacío y sólo compara auth.uid() con el propietario; devuelve únicamente un booleano sobre el propio
--    llamante. Se reafirma que PUBLIC y anon no pueden ejecutarla. El aviso 0029 del Advisor se acepta (docs/security.md).
revoke execute on function public.is_owner() from public, anon;
comment on function public.is_owner() is
  'Devuelve true si auth.uid() es el propietario registrado en private.app_owner. SECURITY DEFINER intencionado: lo evalúan las políticas RLS y la app. Aviso del Security Advisor aceptado: ver docs/security.md.';
