import { useState } from 'react';
import type { Thread } from '../../types/index.ts';

function SenderAvatar({ name, email, avatarUrl }: { name: string | null; email: string | null; avatarUrl: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover"
        onError={() => setImgFailed(true)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: getAvatarColor(email) }}
    >
      {getInitial(name, email)}
    </div>
  );
}

interface ThreadItemProps {
  thread: Thread;
  isSelected: boolean;
  isActive: boolean;
  selectedThreadIds: Set<number>;
  onToggleSelect: (id: number, shiftKey?: boolean) => void;
  onToggleStar: (id: number, starred: boolean) => void;
  onClick: (id: number) => void;
  onTrash?: (id: number) => void;
  onToggleRead?: (id: number, read: boolean) => void;
}

const AVATAR_COLORS = [
  '#7c5cfc', '#f59e42', '#34d399', '#f87171', '#60a5fa',
  '#a78bfa', '#fbbf24', '#2dd4bf', '#fb7185', '#818cf8',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getAvatarColor(email: string | null): string {
  if (!email) return AVATAR_COLORS[0];
  return AVATAR_COLORS[hashString(email) % AVATAR_COLORS.length];
}

function getInitial(name: string | null, email: string | null): string {
  if (name) return name.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return '?';
}

function stripHtml(html: string): string {
  // Remove <style> blocks before parsing (DOMParser includes their text content)
  const noStyle = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const doc = new DOMParser().parseFromString(noStyle, 'text/html');
  let text = doc.body.textContent || '';
  // Remove leftover CSS that leaked as plain text (from bad strip_tags)
  text = text.replace(/(?:body|html|div|td|th|table|img|a|p|span|\.[\w-]+)\s*\{[^}]*\}/g, '');
  text = text.replace(/@(?:media|font-face|import|keyframes)[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)?\}/g, '');
  // Collapse whitespace and trim
  return text.replace(/\s+/g, ' ').trim();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ThreadItem({
  thread,
  isSelected,
  isActive,
  selectedThreadIds,
  onToggleSelect,
  onToggleStar,
  onClick,
  onTrash,
  onToggleRead,
}: ThreadItemProps) {
  const isUnread = !thread.user_state?.is_read;
  const isStarred = thread.user_state?.is_starred ?? false;
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    const ids = selectedThreadIds.has(thread.id) && selectedThreadIds.size > 1
      ? Array.from(selectedThreadIds)
      : [thread.id];
    e.dataTransfer.setData('application/x-thread-ids', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setIsDragging(false)}
      onClick={() => onClick(thread.id)}
      className={`
        group flex cursor-pointer items-start gap-2 border-l-2 px-3 py-2.5 transition-all duration-150
        hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]
        ${isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}
        ${isUnread ? 'bg-gray-900/50' : ''}
        ${isDragging ? 'opacity-50' : ''}
      `}
      style={{
        borderLeftColor: isUnread ? 'var(--accent-primary)' : 'transparent',
        borderBottom: '1px solid var(--border-subtle)',
        contentVisibility: 'auto',
        containIntrinsicSize: '0 82px',
      }}
    >
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(thread.id, e.shiftKey); }}
          className="flex h-5 w-5 items-center justify-center rounded border border-gray-600 transition-colors duration-150 hover:border-gray-400"
        >
          {isSelected && (
            <svg className="h-3.5 w-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleStar(thread.id, !isStarred); }}
          className="p-0.5 transition-colors duration-150"
        >
          {isStarred ? (
            <svg className="h-4 w-4 animate-starBounce" style={{ color: 'var(--accent-secondary)' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-gray-600 group-hover:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          )}
        </button>
      </div>

      <SenderAvatar
        name={thread.is_outbound ? thread.to_name : thread.from_name}
        email={thread.is_outbound ? thread.to_address : thread.from_address}
        avatarUrl={thread.is_outbound ? null : thread.from_avatar_url}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <div className="min-w-0 flex-1 truncate">
            {thread.is_outbound && (
              <span className="mr-1 text-xs text-gray-500">To:</span>
            )}
            <span className={`text-sm ${isUnread ? 'font-semibold text-gray-100' : 'text-gray-300'}`}>
              {thread.is_outbound
                ? (thread.to_name || thread.to_address || '(unknown)')
                : (thread.from_name || thread.from_address || '(unknown)')}
            </span>
            {!thread.is_outbound && thread.from_name && thread.from_address && (
              <span className="ml-1.5 text-xs text-gray-500">&lt;{thread.from_address}&gt;</span>
            )}
          </div>
          {thread.message_count > 1 && (
            <span className="shrink-0 text-xs text-gray-500">{thread.message_count}</span>
          )}
          <span
            className={`ml-auto shrink-0 text-xs ${isUnread ? 'font-semibold' : 'text-gray-500'}`}
            style={isUnread ? { color: 'var(--accent-primary)' } : undefined}
          >
            {formatDate(thread.last_message_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={`truncate text-xs ${isUnread ? 'text-gray-300' : 'text-gray-400'}`}>
            {thread.subject || '(no subject)'}
          </span>
          {thread.has_attachments && (
            <svg className="h-3.5 w-3.5 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
          )}
        </div>
        <p
          className="mt-0.5 text-xs text-gray-500"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {thread.snippet ? stripHtml(thread.snippet) : ''}
        </p>
        {thread.labels.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {thread.labels
              .filter((l) => l.type === 'custom')
              .map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-gray-400"
                  style={{ backgroundColor: `${label.color || '#374151'}20` }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: label.color || '#6b7280' }}
                  />
                  {label.name}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
        {isUnread && (
          <span className="h-2 w-2 shrink-0 rounded-full group-hover:hidden" style={{ background: 'var(--accent-primary)' }} />
        )}
        <div className="hidden items-center gap-0.5 group-hover:flex">
          {onToggleRead && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleRead(thread.id, isUnread); }}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-white/[0.08] hover:text-gray-200"
              title={isUnread ? 'Mark as read' : 'Mark as unread'}
            >
              {isUnread ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              )}
            </button>
          )}
          {onTrash && (
            <button
              onClick={(e) => { e.stopPropagation(); onTrash(thread.id); }}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-white/[0.08] hover:text-red-400"
              title="Move to trash"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
