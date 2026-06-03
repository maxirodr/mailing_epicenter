import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { initOneSignal, loginOneSignal, logoutOneSignal, isOneSignalConfigured } from '../../services/onesignal';
import IOSInstallPrompt from '../ui/IOSInstallPrompt';

export default function AuthGuard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isOneSignalConfigured() || !user) return;

    initOneSignal().then(() => {
      loginOneSignal(user.id);
    });

    return () => {
      logoutOneSignal();
    };
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !user.setup_completed_at && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  return (
    <>
      <Outlet />
      <IOSInstallPrompt />
    </>
  );
}
