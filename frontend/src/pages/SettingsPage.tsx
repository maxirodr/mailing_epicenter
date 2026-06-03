import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePasskeys, useRegisterPasskeyOptions, useRegisterPasskeyVerify, useDeletePasskey } from '../hooks/usePasskeys';
import { isWebAuthnSupported, createPasskeyCredential } from '../services/webauthn';
import type { RegistrationOptions } from '../services/webauthn';
import {
  useUpdatePassword,
  useSetup2FA,
  useConfirm2FA,
  useUpdateProfile,
  useUpdateSignature,
  useUploadAvatar,
  useSessions,
  useRevokeSession,
  useRevokeAllSessions,
  useRenameSession,
  useLoginHistory,
  useRecoveryCodes,
  useRegenerateRecoveryCodes,
  useAutoReply,
  useUpdateAutoReply,
  usePreferences,
  useUpdatePreferences,
  useDeleteAccount,
  useExportData,
  useUpdateMailboxProfile,
} from '../hooks/useSettings';
import { useMailboxes } from '../hooks/useMailboxes';
import { useNotifications } from '../hooks/useNotifications';
import type { AutoReply } from '../types';

const TipTapEditor = lazy(() => import('../components/compose/TipTapEditor'));

// ── Toast ────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-xl animate-slideInBottom ${
        type === 'success'
          ? 'border-green-800 bg-green-950/90 text-green-300'
          : 'border-red-800 bg-red-950/90 text-red-300'
      }`}
    >
      {type === 'success' ? (
        <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 rounded p-0.5 hover:bg-white/10">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  function show(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }
  function dismiss() { setToast(null); }
  return { toast, show, dismiss };
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

const ACCENT_BTN = {
  background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
};

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Argentina/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

const SECTIONS = [
  { key: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { key: 'mailbox', label: 'Mailbox', icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75' },
  { key: 'security', label: 'Security', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { key: 'email', label: 'Email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { key: 'appearance', label: 'Appearance', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { key: 'account', label: 'Account', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

// ── Inline Edit Field ────────────────────────────────────────────────

function InlineEdit({
  label,
  value,
  onSave,
  isPending,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  async function save() {
    if (!draft.trim()) return;
    await onSave(draft.trim());
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-48 rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setEditing(false); setDraft(value); }
            }}
          />
          <button onClick={save} disabled={isPending || !draft.trim()} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-50" style={ACCENT_BTN}>
            {isPending ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setDraft(value); }} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{value || '--'}</span>
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="rounded p-1 transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-tertiary)' }}
            title={`Edit ${label.toLowerCase()}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Password Strength ────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const len = password.length;
  const pct = len < 8 ? 33 : len < 12 ? 66 : 100;
  const color = len < 8 ? 'var(--accent-danger)' : len < 12 ? 'var(--accent-secondary)' : 'var(--accent-success)';
  const label = len < 8 ? 'Weak' : len < 12 ? 'Fair' : 'Strong';
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-xs" style={{ color }}>{label}</p>
    </div>
  );
}

