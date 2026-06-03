import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useSetup2FA, useConfirm2FA } from '../hooks/useSettings';
import { useRegisterPasskeyOptions, useRegisterPasskeyVerify } from '../hooks/usePasskeys';
import { isWebAuthnSupported, createPasskeyCredential } from '../services/webauthn';
import type { RegistrationOptions } from '../services/webauthn';

const ACCENT_BTN = {
  background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
  boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
};

export default function SetupPage() {
  const navigate = useNavigate();
  const { user, setupComplete } = useAuth();
  // If user already has 2FA (e.g. page refresh), skip to step 2
  const [step, setStep] = useState<1 | 2>(user?.two_factor_confirmed_at ? 2 : 1);

  // Already completed setup
  if (user?.setup_completed_at) {
    navigate('/mail', { replace: true });
    return null;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Gradient orbs */}
      <div
        className="pointer-events-none absolute -left-40 -top-40"
        style={{ width: 560, height: 560, borderRadius: '50%', background: 'rgba(124, 92, 252, 0.2)', filter: 'blur(110px)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40"
        style={{ width: 500, height: 500, borderRadius: '50%', background: 'rgba(245, 158, 66, 0.25)', filter: 'blur(120px)' }}
      />

      <div
        className="glass-panel animate-scaleIn relative w-full max-w-lg rounded-2xl p-8"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Progress */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
              style={step >= 1 ? { background: 'var(--accent-primary)', color: 'white' } : { background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}
            >
              {step > 1 ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : '1'}
            </div>
            <span className="text-sm font-medium" style={{ color: step >= 1 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>2FA Setup</span>
          </div>
          <div className="h-px flex-1" style={{ background: 'var(--border-default)' }} />
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
              style={step >= 2 ? { background: 'var(--accent-primary)', color: 'white' } : { background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}
            >
              2
            </div>
            <span className="text-sm font-medium" style={{ color: step >= 2 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>Passkey</span>
          </div>
        </div>

        {step === 1 && <Step1TwoFA onComplete={() => setStep(2)} />}
        {step === 2 && <Step2Passkey onComplete={async () => {
          await setupComplete.mutateAsync();
          navigate('/mail', { replace: true });
        }} />}
      </div>
    </div>
  );
}

// ── Step 1: Mandatory 2FA TOTP Setup ──

function Step1TwoFA({ onComplete }: { onComplete: () => void }) {
  const setup2FA = useSetup2FA();
  const confirm2FA = useConfirm2FA();
  const [phase, setPhase] = useState<'start' | 'scan' | 'recovery'>('start');
  const [qrData, setQrData] = useState<{ secret: string; qr_url: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function handleStartSetup() {
    try {
      const data = await setup2FA.mutateAsync();
      setQrData(data);
      setPhase('scan');
    } catch {
      setError('Failed to initiate 2FA setup.');
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (code.length !== 6) { setError('Enter a 6-digit code'); return; }
    try {
      const result = await confirm2FA.mutateAsync({ code });
      setRecoveryCodes(result.recovery_codes);
      setPhase('recovery');
    } catch {
      setError('Invalid code. Please try again.');
    }
  }

  if (phase === 'start') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            Secure Your Account
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Two-factor authentication (2FA) is required. You'll need an authenticator app like Google Authenticator or Authy.
          </p>
        </div>
        <button
          onClick={handleStartSetup}
          disabled={setup2FA.isPending}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          style={ACCENT_BTN}
        >
          {setup2FA.isPending ? 'Setting up...' : 'Set Up 2FA'}
        </button>
      </div>
    );
  }

  if (phase === 'scan' && qrData) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            Scan QR Code
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Scan this with your authenticator app, then enter the 6-digit code below.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: 'var(--border-default)' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData.qr_url)}`}
              alt="2FA QR Code"
              className="h-44 w-44"
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Manual entry key</p>
          <code
            className="block w-full rounded-lg border px-3.5 py-2.5 text-center font-mono text-sm select-all"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
          >
            {qrData.secret}
          </code>
        </div>

        {error && (
          <div className="rounded-lg px-4 py-2.5 text-sm" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full rounded-xl border px-3.5 py-2.5 text-center font-mono text-lg tracking-widest outline-none transition focus:border-[#7c5cfc] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.15)]"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            placeholder="000000"
            autoFocus
          />
          <button
            type="submit"
            disabled={confirm2FA.isPending || code.length !== 6}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            style={ACCENT_BTN}
          >
            {confirm2FA.isPending ? 'Verifying...' : 'Verify & Enable'}
          </button>
        </form>
      </div>
    );
  }

  if (phase === 'recovery') {
    return (
      <div className="space-y-5">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5" style={{ color: 'var(--accent-success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent-success)' }}>
              2FA Enabled
            </h2>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Save these recovery codes in a safe place. Each code can only be used once.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {recoveryCodes.map((c) => (
            <code
              key={c}
              className="rounded-lg px-3 py-2 text-center font-mono text-sm"
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            >
              {c}
            </code>
          ))}
        </div>

        <button
          onClick={() => {
            navigator.clipboard.writeText(recoveryCodes.join('\n'));
          }}
          className="w-full rounded-lg px-4 py-2 text-sm font-medium transition hover:bg-white/5"
          style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
        >
          Copy All Codes
        </button>

        <button
          onClick={onComplete}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
          style={ACCENT_BTN}
        >
          Continue
        </button>
      </div>
    );
  }

  return null;
}

// ── Step 2: Optional Passkey Setup ──

function Step2Passkey({ onComplete }: { onComplete: () => void }) {
  const registerOptions = useRegisterPasskeyOptions();
  const registerVerify = useRegisterPasskeyVerify();
  const [status, setStatus] = useState<'idle' | 'registering' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const webauthnAvailable = isWebAuthnSupported();

  async function handleRegister() {
    setError('');
    setStatus('registering');
    try {
      const options = await registerOptions.mutateAsync();
      const credential = await createPasskeyCredential(options as RegistrationOptions);
      await registerVerify.mutateAsync({ ...credential, name: 'Setup Passkey' });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to register passkey.');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
          Set Up a Passkey
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Passkeys let you sign in with your fingerprint, face, or device PIN — no password needed.
          {' '}
          <a
            href="https://passkeys.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition hover:brightness-125"
            style={{ color: 'var(--accent-primary)' }}
          >
            Learn more about passkeys
          </a>
        </p>
      </div>

      {status === 'done' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg p-3" style={{ background: 'rgba(52, 211, 153, 0.1)' }}>
            <svg className="h-5 w-5" style={{ color: 'var(--accent-success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium" style={{ color: 'var(--accent-success)' }}>Passkey registered successfully!</span>
          </div>
          <button
            onClick={onComplete}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
            style={ACCENT_BTN}
          >
            Continue to Mail
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg px-4 py-2.5 text-sm" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {webauthnAvailable ? (
            <button
              onClick={handleRegister}
              disabled={status === 'registering'}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              style={ACCENT_BTN}
            >
              {status === 'registering' ? 'Waiting for device...' : 'Set Up Passkey'}
            </button>
          ) : (
            <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}>
              Your browser doesn't support passkeys. You can set one up later in Settings.
            </div>
          )}

          <button
            onClick={onComplete}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
