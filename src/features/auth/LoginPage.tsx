import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { Logo } from '@/components/Logo'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { signIn, message } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await signIn(email.trim(), password)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-sm animate-rise">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="size-12" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">PrintForge</h1>
            <p className="mt-1 text-sm text-muted">Acceso privado</p>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
          <Field label="Correo">
            {(p) => <Input {...p} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Contraseña">
            {(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {message && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {message}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy} className="justify-center">
            Entrar
          </Button>
        </div>
      </form>
    </main>
  )
}