// ── Confirmation Modal ───────────────────────────────────────────────

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  danger,
  requirePassword,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  requirePassword?: boolean;
  isPending: boolean;
  onConfirm: (password?: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl p-6 glass-panel animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>{title}</h3>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
        {requirePassword && (
          <input
            type="password"
            placeholder="Enter your password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="mb-4 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            autoFocus
          />
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/5" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(requirePassword ? pw : undefined)}
            disabled={isPending || (requirePassword && !pw)}
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
            style={danger ? { background: 'var(--accent-danger)' } : ACCENT_BTN}
          >
            {isPending ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Section: Mailbox ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function MailboxSection({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const { data: mailboxes } = useMailboxes();
  const updateProfile = useUpdateMailboxProfile();
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [avatarPreviews, setAvatarPreviews] = useState<Record<number, string>>({});

  async function handleAvatarChange(mailboxId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreviews((prev) => ({ ...prev, [mailboxId]: URL.createObjectURL(file) }));
    try {
      await updateProfile.mutateAsync({ mailboxId, avatar: file });
      showToast('Mailbox avatar updated', 'success');
    } catch (err) {
      showToast(extractError(err, 'Failed to upload avatar'), 'error');
      setAvatarPreviews((prev) => {
        const next = { ...prev };
        delete next[mailboxId];
        return next;
      });
    }
  }

  if (!mailboxes || mailboxes.length === 0) return null;

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Mailbox</h2>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Configure the sender identity for each mailbox. Recipients will see the display name and avatar you set here.
      </p>

      {mailboxes.map((mb) => {
        const avatarSrc = avatarPreviews[mb.id] || mb.avatar_url;
        const initial = (mb.display_name || mb.address).charAt(0).toUpperCase();

        return (
          <div key={mb.id} className="rounded-xl glass-card p-6">
            <div className="mb-5 flex items-center gap-5">
              <button
                type="button"
                onClick={() => fileRefs.current[mb.id]?.click()}
                className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all"
                style={{ background: 'rgba(124, 92, 252, 0.15)' }}
                title="Change mailbox avatar"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-semibold" style={{ color: 'var(--accent-primary)' }}>{initial}</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                {updateProfile.isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </div>
                )}
              </button>
              <input
                ref={(el) => { fileRefs.current[mb.id] = el; }}
                type="file"
                accept="image/*"
                onChange={(e) => handleAvatarChange(mb.id, e)}
                className="hidden"
              />
              <div>
                <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                  {mb.display_name || mb.address}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{mb.full_address}</p>
              </div>
            </div>

            <div className="space-y-3">
              <InlineEdit
                label="Display Name"
                value={mb.display_name ?? ''}
                isPending={updateProfile.isPending}
                onSave={async (v) => {
                  try {
                    await updateProfile.mutateAsync({ mailboxId: mb.id, displayName: v || null });
                    showToast('Display name updated', 'success');
                  } catch (err) {
                    showToast(extractError(err, 'Failed to update display name'), 'error');
                  }
                }}
              />
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Email Address</span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{mb.full_address}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Role</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={mb.role === 'owner'
                    ? { background: 'rgba(124, 92, 252, 0.15)', color: 'var(--accent-primary)' }
                    : { background: 'var(--surface-3)', color: 'var(--text-secondary)' }
                  }
                >
                  {mb.role === 'owner' ? 'Owner' : 'Member'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Section: Profile ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function ProfileSection({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const { user } = useAuth();
  const updateProfileMutation = useUpdateProfile();
  const uploadAvatarMutation = useUploadAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  function handleAvatarClick() {
    fileRef.current?.click();
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    try {
      await uploadAvatarMutation.mutateAsync(file);
      showToast('Avatar updated', 'success');
    } catch (err) {
      showToast(extractError(err, 'Failed to upload avatar'), 'error');
      setAvatarPreview(null);
    }
  }

  const avatarSrc = avatarPreview || user?.avatar_url;
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Profile</h2>

      {/* Avatar */}
      <div className="rounded-xl glass-card p-6">
        <div className="mb-5 flex items-center gap-5">
          <button
            type="button"
            onClick={handleAvatarClick}
            className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all"
            style={{ background: 'rgba(124, 92, 252, 0.15)' }}
            title="Change avatar"
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-semibold" style={{ color: 'var(--accent-primary)' }}>{initials}</span>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            {uploadAvatarMutation.isPending && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          <div>
            <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</p>
          </div>
        </div>

        <div className="space-y-3">
          <InlineEdit
            label="Name"
            value={user?.name ?? ''}
            isPending={updateProfileMutation.isPending}
            onSave={async (v) => {
              try {
                await updateProfileMutation.mutateAsync({ name: v });
                showToast('Name updated', 'success');
              } catch (err) { showToast(extractError(err, 'Failed to update name'), 'error'); }
            }}
          />
          <InlineEdit
            label="Display Name"
            value={user?.display_name ?? ''}
            isPending={updateProfileMutation.isPending}
            onSave={async (v) => {
              try {
                await updateProfileMutation.mutateAsync({ display_name: v || null });
                showToast('Display name updated', 'success');
              } catch (err) { showToast(extractError(err, 'Failed to update display name'), 'error'); }
            }}
          />
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Email</span>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{user?.email}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Role</span>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={user?.is_admin
                ? { background: 'rgba(124, 92, 252, 0.15)', color: 'var(--accent-primary)' }
                : { background: 'var(--surface-3)', color: 'var(--text-secondary)' }
              }
            >
              {user?.is_admin ? 'Administrator' : 'User'}
            </span>
          </div>

          {/* Timezone */}
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Timezone</span>
            <select
              value={user?.timezone ?? 'UTC'}
              onChange={async (e) => {
                try {
                  await updateProfileMutation.mutateAsync({ timezone: e.target.value });
                  showToast('Timezone updated', 'success');
                } catch (err) { showToast(extractError(err, 'Failed to update timezone'), 'error'); }
              }}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Language</span>
            <select
              value={user?.language ?? 'en'}
              onChange={async (e) => {
                try {
                  await updateProfileMutation.mutateAsync({ language: e.target.value });
                  showToast('Language updated', 'success');
                } catch (err) { showToast(extractError(err, 'Failed to update language'), 'error'); }
              }}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>

          {/* Member since */}
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Member since</span>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Section: Security ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function PasskeysCard({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const { data: passkeys, isLoading } = usePasskeys();
  const registerOptions = useRegisterPasskeyOptions();
  const registerVerify = useRegisterPasskeyVerify();
  const deletePasskey = useDeletePasskey();
  const [registering, setRegistering] = useState(false);
  const webauthnAvailable = isWebAuthnSupported();

  async function handleRegister() {
    setRegistering(true);
    try {
      const options = await registerOptions.mutateAsync();
      const credential = await createPasskeyCredential(options as RegistrationOptions);
      await registerVerify.mutateAsync({
        ...credential,
        name: 'Passkey ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      });
      showToast('Passkey registered successfully', 'success');
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          showToast('Passkey creation was blocked or cancelled. If you already have a passkey from this device, delete it first.', 'error');
        } else if (err.name === 'InvalidStateError') {
          showToast('This device already has a passkey registered. Delete the existing one first.', 'error');
        } else {
          showToast('Failed to register passkey: ' + err.message, 'error');
        }
      }
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePasskey.mutateAsync(id);
      showToast('Passkey deleted', 'success');
    } catch {
      showToast('Failed to delete passkey', 'error');
    }
  }

  return (
    <div className="rounded-xl glass-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>Passkeys</h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Sign in with biometrics instead of a password.{' '}
            <a href="https://passkeys.dev" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent-primary)' }}>
              What are passkeys?
            </a>
          </p>
        </div>
        {webauthnAvailable && (
          <button
            onClick={handleRegister}
            disabled={registering}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
            style={ACCENT_BTN}
          >
            {registering ? 'Waiting...' : 'Add Passkey'}
          </button>
        )}
      </div>

      {!webauthnAvailable && (
        <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}>
          Your browser doesn't support passkeys.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600" style={{ borderTopColor: 'var(--accent-primary)' }} />
        </div>
      ) : passkeys && passkeys.length > 0 ? (
        <div className="space-y-2">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center justify-between rounded-lg p-3" style={{ background: 'var(--surface-3)' }}>
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 shrink-0" style={{ color: 'var(--text-tertiary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{pk.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Added {new Date(pk.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(pk.id)}
                disabled={deletePasskey.isPending}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                style={{ color: 'var(--accent-danger)' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No passkeys registered yet.</p>
      )}
    </div>
  );
}

function SecuritySection({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const { user } = useAuth();
  const is2FAEnabled = !!user?.two_factor_confirmed_at;

  // ── Password ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const updatePasswordMutation = useUpdatePassword();

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) { setPasswordError('New password and confirmation do not match'); return; }
    if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters'); return; }
    try {
      await updatePasswordMutation.mutateAsync({ current_password: currentPassword, password: newPassword, password_confirmation: confirmPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      showToast('Password updated successfully', 'success');
    } catch (err) {
      const msg = extractError(err, 'Failed to update password');
      setPasswordError(msg);
      showToast(msg, 'error');
    }
  }

  // ── 2FA ──
  const [twoFAStep, setTwoFAStep] = useState<'idle' | 'setup' | 'confirm'>('idle');
  const [twoFAData, setTwoFAData] = useState<{ secret: string; qr_url: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAError, setTwoFAError] = useState('');
  const setup2FAMutation = useSetup2FA();
  const confirm2FAMutation = useConfirm2FA();

  // Recovery codes
  const recoveryCodes = useRecoveryCodes();
  const regenerateCodesMutation = useRegenerateRecoveryCodes();
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodesData, setRecoveryCodesData] = useState<string[] | null>(null);

  async function handleSetup2FA() {
    setTwoFAError('');
    try {
      const data = await setup2FAMutation.mutateAsync();
      setTwoFAData(data);
      setTwoFAStep('setup');
    } catch (err) { showToast(extractError(err, 'Failed to set up 2FA'), 'error'); }
  }

  async function handleConfirm2FA(e: React.FormEvent) {
    e.preventDefault();
    setTwoFAError('');
    if (twoFACode.length !== 6) { setTwoFAError('Enter a 6-digit code'); return; }
    try {
      await confirm2FAMutation.mutateAsync({ code: twoFACode });
      setTwoFAStep('idle'); setTwoFAData(null); setTwoFACode('');
      showToast('Two-factor authentication enabled successfully', 'success');
    } catch (err) { setTwoFAError(extractError(err, 'Invalid code. Please try again.')); }
  }

  async function handleShowRecoveryCodes() {
    setShowRecoveryCodes(true);
    const result = await recoveryCodes.refetch();
    if (result.data) setRecoveryCodesData(result.data);
  }

  async function handleRegenerateCodes() {
    try {
      const result = await regenerateCodesMutation.mutateAsync();
      setRecoveryCodesData(result.codes);
      showToast('Recovery codes regenerated', 'success');
    } catch (err) { showToast(extractError(err, 'Failed to regenerate codes'), 'error'); }
  }

  // ── Sessions ──
  const { data: sessions } = useSessions();
  const revokeSessionMutation = useRevokeSession();
  const revokeAllMutation = useRevokeAllSessions();
  const renameSessionMutation = useRenameSession();
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [sessionNameInput, setSessionNameInput] = useState('');

  // ── Login History ──
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const { data: loginHistory } = useLoginHistory(historyPage);

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Security</h2>

      {/* ── Change Password ── */}
      <div className="rounded-xl glass-card p-6">
        <h3 className="mb-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Change Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          {passwordError && (
            <div className="rounded-lg border px-4 py-2.5 text-sm animate-errorShake" style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: 'var(--accent-danger)' }}>
              {passwordError}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>Current Password</label>
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>New Password</label>
            <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
              placeholder="Min 8 characters" />
            <PasswordStrength password={newPassword} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>Confirm New Password</label>
            <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }} />
          </div>
          <button type="submit" disabled={updatePasswordMutation.isPending}
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50" style={ACCENT_BTN}>
            {updatePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* ── 2FA ── */}
      <div className="rounded-xl glass-card p-6">
        <h3 className="mb-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Two-Factor Authentication</h3>

        {is2FAEnabled && twoFAStep === 'idle' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'rgba(52, 211, 153, 0.15)' }}>
                <svg className="h-5 w-5" style={{ color: 'var(--accent-success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--accent-success)' }}>2FA Enabled</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Your account is protected with two-factor authentication.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={handleShowRecoveryCodes}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
                style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                View Recovery Codes
              </button>
              <span className="rounded-lg px-4 py-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                2FA is mandatory and cannot be disabled
              </span>
            </div>

            {/* Recovery codes display */}
            {showRecoveryCodes && recoveryCodesData && (
              <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Recovery Codes</h4>
                  <button onClick={handleRegenerateCodes} disabled={regenerateCodesMutation.isPending}
                    className="rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-white/5"
                    style={{ color: 'var(--accent-primary)' }}>
                    {regenerateCodesMutation.isPending ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
                <p className="mb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>Store these codes in a safe place. Each code can only be used once.</p>
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodesData.map((code) => (
                    <code key={code} className="rounded px-3 py-1.5 text-center font-mono text-sm" style={{ background: 'var(--surface-3)', color: 'var(--text-primary)' }}>{code}</code>
                  ))}
                </div>
                <button onClick={() => setShowRecoveryCodes(false)} className="mt-3 text-xs transition-colors hover:underline" style={{ color: 'var(--text-tertiary)' }}>
                  Hide codes
                </button>
              </div>
            )}
          </div>
        ) : twoFAStep === 'idle' ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Two-factor authentication is not enabled.</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>Add an extra layer of security to your account.</p>
            </div>
            <button onClick={handleSetup2FA} disabled={setup2FAMutation.isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50" style={ACCENT_BTN}>
              {setup2FAMutation.isPending ? 'Setting up...' : 'Enable 2FA'}
            </button>
          </div>
        ) : twoFAStep === 'setup' && twoFAData ? (
          <div className="space-y-5">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.):
            </p>
            <div className="flex justify-center">
              <div className="rounded-xl border bg-white p-4" style={{ borderColor: 'var(--border-default)' }}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFAData.qr_url)}`} alt="2FA QR Code" className="h-48 w-48" />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Manual entry key</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border px-3.5 py-2.5 font-mono text-sm select-all"
                  style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  {twoFAData.secret}
                </code>
                <button onClick={() => { navigator.clipboard.writeText(twoFAData.secret); showToast('Secret copied', 'success'); }}
                  className="rounded-lg border p-2.5 transition-colors hover:bg-white/5"
                  style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }} title="Copy">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleConfirm2FA} className="space-y-3">
              {twoFAError && (
                <div className="rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: 'var(--accent-danger)' }}>
                  {twoFAError}
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>Enter the 6-digit code from your app</label>
                <input type="text" inputMode="numeric" maxLength={6} required value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-lg border px-3.5 py-2.5 text-center font-mono text-lg tracking-widest outline-none transition-colors focus:border-[var(--accent-primary)]"
                  style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
                  placeholder="000000" autoFocus />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setTwoFAStep('idle'); setTwoFAData(null); setTwoFACode(''); setTwoFAError(''); }}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
                  style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={confirm2FAMutation.isPending || twoFACode.length !== 6}
                  className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50" style={ACCENT_BTN}>
                  {confirm2FAMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

      </div>

      {/* ── Passkeys ── */}
      <PasskeysCard showToast={showToast} />

      {/* ── Active Sessions ── */}
      <div className="rounded-xl glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>Active Sessions</h3>
          {sessions && sessions.length > 1 && (
            <button
              onClick={async () => {
                try {
                  await revokeAllMutation.mutateAsync();
                  showToast('All other sessions revoked', 'success');
                } catch (err) { showToast(extractError(err, 'Failed to revoke sessions'), 'error'); }
              }}
              disabled={revokeAllMutation.isPending}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-110"
              style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--accent-danger)' }}
            >
              {revokeAllMutation.isPending ? 'Revoking...' : 'Sign out all other devices'}
            </button>
          )}
        </div>
        <div className="space-y-3">
          {sessions?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg p-3" style={{ background: 'var(--surface-3)' }}>
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 shrink-0" style={{ color: s.is_current ? 'var(--accent-primary)' : 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {s.device?.toLowerCase().includes('mobile')
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  }
                </svg>
                <div>
                  <div className="flex items-center gap-2">
                    {editingSessionId === s.id ? (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await renameSessionMutation.mutateAsync({ id: s.id, name: sessionNameInput });
                            showToast('Session renamed', 'success');
                          } catch (err) { showToast(extractError(err, 'Failed to rename session'), 'error'); }
                          setEditingSessionId(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={sessionNameInput}
                          onChange={(e) => setSessionNameInput(e.target.value)}
                          onBlur={() => setEditingSessionId(null)}
                          onKeyDown={(e) => { if (e.key === 'Escape') setEditingSessionId(null); }}
                          maxLength={100}
                          className="w-40 rounded border px-2 py-0.5 text-sm bg-transparent outline-none focus:border-[var(--accent-primary)]"
                          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                          placeholder="e.g. Office PC, MacBook..."
                        />
                      </form>
                    ) : (
                      <>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {s.name || s.device || 'Unknown Device'}
                        </span>
                        <button
                          onClick={() => { setEditingSessionId(s.id); setSessionNameInput(s.name || ''); }}
                          title="Rename session"
                          className="rounded p-0.5 transition-colors hover:bg-white/10"
                        >
                          <svg className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                      </>
                    )}
                    {s.is_current && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(124, 92, 252, 0.15)', color: 'var(--accent-primary)' }}>Current</span>
                    )}
                  </div>
                  {s.name && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.device}</p>}
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.ip_address} &middot; {new Date(s.last_activity).toLocaleString()}</p>
                </div>
              </div>
              {!s.is_current && (
                <button
                  onClick={async () => {
                    try {
                      await revokeSessionMutation.mutateAsync(s.id);
                      showToast('Session revoked', 'success');
                    } catch (err) { showToast(extractError(err, 'Failed to revoke session'), 'error'); }
                  }}
                  disabled={revokeSessionMutation.isPending}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                  style={{ color: 'var(--accent-danger)' }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
          {!sessions?.length && (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No active sessions found.</p>
          )}
        </div>
      </div>

      {/* ── Login History ── */}
      <div className="rounded-xl glass-card p-6">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>Login History</h3>
          <svg className={`h-5 w-5 transition-transform ${showHistory ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showHistory && (
          <div className="mt-4 space-y-2 animate-slideUp">
            {loginHistory?.data.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--surface-3)' }}>
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={entry.success
                      ? { background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-success)' }
                      : { background: 'rgba(248,113,113,0.1)', color: 'var(--accent-danger)' }
                    }
                  >
                    {entry.success ? 'Success' : 'Failed'}
                  </span>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{entry.method}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{entry.ip_address}</p>
                  </div>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {loginHistory && loginHistory.meta.last_page > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}
                  className="rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}>Previous</button>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Page {loginHistory.meta.current_page} of {loginHistory.meta.last_page}
                </span>
                <button disabled={historyPage >= loginHistory.meta.last_page} onClick={() => setHistoryPage((p) => p + 1)}
                  className="rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}>Next</button>
              </div>
            )}
            {!loginHistory?.data.length && (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No login history available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Section: Email ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function AutoReplyCard({ mailboxId, fullAddress, showToast }: { mailboxId: number; fullAddress: string; showToast: (m: string, t: 'success' | 'error') => void }) {
  const { data: autoReply } = useAutoReply(mailboxId);
  const updateAutoReplyMutation = useUpdateAutoReply(mailboxId);
  const [draft, setDraft] = useState<Partial<AutoReply> | null>(null);

  useEffect(() => {
    if (autoReply && !draft) {
      setDraft({ ...autoReply });
    }
  }, [autoReply, draft]);

  const current = draft ?? autoReply ?? { enabled: false, subject: '', message: '', start_date: null, end_date: null };

  async function save() {
    try {
      await updateAutoReplyMutation.mutateAsync(current);
      showToast(`Auto-reply updated for ${fullAddress}`, 'success');
    } catch (err) { showToast(extractError(err, 'Failed to update auto-reply'), 'error'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fullAddress}</span>
        <button
          type="button"
          role="switch"
          aria-checked={!!current.enabled}
          onClick={() => setDraft({ ...current, enabled: !current.enabled })}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
          style={current.enabled ? { background: 'var(--accent-primary)' } : { background: 'var(--surface-3)' }}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${current.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
      {current.enabled && (
        <div className="space-y-3 animate-slideUp">
          <input
            type="text"
            placeholder="Subject"
            value={current.subject ?? ''}
            onChange={(e) => setDraft({ ...current, subject: e.target.value })}
            className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
          />
          <textarea
            placeholder="Auto-reply message..."
            value={current.message ?? ''}
            onChange={(e) => setDraft({ ...current, message: e.target.value })}
            rows={3}
            className="w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>Start date</label>
              <input type="date" value={current.start_date ?? ''} onChange={(e) => setDraft({ ...current, start_date: e.target.value || null })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>End date</label>
              <input type="date" value={current.end_date ?? ''} onChange={(e) => setDraft({ ...current, end_date: e.target.value || null })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <button onClick={save} disabled={updateAutoReplyMutation.isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50" style={ACCENT_BTN}>
            {updateAutoReplyMutation.isPending ? 'Saving...' : 'Save Auto-Reply'}
          </button>
        </div>
      )}
    </div>
  );
}

function EmailSection({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const { data: mailboxes } = useMailboxes();
  const updateSignatureMutation = useUpdateSignature();
  const [signatureValues, setSignatureValues] = useState<Record<number, string>>({});
  const [savingSignatureId, setSavingSignatureId] = useState<number | null>(null);

  // Email preferences
  const { data: prefs } = usePreferences();
  const updatePrefsMutation = useUpdatePreferences();

  function getSignatureValue(mailboxId: number, currentSignature: string | null): string {
    if (mailboxId in signatureValues) return signatureValues[mailboxId];
    return currentSignature ?? '';
  }

  async function handleSignatureSave(mailboxId: number) {
    setSavingSignatureId(mailboxId);
    const value = signatureValues[mailboxId] ?? null;
    try {
      await updateSignatureMutation.mutateAsync({ mailboxId, signature: value?.trim() || null });
      setSignatureValues((prev) => { const next = { ...prev }; delete next[mailboxId]; return next; });
      showToast('Signature updated', 'success');
    } catch (err) { showToast(extractError(err, 'Failed to update signature'), 'error'); }
    finally { setSavingSignatureId(null); }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Email</h2>

      {/* ── Signatures ── */}
      {mailboxes && mailboxes.length > 0 && (
        <div className="rounded-xl glass-card p-6">
          <h3 className="mb-1 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Email Signatures</h3>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>Set a signature for each mailbox. It will be appended to new emails.</p>
          <div className="space-y-5">
            {mailboxes.map((mb) => {
              const currentValue = getSignatureValue(mb.id, mb.signature);
              const isDirty = mb.id in signatureValues;
              const isSaving = savingSignatureId === mb.id;
              return (
                <div key={mb.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                      {mb.address[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{mb.full_address}</span>
                  </div>
                  <Suspense fallback={<div className="flex items-center justify-center rounded-lg p-8 glass-card"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600" style={{ borderTopColor: 'var(--accent-primary)' }} /></div>}>
                    <TipTapEditor
                      content={currentValue}
                      onChange={(html) => setSignatureValues((prev) => ({ ...prev, [mb.id]: html }))}
                      placeholder="Write your email signature..."
                    />
                  </Suspense>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleSignatureSave(mb.id)} disabled={!isDirty || isSaving}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" style={ACCENT_BTN}>
                      {isSaving ? 'Saving...' : 'Save Signature'}
                    </button>
                    {isDirty && (
                      <button onClick={() => setSignatureValues((prev) => { const next = { ...prev }; delete next[mb.id]; return next; })}
                        className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/5"
                        style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                        Discard
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Auto-Reply ── */}
      {mailboxes && mailboxes.length > 0 && (
        <div className="rounded-xl glass-card p-6">
          <h3 className="mb-1 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Auto-Reply</h3>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>Configure automatic replies for each mailbox.</p>
          <div className="space-y-5">
            {mailboxes.map((mb) => (
              <AutoReplyCard key={mb.id} mailboxId={mb.id} fullAddress={mb.full_address} showToast={showToast} />
            ))}
          </div>
        </div>
      )}

      {/* ── Email Preferences ── */}
      <div className="rounded-xl glass-card p-6">
        <h3 className="mb-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Email Preferences</h3>
        <div className="space-y-4">
          {/* Default from mailbox */}
          {mailboxes && mailboxes.length > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Default From Mailbox</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Used when composing new emails</p>
              </div>
              <select
                value={prefs?.default_mailbox_id ?? ''}
                onChange={async (e) => {
                  try {
                    await updatePrefsMutation.mutateAsync({ default_mailbox_id: e.target.value ? Number(e.target.value) : null });
                    showToast('Default mailbox updated', 'success');
                  } catch (err) { showToast(extractError(err, 'Failed to update preference'), 'error'); }
                }}
                className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
              >
                <option value="">None</option>
                {mailboxes.map((mb) => <option key={mb.id} value={mb.id}>{mb.full_address}</option>)}
              </select>
            </div>
          )}

          {/* Reply behavior */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Reply Behavior</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Default action when replying</p>
            </div>
            <select
              value={prefs?.reply_behavior ?? 'reply'}
              onChange={async (e) => {
                try {
                  await updatePrefsMutation.mutateAsync({ reply_behavior: e.target.value as 'reply' | 'reply_all' });
                  showToast('Reply behavior updated', 'success');
                } catch (err) { showToast(extractError(err, 'Failed to update preference'), 'error'); }
              }}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            >
              <option value="reply">Reply</option>
              <option value="reply_all">Reply All</option>
            </select>
          </div>

          {/* Conversation view */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Conversation View</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Group emails into conversations</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs?.conversation_view ?? true}
              onClick={async () => {
                try {
                  await updatePrefsMutation.mutateAsync({ conversation_view: !(prefs?.conversation_view ?? true) });
                  showToast('Conversation view updated', 'success');
                } catch (err) { showToast(extractError(err, 'Failed to update preference'), 'error'); }
              }}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
              style={(prefs?.conversation_view ?? true) ? { background: 'var(--accent-primary)' } : { background: 'var(--surface-3)' }}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${(prefs?.conversation_view ?? true) ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Mark as read on view */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Mark as Read on View</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Automatically mark emails as read when opened</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs?.mark_as_read_on_view ?? true}
              onClick={async () => {
                try {
                  await updatePrefsMutation.mutateAsync({ mark_as_read_on_view: !(prefs?.mark_as_read_on_view ?? true) });
                  showToast('Preference updated', 'success');
                } catch (err) { showToast(extractError(err, 'Failed to update preference'), 'error'); }
              }}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
              style={(prefs?.mark_as_read_on_view ?? true) ? { background: 'var(--accent-primary)' } : { background: 'var(--surface-3)' }}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${(prefs?.mark_as_read_on_view ?? true) ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Section: Notifications ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

const NOTIFICATION_CATEGORY_OPTIONS = [
  { key: 'primary', label: 'Primary', desc: 'Main inbox emails' },
  { key: 'updates', label: 'Updates', desc: 'System updates & notifications' },
  { key: 'promotions', label: 'Promotions', desc: 'Marketing & promotional emails' },
  { key: 'social', label: 'Social', desc: 'Social network notifications' },
  { key: 'forums', label: 'Forums', desc: 'Forum & discussion notifications' },
];

function NotificationsSection({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const { user } = useAuth();
  const notifications = useNotifications(user?.id ?? null);
  const { data: preferences } = usePreferences();
  const updatePreferences = useUpdatePreferences();

  const activeCategories = preferences?.notification_categories ?? ['primary', 'updates'];

  function toggleCategory(key: string) {
    const current = [...activeCategories];
    const idx = current.indexOf(key);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(key);
    }
    updatePreferences.mutate(
      { notification_categories: current },
      { onSuccess: () => showToast('Notification preferences saved', 'success') },
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Notifications</h2>

      {/* ── Notification Preferences (global, all devices) ── */}
      <div className="rounded-xl glass-card p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>Notification Preferences</h3>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>These settings apply to all your devices</p>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Notify me for</p>
            <p className="mb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>Choose which email categories trigger push notifications</p>
            <div className="space-y-2">
              {NOTIFICATION_CATEGORY_OPTIONS.map((cat) => (
                <label
                  key={cat.key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  <input
                    type="checkbox"
                    checked={activeCategories.includes(cat.key)}
                    onChange={() => toggleCategory(cat.key)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                  />
                  <div>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{cat.label}</span>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{cat.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
              <div>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Sent email confirmations</span>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Get notified when your emails are sent</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences?.notify_sent ?? false}
                onClick={() => updatePreferences.mutate(
                  { notify_sent: !(preferences?.notify_sent ?? false) },
                  { onSuccess: () => showToast('Notification preferences saved', 'success') },
                )}
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                style={(preferences?.notify_sent ?? false) ? { background: 'var(--accent-primary)' } : { background: 'var(--surface-3)' }}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${(preferences?.notify_sent ?? false) ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── This Device ── */}
      {notifications.isConfigured && (
        <div className="rounded-xl glass-card p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>This Device</h3>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Enable or disable push notifications on this browser
                </p>
              </div>
              <div className="flex items-center gap-3">
                {notifications.isSyncing && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Syncing...</span>}
                <span className="text-xs font-medium" style={{ color: notifications.isEnabled ? 'var(--accent-success)' : 'var(--text-tertiary)' }}>
                  {notifications.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.isEnabled}
                  onClick={notifications.togglePush}
                  disabled={!notifications.isInitialized}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={notifications.isEnabled ? { background: 'var(--accent-primary)' } : { background: 'var(--surface-3)' }}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${notifications.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {user?.is_admin && (
              <div className="border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  onClick={async () => {
                    try {
                      const result = await notifications.sendTest();
                      showToast(result.message || 'Test notification sent', 'success');
                    } catch { showToast('Failed to send test notification', 'error'); }
                  }}
                  disabled={notifications.isTesting || !notifications.isEnabled}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
                >
                  {notifications.isTesting ? 'Sending...' : 'Send Test Notification'}
                </button>
              </div>
            )}

            <div className="border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="mb-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Subscription ID</p>
              <div className="rounded-lg border px-3.5 py-2.5 font-mono text-xs break-all"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                {notifications.subscriptionId || 'Not registered'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Section: Appearance ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function AppearanceSection({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const { data: prefs } = usePreferences();
  const updatePrefsMutation = useUpdatePreferences();

  const currentTheme = prefs?.theme ?? 'dark';
  const currentDensity = prefs?.density ?? 'normal';
  const currentFontSize = prefs?.font_size ?? 'normal';

  async function updatePref(payload: Parameters<typeof updatePrefsMutation.mutateAsync>[0]) {
    try {
      await updatePrefsMutation.mutateAsync(payload);
      showToast('Appearance updated', 'success');
    } catch (err) { showToast(extractError(err, 'Failed to update appearance'), 'error'); }
  }

  // Apply theme/density/font-size class changes immediately
  useEffect(() => {
    if (!prefs) return;
    document.body.dataset.theme = prefs.theme;
    document.body.dataset.density = prefs.density;
    document.body.dataset.fontSize = prefs.font_size;
  }, [prefs]);

  const themes = [
    { key: 'dark' as const, label: 'Dark', icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' },
    { key: 'light' as const, label: 'Light', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
    { key: 'auto' as const, label: 'Auto', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  ];

  const densities = [
    { key: 'compact' as const, label: 'Compact' },
    { key: 'normal' as const, label: 'Normal' },
    { key: 'spacious' as const, label: 'Spacious' },
  ];

  const fontSizes = [
    { key: 'small' as const, label: 'Small' },
    { key: 'normal' as const, label: 'Normal' },
    { key: 'large' as const, label: 'Large' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Appearance</h2>

      {/* Theme */}
      <div className="rounded-xl glass-card p-6">
        <h3 className="mb-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Theme</h3>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((t) => (
            <button
              key={t.key}
              onClick={() => updatePref({ theme: t.key })}
              className="flex flex-col items-center gap-2 rounded-xl p-4 transition-all"
              style={{
                background: currentTheme === t.key ? 'rgba(124, 92, 252, 0.1)' : 'var(--surface-3)',
                border: `2px solid ${currentTheme === t.key ? 'var(--accent-primary)' : 'transparent'}`,
              }}
            >
              <svg className="h-6 w-6" style={{ color: currentTheme === t.key ? 'var(--accent-primary)' : 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
              </svg>
              <span className="text-sm font-medium" style={{ color: currentTheme === t.key ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="rounded-xl glass-card p-6">
        <h3 className="mb-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Density</h3>
        <div className="space-y-2">
          {densities.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-white/3" style={{ background: currentDensity === d.key ? 'rgba(124, 92, 252, 0.06)' : 'transparent' }}>
              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors"
                style={{ borderColor: currentDensity === d.key ? 'var(--accent-primary)' : 'var(--border-strong)' }}>
                {currentDensity === d.key && <div className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent-primary)' }} />}
              </div>
              <span className="text-sm" style={{ color: currentDensity === d.key ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{d.label}</span>
              <input type="radio" name="density" value={d.key} checked={currentDensity === d.key}
                onChange={() => updatePref({ density: d.key })} className="hidden" />
            </label>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="rounded-xl glass-card p-6">
        <h3 className="mb-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Font Size</h3>
        <div className="space-y-2">
          {fontSizes.map((f) => (
            <label key={f.key} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-white/3" style={{ background: currentFontSize === f.key ? 'rgba(124, 92, 252, 0.06)' : 'transparent' }}>
              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors"
                style={{ borderColor: currentFontSize === f.key ? 'var(--accent-primary)' : 'var(--border-strong)' }}>
                {currentFontSize === f.key && <div className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent-primary)' }} />}
              </div>
              <span className="text-sm" style={{ color: currentFontSize === f.key ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{f.label}</span>
              <input type="radio" name="font_size" value={f.key} checked={currentFontSize === f.key}
                onChange={() => updatePref({ font_size: f.key })} className="hidden" />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Section: Account (Danger Zone) ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function AccountSection({ showToast }: { showToast: (m: string, t: 'success' | 'error') => void }) {
  const exportDataMutation = useExportData();
  const deleteAccountMutation = useDeleteAccount();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  async function handleExport() {
    try {
      const data = await exportDataMutation.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `account-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Data exported successfully', 'success');
    } catch (err) { showToast(extractError(err, 'Failed to export data'), 'error'); }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Account</h2>

      {/* Export data */}
      <div className="rounded-xl glass-card p-6">
        <h3 className="mb-2 text-base font-medium" style={{ color: 'var(--text-primary)' }}>Export Data</h3>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>Download all your account data as a JSON file.</p>
        <button onClick={handleExport} disabled={exportDataMutation.isPending}
          className="rounded-lg px-5 py-2.5 text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{ background: 'var(--surface-3)', color: 'var(--text-primary)' }}>
          {exportDataMutation.isPending ? 'Exporting...' : 'Export Data'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl p-6" style={{ background: 'rgba(248, 113, 113, 0.04)', border: '1px solid rgba(248, 113, 113, 0.15)' }}>
        <h3 className="mb-2 text-base font-medium" style={{ color: 'var(--accent-danger)' }}>Danger Zone</h3>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button onClick={() => setShowDeleteModal(true)}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
          style={{ background: 'var(--accent-danger)' }}>
          Delete Account
        </button>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        title="Delete Account"
        description="This will permanently delete your account, all mailboxes, emails, and data. This action cannot be undone. Enter your password to confirm."
        confirmLabel="Delete My Account"
        danger
        requirePassword
        isPending={deleteAccountMutation.isPending}
        onConfirm={async (pw) => {
          if (!pw) return;
          try {
            await deleteAccountMutation.mutateAsync(pw);
            window.location.href = '/login';
          } catch (err) { showToast(extractError(err, 'Failed to delete account'), 'error'); }
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Main Component ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('profile');
  const { toast, show: showToast, dismiss: dismissToast } = useToast();

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>Settings</h1>
          <a href="/mail" className="text-sm transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>
            &larr; Back to Mail
          </a>
        </div>

        {/* Layout: sidebar + content */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Sidebar nav (desktop: vertical, mobile: horizontal scroll) */}
          <nav className="shrink-0 md:w-52">
            <div className="flex gap-1 overflow-x-auto rounded-xl glass-panel p-2 md:flex-col md:overflow-x-visible">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all whitespace-nowrap"
                  style={activeSection === s.key
                    ? { background: 'rgba(124, 92, 252, 0.1)', color: 'var(--accent-primary)' }
                    : { color: 'var(--text-secondary)' }
                  }
                >
                  <svg className="h-4.5 w-4.5 shrink-0" style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                  </svg>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Content area */}
          <main className="min-w-0 flex-1 rounded-xl glass-panel p-6">
            {activeSection === 'profile' && <ProfileSection showToast={showToast} />}
            {activeSection === 'mailbox' && <MailboxSection showToast={showToast} />}
            {activeSection === 'security' && <SecuritySection showToast={showToast} />}
            {activeSection === 'email' && <EmailSection showToast={showToast} />}
            {activeSection === 'notifications' && <NotificationsSection showToast={showToast} />}
            {activeSection === 'appearance' && <AppearanceSection showToast={showToast} />}
            {activeSection === 'account' && <AccountSection showToast={showToast} />}
          </main>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}
