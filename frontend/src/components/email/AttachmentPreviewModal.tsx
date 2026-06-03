import { useState, useEffect, useRef, useCallback } from 'react';
import type { Attachment } from '../../types/index.ts';
import api from '../../services/api.ts';

interface AttachmentPreviewModalProps {
  attachments: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPreviewType(contentType: string): 'image' | 'pdf' | 'video' | 'other' {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('video/')) return 'video';
  return 'other';
}

function getFileIconPath(contentType: string): string {
  if (contentType.startsWith('audio/')) return 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z';
  if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('gzip')) return 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z';
  if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType === 'text/csv') return 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 15.75h7.5';
  return 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z';
}

export default function AttachmentPreviewModal({ attachments, initialIndex, onClose }: AttachmentPreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [error, setError] = useState(false);
  const urlCache = useRef<Map<number, string>>(new Map());

  const attachment = attachments[currentIndex];
  const previewType = getPreviewType(attachment.content_type);
  const hasMultiple = attachments.length > 1;

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setZoomed(false);
    setError(false);
    setSignedUrl(null);
  }, []);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  const goNext = useCallback(() => {
    if (currentIndex < attachments.length - 1) goTo(currentIndex + 1);
  }, [currentIndex, attachments.length, goTo]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowLeft') { e.stopPropagation(); goPrev(); }
      if (e.key === 'ArrowRight') { e.stopPropagation(); goNext(); }
    }
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onClose, goPrev, goNext]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Resolve preview URL for PDFs and videos
  useEffect(() => {
    if (previewType !== 'pdf' && previewType !== 'video') return;

    // PDFs stream through the backend to avoid CSP frame-src issues with
    // cross-origin R2 URLs. When the API is same-origin as the page we use
    // a relative URL so `default-src 'self'` covers it; otherwise we fall
    // back to the axios baseURL (requires CSP to whitelist that origin).
    if (previewType === 'pdf') {
      const base = api.defaults.baseURL ?? '';
      const sameOrigin = !base || base.startsWith(window.location.origin);
      const streamPath = `/api/attachments/${attachment.id}/stream`;
      setSignedUrl(sameOrigin ? streamPath : `${base}${streamPath}`);
      return;
    }

    const cached = urlCache.current.get(attachment.id);
    if (cached) {
      setSignedUrl(cached);
      return;
    }

    setLoading(true);
    setError(false);
    api.get<{ download_url: string }>(`/api/attachments/${attachment.id}/download`)
      .then(({ data }) => {
        urlCache.current.set(attachment.id, data.download_url);
        setSignedUrl(data.download_url);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [attachment.id, previewType]);

  async function handleDownload() {
    try {
      const { data } = await api.get<{ download_url: string }>(`/api/attachments/${attachment.id}/download`);
      triggerDownload(data.download_url, attachment.filename);
    } catch {
      triggerDownload(attachment.download_url, attachment.filename);
    }
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/85 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-200">{attachment.filename}</p>
          <p className="text-xs text-gray-500">
            {formatSize(attachment.size)}
            {hasMultiple && <span className="ml-2">{currentIndex + 1} / {attachments.length}</span>}
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/[0.1]"
          title="Download"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <span className="hidden sm:inline">Download</span>
        </button>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.1] hover:text-gray-200"
          title="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2 sm:px-12"
        onClick={(e) => e.stopPropagation()}
      >
        {previewType === 'image' && (
          <img
            src={attachment.inline_url || attachment.download_url}
            alt={attachment.filename}
            className="max-h-[calc(100vh-120px)] max-w-full rounded-lg object-contain transition-transform duration-200"
            style={{
              transform: zoomed ? 'scale(2)' : 'scale(1)',
              cursor: zoomed ? 'zoom-out' : 'zoom-in',
            }}
            onClick={() => setZoomed(!zoomed)}
            draggable={false}
          />
        )}

        {previewType === 'pdf' && (
          loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600" style={{ borderTopColor: 'var(--accent-primary)' }} />
              <p className="text-sm text-gray-400">Loading PDF...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl p-8" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <svg className="h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-gray-400">Could not load preview</p>
              <button onClick={handleDownload} className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110" style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)' }}>
                Download instead
              </button>
            </div>
          ) : signedUrl ? (
            <iframe
              src={`${signedUrl}#toolbar=1&navpanes=0`}
              title={attachment.filename}
              className="h-[calc(100vh-120px)] w-full max-w-4xl rounded-lg"
              style={{ background: 'white' }}
              allow="fullscreen"
            />
          ) : null
        )}

        {previewType === 'video' && (
          loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600" style={{ borderTopColor: 'var(--accent-primary)' }} />
              <p className="text-sm text-gray-400">Loading video...</p>
            </div>
          ) : signedUrl ? (
            <video
              src={signedUrl}
              controls
              className="max-h-[calc(100vh-120px)] max-w-full rounded-lg"
            />
          ) : null
        )}

        {previewType === 'other' && (
          <div className="flex flex-col items-center gap-4 rounded-2xl p-10" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
            <svg className="h-16 w-16 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d={getFileIconPath(attachment.content_type)} />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-200">{attachment.filename}</p>
              <p className="mt-1 text-xs text-gray-500">{formatSize(attachment.size)}</p>
            </div>
            <button
              onClick={handleDownload}
              className="rounded-lg px-5 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)', boxShadow: '0 4px 16px rgba(124, 92, 252, 0.25)' }}
            >
              Download
            </button>
          </div>
        )}

        {/* Nav arrows */}
        {hasMultiple && currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-gray-300 transition-colors hover:bg-white/20 sm:left-3 sm:p-3"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {hasMultiple && currentIndex < attachments.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-gray-300 transition-colors hover:bg-white/20 sm:right-3 sm:p-3"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
