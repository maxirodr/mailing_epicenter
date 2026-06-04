import { useState } from 'react';
import Modal from './Modal';

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const isSafari = /WebKit/.test(ua) && !/(CriOS|FxiOS)/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone;
  const dismissed = localStorage.getItem('nexomail-ios-install-dismissed');
  return isIOS && isSafari && !isStandalone && !dismissed;
}

export default function IOSInstallPrompt() {
  const [visible, setVisible] = useState(shouldShow);
  const [step, setStep] = useState<'ask' | 'tutorial'>('ask');

  function dismiss() {
    localStorage.setItem('nexomail-ios-install-dismissed', '1');
    setVisible(false);
  }

  return (
    <Modal open={visible} onClose={dismiss} title={step === 'ask' ? 'Push Notifications' : 'How to Install'}>
      {step === 'ask' ? (
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }} className="text-sm leading-relaxed">
            To receive push notifications on iOS, you need to install Epicenter Mail as an app on your home screen.
          </p>
          <p style={{ color: 'var(--text-secondary)' }} className="text-sm">
            Want us to show you how? It only takes a few seconds.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={dismiss}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/5"
              style={{
                background: 'var(--surface-2)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'var(--border-default)',
                color: 'var(--text-secondary)',
              }}
            >
              Maybe Later
            </button>
            <button
              onClick={() => setStep('tutorial')}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
                boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
              }}
            >
              Show Me How
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: 'rgba(124,92,252,0.2)', color: 'var(--accent-primary)' }}
            >
              1
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Tap the Share button
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                The square icon with an arrow pointing up, at the bottom of Safari.
              </p>
              <div className="mt-2 flex items-center justify-center rounded-lg py-3" style={{ background: 'var(--surface-2)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3-3m0 0l3 3m-3-3v12" />
                </svg>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: 'rgba(124,92,252,0.2)', color: 'var(--accent-primary)' }}
            >
              2
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Tap "Add to Home Screen"
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Scroll down in the share menu until you find it.
              </p>
              <div
                className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: 'var(--surface-2)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Add to Home Screen</span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: 'rgba(124,92,252,0.2)', color: 'var(--accent-primary)' }}
            >
              3
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Open from your Home Screen
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Launch Epicenter Mail from the new icon. You'll be prompted to allow notifications.
              </p>
            </div>
          </div>

          <button
            onClick={dismiss}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
              boxShadow: '0 4px 16px rgba(124,92,252,0.3)',
            }}
          >
            Got it!
          </button>
        </div>
      )}
    </Modal>
  );
}
