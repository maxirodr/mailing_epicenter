import { useState, useRef, useCallback, type DragEvent } from 'react';
import api from '../../services/api.ts';

interface UploadedFile {
  id: number;
  filename: string;
  size: number;
}

interface AttachmentUploaderProps {
  attachments: UploadedFile[];
  onAttachmentsChange: (attachments: UploadedFile[]) => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentUploader({ attachments, onAttachmentsChange }: AttachmentUploaderProps) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`File "${file.name}" exceeds 25MB limit`);
      return;
    }

    setError('');
    setUploadingCount((c) => c + 1);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post<{ id: number; filename: string; size: number }>(
        '/api/attachments/upload',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              setProgress(Math.round((e.loaded / e.total) * 100));
            }
          },
        },
      );
      // Use ref to always get current attachments, avoiding stale closure
      onAttachmentsChange([...attachmentsRef.current, data]);
    } catch {
      setError(`Failed to upload "${file.name}"`);
    } finally {
      setUploadingCount((c) => c - 1);
      setProgress(0);
    }
  }, [onAttachmentsChange]);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      void uploadFile(file);
    }
  }

  const uploading = uploadingCount > 0;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeAttachment(id: number) {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          rounded-lg border-2 border-dashed p-3 text-center transition-colors duration-150
          ${dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700'}
        `}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
          Attach files
        </button>
        <p className="mt-1 text-xs text-gray-600">or drag and drop (max 25MB)</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {uploading && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">{progress}% uploaded</p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-1.5"
            >
              <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              <span className="max-w-[150px] truncate text-xs text-gray-300">{att.filename}</span>
              <span className="text-xs text-gray-500">{formatSize(att.size)}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-gray-500 transition-colors hover:text-gray-300"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
