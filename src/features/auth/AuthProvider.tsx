import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { checkOwner } from '@/data/api'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'signed_out' | 'signed_in'

interface AuthState {
  status: Status
  session: Session | null
  /** Mensaje para mostrar en el login (credenciales incorrectas, cuenta no autorizada…). */
  message: string | null
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

const NOT_AUTHORIZED = 'Esta cuenta no está autorizada para acceder a PrintForge.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState<string | null>(null)

  /** Una sesión sólo es válida si pertenece al propietario registrado en la base de datos. */
  const accept = useCallback(async (next: Session | null) => {
    if (!next) {
      setSession(null)
      setStatus('signed_out')
      return
    }
    try {
      if (!(await checkOwner())) {
        await supabase.auth.signOut()
        setSession(null)
        setMessage(NOT_AUTHORIZED)
        setStatus('signed_out')
        return
      }
      setSession(next)
      setStatus('signed_in')
    } catch (e) {
      await supabase.auth.signOut()
      setSession(null)
      setMessage(e instanceof Error ? `No se pudo verificar el acceso: ${e.message}` : 'No se pudo verificar el acceso')
      setStatus('signed_out')
    }
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) return accept(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Evita deadlocks de supabase-js: no hacer llamadas a la API dentro del callback.
      if (event === 'SIGNED_OUT') setTimeout(() => active && void accept(null), 0)
      if (event === 'TOKEN_REFRESHED') setTimeout(() => active && setSession(next), 0)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [accept])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setMessage(null)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session) {
        setMessage('Correo o contraseña incorrectos.')
        return false
      }
      await accept(data.session)
      return true
    },
    [accept],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setMessage(null)
    await accept(null)
  }, [accept])

  const value = useMemo(() => ({ status, session, message, signIn, signOut }), [status, session, message, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
