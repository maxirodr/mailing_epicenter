import { useState } from 'react';
import type { Email } from '../../types/index.ts';

interface EmailActionsProps {
  email: Email;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onMarkUnread?: () => void;
  onStar?: () => void;
  onDelete?: () => void;
  onSpam?: () => void;
  onShowOriginal?: () => void;
  onPrint?: () => void;
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.06] ${danger ? 'text-red-400' : 'text-gray-300'}`}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />;
}

export default function EmailActions({
  email,
  onReply,
  onReplyAll,
  onForward,
  onMarkUnread,
  onStar,
  onDelete,
  onSpam,
  onShowOriginal,
  onPrint,
}: EmailActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  function handleDownloadEml() {
    const headers = [
      `Message-ID: ${email.message_id}`,
      `From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}`,
      `To: ${email.to_addresses.join(', ')}`,
      email.cc_addresses?.length ? `Cc: ${email.cc_addresses.join(', ')}` : '',
      `Subject: ${email.subject}`,
      `Date: ${email.sent_at ? new Date(email.sent_at).toUTCString() : ''}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      email.in_reply_to ? `In-Reply-To: ${email.in_reply_to}` : '',
    ].filter(Boolean).join('\r\n');

    const body = email.html_body || email.text_body || '';
    const eml = `${headers}\r\n\r\n${body}`;
    const blob = new Blob([eml], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${email.subject || 'email'}.eml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyMessageId() {
    navigator.clipboard.writeText(email.message_id);
  }

  function close(fn?: () => void) {
    return () => { fn?.(); setMenuOpen(false); };
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onReply}
        title="Reply"
        className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      </button>
      <button
        onClick={onReplyAll}
        title="Reply All"
        className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15l-4.5-6 4.5-6m6 12l-4.5-6 4.5-6M15 9h6a3 3 0 010 6h-3" />
        </svg>
      </button>
      <button
        onClick={onForward}
        title="Forward"
        className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
        </svg>
      </button>

      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete"
          className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-red-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          title="More actions"
          className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-xl py-1 shadow-2xl animate-fadeIn"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}
            >
              {onMarkUnread && (
                <MenuItem
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>}
                  label="Mark as unread"
                  onClick={close(onMarkUnread)}
                />
              )}
              {onStar && (
                <MenuItem
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>}
                  label="Star"
                  onClick={close(onStar)}
                />
              )}

              <Divider />

              {onSpam && (
                <MenuItem
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
                  label="Report spam"
                  onClick={close(onSpam)}
                />
              )}

              <Divider />

              {onPrint && (
                <MenuItem
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>}
                  label="Print"
                  onClick={close(onPrint)}
                />
              )}

              <MenuItem
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>}
                label="Download message"
                onClick={close(handleDownloadEml)}
              />

              <MenuItem
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>}
                label="Copy message ID"
                onClick={close(handleCopyMessageId)}
              />

              <Divider />

              {onShowOriginal && (
                <MenuItem
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>}
                  label="Show original"
                  onClick={close(onShowOriginal)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
