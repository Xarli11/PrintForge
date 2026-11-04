import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Loading } from '@/components/ui/States'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { JobDetailPage } from '@/features/jobs/JobDetailPage'
import { JobsPage } from '@/features/jobs/JobsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { isConfigured } from '@/lib/supabase'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

function Gate() {
  const { status } = useAuth()
  if (status === 'loading') return <Loading label="Verificando sesión…" />
  if (status === 'signed_out') return <LoginPage />
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function MissingConfig() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md rounded-card border border-warn/30 bg-surface p-6 text-sm">
        <h1 className="mb-2 text-base font-semibold">Falta la configuración de Supabase</h1>
        <p className="text-muted">
          Define <code className="font-mono text-fg">VITE_SUPABASE_URL</code> y <code className="font-mono text-fg">VITE_SUPABASE_ANON_KEY</code> (copia{' '}
          <code className="font-mono text-fg">.env.example</code> a <code className="font-mono text-fg">.env.local</code>) y reinicia la compilación.
        </p>
      </div>
    </main>
  )
}

export function App() {
  if (!isConfigured) return <MissingConfig />
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* HashRouter: recargar cualquier pantalla funciona en GitHub Pages sin reglas de servidor */}
        <HashRouter>
          <Gate />
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
