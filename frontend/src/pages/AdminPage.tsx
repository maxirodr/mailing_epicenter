import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import UserManager from '../components/admin/UserManager';
import MailboxManager from '../components/admin/MailboxManager';
import UnmatchedManager from '../components/admin/UnmatchedManager';

interface AdminStats {
  users: number;
  mailboxes: number;
  emails: number;
  threads: number;
  unmatched: number;
  unmatched_by_address?: Record<string, number>;
}

function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<AdminStats>('/api/admin/stats');
      return data;
    },
  });
}

type Tab = 'dashboard' | 'users' | 'mailboxes' | 'unmatched';

function DashboardStats() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: 'Users', value: stats.users, icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z', color: 'blue' },
    { label: 'Mailboxes', value: stats.mailboxes, icon: 'M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z', color: 'purple' },
    { label: 'Emails', value: stats.emails, icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75', color: 'green' },
    { label: 'Threads', value: stats.threads, icon: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155', color: 'amber' },
    { label: 'Unmatched', value: stats.unmatched, icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z', color: 'red' },
  ];

  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'text-blue-500' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: 'text-purple-500' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', icon: 'text-green-500' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: 'text-amber-500' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', icon: 'text-red-500' },
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-100">Overview</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const colors = colorMap[card.color];
          return (
            <div
              key={card.label}
              className="glass-card rounded-lg p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-lg ${colors.bg} p-2.5`}>
                  <svg className={`h-5 w-5 ${colors.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-400">{card.label}</p>
                  <p className={`text-2xl font-bold ${colors.text}`}>
                    {card.value.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {stats.unmatched_by_address && Object.keys(stats.unmatched_by_address).length > 0 && (
        <div className="mt-6 rounded-xl glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--accent-secondary)' }}>
              Emails waiting for mailbox creation
            </h3>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
            These addresses received emails but don't have a mailbox yet. Create the mailbox to process them automatically.
          </p>
          <div className="space-y-2">
            {Object.entries(stats.unmatched_by_address).map(([address, count]) => (
              <div key={address} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--surface-3)' }}>
                <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{address}</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(245,158,66,0.15)', color: 'var(--accent-secondary)' }}>
                  {count} {count === 1 ? 'email' : 'emails'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  // Admin guard: redirect non-admins
  useEffect(() => {
    if (!isLoading && user && !user.is_admin) {
      navigate('/mail', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      </div>
    );
  }

  if (!user?.is_admin) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>Admin Panel</h1>
          <a
            href="/mail"
            className="text-sm text-gray-400 transition-colors hover:text-gray-200"
          >
            &larr; Back to Mail
          </a>
        </div>

        <div className="mb-6 flex gap-1 rounded-lg glass-panel p-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-white/[0.08] text-gray-100 shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-white/[0.08] text-gray-100 shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('mailboxes')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'mailboxes'
                ? 'bg-white/[0.08] text-gray-100 shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
            }`}
          >
            Mailboxes
          </button>
          <button
            onClick={() => setActiveTab('unmatched')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'unmatched'
                ? 'bg-white/[0.08] text-gray-100 shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
            }`}
          >
            Unmatched
          </button>
        </div>

        <div className="rounded-xl glass-panel p-6">
          {activeTab === 'dashboard' && <DashboardStats />}
          {activeTab === 'users' && <UserManager />}
          {activeTab === 'mailboxes' && <MailboxManager />}
          {activeTab === 'unmatched' && <UnmatchedManager />}
        </div>
      </div>
    </div>
  );
}
