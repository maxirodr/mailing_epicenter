import type { ReactNode } from 'react';

interface AppLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export default function AppLayout({ sidebar, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
      {sidebar}
      <main className="flex min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
