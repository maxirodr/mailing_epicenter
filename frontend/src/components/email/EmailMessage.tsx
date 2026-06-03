import React, { useState, useRef, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { Email } from '../../types/index.ts';
import EmailActions from './EmailActions.tsx';
import EmailSourceModal from './EmailSourceModal.tsx';
import AttachmentPreviewModal from './AttachmentPreviewModal.tsx';

interface EmailMessageProps {
  email: Email;
  defaultExpanded: boolean;
  onReply: (email: Email) => void;
  onReplyAll: (email: Email) => void;
  onForward: (email: Email) => void;
  onMarkUnread?: () => void;
  onStar?: () => void;
  onDelete?: () => void;
  onSpam?: () => void;
  isSpam?: boolean;
  onNotSpam?: () => void;
  onTrustSender?: () => void;
  onCancelSchedule?: () => void;
  onSendNow?: () => void;
}

function avatarGradient(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 60%, 45%), hsl(${h2}, 50%, 35%))`;
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extracts CSS rules from <style> blocks and inlines them onto matching elements.
 * This ensures email formatting survives DOMPurify sanitization and overrides
 * the wrapper's Tailwind prose classes.
 */
function inlineEmailStyles(html: string): string {
  // Collect all <style> blocks from the full document
  const styleBlocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let sm;
  while ((sm = styleRegex.exec(html)) !== null) {
    styleBlocks.push(sm[1]);
  }
  if (styleBlocks.length === 0) return html;

  // Parse CSS rules (simple parser for class/element selectors)
  const rules: { selector: string; props: string }[] = [];
  const cssText = styleBlocks.join('\n');
  const ruleRegex = /([^{}]+)\{([^}]+)\}/g;
  let rm;
  while ((rm = ruleRegex.exec(cssText)) !== null) {
    const selector = rm[1].trim();
    const props = rm[2].trim();
    // Skip @media, @keyframes, etc.
    if (selector.startsWith('@')) continue;
    // Handle comma-separated selectors
    for (const sel of selector.split(',')) {
      rules.push({ selector: sel.trim(), props });
    }
  }

  if (rules.length === 0) return html;

  // Extract body content to work with. Use greedy match because some emails
  // (e.g. SendGrid) nest multiple <body> tags inside modules; a lazy match
  // would stop at the first inner </body> and drop the rest of the email.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : html;

  // Use DOMParser to apply styles
  const doc = new DOMParser().parseFromString(content, 'text/html');

  for (const { selector, props } of rules) {
    // Skip body/html selectors - apply to wrapper-level
    if (selector === 'body' || selector === 'html') continue;
    try {
      const els = doc.body.querySelectorAll(selector);
      els.forEach((el) => {
        const existing = el.getAttribute('style') || '';
        el.setAttribute('style', existing + (existing && !existing.endsWith(';') ? ';' : '') + props);
      });
    } catch {
      // Invalid selector, skip
    }
  }

  return doc.body.innerHTML;
}

/**
 * Sanitizes HTML email body using DOMPurify.
 * All content is sanitized before being rendered to prevent XSS.
 */
function sanitizeHtmlBody(html: string) {
  // Inline CSS from <style> blocks into the HTML elements before DOMPurify strips them.
  const htmlWithStyles = inlineEmailStyles(html);

  // Strip data: URIs and selection/interaction-blocking CSS
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'src') {
      const val = data.attrValue.trim();
      if (val.toLowerCase().startsWith('data:')) {
        data.attrValue = 'about:blank';
      } else if (node.tagName === 'IMG' && val.toLowerCase().startsWith('http://')) {
        // Upgrade http image URLs to https to avoid mixed-content blocking on HTTPS pages
        data.attrValue = 'https://' + val.slice(7);
      }
    }
    if (data.attrName === 'style') {
      // Strip all vendor-prefixed user-select (prevents emails from blocking text selection)
      data.attrValue = data.attrValue.replace(/(-webkit-|-moz-|-ms-)?user-select\s*:\s*[^;]+;?/gi, '');
      // Strip pointer-events: none (prevents click/selection blocking)
      data.attrValue = data.attrValue.replace(/pointer-events\s*:\s*none\s*;?/gi, '');
    }
  });

  // Force all links to open in a new tab so they never navigate away from the app
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  const clean = DOMPurify.sanitize(htmlWithStyles, {
    ALLOWED_TAGS: [
      'a', 'abbr', 'address', 'article', 'b', 'blockquote', 'br', 'caption',
      'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
      'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'h1', 'h2',
      'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark',
      'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small', 'span',
      'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody',
      'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr',
    ],
    ALLOWED_ATTR: [
      'align', 'alt', 'bgcolor', 'border', 'cellpadding', 'cellspacing',
      'class', 'color', 'colspan', 'dir', 'face', 'height', 'href', 'id',
      'lang', 'name', 'rel', 'rowspan', 'size', 'src', 'style', 'target',
      'title', 'type', 'valign', 'width',
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ALLOW_DATA_ATTR: false,
  });

  DOMPurify.removeHook('uponSanitizeAttribute');
  DOMPurify.removeHook('afterSanitizeAttributes');

  return { __html: clean };
}

function stripHtmlToText(html: string): string {
  const noStyle = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const doc = new DOMParser().parseFromString(noStyle, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Parses a CSS color string and returns its luminance (0 = black, 1 = white).
 * Handles hex (#rgb, #rrggbb), rgb(), rgba(), and common named colors.
 */
function getColorLuminance(color: string): number | null {
  const c = color.trim().toLowerCase();
  if (c === 'black' || c === '#000' || c === '#000000') return 0;
  if (c === 'white' || c === '#fff' || c === '#ffffff') return 1;

  let r: number | undefined, g: number | undefined, b: number | undefined;

  const hex = c.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else if (h.length >= 6) {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  }

  const rgb = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    r = parseInt(rgb[1]);
    g = parseInt(rgb[2]);
    b = parseInt(rgb[3]);
  }

  if (r === undefined || g === undefined || b === undefined) return null;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Post-processes email HTML in dark mode: converts dark text colors
 * to light and removes light backgrounds so content is readable.
 */
function fixDarkModeColors(container: HTMLElement) {
  // Fix elements with inline color styles
  container.querySelectorAll('[style]').forEach((el) => {
    const style = (el as HTMLElement).style;

    if (style.color) {
      const lum = getColorLuminance(style.color);
      if (lum !== null && lum < 0.25) {
        style.color = '#d1d5db';
      }
    }

    if (style.backgroundColor) {
      const lum = getColorLuminance(style.backgroundColor);
      if (lum !== null && lum > 0.75) {
        style.backgroundColor = 'transparent';
      }
    }
  });

  // Handle <font color="..."> tags
  container.querySelectorAll('font[color]').forEach((el) => {
    const color = el.getAttribute('color');
    if (color) {
      const lum = getColorLuminance(color);
      if (lum !== null && lum < 0.25) {
        el.setAttribute('color', '#d1d5db');
      }
    }
  });
}

// CSS selectors for quoted content across email clients
const QUOTE_SELECTORS_LIST = [
  'blockquote',
  '.gmail_quote',
  '.gmail_extra',
  '.yahoo_quoted',
  '.zmail_extra',
  '.moz-cite-prefix',
  '.protonmail_quote',
  '[name="quote"]',
  '[name="mailReplySection"]',
  '.ms-outlook-quote',
  '#divRplyFwdMsg',
  '#x_divRplyFwdMsg',
  '#isForwardContent',
  '#isReplyContent',
  '#mail-editor-reference-message-container',
  '.tutanota_quote',
  '.FastmailQuote',
];
const QUOTE_SELECTORS = QUOTE_SELECTORS_LIST.join(', ');

// Regex to detect "On ... wrote:" attribution lines (multiple languages)
const ATTRIBUTION_REGEX = /^(on\s.+\s(wrote|said)|el\s.+\s(escribi[oó]|a\s+la)|de\s*:\s*\S|from\s*:\s*\S|------+\s*(forwarded|reenviad|original)\s*(message|mensaje))/i;

/**
 * Splits sanitized HTML into main content and quoted content.
 * Uses DOM parsing to find quote boundaries reliably.
 * Returns { mainHtml, quotedHtml } where quotedHtml is null if no quotes found.
 */
function splitQuotedContent(html: string): { mainHtml: string; quotedHtml: string | null } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body.children.length) return { mainHtml: html, quotedHtml: null };

  // Phase 1: Find by CSS selectors (blockquote, .gmail_quote, etc.)
  const quoteEl = body.querySelector(QUOTE_SELECTORS);
  if (quoteEl) {
    // Walk up to find the top-level container within body
    let container: Element = quoteEl;
    while (container.parentElement && container.parentElement !== body) {
      container = container.parentElement;
    }

    const mainParts: string[] = [];
    const quoteParts: string[] = [];
    let foundQuote = false;

    for (const child of Array.from(body.children)) {
      if (child === container || foundQuote) {
        foundQuote = true;
        quoteParts.push(child.outerHTML);
      } else {
        mainParts.push(child.outerHTML);
      }
    }

    if (quoteParts.length > 0) {
      return { mainHtml: mainParts.join(''), quotedHtml: quoteParts.join('') };
    }
  }

  // Phase 2: Find by "On ... wrote:" / "El ... escribió:" attribution text
  const children = Array.from(body.children);
  for (let i = 0; i < children.length; i++) {
    const text = (children[i].textContent || '').trim();
    if (ATTRIBUTION_REGEX.test(text)) {
      const mainParts = children.slice(0, i).map((c) => c.outerHTML).join('');
      const quoteParts = children.slice(i).map((c) => c.outerHTML).join('');
      if (quoteParts.length > 0) {
        return { mainHtml: mainParts, quotedHtml: quoteParts };
      }
    }
  }

  // Phase 3: Find div with border-left (common quote indicator)
  for (let i = 0; i < children.length; i++) {
    const el = children[i] as HTMLElement;
    const style = el.getAttribute('style') || '';
    if (/border-left\s*:\s*[^n0]/i.test(style) && (el.textContent || '').trim().length > 20) {
      const mainParts = children.slice(0, i).map((c) => c.outerHTML).join('');
      const quoteParts = children.slice(i).map((c) => c.outerHTML).join('');
      return { mainHtml: mainParts, quotedHtml: quoteParts };
    }
  }

  return { mainHtml: html, quotedHtml: null };
}

function EmailMessage({
  email,
  defaultExpanded,
  onReply,
  onReplyAll,
  onForward,
  onMarkUnread,
  onStar,
  onDelete,
  onSpam,
  isSpam,
  onNotSpam,
  onTrustSender,
  onCancelSchedule,
  onSendNow,
}: EmailMessageProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showSource, setShowSource] = useState(false);
  const [showOriginalHtml, setShowOriginalHtml] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Split HTML into main content and quoted content (memoized by html_body)
  const { mainHtml, quotedHtml } = useMemo(() => {
    if (!email.html_body) return { mainHtml: null, quotedHtml: null };
    const sanitized = sanitizeHtmlBody(email.html_body).__html;
    return splitQuotedContent(sanitized);
  }, [email.html_body]);

  // Fix dark colors after render
  useEffect(() => {
    if (expanded && contentRef.current) {
      fixDarkModeColors(contentRef.current);
    }
  }, [expanded, mainHtml, showQuoted]);

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const from = email.from_name ? `${email.from_name} &lt;${email.from_address}&gt;` : email.from_address;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>${DOMPurify.sanitize(email.subject)}</title>
      <style>body{font-family:-apple-system,system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}
      .header{border-bottom:2px solid #eee;padding-bottom:16px;margin-bottom:24px}
      .meta{color:#666;font-size:13px;margin:4px 0}h1{font-size:20px;margin:0 0 12px}
      img{max-width:100%}blockquote{border-left:3px solid #ddd;padding-left:12px;margin-left:0;color:#666}</style></head>
      <body><div class="header"><h1>${DOMPurify.sanitize(email.subject)}</h1>
      <div class="meta"><strong>From:</strong> ${DOMPurify.sanitize(from)}</div>
      <div class="meta"><strong>To:</strong> ${DOMPurify.sanitize(email.to_addresses.join(', '))}</div>
      ${email.cc_addresses?.length ? `<div class="meta"><strong>CC:</strong> ${DOMPurify.sanitize(email.cc_addresses.join(', '))}</div>` : ''}
      <div class="meta"><strong>Date:</strong> ${email.sent_at ? new Date(email.sent_at).toLocaleString() : ''}</div>
      </div>${DOMPurify.sanitize(email.html_body || `<pre>${email.text_body || ''}</pre>`)}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-white/[0.03]"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-gray-300"
          style={{ background: avatarGradient(email.from_address) }}
        >
          {(email.from_name || email.from_address).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-gray-300">
            {email.from_name || email.from_address}
          </span>
          <span className="ml-2 truncate text-xs text-gray-500">
            {email.text_body?.slice(0, 100) || 'No preview'}
          </span>
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {formatFullDate(email.sent_at)}
        </span>
      </div>
    );
  }

  const emailContentClass = "prose prose-invert max-w-none text-sm text-gray-300 select-text overflow-x-auto break-words [&_a]:text-blue-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-4 [&_blockquote]:text-gray-400 [&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block [&_table]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_pre]:max-w-full [&_pre]:overflow-x-auto";

  return (
    <>
      <div className="glass-card animate-slideUp rounded-xl mx-2 my-2 overflow-hidden">
        <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-gray-200"
            style={{ background: avatarGradient(email.from_address) }}
          >
            {(email.from_name || email.from_address).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-sm font-semibold text-gray-100">
                  {email.from_name || email.from_address}
                </span>
                <span className="ml-1 text-xs text-gray-500">
                  {'<'}{email.from_address}{'>'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-gray-500">
                  {email.scheduled_at && !email.sent_at ? (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatFullDate(email.scheduled_at)}
                    </span>
                  ) : formatFullDate(email.sent_at)}
                </span>
                <button
                  onClick={() => setExpanded(false)}
                  className="rounded-lg p-1 text-gray-500 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-300 active:scale-95"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              <span>To: {email.to_addresses.join(', ')}</span>
              {email.cc_addresses && email.cc_addresses.length > 0 && (
                <span className="ml-2">CC: {email.cc_addresses.join(', ')}</span>
              )}
              {email.bcc_addresses && email.bcc_addresses.length > 0 && (
                <span className="ml-2">BCC: {email.bcc_addresses.join(', ')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="px-3 pb-3 pl-4 sm:px-4 sm:pl-16">
          {email.scheduled_at && !email.sent_at && (
            <div
              className="mb-3 rounded-lg px-4 py-3"
              style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}
            >
              <div className="flex items-center gap-3 text-sm">
                <svg className="h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="flex-1 text-amber-300">
                  Scheduled for {formatFullDate(email.scheduled_at)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                {onSendNow && (
                  <button
                    onClick={onSendNow}
                    className="rounded-md px-3 py-1 text-xs font-medium text-gray-200 transition-colors hover:bg-white/[0.08]"
                    style={{ border: '1px solid var(--border-default)' }}
                  >
                    Send now
                  </button>
                )}
                {onCancelSchedule && (
                  <button
                    onClick={onCancelSchedule}
                    className="rounded-md px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/15"
                    style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  >
                    Cancel schedule
                  </button>
                )}
              </div>
            </div>
          )}

          {isSpam && (
            <div
              className="mb-3 rounded-lg px-4 py-3"
              style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              <div className="flex items-center gap-3 text-sm">
                <svg className="h-5 w-5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="flex-1 text-red-300">
                  This message is in your spam folder. Images and formatting are hidden for safety.
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                {onNotSpam && (
                  <button
                    onClick={onNotSpam}
                    className="rounded-md px-3 py-1 text-xs font-medium text-gray-200 transition-colors hover:bg-white/[0.08]"
                    style={{ border: '1px solid var(--border-default)' }}
                  >
                    Not spam
                  </button>
                )}
                {onTrustSender && (
                  <button
                    onClick={onTrustSender}
                    className="rounded-md px-3 py-1 text-xs font-medium text-green-300 transition-colors hover:bg-green-500/15"
                    style={{ border: '1px solid rgba(34, 197, 94, 0.3)' }}
                  >
                    Trust this sender
                  </button>
                )}
                {!showOriginalHtml && email.html_body && (
                  <button
                    onClick={() => setShowOriginalHtml(true)}
                    className="rounded-md px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
                    style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  >
                    View original
                  </button>
                )}
              </div>
            </div>
          )}

          {isSpam && !showOriginalHtml ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-300">
              {email.text_body || (email.html_body ? stripHtmlToText(email.html_body) : '')}
            </pre>
          ) : mainHtml !== null ? (
            <div ref={contentRef}>
              <div
                className={emailContentClass}
                dangerouslySetInnerHTML={{ __html: mainHtml }}
              />
              {quotedHtml && (
                <>
                  <button
                    onClick={() => setShowQuoted(!showQuoted)}
                    className="my-1 inline-flex items-center justify-center rounded-[10px] px-3 text-sm leading-5 tracking-widest transition-all duration-150 hover:bg-white/[0.08]"
                    style={{
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#9ca3af',
                    }}
                    title={showQuoted ? 'Hide quoted text' : 'Show quoted text'}
                  >
                    &bull;&bull;&bull;
                  </button>
                  {showQuoted && (
                    <div
                      className={emailContentClass}
                      dangerouslySetInnerHTML={{ __html: quotedHtml }}
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-gray-300">{email.text_body}</pre>
          )}

          {email.attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {email.attachments.map((att, idx) => (
                <button
                  key={att.id}
                  onClick={() => setPreviewIndex(idx)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-all duration-150 hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)] cursor-pointer"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  {att.inline_url ? (
                    <img src={att.inline_url} alt="" className="h-8 w-10 shrink-0 rounded object-cover" />
                  ) : (
                    <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-gray-300">{att.filename}</p>
                    <p className="text-xs text-gray-500">{formatSize(att.size)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4">
            <EmailActions
              email={email}
              onReply={() => onReply(email)}
              onReplyAll={() => onReplyAll(email)}
              onForward={() => onForward(email)}
              onMarkUnread={onMarkUnread}
              onStar={onStar}
              onDelete={onDelete}
              onSpam={onSpam}
              onShowOriginal={() => setShowSource(true)}
              onPrint={handlePrint}
            />
          </div>
        </div>
      </div>

      {showSource && (
        <EmailSourceModal email={email} onClose={() => setShowSource(false)} />
      )}

      {previewIndex !== null && (
        <AttachmentPreviewModal
          attachments={email.attachments}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  );
}

export default React.memo(EmailMessage, (prev, next) => {
  // Compare by value instead of reference to prevent re-renders that destroy text selection.
  // React Query returns new object references on refetch even when data hasn't changed.
  return prev.email.id === next.email.id
    && prev.email.html_body === next.email.html_body
    && prev.email.text_body === next.email.text_body
    && prev.email.sent_at === next.email.sent_at
    && prev.email.scheduled_at === next.email.scheduled_at
    && prev.email.attachments.length === next.email.attachments.length
    && prev.defaultExpanded === next.defaultExpanded
    && prev.isSpam === next.isSpam
    && prev.onCancelSchedule === next.onCancelSchedule
    && prev.onSendNow === next.onSendNow;
});
