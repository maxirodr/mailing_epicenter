import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import api, { fetchCsrfCookie } from '../services/api';
import { AxiosError } from 'axios';

interface InviteInfo {
  user: { name: string; email: string };
  expires_at: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchInvite() {
      try {
        await fetchCsrfCookie();
        const { data } = await api.get<InviteInfo>(`/api/invite/${token}`);
        setInfo(data);
      } catch (err) {
        if (err instanceof AxiosError) {
          setError(err.response?.data?.message || 'Invalid invite link.');
        } else {
          setError('Failed to load invite.');
        }
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchInvite();
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/invite/${token}`, {
        password,
        password_confirmation: confirmPassword,
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof AxiosError) {
        setFormError(err.response?.data?.message || 'Failed to set password.');
      } else {
        setFormError('An unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
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
        className="glass-panel animate-scaleIn relative w-full max-w-sm rounded-2xl p-8"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <h1
          className="mb-1 text-center text-2xl font-semibold"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}
        >
          Epicenter Mail
        </h1>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
          </div>
        ) : error ? (
          <div className="mt-6 space-y-4">
            <div
              className="rounded-lg px-4 py-3 text-sm text-center"
              style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}
            >
              {error}
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full text-center text-sm transition hover:brightness-125"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Go to login
            </button>
          </div>
        ) : success ? (
          <div className="mt-6 space-y-5">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(52, 211, 153, 0.15)' }}>
                <svg className="h-6 w-6" style={{ color: 'var(--accent-success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Your password has been set. You can now sign in.
              </p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
                boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
              }}
            >
              Sign in
            </button>
          </div>
        ) : info ? (
          <div className="mt-4">
            <p className="mb-1 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              Welcome, <strong style={{ color: 'var(--text-primary)' }}>{info.user.name}</strong>
            </p>
            <p className="mb-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Set a password for <strong>{info.user.email}</strong>
            </p>

            {formError && (
              <div
                key={formError}
                className="animate-errorShake mb-4 rounded-lg px-4 py-3 text-sm"
                style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
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
                  minLength={8}
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
                  placeholder="Min 8 characters"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition focus:border-[#7c5cfc] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.15)]"
                  style={{
                    background: 'var(--surface-2)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="Repeat password"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
                  boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
                }}
              >
                {submitting ? 'Setting password...' : 'Set Password'}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
