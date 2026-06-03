import { useState } from 'react';
import { useLabels, useCreateLabel, useUpdateLabel, useDeleteLabel } from '../../hooks/useLabels.ts';
import type { Label } from '../../types/index.ts';

interface LabelManagerProps {
  mailboxId: number;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6',
];

export default function LabelManager({ mailboxId, onClose }: LabelManagerProps) {
  const { data: labels } = useLabels(mailboxId);
  const createLabel = useCreateLabel(mailboxId);
  const updateLabel = useUpdateLabel(mailboxId);
  const deleteLabel = useDeleteLabel(mailboxId);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[5]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const customLabels = labels?.filter((l: Label) => l.type === 'custom') ?? [];

  function handleCreate() {
    if (!newName.trim()) return;
    createLabel.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          setNewName('');
          setNewColor(PRESET_COLORS[5]);
        },
      },
    );
  }

  function startEdit(label: Label) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color || PRESET_COLORS[5]);
  }

  function handleUpdate() {
    if (editingId === null || !editName.trim()) return;
    updateLabel.mutate(
      { labelId: editingId, name: editName.trim(), color: editColor },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function handleDelete(labelId: number) {
    deleteLabel.mutate(labelId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-100">Manage Labels</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-5 [scrollbar-color:theme(colors.gray.700)_transparent] [scrollbar-width:thin]">
          <div className="mb-5 space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Create new label</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Label name"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createLabel.isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                Create
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewColor(color)}
                  className={`h-6 w-6 rounded-full transition-all ${newColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'hover:scale-110'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {customLabels.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-300">Custom labels</h3>
              {customLabels.map((label: Label) => (
                <div key={label.id} className="flex items-center gap-3 rounded-lg border border-gray-800 px-3 py-2">
                  {editingId === label.id ? (
                    <>
                      <div className="flex flex-1 flex-col gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500"
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(); }}
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditColor(color)}
                              className={`h-5 w-5 rounded-full transition-all ${editColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : 'hover:scale-110'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={handleUpdate}
                          className="rounded p-1 text-green-400 hover:bg-gray-700"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-700"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: label.color || '#6b7280' }}
                      />
                      <span className="flex-1 text-sm text-gray-200">{label.name}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(label)}
                          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-300"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(label.id)}
                          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-700 hover:text-red-400"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {customLabels.length === 0 && (
            <p className="text-center text-sm text-gray-500">No custom labels yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
