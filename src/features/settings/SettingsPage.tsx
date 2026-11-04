import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Form'
import { ErrorState, Loading } from '@/components/ui/States'
import { useSaveSettings, useSettings } from '@/data/hooks'
import { fieldErrors, settingsSchema } from '@/domain/schemas'
import { useAuth } from '@/features/auth/AuthProvider'

const toNumber = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

export function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings()
  const save = useSaveSettings()
  const { session, signOut } = useAuth()
  const [f, setF] = useState({ hours_per_day: '', printer_watts: '', kwh_price: '', default_price_per_kg: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (data)
      setF({
        hours_per_day: String(data.hours_per_day),
        printer_watts: String(data.printer_watts),
        kwh_price: String(data.kwh_price),
        default_price_per_kg: String(data.default_price_per_kg),
      })
  }, [data])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    setSubmitError(null)
    const parsed = settingsSchema.safeParse({
      hours_per_day: toNumber(f.hours_per_day),
      printer_watts: toNumber(f.printer_watts),
      kwh_price: toNumber(f.kwh_price),
      default_price_per_kg: toNumber(f.default_price_per_kg),
    })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    try {
      await save.mutateAsync(parsed.data)
      setSaved(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const set = (k: keyof typeof f, v: string) => {
    setSaved(false)
    setF((s) => ({ ...s, [k]: v }))
  }

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Parámetros de cálculo y sesión" />
      <div className="flex max-w-2xl flex-col gap-6 px-4 md:px-8">
        {isLoading && <Loading />}
        {error && <ErrorState error={error} onRetry={() => void refetch()} />}
        {data && (
          <form onSubmit={submit} noValidate>
            <Card className="flex flex-col gap-5 p-5">
              <div>
                <h2 className="text-base font-semibold">Cálculo de tiempos y costes</h2>
                <p className="mt-1 text-sm text-muted">Se usan para estimar fechas orientativas, electricidad y material valorado. Son aproximaciones.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Horas de impresión por día" hint="Las que sueles tener disponibles" error={errors.hours_per_day}>
                  {(p) => <Input {...p} inputMode="decimal" value={f.hours_per_day} onChange={(e) => set('hours_per_day', e.target.value)} />}
                </Field>
                <Field label="Consumo de la impresora (W)" hint="Media aproximada durante la impresión" error={errors.printer_watts}>
                  {(p) => <Input {...p} inputMode="decimal" value={f.printer_watts} onChange={(e) => set('printer_watts', e.target.value)} />}
                </Field>
                <Field label="Precio del kWh (€)" error={errors.kwh_price}>
                  {(p) => <Input {...p} inputMode="decimal" value={f.kwh_price} onChange={(e) => set('kwh_price', e.target.value)} />}
                </Field>
                <Field label="Precio por defecto del filamento (€/kg)" hint="Cuando un color no tiene material asignado" error={errors.default_price_per_kg}>
                  {(p) => <Input {...p} inputMode="decimal" value={f.default_price_per_kg} onChange={(e) => set('default_price_per_kg', e.target.value)} />}
                </Field>
              </div>
              {submitError && <p role="alert" className="text-sm text-danger">{submitError}</p>}
              <div className="flex items-center justify-end gap-3">
                {saved && <span role="status" className="text-sm text-accent-fg">Guardado</span>}
                <Button type="submit" variant="primary" loading={save.isPending}>Guardar</Button>
              </div>
            </Card>
          </form>
        )}

        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Sesión</h2>
            <p className="mt-1 truncate text-sm text-muted">{session?.user.email}</p>
          </div>
          <Button onClick={() => void signOut()}>Cerrar sesión</Button>
        </Card>
      </div>
    </>
  )
}
