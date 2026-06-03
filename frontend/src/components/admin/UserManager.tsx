import { useState, useEffect } from 'react';
import {
  useAdminUsers,
  useAdminCreateUser,
  useAdminUpdateUser,
  useAdminDeleteUser,
  useAdminResendInvite,
} from '../../hooks/useAdmin';
import type { AdminUser } from '../../types';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';

// ── Icons (inline SVG) ───────────────────────────────────────────────

function IconPlus({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconEdit({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function IconTrash({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function IconSearch({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

// ── User Form Modal ──────────────────────────────────────────────────

interface UserFormState {
  name: string;
  email: string;
  password: string;
  is_admin: boolean;
  create_mailbox: boolean;
  send_invite: boolean;
}

const emptyForm: UserFormState = { name: '', email: '', password: '', is_admin: false, create_mailbox: true, send_invite: true };

function UserFormModal({
  open,
  onClose,
  editUser,
}: {
  open: boolean;
  onClose: () => void;
  editUser: AdminUser | null;
}) {
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const createMutation = useAdminCreateUser();
  const updateMutation = useAdminUpdateUser();
  const isEdit = !!editUser;
  const isLoading = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (editUser) {
      setForm({ name: editUser.name, email: editUser.email, password: '', is_admin: editUser.is_admin, create_mailbox: false, send_invite: false });
    } else {
      setForm(emptyForm);
    }
    setError('');
    setInviteUrl('');
  }, [editUser, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      if (isEdit) {
        const payload: Record<string, unknown> = { id: editUser!.id, name: form.name, email: form.email, is_admin: form.is_admin };
        if (form.password) payload.password = form.password;
        await updateMutation.mutateAsync(payload as Parameters<typeof updateMutation.mutateAsync>[0]);
        onClose();
      } else {
        if (!form.send_invite && !form.password) {
          setError('Password is required when not sending an invite');
          return;
        }
        const result = await createMutation.mutateAsync({
          name: form.name,
          email: form.email,
          password: form.send_invite ? undefined : form.password,
          is_admin: form.is_admin,
          create_mailbox: form.create_mailbox,
          send_invite: form.send_invite,
        });
        if (result.invite_url) {
          setInviteUrl(result.invite_url);
        } else {
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';
      setError(msg);
    }
  }

  function handleCopyInvite() {
    navigator.clipboard.writeText(inviteUrl);
  }

  if (inviteUrl) {
    return (
      <Modal open={open} onClose={onClose} title="Invite Link Created">
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg p-3" style={{ background: 'rgba(52, 211, 153, 0.1)' }}>
            <svg className="h-5 w-5 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium text-green-400">User created successfully!</span>
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Send this link to the user</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 font-mono text-xs text-gray-300 outline-none select-all"
              />
              <button
                onClick={handleCopyInvite}
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">This link expires in 7 days. The user will set their own password.</p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit User' : 'Create User'}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : isEdit ? 'Update' : form.send_invite ? 'Create & Generate Link' : 'Create'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
            placeholder="john@nexosmart.com"
          />
        </div>

        {!isEdit && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.send_invite}
              onClick={() => setForm((f) => ({ ...f, send_invite: !f.send_invite, password: '' }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.send_invite ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  form.send_invite ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <div>
              <span className="text-sm text-gray-300">Send invite link</span>
              <p className="text-xs text-gray-500">User sets their own password via link</p>
            </div>
          </div>
        )}

        {(!form.send_invite || isEdit) && (
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">
              Password {isEdit && <span className="text-gray-600">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              required={!isEdit && !form.send_invite}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
              placeholder={isEdit ? '********' : 'Min 8 characters'}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.is_admin}
            onClick={() => setForm((f) => ({ ...f, is_admin: !f.is_admin }))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              form.is_admin ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                form.is_admin ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-gray-300">Administrator</span>
        </div>

        {!isEdit && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.create_mailbox}
              onClick={() => setForm((f) => ({ ...f, create_mailbox: !f.create_mailbox }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.create_mailbox ? 'bg-green-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  form.create_mailbox ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <div>
              <span className="text-sm text-gray-300">Create mailbox automatically</span>
              <p className="text-xs text-gray-500">Creates a mailbox matching the user's email address</p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── Pagination ───────────────────────────────────────────────────────

function Pagination({
  currentPage,
  lastPage,
  onPageChange,
}: {
  currentPage: number;
  lastPage: number;
  onPageChange: (p: number) => void;
}) {
  if (lastPage <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <button
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Previous
      </button>
      {Array.from({ length: lastPage }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            p === currentPage
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        disabled={currentPage >= lastPage}
        onClick={() => onPageChange(currentPage + 1)}
        className="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Next
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function UserManager() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const { data, isLoading } = useAdminUsers(page, debouncedSearch);
  const deleteMutation = useAdminDeleteUser();
  const resendInviteMutation = useAdminResendInvite();
  const [inviteLinkUrl, setInviteLinkUrl] = useState('');
  const [showInviteLink, setShowInviteLink] = useState(false);

  async function handleResendInvite(user: AdminUser) {
    try {
      const result = await resendInviteMutation.mutateAsync(user.id);
      setInviteLinkUrl(result.invite_url);
      setShowInviteLink(true);
    } catch {
      // error handled by mutation
    }
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function openCreate() {
    setEditUser(null);
    setFormOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEditUser(user);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // error handled by mutation
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">Users</h2>
        <div className="flex gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 sm:w-56"
            />
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <IconPlus />
            Create User
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="pb-3 pr-4 font-medium text-gray-400">Name</th>
              <th className="pb-3 pr-4 font-medium text-gray-400">Email</th>
              <th className="pb-3 pr-4 font-medium text-gray-400">Role</th>
              <th className="pb-3 pr-4 font-medium text-gray-400">Mailboxes</th>
              <th className="pb-3 font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-500">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                </td>
              </tr>
            ) : !data?.data.length ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-500">
                  {search ? 'No users match your search' : 'No users found'}
                </td>
              </tr>
            ) : (
              data.data.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-gray-800/50">
                  <td className="py-3 pr-4 font-medium text-gray-200">{user.name}</td>
                  <td className="py-3 pr-4 text-gray-400">{user.email}</td>
                  <td className="py-3 pr-4">
                    {user.is_admin ? (
                      <span className="inline-flex items-center rounded-full bg-blue-600/20 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-700/50 px-2.5 py-0.5 text-xs font-medium text-gray-400">
                        User
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {user.mailboxes?.length ? (
                        user.mailboxes.map((mb) => (
                          <span
                            key={mb.id}
                            className="inline-flex items-center rounded-full bg-gray-700/50 px-2 py-0.5 text-xs text-gray-300"
                          >
                            {mb.address}@{mb.domain}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-600">None</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleResendInvite(user)}
                        disabled={resendInviteMutation.isPending}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-950 hover:text-blue-400 disabled:opacity-50"
                        title="Generate invite link"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openEdit(user)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
                        title="Edit"
                      >
                        <IconEdit />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(user)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-950 hover:text-red-400"
                        title="Delete"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <Pagination
          currentPage={data.meta.current_page}
          lastPage={data.meta.last_page}
          onPageChange={setPage}
        />
      )}

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editUser={editUser}
      />

      <Modal
        open={showInviteLink}
        onClose={() => setShowInviteLink(false)}
        title="Invite Link"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Send this link to the user</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={inviteLinkUrl}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 font-mono text-xs text-gray-300 outline-none select-all"
              />
              <button
                onClick={() => navigator.clipboard.writeText(inviteLinkUrl)}
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">This link expires in 7 days.</p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setShowInviteLink(false)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
