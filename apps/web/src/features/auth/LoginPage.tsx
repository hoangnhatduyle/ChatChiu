// Sign in (F-AU-01) and the way to the forgot-password form (F-AU-03). Success is not handled here:
// the session event moves the state to SIGNED_IN and <PublicRoute> sends her to the page she asked for.
import { useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSession } from '../../core/session-context'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout, FormMessage } from './AuthLayout'
import { focusFirstInvalid, hasErrors, validateLogin, type FieldErrors } from './auth-validation'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { PasswordField, ShowPasswordsBox } from './PasswordFields'
import { useRevealed } from './use-revealed'

const LINK = 'font-bold text-accent underline underline-offset-2'

export default function LoginPage() {
  // ?forgot=1 opens the request form (the expired-link page links to it). After that the two views
  // switch in place, with no navigation: the email she typed and the remembered page
  // (location.state.from, F-AU-05) stay, and the route boundary does not remount the page.
  const [params] = useSearchParams()
  const [forgot, setForgot] = useState(() => params.has('forgot'))
  const [email, setEmail] = useState('')
  const [switched, setSwitched] = useState(false)

  function show(next: boolean) {
    setSwitched(true)
    setForgot(next)
  }

  if (forgot) {
    return <ForgotPasswordForm email={email} onEmailChange={setEmail} onBack={() => show(false)} />
  }
  return (
    <SignInForm
      email={email}
      onEmailChange={setEmail}
      onForgot={() => show(true)}
      focusTitle={switched}
    />
  )
}

type SignInFormProps = {
  email: string
  onEmailChange: (email: string) => void
  onForgot: () => void
  focusTitle: boolean
}

function SignInForm({ email, onEmailChange, onForgot, focusTitle }: SignInFormProps) {
  const { signIn, expired } = useSession()
  const form = useRef<HTMLFormElement>(null)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'email' | 'password'>>({})
  const [failure, setFailure] = useState('')
  const [pending, setPending] = useState(false)
  const { revealed, toggle } = useRevealed()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const found = validateLogin({ email, password })
    setErrors(found)
    setFailure('')
    if (hasErrors(found)) return focusFirstInvalid(form.current)
    setPending(true)
    const result = await signIn(email.trim(), password)
    // On success the redirect replaces this page; if it does not, the form must not stay locked.
    setPending(false)
    if (!result.success) setFailure(result.message)
  }

  return (
    <AuthLayout
      title="Sign in"
      intro="Welcome back. Your kitchen is where you left it."
      focusTitle={focusTitle}
    >
      <form ref={form} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormMessage role="status" tone="info">
          {expired ? 'Your session expired. Sign in again to continue.' : undefined}
        </FormMessage>
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={onEmailChange}
          isRequired
          isInvalid={errors.email !== undefined}
          errorMessage={errors.email}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          revealed={revealed}
          isRequired
          isInvalid={errors.password !== undefined}
          errorMessage={errors.password}
        />
        <ShowPasswordsBox revealed={revealed} onChange={toggle} label="Show password" />
        <FormMessage role="alert" tone="error">
          {failure}
        </FormMessage>
        <Button type="submit" variant="primary" size="lg" shape="rounded" isPending={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="flex flex-col gap-1 text-md">
        <Button variant="ghost" onPress={onForgot} className="self-start">
          Forgot password?
        </Button>
        <p className="text-muted">
          New here?{' '}
          <Link to="/register" className={LINK}>
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
