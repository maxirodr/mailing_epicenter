import { useState, useRef, type KeyboardEvent, type ClipboardEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { usePasskeyLoginOptions, usePasskeyLoginVerify } from '../hooks/usePasskeys';
import { isWebAuthnSupported, getPasskeyAssertion } from '../services/webauthn';
import type { AuthenticationOptions } from '../services/webauthn';
import { AxiosError } from 'axios';

const CODE_LENGTH = 6;

export default function TwoFactorPage() {
  const navigate = useNavigate();
  const { verify2fa } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const location = useLocation();
  const methods: string[] = (location.state as { methods?: string[] })?.methods ?? ['totp'];
  const hasPasskeyMethod = methods.includes('passkey') && isWebAuthnSupported();
  const [activeTab, setActiveTab] = useState<'totp' | 'passkey'>('totp');
  const passkeyLoginOptions = usePasskeyLoginOptions();
  const passkeyLoginVerify = usePasskeyLoginVerify();
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  async function handlePasskeyVerify() {
    setError('');
    setPasskeyLoading(true);
    try {
      const options = await passkeyLoginOptions.mutateAsync();
      const assertion = await getPasskeyAssertion(options as AuthenticationOptions);
      await passkeyLoginVerify.mutateAsync({ ...assertion, challengeKey: options.challengeKey });
      navigate('/mail');
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey authentication was cancelled.');
      } else {
        setError('Passkey verification failed.');
      }
    } finally {
      setPasskeyLoading(false);
    }
  }

  function focusInput(index: number) {
    inputRefs.current[index]?.focus();
  }

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;

    const char = value.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    if (char && index < CODE_LENGTH - 1) {
      focusInput(index + 1);
    }

    if (next.every((d) => d !== '') && char) {
      submitCode(next.join(''));
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);

    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    focusInput(focusIdx);

    if (next.every((d) => d !== '')) {
      submitCode(next.join(''));
    }
  }

  function submitCode(code: string) {
    setError('');
    verify2fa.mutate(
      { code },
      {
        onSuccess: () => {
          navigate('/mail');
        },
        onError: (err: Error) => {
          setDigits(Array(CODE_LENGTH).fill(''));
          focusInput(0);
          if (err instanceof AxiosError && err.response?.status === 422) {
            setError(err.response.data?.message || 'Invalid code. Please try again.');
          } else {
            setError('Verification failed. Please try again.');
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
          className="mb-1 text-center text-2xl font-semibold"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}
        >
          Two-Factor Authentication
        </h1>
        <p
          className="mb-4 text-center text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          {activeTab === 'totp' ? 'Enter the 6-digit code from your authenticator app' : 'Verify your identity with a passkey'}
        </p>

        {hasPasskeyMethod && (
          <div className="mb-6 flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface-2)' }}>
            <button
              onClick={() => setActiveTab('totp')}
              className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition"
              style={activeTab === 'totp' ? { background: 'var(--accent-primary)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              TOTP Code
            </button>
            <button
              onClick={() => setActiveTab('passkey')}
              className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition"
              style={activeTab === 'passkey' ? { background: 'var(--accent-primary)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              Passkey
            </button>
          </div>
        )}

        {error && (
          <div
            key={error}
            className="animate-errorShake mb-4 rounded-lg px-4 py-3 text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}
          >
            {error}
          </div>
        )}

        {activeTab === 'passkey' ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handlePasskeyVerify}
              disabled={passkeyLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
                boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              {passkeyLoading ? 'Verifying...' : 'Verify with Passkey'}
            </button>
          </div>
        ) : (
        <>

        <div className="mb-6 flex justify-center gap-2.5">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className="h-12 w-10 rounded-xl text-center text-lg font-semibold outline-none transition focus:border-[#7c5cfc] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.15)]"
              style={{
                background: 'var(--surface-2)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
              autoFocus={i === 0}
            />
          ))}
        </div>

        <button
          type="button"
          disabled={verify2fa.isPending || digits.some((d) => !d)}
          onClick={() => submitCode(digits.join(''))}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
            boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
          }}
        >
          {verify2fa.isPending ? 'Verifying...' : 'Verify'}
        </button>

        </>
        )}

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-3 w-full text-center text-sm transition hover:brightness-125"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
