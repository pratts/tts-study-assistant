import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Link, useSearchParams } from 'react-router'
import { AuthLayout } from '@/components/auth-layout'
import { FormError } from '@/components/form-error'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldGroup } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useRegister } from '@/hooks/use-auth'
import { applyServerError } from '@/lib/forms'
import { LIMITS, registerSchema, type RegisterValues } from '@/lib/validation'

export default function RegisterPage() {
  const [params] = useSearchParams()
  const registerMutation = useRegister()
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await registerMutation.mutateAsync(values)
      toast.success(`Welcome, ${res.user.name}!`)
    } catch (error) {
      applyServerError(form.setError, error)
    }
  })

  const next = params.get('next')
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Create an account</h1>
            <p className="text-sm text-balance text-muted-foreground">Save notes from any website and listen to them</p>
          </div>
          <FormError message={errors.root?.server?.message} />
          <TextField id="name" label="Name" autoComplete="name" registration={form.register('name')} error={errors.name} />
          <TextField id="email" label="Email" type="email" autoComplete="email" registration={form.register('email')} error={errors.email} />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            registration={form.register('password')}
            error={errors.password}
            description={`Up to ${LIMITS.passwordBytes} bytes.`}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            Create account
          </Button>
          <FieldDescription className="text-center">
            Already have an account?{' '}
            <Link to={loginHref} className="underline underline-offset-4">
              Log in
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
