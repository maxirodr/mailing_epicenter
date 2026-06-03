import { useState, useEffect } from 'react';
import {
  useAdminMailboxes,
  useAdminCreateMailbox,
  useAdminUpdateMailbox,
  useAdminDeleteMailbox,
  useAdminAssignUser,
  useAdminRemoveUser,
  useAdminUsers,
} from '../../hooks/useAdmin';
import type { AdminMailbox, User } from '../../types';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';

// ── Icons ────────────────────────────────────────────────────────────

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

function IconUsers({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m3 5.197V21" />
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

function IconX({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Mailbox Form Modal ───────────────────────────────────────────────

interface MailboxFormState {
  address: string;
  domain: string;
  display_name: string;
}

const emptyForm: MailboxFormState = { address: '', domain: '', display_name: '' };

function MailboxFormModal({
  open,
  onClose,
  editMailbox,
}: {
  open: boolean;
  onClose: () => void;
  editMailbox: AdminMailbox | null;
}) {
  const [form, setForm] = useState<MailboxFormState>(emptyForm);
  const [error, setError] = useState('');
  const createMutation = useAdminCreateMailbox();
  const updateMutation = useAdminUpdateMailbox();
  const isEdit = !!editMailbox;
  const isLoading = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (editMailbox) {
      setForm({
        address: editMailbox.address,
        domain: editMailbox.domain,
        display_name: editMailbox.display_name || '',
      });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [editMailbox, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      const payload = {
        address: form.address,
        domain: form.domain,
        display_name: form.display_name || undefined,
      };

      if (isEdit) {
        await updateMutation.mutateAsync({ id: editMailbox!.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';
      setError(msg);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Mailbox' : 'Create Mailbox'}
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
            {isLoading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
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
          <label className="mb-1.5 block text-sm text-gray-400">Address (local part)</label>
          <input
            type="text"
            required
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
            placeholder="info"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Domain</label>
          <input
            type="text"
            required
            value={form.domain}
            onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
            placeholder="example.com"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Display Name</label>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
            placeholder="Company Info"
          />
        </div>
      </form>
    </Modal>
  );
}

// ── User Assignment Modal ────────────────────────────────────────────

function UserAssignmentModal({
  open,
  onClose,
  mailbox,
}: {
  open: boolean;
  onClose: () => void;
  mailbox: AdminMailbox | null;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'owner' | 'member'>('member');
  const [error, setError] = useState('');

  const { data: usersData } = useAdminUsers(1, '');
  const assignMutation = useAdminAssignUser();
  const removeMutation = useAdminRemoveUser();

  // Filter out users already assigned
  const assignedIds = new Set(mailbox?.users?.map((u) => u.id) || []);
  const availableUsers = usersData?.data.filter((u) => !assignedIds.has(u.id)) || [];

  useEffect(() => {
    setSelectedUserId('');
    setSelectedRole('member');
    setError('');
  }, [open, mailbox]);

  async function handleAssign() {
    if (!mailbox || !selectedUserId) return;
    setError('');
    try {
      await assignMutation.mutateAsync({
        mailboxId: mailbox.id,
        userId: Number(selectedUserId),
        role: selectedRole,
      });
      setSelectedUserId('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to assign user';
      setError(msg);
    }
  }

  async function handleRemove(userId: number) {
    if (!mailbox) return;
    try {
      await removeMutation.mutateAsync({ mailboxId: mailbox.id, userId });
    } catch {
      // handled by mutation
    }
  }

  if (!mailbox) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Manage Users - ${mailbox.address}@${mailbox.domain}`} wide>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Current users */}
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-400">Current Users</h4>
          {mailbox.users?.length ? (
            <div className="space-y-2">
              {mailbox.users.map((user: User & { pivot?: { role?: string } }) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-200">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-gray-700/50 px-2 py-0.5 text-xs text-gray-400">
                      {(user as User & { pivot?: { role?: string } }).pivot?.role || 'member'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemove(user.id)}
                    disabled={removeMutation.isPending}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-950 hover:text-red-400 disabled:opacity-50"
                    title="Remove user"
                  >
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No users assigned</p>
          )}
        </div>

        {/* Add user */}
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-400">Add User</h4>
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 outline-none focus:border-blue-500"
            >
              <option value="">Select a user...</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as 'owner' | 'member')}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 outline-none focus:border-blue-500"
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
            <button
              onClick={handleAssign}
              disabled={!selectedUserId || assignMutation.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              <IconPlus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>
      </div>
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

export default function MailboxManager() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editMailbox, setEditMailbox] = useState<AdminMailbox | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMailbox | null>(null);
  const [assignTarget, setAssignTarget] = useState<AdminMailbox | null>(null);

  const { data, isLoading } = useAdminMailboxes(page, debouncedSearch);
  const deleteMutation = useAdminDeleteMailbox();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function openCreate() {
    setEditMailbox(null);
    setFormOpen(true);
  }

  function openEdit(mb: AdminMailbox) {
    setEditMailbox(mb);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // handled by mutation
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">Mailboxes</h2>
        <div className="flex gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search mailboxes..."
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
            Create Mailbox
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="pb-3 pr-4 font-medium text-gray-400">Address</th>
              <th className="pb-3 pr-4 font-medium text-gray-400">Domain</th>
              <th className="pb-3 pr-4 font-medium text-gray-400">Display Name</th>
              <th className="pb-3 pr-4 font-medium text-gray-400">Users</th>
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
                  {search ? 'No mailboxes match your search' : 'No mailboxes found'}
                </td>
              </tr>
            ) : (
              data.data.map((mb) => (
                <tr key={mb.id} className="transition-colors hover:bg-gray-800/50">
                  <td className="py-3 pr-4 font-medium text-gray-200">{mb.address}</td>
                  <td className="py-3 pr-4 text-gray-400">{mb.domain}</td>
                  <td className="py-3 pr-4 text-gray-400">{mb.display_name || <span className="text-gray-600">--</span>}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {mb.users?.length ? (
                        mb.users.map((u) => (
                          <span
                            key={u.id}
                            className="inline-flex items-center rounded-full bg-gray-700/50 px-2 py-0.5 text-xs text-gray-300"
                          >
                            {u.name}
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
                        onClick={() => setAssignTarget(mb)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
                        title="Manage Users"
                      >
                        <IconUsers />
                      </button>
                      <button
                        onClick={() => openEdit(mb)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
                        title="Edit"
                      >
                        <IconEdit />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(mb)}
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

      <MailboxFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editMailbox={editMailbox}
      />

      <UserAssignmentModal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        mailbox={assignTarget}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Mailbox"
        message={`Are you sure you want to delete "${deleteTarget?.address}@${deleteTarget?.domain}"? All associated emails will be permanently lost.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
