# TODO

## Hecho
- Fase 1 (núcleo) — validada contra Supabase real (19 pasos, 0 errores HTTP).
- Fase 2 (código): migración 2, Storage privado, biblioteca, miniaturas 3MF, materiales, colores, consumo y costes por material. 85 tests unitarios/BD + 6 e2e (escritorio + iPhone).

## Pendiente inmediato
- Aplicar la migración 2 en Supabase y ejecutar `node scripts/verify-real-files.mjs` (acceso anónimo a archivos, integridad SHA-256, enlaces firmados, límites).
- Revisar avisos del Security Advisor de Supabase antes de publicar.
- GitHub Pages: habilitar (Settings → Pages → GitHub Actions) y definir variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; el job `deploy` falla con 404 hasta entonces.

## Fases siguientes
- Fase 3: calendario, alertas, filtros por material/color/fecha, dashboard completo.
- Fase 4: metadatos de laminado 3MF (Bambu), previsualización STL, exportación JSON, pulido móvil.
