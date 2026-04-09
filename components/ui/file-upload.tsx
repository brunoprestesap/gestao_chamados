'use client';

import { FileUp, Loader2, Paperclip, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS_PER_TICKET,
  MAX_FILE_SIZE,
} from '@/shared/chamados/attachment.schemas';

import { Button } from './button';

export interface UploadedFile {
  _id: string;
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

interface FileUploadProps {
  chamadoId?: string;
  context?: 'abertura' | 'execucao' | 'comentario' | 'geral';
  onUploadComplete?: (file: UploadedFile) => void;
  onFilesChange?: (files: File[]) => void;
  maxFiles?: number;
  /** Mode: 'immediate' uploads on select, 'deferred' collects files for later upload */
  mode?: 'immediate' | 'deferred';
  accept?: string;
  existingCount?: number;
  className?: string;
}

interface PendingFile {
  id: string;
  file: File;
  preview?: string;
  uploading: boolean;
  error?: string;
  uploaded?: UploadedFile;
}

let fileIdCounter = 0;
function nextFileId(): string {
  fileIdCounter += 1;
  return `pf-${fileIdCounter}-${Date.now()}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  chamadoId,
  context = 'geral',
  onUploadComplete,
  onFilesChange,
  maxFiles = MAX_ATTACHMENTS_PER_TICKET,
  mode = 'immediate',
  accept = ALLOWED_MIME_TYPES.join(','),
  existingCount = 0,
  className,
}: FileUploadProps) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
       
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
    // Only run cleanup on unmount — intentionally empty deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remainingSlots = maxFiles - existingCount - files.filter((f) => !f.error).length;

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        return 'Tipo não permitido. Aceitos: JPEG, PNG, WebP, PDF.';
      }
      if (file.size > MAX_FILE_SIZE) {
        return 'Arquivo excede 5MB.';
      }
      if (remainingSlots <= 0) {
        return `Limite de ${maxFiles} anexos atingido.`;
      }
      return null;
    },
    [remainingSlots, maxFiles],
  );

  const uploadFileById = useCallback(
    async (fileId: string, fileToUpload: File) => {
      if (!chamadoId) return;

      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, uploading: true, error: undefined } : f)),
      );

      try {
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('chamadoId', chamadoId);
        formData.append('context', context);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();

        if (!json.ok) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, uploading: false, error: json.error } : f,
            ),
          );
          return;
        }

        const uploaded: UploadedFile = json.data;
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, uploading: false, uploaded } : f,
          ),
        );
        onUploadComplete?.(uploaded);
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, uploading: false, error: 'Erro no upload.' } : f,
          ),
        );
      }
    },
    [chamadoId, context, onUploadComplete],
  );

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const pending: PendingFile[] = fileArray.map((file) => {
        const error = validateFile(file);
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        return { id: nextFileId(), file, preview, uploading: false, error: error ?? undefined };
      });

      setFiles((prev) => {
        const next = [...prev, ...pending];
        if (mode === 'deferred' && onFilesChange) {
          onFilesChange(next.filter((f) => !f.error).map((f) => f.file));
        }
        return next;
      });

      // In immediate mode, auto-upload valid files
      if (mode === 'immediate' && chamadoId) {
        for (const pf of pending) {
          if (!pf.error) {
            void uploadFileById(pf.id, pf.file);
          }
        }
      }
    },
    [validateFile, mode, chamadoId, uploadFileById, onFilesChange],
  );

  const removeFile = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        const target = prev.find((f) => f.id === fileId);
        if (target?.preview) URL.revokeObjectURL(target.preview);
        const next = prev.filter((f) => f.id !== fileId);
        if (mode === 'deferred' && onFilesChange) {
          onFilesChange(next.filter((f) => !f.error).map((f) => f.file));
        }
        return next;
      });
    },
    [mode, onFilesChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border/50 hover:border-primary/50 hover:bg-muted/50',
        )}
      >
        <FileUp className="size-8 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">
          Arraste arquivos aqui ou{' '}
          <span className="font-medium text-primary">clique para selecionar</span>
        </p>
        <p className="text-center text-xs text-muted-foreground/70">
          JPEG, PNG, WebP ou PDF — máx. 5MB por arquivo
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((pf) => (
            <li
              key={pf.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                pf.error
                  ? 'border-destructive/30 bg-destructive/5'
                  : pf.uploaded
                    ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-border/50',
              )}
            >
              {/* Thumbnail / icon */}
              {pf.preview ? (
                <img
                  src={pf.preview}
                  alt={pf.file.name}
                  className="size-10 rounded-lg object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Paperclip className="size-4 text-muted-foreground" />
                </div>
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pf.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(pf.file.size)}</p>
                {pf.error && <p className="text-xs text-destructive">{pf.error}</p>}
              </div>

              {/* Status / actions */}
              {pf.uploading ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : pf.uploaded ? (
                <span className="text-xs font-medium text-emerald-600">Enviado</span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(pf.id);
                  }}
                >
                  {pf.error ? (
                    <X className="size-4 text-destructive" />
                  ) : (
                    <Trash2 className="size-4 text-muted-foreground" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {remainingSlots <= 5 && remainingSlots > 0 && (
        <p className="text-xs text-muted-foreground">
          {remainingSlots} {remainingSlots === 1 ? 'anexo restante' : 'anexos restantes'}
        </p>
      )}
    </div>
  );
}

/**
 * Upload a list of files (deferred mode) to a chamado.
 * Returns the list of successfully uploaded files.
 */
export async function uploadDeferredFiles(
  files: File[],
  chamadoId: string,
  context: string = 'geral',
): Promise<UploadedFile[]> {
  const results: UploadedFile[] = [];

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chamadoId', chamadoId);
    formData.append('context', context);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (json.ok) {
        results.push(json.data);
      }
    } catch {
      // Continue with remaining files
    }
  }

  return results;
}
