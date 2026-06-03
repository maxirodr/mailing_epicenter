import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import AuthGuard from './components/auth/AuthGuard.tsx';

const LoginPage = lazy(() => import('./pages/LoginPage.tsx'));
const TwoFactorPage = lazy(() => import('./pages/TwoFactorPage.tsx'));
const InvitePage = lazy(() => import('./pages/InvitePage.tsx'));
const SetupPage = lazy(() => import('./pages/SetupPage.tsx'));
const MailPage = lazy(() => import('./pages/MailPage.tsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.tsx'));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--surface-0)' }}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-[#7c5cfc]" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/2fa" element={<TwoFactorPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />

        <Route element={<AuthGuard />}>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/mail" element={<MailPage />} />
          <Route path="/mail/:mailboxId" element={<MailPage />} />
          <Route path="/mail/:mailboxId/:label" element={<MailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/mail" replace />} />
      </Routes>
    </Suspense>
  );
}
