import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router'
import { AuthLayout } from '@/components/auth-layout'
import { FormError } from '@/components/form-error'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldGroup } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useLogin } from '@/hooks/use-auth'
import { applyServerError } from '@/lib/forms'
import { loginSchema, type LoginValues } from '@/lib/validation'

export default function LoginPage() {
  const [params] = useSearchParams()
  const loginMutation = useLogin()
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await loginMutation.mutateAsync(values)
    } catch (error) {
      applyServerError(form.setError, error)
    }
  })

  const next = params.get('next')
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register'

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Log in to your account</h1>
            <p className="text-sm text-balance text-muted-foreground">Enter your email and password</p>
          </div>
          <FormError message={errors.root?.server?.message} />
          <TextField id="email" label="Email" type="email" autoComplete="email" registration={form.register('email')} error={errors.email} />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            registration={form.register('password')}
            error={errors.password}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            Log in
          </Button>
          <FieldDescription className="text-center">
            Don&apos;t have an account?{' '}
            <Link to={registerHref} className="underline underline-offset-4">
              Sign up
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
