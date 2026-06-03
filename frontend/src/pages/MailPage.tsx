import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '../stores/uiStore.ts';
import { useComposeStore } from '../stores/composeStore.ts';
import { useMailboxes } from '../hooks/useMailboxes.ts';
import { useThreads, useThread, useUpdateThread, useBulkAction, useMarkAllRead, useEmptyTrash } from '../hooks/useThreads.ts';
import { useSearch, type SearchParams } from '../hooks/useSearch.ts';
import { usePreferences } from '../hooks/useSettings.ts';
import { useWebSocket } from '../hooks/useWebSocket.ts';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.ts';
import type { Email, EmailCategory } from '../types/index.ts';
import AppLayout from '../components/layout/AppLayout.tsx';
import Sidebar from '../components/layout/Sidebar.tsx';
import Header from '../components/layout/Header.tsx';
import CategoryTabs from '../components/email/CategoryTabs.tsx';
import { useCategoryCounts } from '../hooks/useCategoryCounts.ts';
import ThreadList from '../components/email/ThreadList.tsx';
import ThreadView from '../components/email/ThreadView.tsx';
import LabelManager from '../components/labels/LabelManager.tsx';
import KeyboardShortcutHelp from '../components/ui/KeyboardShortcutHelp.tsx';
import { showNotificationToast } from '../components/ui/NotificationToast.tsx';

const ComposeModal = lazy(() => import('../components/compose/ComposeModal.tsx'));

