import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { usePasskeyLoginOptions, usePasskeyLoginVerify } from '../hooks/usePasskeys';
import { isWebAuthnSupported, getPasskeyAssertion } from '../services/webauthn';
import type { LoginResponse } from '../types';
import type { AuthenticationOptions } from '../services/webauthn';
import { AxiosError } from 'axios';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const passkeyLoginOptions = usePasskeyLoginOptions();
  const passkeyLoginVerify = usePasskeyLoginVerify();
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const webauthnSupported = isWebAuthnSupported();
  const autoTriggered = useRef(false);

  const handlePasskeyLogin = useCallback(async (silent = false) => {
    setError('');
    setPasskeyLoading(true);
    try {
      const options = await passkeyLoginOptions.mutateAsync();
      const assertion = await getPasskeyAssertion(options as AuthenticationOptions);
      await passkeyLoginVerify.mutateAsync({ ...assertion, challengeKey: options.challengeKey });
      navigate('/mail');
    } catch (err) {
      if (silent && err instanceof Error && err.name === 'NotAllowedError') {
        // User cancelled auto-triggered passkey — silently show login form
      } else if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey authentication was cancelled.');
      } else if (!silent) {
        setError('Passkey authentication failed. Please try again.');
      }
    } finally {
      setPasskeyLoading(false);
    }
  }, [navigate, passkeyLoginOptions, passkeyLoginVerify]);

  useEffect(() => {
    if (webauthnSupported && !autoTriggered.current) {
      autoTriggered.current = true;
      handlePasskeyLogin(true);
    }
  }, [webauthnSupported, handlePasskeyLogin]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    login.mutate(
      { email, password },
      {
        onSuccess: (data: LoginResponse) => {
          if (data.two_factor_required) {
            navigate('/2fa', { state: { methods: data.methods } });
          } else if (data.setup_required) {
            navigate('/setup');
          } else {
            navigate('/mail');
          }
        },
        onError: (err: Error) => {
          if (err instanceof AxiosError && err.response?.status === 429) {
            const retryAfter = err.response.headers['retry-after'];
            const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
            setError(`Too many login attempts. Please wait ${seconds} seconds before trying again.`);
          } else if (err instanceof AxiosError && err.response?.status === 422) {
            const messages = err.response.data?.errors;
            if (messages) {
              const first = Object.values(messages).flat()[0];
              setError(typeof first === 'string' ? first : 'Invalid credentials.');
            } else {
              setError(err.response.data?.message || 'Invalid credentials.');
            }
          } else {
            setError('An unexpected error occurred. Please try again.');
          }
        },
      },
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Gradient orbs */}
      <div
        className="pointer-events-none absolute -left-40 -top-40"
        style={{
          width: 560,
          height: 560,
          borderRadius: '50%',
          background: 'rgba(124, 92, 252, 0.2)',
          filter: 'blur(110px)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40"
        style={{
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'rgba(245, 158, 66, 0.25)',
          filter: 'blur(120px)',
        }}
      />

      <div
        className="glass-panel animate-scaleIn relative w-full max-w-sm rounded-2xl p-8"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <h1
          className="text-gradient mb-1 text-center text-2xl font-semibold animate-blurIn"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Epicenter Mail
        </h1>
        <p
          className="mb-8 text-center text-sm animate-blurIn"
          style={{ color: 'var(--text-secondary)', animationDelay: '0.1s', animationFillMode: 'both' }}
        >
          Sign in to your account
        </p>

        {error && (
          <div
            key={error}
            className="animate-errorShake mb-4 rounded-lg px-4 py-3 text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition focus:border-[#7c5cfc] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.15)]"
              style={{
                background: 'var(--surface-2)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition focus:border-[#7c5cfc] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.15)]"
              style={{
                background: 'var(--surface-2)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
              boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
            }}
          >
            {login.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {webauthnSupported && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: 'var(--border-default)' }} />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>or</span>
              <div className="h-px flex-1" style={{ background: 'var(--border-default)' }} />
            </div>

            <button
              type="button"
              onClick={() => handlePasskeyLogin(false)}
              disabled={passkeyLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/5 disabled:opacity-50"
              style={{
                background: 'var(--surface-2)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              {passkeyLoading ? 'Authenticating...' : 'Sign in with Passkey'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
