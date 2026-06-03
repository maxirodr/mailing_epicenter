import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api.ts';

interface UnmatchedEmail {
  id: number;
  from_address: string;
  to_addresses: string[];
  subject: string | null;
  created_at: string;
}

interface PaginatedResponse {
  data: UnmatchedEmail[];
  current_page: number;
  last_page: number;
  total: number;
}

export default function UnmatchedManager() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['admin', 'unmatched-emails', page],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse>(
        `/api/admin/unmatched-emails?page=${page}`,
      );
      return data;
    },
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await api.delete(`/api/admin/unmatched-emails/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'unmatched-emails'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      </div>
    );
  }

  const emails = data?.data ?? [];

  if (emails.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        No unmatched emails found.
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Unmatched Inbound Emails</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr
                key={email.id}
                className="border-b border-gray-800/50 transition-colors hover:bg-gray-800/30"
              >
                <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-200">
                  {email.from_address}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-300">
                  {email.to_addresses?.join(', ')}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2.5 text-gray-300">
                  {email.subject || '(No subject)'}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-gray-400">
                  {new Date(email.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => deleteMutation.mutate(email.id)}
                    disabled={deleteMutation.isPending}
                    className="rounded-md px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.last_page > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Page {data.current_page} of {data.last_page} ({data.total} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
              disabled={page >= data.last_page}
              className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
