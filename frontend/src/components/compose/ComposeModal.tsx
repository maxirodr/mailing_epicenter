import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useUiStore } from '../../stores/uiStore.ts';
import { useComposeStore, type ComposeInstance } from '../../stores/composeStore.ts';
import { useMailboxes } from '../../hooks/useMailboxes.ts';
import { useSendEmail, useReplyEmail, useForwardEmail, useCreateDraft, useSaveDraft, useSendDraft, useDeleteDraft, useCancelSend } from '../../hooks/useEmails.ts';
import { showNotificationToast } from '../ui/NotificationToast.tsx';
import RecipientInput, { type RecipientInputHandle } from './RecipientInput.tsx';
const TipTapEditor = lazy(() => import('./TipTapEditor.tsx'));
import AttachmentUploader from './AttachmentUploader.tsx';

interface UploadedFile {
  id: number;
  filename: string;
  size: number;
}

interface ComposeWindowProps {
  instance: ComposeInstance;
  index: number;
  totalOpen: number;
}

function ComposeWindow({ instance, index, totalOpen: _totalOpen }: ComposeWindowProps) {
  const compose = useComposeStore();
  const selectedMailboxId = useUiStore((s) => s.selectedMailboxId);
  const { data: mailboxes } = useMailboxes();

  const [fullscreen, setFullscreen] = useState(false);
  const [fromMailboxId, setFromMailboxId] = useState<number | null>(instance.mailboxId ?? selectedMailboxId);
  const [to, setTo] = useState<string[]>(instance.to);
  const [cc, setCc] = useState<string[]>(instance.cc);
  const [bcc, setBcc] = useState<string[]>(instance.bcc);
  const [showCcBcc, setShowCcBcc] = useState(instance.cc.length > 0 || instance.bcc.length > 0);
  const [subject, setSubject] = useState(instance.subject);
  const [body, setBody] = useState(instance.body);
  const [attachments, setAttachments] = useState<UploadedFile[]>(
    instance.attachmentIds.map((id) => ({ id, filename: '', size: 0 }))
  );
  const [sending, setSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [draftId, setDraftId] = useState<number | null>(instance.draftId);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sendEmail = useSendEmail(fromMailboxId);
  const replyEmail = useReplyEmail(fromMailboxId);
  const forwardEmail = useForwardEmail(fromMailboxId);
  const createDraft = useCreateDraft(fromMailboxId);
  const saveDraft = useSaveDraft(fromMailboxId);
  const sendDraftMutation = useSendDraft(fromMailboxId);
  const deleteDraft = useDeleteDraft(fromMailboxId);
  const cancelSend = useCancelSend(fromMailboxId);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const toRef = useRef<RecipientInputHandle>(null);
  const ccRef = useRef<RecipientInputHandle>(null);
  const bccRef = useRef<RecipientInputHandle>(null);

  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);
  useEffect(() => { savingRef.current = saving; }, [saving]);

  // On mobile viewports, force-clear minimized state
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = () => { if (!mq.matches) compose.setMinimized(instance.id, false); };
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  // Sync local state back to compose store (debounced) for persistence
  const syncToStore = useCallback(() => {
    compose.updateInstance(instance.id, {
      to, cc, bcc, subject, body,
      mailboxId: fromMailboxId,
      draftId,
      attachmentIds: attachments.map((a) => a.id),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, body, fromMailboxId, draftId, attachments, instance.id]);

  useEffect(() => {
    const timer = setTimeout(syncToStore, 500);
    return () => clearTimeout(timer);
  }, [syncToStore]);

  useEffect(() => {
    function handleBeforeUnload() { syncToStore(); }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [syncToStore]);

  useEffect(() => {
    if (!fromMailboxId) {
      if (selectedMailboxId) setFromMailboxId(selectedMailboxId);
      else if (mailboxes && mailboxes.length > 0) setFromMailboxId(mailboxes[0].id);
    }
  }, [selectedMailboxId, fromMailboxId, mailboxes]);

  // Update signature when From mailbox changes
  useEffect(() => {
    if (!fromMailboxId || !mailboxes) return;
    const mb = mailboxes.find((m) => m.id === fromMailboxId);
    const sigBlock = mb?.signature
      ? `<br><br><div class="signature">${mb.signature}</div>`
      : '';
    setBody((prev) => {
      const stripped = prev.replace(/<br><br><div class="signature">[\s\S]*?<\/div>/, '');
      if (instance.mode === 'new') return stripped + sigBlock;
      const quoteStart = stripped.search(/<br><br><div style="border-left:/);
      if (quoteStart !== -1) return stripped.slice(0, quoteStart) + sigBlock + stripped.slice(quoteStart);
      return stripped + sigBlock;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMailboxId]);

  const handleAutoSave = useCallback(async () => {
    if (savingRef.current || !fromMailboxId) return;
    const hasContent = subject.trim() !== '' || body.trim() !== '' || to.length > 0;
    if (!hasContent) return;

    setSaving(true);
    try {
      if (draftIdRef.current) {
        await saveDraft.mutateAsync({
          draftId: draftIdRef.current,
          to_addresses: to,
          cc_addresses: cc.length > 0 ? cc : undefined,
          bcc_addresses: bcc.length > 0 ? bcc : undefined,
          subject,
          html_body: body,
          attachment_ids: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
        });
      } else {
        const draft = await createDraft.mutateAsync({
          to_addresses: to.length > 0 ? to : undefined,
          cc_addresses: cc.length > 0 ? cc : undefined,
          bcc_addresses: bcc.length > 0 ? bcc : undefined,
          subject: subject || '(No subject)',
          html_body: body || undefined,
          attachment_ids: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
          reply_to_email_id: instance.mode === 'reply' && instance.replyToEmailId ? instance.replyToEmailId : undefined,
        });
        setDraftId(draft.id);
        draftIdRef.current = draft.id;
      }
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // Silently fail auto-save
    } finally {
      setSaving(false);
    }
  }, [fromMailboxId, to, cc, bcc, subject, body, attachments, saveDraft, createDraft, instance.mode, instance.replyToEmailId]);

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { void handleAutoSave(); }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [to, cc, bcc, subject, body, handleAutoSave]);

  async function handleClose() {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    if (draftIdRef.current && fromMailboxId) {
      try {
        await saveDraft.mutateAsync({
          draftId: draftIdRef.current,
          to_addresses: to,
          cc_addresses: cc.length > 0 ? cc : undefined,
          bcc_addresses: bcc.length > 0 ? bcc : undefined,
          subject, html_body: body,
          attachment_ids: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
        });
      } catch { /* ignore */ }
    } else if (fromMailboxId) {
      const hasContent = subject.trim() !== '' || body.trim() !== '' || to.length > 0;
      if (hasContent) {
        try {
          await createDraft.mutateAsync({
            to_addresses: to.length > 0 ? to : undefined,
            subject: subject || '(No subject)',
            html_body: body || undefined,
            attachment_ids: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
            reply_to_email_id: instance.mode === 'reply' && instance.replyToEmailId ? instance.replyToEmailId : undefined,
          });
        } catch { /* ignore */ }
      }
    }
    compose.closeInstance(instance.id);
  }

  async function handleDiscard() {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    if (draftIdRef.current && fromMailboxId) {
      try { await deleteDraft.mutateAsync(draftIdRef.current); } catch { /* ignore */ }
    }
    compose.closeInstance(instance.id);
  }

  async function handleSend() {
    if (sending) return;
    if (!fromMailboxId) { showNotificationToast('Cannot send', 'No mailbox assigned to your account.'); return; }

    const finalTo = toRef.current?.flushPending() ?? to;
    const finalCc = ccRef.current?.flushPending() ?? cc;
    const finalBcc = bccRef.current?.flushPending() ?? bcc;

    if (finalTo.length === 0 && finalCc.length === 0 && finalBcc.length === 0) {
      showNotificationToast('Cannot send', 'Add at least one recipient.');
      return;
    }

    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    setSending(true);
    try {
      let result: { id: number };
      const payloadBase = {
        to_addresses: finalTo,
        cc_addresses: finalCc.length > 0 ? finalCc : undefined,
        bcc_addresses: finalBcc.length > 0 ? finalBcc : undefined,
        html_body: body,
        attachment_ids: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
      };

      if (instance.mode === 'reply' && instance.replyToEmailId) {
        if (draftIdRef.current) {
          result = await sendDraftMutation.mutateAsync({ draftId: draftIdRef.current, ...payloadBase, subject });
        } else {
          result = await replyEmail.mutateAsync({ emailId: instance.replyToEmailId, ...payloadBase, subject });
        }
      } else if (instance.mode === 'forward' && instance.replyToEmailId) {
        result = await forwardEmail.mutateAsync({ emailId: instance.replyToEmailId, ...payloadBase, subject });
        if (draftIdRef.current) { try { await deleteDraft.mutateAsync(draftIdRef.current); } catch { /* ignore */ } }
      } else if (draftIdRef.current) {
        result = await sendDraftMutation.mutateAsync({ draftId: draftIdRef.current, ...payloadBase, subject });
      } else {
        result = await sendEmail.mutateAsync({ ...payloadBase, subject });
      }
      compose.closeInstance(instance.id);
      showNotificationToast('Email sent', 'Your email is being delivered.', {
        label: 'Undo',
        onClick: () => cancelSend.mutate(result.id),
      });
    } catch { /* Error handled by mutation */ } finally { setSending(false); }
  }

  async function handleScheduleSend() {
    if (sending || !fromMailboxId || !scheduleDate) return;
    const finalTo = toRef.current?.flushPending() ?? to;
    const finalCc = ccRef.current?.flushPending() ?? cc;
    const finalBcc = bccRef.current?.flushPending() ?? bcc;
    if (finalTo.length === 0 && finalCc.length === 0 && finalBcc.length === 0) return;
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    setSending(true);
    try {
      await sendEmail.mutateAsync({
        to_addresses: finalTo,
        cc_addresses: finalCc.length > 0 ? finalCc : undefined,
        bcc_addresses: finalBcc.length > 0 ? finalBcc : undefined,
        subject, html_body: body,
        attachment_ids: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
        scheduled_at: new Date(scheduleDate).toISOString(),
      });
      compose.closeInstance(instance.id);
    } catch { /* Error handled by mutation */ } finally { setSending(false); setShowSchedule(false); }
  }

  if (!mailboxes || mailboxes.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col w-full glass-panel lg:inset-auto lg:bottom-0 lg:right-6 lg:max-w-[560px] lg:rounded-t-xl lg:animate-slideInBottom" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="text-sm font-medium text-gray-200">New Message</span>
          <button onClick={() => compose.closeInstance(instance.id)} className="rounded p-1 text-gray-400 hover:bg-white/[0.06] hover:text-gray-200">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm font-medium text-gray-200">No mailbox assigned</p>
          <p className="mt-1 text-xs text-gray-500">Contact your administrator to get a mailbox assigned to your account.</p>
        </div>
      </div>
    );
  }

  const modeLabel = instance.mode === 'reply' ? 'Reply' : instance.mode === 'forward' ? 'Forward' : 'New Message';
  const title = subject.trim() ? subject.trim() : modeLabel;

  // Minimized: show as compact tab at the bottom
  if (instance.isMinimized) {
    return (
      <div
        className="hidden lg:block fixed bottom-10 z-50 w-72 rounded-lg glass-panel"
        style={{ boxShadow: 'var(--shadow-md)', right: `${16 + index * 288}px` }}
      >
        <div
          className="flex cursor-pointer items-center justify-between px-4 py-2"
          onClick={() => compose.setMinimized(instance.id, false)}
        >
          <span className="truncate text-sm font-medium text-gray-200">{title}</span>
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); compose.setMinimized(instance.id, false); }} className="rounded p-1 text-gray-400 hover:bg-white/[0.06] hover:text-gray-200">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); void handleClose(); }} className="rounded p-1 text-gray-400 hover:bg-white/[0.06] hover:text-gray-200">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full window position: offset from right for multiple windows
  const rightOffset = 24 + index * 580;

  const containerClass = fullscreen
    ? 'fixed inset-4 z-50 flex flex-col rounded-xl glass-panel'
    : 'fixed inset-0 z-50 flex h-full w-full flex-col glass-panel lg:inset-auto lg:bottom-0 lg:h-auto lg:max-h-[80vh] lg:max-w-[560px] lg:rounded-t-xl lg:animate-slideInBottom';

  return (
    <>
      {fullscreen && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => void handleClose()} />}
      <div className={containerClass} style={{ boxShadow: 'var(--shadow-lg)', ...(!fullscreen ? { right: `${rightOffset}px` } : {}) }}>
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <button onClick={() => void handleClose()} className="rounded-lg p-1 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200 lg:hidden">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </button>
            <span className="text-sm font-medium text-gray-200">{title}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => compose.setMinimized(instance.id, true)} className="hidden lg:inline-flex rounded p-1 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200" title="Minimize">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
            </button>
            <button onClick={() => setFullscreen(!fullscreen)} className="hidden lg:inline-flex rounded p-1 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {fullscreen ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
              )}
            </button>
            <button onClick={() => void handleClose()} className="hidden lg:inline-flex rounded p-1 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200" title="Close">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto [scrollbar-color:theme(colors.gray.700)_transparent] [scrollbar-width:thin]">
          <div className="space-y-2 p-4">
            {mailboxes && mailboxes.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-xs font-medium text-gray-500">From</label>
                <select value={fromMailboxId ?? ''} onChange={(e) => setFromMailboxId(parseInt(e.target.value, 10))} className="flex-1 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-[var(--accent-primary)]" style={{ background: 'var(--surface-2)' }}>
                  {mailboxes.map((mb) => (
                    <option key={mb.id} value={mb.id}>{mb.display_name ? `${mb.display_name} <${mb.full_address}>` : mb.full_address}</option>
                  ))}
                </select>
              </div>
            )}

            <RecipientInput ref={toRef} label="To" recipients={to} onChange={setTo} mailboxId={fromMailboxId}
              onRecipientDrop={(email) => { setCc((prev) => prev.filter((e) => e !== email)); setBcc((prev) => prev.filter((e) => e !== email)); }} />

            {!showCcBcc && (
              <button onClick={() => setShowCcBcc(true)} className="ml-8 text-xs text-gray-500 transition-colors hover:text-gray-300">CC / BCC</button>
            )}

            {showCcBcc && (
              <>
                <RecipientInput ref={ccRef} label="CC" recipients={cc} onChange={setCc} mailboxId={fromMailboxId}
                  onRecipientDrop={(email) => { setTo((prev) => prev.filter((e) => e !== email)); setBcc((prev) => prev.filter((e) => e !== email)); }} />
                <RecipientInput ref={bccRef} label="BCC" recipients={bcc} onChange={setBcc} mailboxId={fromMailboxId}
                  onRecipientDrop={(email) => { setTo((prev) => prev.filter((e) => e !== email)); setCc((prev) => prev.filter((e) => e !== email)); }} />
              </>
            )}

            <div className="flex items-center gap-2">
              <label className="shrink-0 text-xs font-medium text-gray-500">Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
                className="flex-1 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition focus:border-[var(--accent-primary)]" style={{ background: 'var(--surface-2)' }} />
            </div>

            <Suspense fallback={<div className="flex items-center justify-center rounded-lg p-8 glass-card"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600" style={{ borderTopColor: 'var(--accent-primary)' }} /></div>}>
              <TipTapEditor content={body} onChange={setBody} placeholder="Write your message..." />
            </Suspense>

            <AttachmentUploader attachments={attachments} onAttachmentsChange={setAttachments} />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="relative flex items-center gap-1">
            <button onClick={() => void handleSend()} disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-all duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)', boxShadow: '0 4px 16px rgba(124, 92, 252, 0.25)' }}>
              {sending ? (<><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Sending...</>) : (
                <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>Send</>
              )}
            </button>
            <button onClick={() => setShowSchedule(!showSchedule)} disabled={sending}
              className="inline-flex items-center rounded-lg p-2 text-sm transition-colors duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              title="Send later" style={{ background: 'var(--surface-2)', color: 'var(--accent-primary)' }}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            {showSchedule && (
              <div className="absolute bottom-full left-0 mb-2 rounded-lg p-3 glass-panel" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <p className="mb-2 text-xs font-medium text-gray-400">Schedule send</p>
                <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                  className="mb-2 w-full rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-[var(--accent-primary)]" style={{ background: 'var(--surface-2)' }} />
                <button onClick={() => void handleScheduleSend()} disabled={!scheduleDate || sending}
                  className="w-full rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)' }}>Schedule</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {(saving || lastSavedAt) && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                {saving ? (<><div className="h-3 w-3 animate-spin rounded-full border border-gray-500/30 border-t-gray-500" />Saving...</>) : <>Saved at {lastSavedAt}</>}
              </span>
            )}
            <button onClick={() => void handleDiscard()} className="rounded-lg p-2 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-red-400" title="Discard">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Container that renders all compose instances
export default function ComposeModal() {
  const instances = useComposeStore((s) => s.instances);

  if (instances.length === 0) return null;

  // Separate minimized and open instances for z-index ordering
  const openInstances = instances.filter((i) => !i.isMinimized);
  const minimizedInstances = instances.filter((i) => i.isMinimized);

  return (
    <>
      {minimizedInstances.map((inst, idx) => (
        <ComposeWindow key={inst.id} instance={inst} index={idx} totalOpen={openInstances.length} />
      ))}
      {openInstances.map((inst, idx) => (
        <ComposeWindow key={inst.id} instance={inst} index={idx} totalOpen={openInstances.length} />
      ))}
    </>
  );
}