export default function MailPage() {
  const { mailboxId: mailboxIdParam, label: labelParam } = useParams<{
    mailboxId?: string;
    label?: string;
  }>();
  const navigate = useNavigate();

  const selectedMailboxId = useUiStore((s) => s.selectedMailboxId);
  const setSelectedMailboxId = useUiStore((s) => s.setSelectedMailboxId);
  const selectedThreadId = useUiStore((s) => s.selectedThreadId);
  const setSelectedThreadId = useUiStore((s) => s.setSelectedThreadId);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const compose = useComposeStore();
  const composeOpen = useComposeStore((s) => s.instances.length > 0);

  const { data: mailboxes, isLoading: mailboxesLoading } = useMailboxes();
  const activeLabel = labelParam || 'INBOX';
  const [page, setPage] = useState(1);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<number>>(new Set());
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [searchParams, setSearchParams] = useState<SearchParams>({});
  const [activeCategory, setActiveCategory] = useState<EmailCategory>('primary');
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);

  // Show toast on rate limit (429)
  useEffect(() => {
    function handleRateLimit(e: Event) {
      const seconds = (e as CustomEvent).detail?.seconds || 60;
      showNotificationToast('Rate limited', `Too many requests. Please wait ${seconds}s.`);
    }
    window.addEventListener('api:rate-limited', handleRateLimit);
    return () => window.removeEventListener('api:rate-limited', handleRateLimit);
  }, []);

  // Auto-select mailbox: URL param > user preference > first mailbox
  const { data: preferences, isLoading: preferencesLoading } = usePreferences();

  // Real-time updates via WebSocket
  const { connected: wsConnected, reconnect: wsReconnect } = useWebSocket(selectedMailboxId, preferences?.notification_categories);

  const { data: categoryCounts } = useCategoryCounts(selectedMailboxId);
  useEffect(() => {
    if (!mailboxes || mailboxes.length === 0) return;
    if (selectedMailboxId) return;
    // Wait for preferences to load before falling back to first mailbox
    if (!mailboxIdParam && preferencesLoading) return;

    let targetId: number;
    if (mailboxIdParam) {
      targetId = parseInt(mailboxIdParam, 10);
    } else if (preferences?.default_mailbox_id && mailboxes.some(m => m.id === preferences.default_mailbox_id)) {
      targetId = preferences.default_mailbox_id;
    } else {
      targetId = mailboxes[0].id;
    }
    setSelectedMailboxId(targetId);
  }, [mailboxes, selectedMailboxId, mailboxIdParam, setSelectedMailboxId, preferences, preferencesLoading]);

  // Sync URL with mailbox ID
  useEffect(() => {
    if (selectedMailboxId && !mailboxIdParam) {
      navigate(`/mail/${selectedMailboxId}/${activeLabel}`, { replace: true });
    }
  }, [selectedMailboxId, mailboxIdParam, activeLabel, navigate]);

  const isSearching = !!(searchQuery || searchParams.q || searchParams.from || searchParams.to || searchParams.after || searchParams.before || searchParams.has_attachment);

  const threadsQuery = useThreads(
    selectedMailboxId,
    activeLabel,
    page,
    activeLabel === 'INBOX' ? activeCategory : undefined,
    filterUnread || undefined,
  );
  const searchResult = useSearch(selectedMailboxId, { ...searchParams, q: searchQuery }, page);

  const threads = isSearching ? searchResult : threadsQuery;
  const updateThread = useUpdateThread(selectedMailboxId);
  const bulkAction = useBulkAction(selectedMailboxId);
  const markAllRead = useMarkAllRead(selectedMailboxId);
  const emptyTrash = useEmptyTrash(selectedMailboxId);
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch selected thread data for draft detection
  const { data: selectedThreadData } = useThread(selectedMailboxId, selectedThreadId);

  // If the selected thread is a draft, open it in compose instead
  useEffect(() => {
    if (!selectedThreadData?.emails?.length) return;
    const lastEmail = selectedThreadData.emails[selectedThreadData.emails.length - 1];
    if (lastEmail?.is_draft) {
      // Detect reply context: find the email this draft is replying to
      let replyToEmailId: number | undefined;
      if (lastEmail.in_reply_to && selectedThreadData.emails) {
        const parentEmail = selectedThreadData.emails.find(
          (e) => e.message_id === lastEmail.in_reply_to && !e.is_draft
        );
        if (parentEmail) {
          replyToEmailId = parentEmail.id;
        }
      }

      compose.openDraft({
        id: lastEmail.id,
        mailboxId: lastEmail.mailbox_id,
        to: lastEmail.to_addresses || [],
        cc: lastEmail.cc_addresses || [],
        bcc: lastEmail.bcc_addresses || [],
        subject: lastEmail.subject || '',
        body: lastEmail.html_body || '',
        attachmentIds: lastEmail.attachments?.map((a) => a.id) || [],
        replyToEmailId,
      });
      setSelectedThreadId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    wsReconnect();
    await queryClient.invalidateQueries({ queryKey: ['threads', selectedMailboxId] });
    await queryClient.invalidateQueries({ queryKey: ['counts', selectedMailboxId] });
    await queryClient.invalidateQueries({ queryKey: ['categoryCounts', selectedMailboxId] });
    setIsRefreshing(false);
  }, [queryClient, selectedMailboxId, wsReconnect]);

  const handleLabelChange = useCallback(
    (label: string) => {
      setPage(1);
      setSelectedThreadIds(new Set());
      setSelectedThreadId(null);
      setActiveCategory('primary');
      setFilterUnread(false);
      setSearchParams({});
      setSearchQuery('');
      navigate(`/mail/${selectedMailboxId}/${label}`);
    },
    [selectedMailboxId, navigate, setSelectedThreadId, setSearchQuery],
  );

  const handleCategoryChange = useCallback(
    (category: EmailCategory) => {
      setActiveCategory(category);
      setPage(1);
      setSelectedThreadIds(new Set());
      setSelectedThreadId(null);
    },
    [setSelectedThreadId],
  );

  function handleToggleSelect(id: number, shiftKey?: boolean) {
    if (shiftKey && lastSelectedId !== null && threads.data) {
      const allIds = threads.data.data.map((t) => t.id);
      const fromIdx = allIds.indexOf(lastSelectedId);
      const toIdx = allIds.indexOf(id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        setSelectedThreadIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            next.add(allIds[i]);
          }
          return next;
        });
        setLastSelectedId(id);
        return;
      }
    }
    setSelectedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastSelectedId(id);
  }

  function handleSelectAll() {
    if (!threads.data) return;
    setSelectedThreadIds(new Set(threads.data.data.map((t) => t.id)));
  }

  function handleDeselectAll() {
    setSelectedThreadIds(new Set());
  }

  function handleToggleStar(threadId: number, starred: boolean) {
    updateThread.mutate({ threadId, data: { is_starred: starred } });
  }

  function handleClickThread(threadId: number) {
    setSelectedThreadId(threadId);
    // Mark as read
    updateThread.mutate({ threadId, data: { is_read: true } });
  }

  function handleBulkAction(action: 'read' | 'unread' | 'trash' | 'delete' | 'spam') {
    if (selectedThreadIds.size === 0) return;
    const ids = Array.from(selectedThreadIds);
    const count = ids.length;
    bulkAction.mutate(
      { thread_ids: ids, action },
      {
        onSuccess: () => {
          setSelectedThreadIds(new Set());
          if (action === 'trash') {
            showNotificationToast(
              'Moved to Trash',
              `${count} conversation${count > 1 ? 's' : ''} trashed.`,
              { label: 'Undo', onClick: () => bulkAction.mutate({ thread_ids: ids, action: 'untrash' }) },
            );
          } else if (action === 'spam') {
            showNotificationToast(
              'Marked as Spam',
              `${count} conversation${count > 1 ? 's' : ''} marked as spam.`,
              { label: 'Undo', onClick: () => bulkAction.mutate({ thread_ids: ids, action: 'not_spam' }) },
            );
          } else if (action === 'read') {
            showNotificationToast('Marked as Read', `${count} conversation${count > 1 ? 's' : ''} marked as read.`);
          } else if (action === 'unread') {
            showNotificationToast('Marked as Unread', `${count} conversation${count > 1 ? 's' : ''} marked as unread.`);
          } else if (action === 'delete') {
            showNotificationToast('Deleted forever', `${count} conversation${count > 1 ? 's' : ''} permanently deleted.`);
          }
        },
      },
    );
  }

  function handleMoveToCategory(category: EmailCategory) {
    if (selectedThreadIds.size === 0) return;
    bulkAction.mutate(
      { thread_ids: Array.from(selectedThreadIds), action: 'category', category },
      { onSuccess: () => setSelectedThreadIds(new Set()) },
    );
  }

  function handleDropOnCategory(threadIds: number[], category: EmailCategory) {
    if (threadIds.length === 0) return;
    bulkAction.mutate(
      { thread_ids: threadIds, action: 'category', category },
      { onSuccess: () => setSelectedThreadIds(new Set()) },
    );
  }

  function stripNestedQuotes(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Remove blockquotes, gmail_quote divs, and other quote containers
    doc.body.querySelectorAll('blockquote, .gmail_quote, .gmail_extra, .yahoo_quoted, [name="quote"], #divRplyFwdMsg').forEach((el) => el.remove());
    return doc.body.innerHTML;
  }

  function buildQuotedBody(email: Email): string {
    const date = email.sent_at ? new Date(email.sent_at).toLocaleString() : '';
    const from = email.from_name ? `${email.from_name} &lt;${email.from_address}&gt;` : email.from_address;
    const content = stripNestedQuotes(email.html_body || email.text_body || '');
    return `<br><br><div style="border-left:2px solid #7c5cfc;padding-left:12px;margin-left:0;color:#a1a1aa"><p><strong>On ${date}, ${from} wrote:</strong></p>${content}</div>`;
  }

  function handleReply(email: Email) {
    const mailbox = mailboxes?.find((m) => m.id === selectedMailboxId);
    const myAddress = mailbox ? `${mailbox.address}@${mailbox.domain}` : '';

    // For outbound emails (sent by us), reply to the original recipients
    const replyTo = email.direction === 'outbound'
      ? (email.to_addresses || []).filter((a) => a !== myAddress)
      : [email.from_address].filter((a) => a !== myAddress);

    const replyCc = (email.cc_addresses || []).filter((a) => a !== myAddress);

    compose.openReply(
      selectedMailboxId,
      email.id,
      replyTo,
      email.subject,
      buildQuotedBody(email),
      mailbox?.signature || undefined,
      replyCc,
    );
  }

  function handleReplyAll(email: Email) {
    const mailbox = mailboxes?.find((m) => m.id === selectedMailboxId);
    const myAddress = mailbox ? `${mailbox.address}@${mailbox.domain}` : '';

    // For outbound emails, include all original recipients
    const allTo = email.direction === 'outbound'
      ? (email.to_addresses || []).filter((a) => a !== myAddress)
      : [email.from_address, ...(email.to_addresses || [])].filter((a) => a !== myAddress);

    const allCc = (email.cc_addresses || []).filter((a) => a !== myAddress);
    compose.openReply(selectedMailboxId, email.id, allTo, email.subject, buildQuotedBody(email), mailbox?.signature || undefined, allCc);
  }

  function handleForward(email: Email) {
    const date = email.sent_at ? new Date(email.sent_at).toLocaleString() : '';
    const from = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;
    const to = (email.to_addresses || []).join(', ');
    const fwdBody = `<br><br><div style="border-left:2px solid #7c5cfc;padding-left:12px;margin-left:0;color:#a1a1aa"><p><strong>---------- Forwarded message ----------</strong></p><p>From: ${from}<br>Date: ${date}<br>Subject: ${email.subject}<br>To: ${to}</p><hr style="border-color:rgba(255,255,255,0.1)">${email.html_body || email.text_body || ''}</div>`;

    compose.openForward(selectedMailboxId, email.id, email.subject, fwdBody);
  }

  function handleSearchFiltersChange(params: SearchParams) {
    // Category and unread filters apply to the normal thread list, not search
    if (params.category) {
      setActiveCategory(params.category as EmailCategory);
    }
    setFilterUnread(!!params.is_unread);

    // Pass remaining filters (text, from, to, date, attachment) to search
    const { category: _cat, is_unread: _ur, ...searchOnly } = params;
    setSearchParams(searchOnly);
    setPage(1);
  }

  useKeyboardShortcuts({
    onCompose: () => {
      const mailbox = mailboxes?.find((m) => m.id === selectedMailboxId);
      compose.openNew(selectedMailboxId, mailbox?.signature || undefined);
    },
    onFocusSearch: () => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus(),
    onTrash: () => handleBulkAction('trash'),
    onShowHelp: () => setShowShortcutHelp(true),
  });

  if (mailboxesLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      </div>
    );
  }

  const showThreadView = selectedThreadId !== null && selectedMailboxId !== null;

  return (
    <AppLayout
      sidebar={
        <Sidebar
          activeLabel={activeLabel}
          onLabelChange={handleLabelChange}
          onManageLabels={() => setShowLabelManager(true)}
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
        />
      }
    >
      <div className={`flex min-w-0 flex-1 flex-col ${showThreadView ? 'hidden' : 'flex'}`}>
        <Header
          selectedCount={selectedThreadIds.size}
          allSelected={
            threads.data
              ? selectedThreadIds.size === threads.data.data.length && threads.data.data.length > 0
              : false
          }
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onBulkAction={handleBulkAction}
          onMoveToCategory={handleMoveToCategory}
          showCategoryMove={activeLabel === 'INBOX' && !isSearching}
          activeLabel={activeLabel}
          onEmptyTrash={() => {
            emptyTrash.mutate(undefined, {
              onSuccess: (data) => {
                showNotificationToast(
                  'Trash emptied',
                  `${data.count} conversation${data.count === 1 ? '' : 's'} permanently deleted.`,
                );
                setSelectedThreadIds(new Set());
                setSelectedThreadId(null);
              },
            });
          }}
          onRefresh={() => void handleRefresh()}
          isRefreshing={isRefreshing}
          wsConnected={wsConnected}
          searchFilters={searchParams}
          onSearchFiltersChange={handleSearchFiltersChange}
          mailboxId={selectedMailboxId}
          onMarkPageRead={() => {
            if (!threads.data) return;
            const ids = threads.data.data.map((t) => t.id);
            if (ids.length === 0) return;
            bulkAction.mutate(
              { thread_ids: ids, action: 'read' },
              { onSuccess: () => showNotificationToast('Done', `${ids.length} conversations marked as read.`) },
            );
          }}
          onMarkAllRead={() => {
            const payload: { category?: string; label?: string } = {};
            if (activeLabel === 'INBOX') payload.category = activeCategory;
            else payload.label = activeLabel;
            markAllRead.mutate(payload, {
              onSuccess: (data) => showNotificationToast('Done', `${data.count} conversations marked as read.`),
            });
          }}
        />
        {activeLabel === 'INBOX' && !isSearching && (
          <CategoryTabs
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
            counts={categoryCounts}
            onDropThreads={handleDropOnCategory}
          />
        )}
        <ThreadList
          data={threads.data}
          isLoading={threads.isLoading}
          selectedThreadIds={selectedThreadIds}
          activeThreadId={selectedThreadId}
          onToggleSelect={handleToggleSelect}
          onToggleStar={handleToggleStar}
          onClickThread={handleClickThread}
          onPageChange={setPage}
          onTrash={(id) => {
            updateThread.mutate({ threadId: id, data: { is_trashed: true } });
            showNotificationToast('Moved to Trash', '1 conversation trashed.', {
              label: 'Undo',
              onClick: () => updateThread.mutate({ threadId: id, data: { is_trashed: false } }),
            });
          }}
          onToggleRead={(id, read) => {
            updateThread.mutate({ threadId: id, data: { is_read: read } });
          }}
        />
      </div>

      {showThreadView && (
        <ThreadView
          mailboxId={selectedMailboxId}
          threadId={selectedThreadId}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onClose={() => setSelectedThreadId(null)}
        />
      )}

      {composeOpen && (
        <Suspense fallback={null}>
          <ComposeModal />
        </Suspense>
      )}

      {showLabelManager && selectedMailboxId && (
        <LabelManager
          mailboxId={selectedMailboxId}
          onClose={() => setShowLabelManager(false)}
        />
      )}

      <KeyboardShortcutHelp
        open={showShortcutHelp}
        onClose={() => setShowShortcutHelp(false)}
      />
    </AppLayout>
  );
}
