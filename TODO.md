# TODO

## Hecho
- Fase 1 (núcleo) y fase 2 (archivos/materiales): validadas contra Supabase real y sobre la web publicada.
- Seguridad: migración 4 aplicada (rls_auto_enable() bloqueada); `is_owner()` y Leaked Password Protection aceptados (docs/security.md).
- Despliegue en GitHub Pages: https://xarli11.github.io/PrintForge/ (tests + build + deploy en Actions).
- 98 tests unitarios/BD + 6 e2e (escritorio + iPhone emulado).

## Pendiente
- Probar en un iPhone real (instalación como acceso directo, subida/descarga desde Safari).
- Actions: avisos de Node 20 en `actions/checkout`/`setup-node`/`upload-pages-artifact` v4 (forzados a Node 24); revisar versiones más recientes.

## Fases siguientes
- Fase 3: calendario, alertas, filtros por material/color/fecha, dashboard completo.
- Fase 4: metadatos de laminado 3MF (Bambu), previsualización STL, exportación JSON, pulido móvil.
