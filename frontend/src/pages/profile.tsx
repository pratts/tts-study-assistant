import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormError } from '@/components/form-error'
import { ErrorState } from '@/components/query-state'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useProfile, useUpdatePassword, useUpdateProfile } from '@/hooks/use-profile'
import { applyServerError } from '@/lib/forms'
import { LIMITS, passwordChangeSchema, profileSchema, type PasswordChangeValues, type ProfileValues } from '@/lib/validation'

function ProfileForm({ name, email }: ProfileValues) {
  const updateProfile = useUpdateProfile()
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: { name, email } })
  const { errors, isSubmitting, isDirty } = form.formState

  useEffect(() => form.reset({ name, email }), [name, email, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      // Send only what changed; the backend treats omitted fields as unchanged.
      const profile = await updateProfile.mutateAsync({
        name: values.name !== name ? values.name : undefined,
        email: values.email !== email ? values.email : undefined,
      })
      form.reset({ name: profile.name, email: profile.email })
      toast.success('Profile updated')
    } catch (error) {
      applyServerError(form.setError, error)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <TextField id="profile-name" label="Name" autoComplete="name" registration={form.register('name')} error={errors.name} />
        <TextField id="profile-email" label="Email" type="email" autoComplete="email" registration={form.register('email')} error={errors.email} />
        <Button type="submit" className="self-start" disabled={isSubmitting || !isDirty}>
          {isSubmitting && <Spinner />}
          Save profile
        </Button>
      </FieldGroup>
    </form>
  )
}

function PasswordForm() {
  const updatePassword = useUpdatePassword()
  const form = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updatePassword.mutateAsync({ old_password: values.oldPassword, new_password: values.newPassword })
      form.reset()
      toast.success('Password updated')
    } catch (error) {
      applyServerError(form.setError, error)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <TextField
          id="old-password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          registration={form.register('oldPassword')}
          error={errors.oldPassword}
        />
        <TextField
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          registration={form.register('newPassword')}
          error={errors.newPassword}
          description={`Up to ${LIMITS.passwordBytes} bytes.`}
        />
        <TextField
          id="confirm-password"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          registration={form.register('confirmPassword')}
          error={errors.confirmPassword}
        />
        <Button type="submit" className="self-start" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Update password
        </Button>
      </FieldGroup>
    </form>
  )
}

export default function ProfilePage() {
  const profile = useProfile()

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name and the email you log in with.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile.isPending && (
            <div className="flex flex-col gap-4" role="status" aria-label="Loading profile">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          )}
          {profile.isError && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} title="Could not load your profile" />}
          {profile.data && <ProfileForm name={profile.data.name} email={profile.data.email} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Other devices stay logged in until their sessions expire.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
