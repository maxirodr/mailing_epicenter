import { useEditor, EditorContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { useCallback, useRef, useState } from 'react';
import api from '../../services/api.ts';

// Resizable image node view
function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const [resizing, setResizing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const startX = useRef(0);
  const startW = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startX.current = e.clientX;
    startW.current = imgRef.current?.offsetWidth || 200;

    function onMouseMove(ev: MouseEvent) {
      const diff = ev.clientX - startX.current;
      const newWidth = Math.max(50, startW.current + diff);
      updateAttributes({ width: newWidth });
    }

    function onMouseUp() {
      setResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateAttributes]);

  return (
    <NodeViewWrapper as="span" className="inline-block relative" style={{ lineHeight: 0 }}>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        width={node.attrs.width || undefined}
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          width: node.attrs.width ? `${node.attrs.width}px` : undefined,
          outline: selected ? '2px solid var(--accent-primary)' : undefined,
          borderRadius: '4px',
          cursor: 'default',
        }}
        draggable={false}
      />
      {selected && (
        <span
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 12,
            height: 12,
            background: 'var(--accent-primary)',
            borderRadius: 2,
            cursor: resizing ? 'ew-resize' : 'nwse-resize',
            border: '2px solid var(--surface-1)',
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

// Extend Image to support width attribute + custom resizable view
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, renderHTML: (attrs) => attrs.width ? { width: attrs.width } : {} },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent editor from losing focus
        onClick();
      }}
      title={title}
      className={`rounded p-1.5 transition-colors duration-150 ${
        active
          ? 'bg-white/[0.1] text-gray-100'
          : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

export default function TipTapEditor({ content, onChange, placeholder }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-400 underline' },
      }),
      ResizableImage,
      Placeholder.configure({
        placeholder: placeholder || 'Write your message...',
      }),
      Underline,
      TextAlign.configure({
        types: ['paragraph'],
      }),
      Color,
      TextStyle,
    ],
    content,
    onUpdate: ({ editor: ed }) => {
      // Preserve empty paragraphs as visible line breaks (prevent <p></p> collapsing to zero height)
      let html = ed.getHTML();
      html = html.replace(/<p><\/p>/g, '<p><br></p>');
      onChange(html);
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[200px] px-4 py-3 text-sm text-gray-200 outline-none prose prose-invert max-w-none [&_p]:my-0 [&_p:empty]:my-0 [&_p:empty]:min-h-[1em]',
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) return true;

            const formData = new FormData();
            formData.append('file', file, file.name || 'pasted-image.png');

            api.post<{ inline_url: string | null }>('/api/attachments/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            }).then(({ data }) => {
              if (data.inline_url) {
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src: data.inline_url })
                  )
                );
              }
            }).catch(() => {
              // Silently fail image paste
            });

            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'));
        if (!imageFile) return false;

        event.preventDefault();
        const formData = new FormData();
        formData.append('file', imageFile);

        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });

        api.post<{ inline_url: string | null }>('/api/attachments/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).then(({ data }) => {
          if (data.inline_url && coords) {
            view.dispatch(
              view.state.tr.insert(
                coords.pos,
                view.state.schema.nodes.image.create({ src: data.inline_url })
              )
            );
          }
        }).catch(() => {
          // Silently fail image drop
        });

        return true;
      },
    },
  });

  const [quoteCollapsed, setQuoteCollapsed] = useState(true);

  if (!editor) return null;

  function addLink() {
    if (!editor) return;
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700" style={{ background: 'var(--surface-2)' }}>
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" />
          </svg>
        </ToolbarButton>

        <div className="mx-1 h-4 w-px" style={{ background: 'var(--border-subtle)' }} />

        <ToolbarButton
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="Align left"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="Align center"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="Align right"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z" />
          </svg>
        </ToolbarButton>

        <div className="mx-1 h-4 w-px" style={{ background: 'var(--border-subtle)' }} />

        <ToolbarButton
          active={false}
          onClick={addLink}
          title="Add link"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        </ToolbarButton>

        <div className="mx-1 h-4 w-px" style={{ background: 'var(--border-subtle)' }} />

        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
          </svg>
        </ToolbarButton>

        <div className="mx-1 h-4 w-px" style={{ background: 'var(--border-subtle)' }} />

        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
          </svg>
        </ToolbarButton>
      </div>

      <div className={quoteCollapsed ? 'compose-quote-collapsed' : ''}>
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .compose-quote-collapsed .ProseMirror blockquote,
        .compose-quote-collapsed .ProseMirror > div[style*="border-left"] {
          display: none;
        }
      `}</style>
      {content.includes('border-left') || content.includes('<blockquote') ? (
        <button
          type="button"
          onClick={() => setQuoteCollapsed(!quoteCollapsed)}
          className="mx-3 mb-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
        >
          <svg className={`h-3.5 w-3.5 transition-transform ${quoteCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {quoteCollapsed ? 'Show quoted text' : 'Hide quoted text'}
        </button>
      ) : null}
    </div>
  );
}
