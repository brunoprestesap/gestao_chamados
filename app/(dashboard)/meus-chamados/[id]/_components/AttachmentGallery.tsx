'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { notifyAttachmentAction } from '@/app/(dashboard)/meus-chamados/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import type { AttachmentListItem } from '@/shared/chamados/attachment.schemas';

interface AttachmentGalleryProps {
  chamadoId: string;
  canUpload: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CONTEXT_LABELS: Record<string, string> = {
  abertura: 'Abertura',
  execucao: 'Execução',
  comentario: 'Comentário',
  geral: 'Geral',
};

export function AttachmentGallery({ chamadoId, canUpload }: AttachmentGalleryProps) {
  const [attachments, setAttachments] = useState<AttachmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/chamados/${chamadoId}/attachments`);
      const json = await res.json();
      if (json.ok) {
        setAttachments(json.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [chamadoId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleUploadComplete = useCallback(
    async (file: UploadedFile) => {
      // Register in history via server action (uses attachmentId, fetches data from DB)
      await notifyAttachmentAction({
        chamadoId,
        attachmentId: file._id,
      });
      // Refresh list
      await fetchAttachments();
    },
    [chamadoId, fetchAttachments],
  );

  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));

  const navigateLightbox = useCallback(
    (direction: 1 | -1) => {
      if (lightboxIndex === null) return;
      const newIndex = lightboxIndex + direction;
      if (newIndex >= 0 && newIndex < images.length) {
        setLightboxIndex(newIndex);
      }
    },
    [lightboxIndex, images.length],
  );

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigateLightbox(-1);
      else if (e.key === 'ArrowRight') navigateLightbox(1);
      else if (e.key === 'Escape') setLightboxIndex(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, navigateLightbox]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Anexos {attachments.length > 0 && `(${attachments.length})`}
          </h3>
        </div>
        {canUpload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowUpload(!showUpload)}
          >
            <Plus className="size-3.5" />
            Adicionar
          </Button>
        )}
      </div>

      {/* Upload zone */}
      {showUpload && (
        <FileUpload
          chamadoId={chamadoId}
          context="geral"
          mode="immediate"
          onUploadComplete={handleUploadComplete}
          existingCount={attachments.length}
        />
      )}

      {/* Empty state */}
      {attachments.length === 0 && !showUpload && (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhum anexo.</p>
      )}

      {/* Gallery grid */}
      {attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {attachments.map((attachment) => {
            const isImage = attachment.mimeType.startsWith('image/');
            const imageIndex = isImage ? images.findIndex((img) => img._id === attachment._id) : -1;

            return (
              <div
                key={attachment._id}
                className="group relative overflow-hidden rounded-xl border border-border/50 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                {isImage ? (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(imageIndex)}
                    className="block aspect-square w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- URLs de anexo (API/uploads) */}
                    <img
                      src={attachment.url}
                      alt={attachment.originalName}
                      className="size-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="rounded-md bg-black/50 p-1">
                        <ImageIcon className="size-3.5 text-white" />
                      </div>
                    </div>
                  </button>
                ) : (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-muted/50 p-3"
                  >
                    <FileText className="size-8 text-muted-foreground" />
                    <span className="line-clamp-2 text-center text-xs font-medium">
                      {attachment.originalName}
                    </span>
                  </a>
                )}

                {/* Metadata bar */}
                <div className="border-t bg-background/80 px-2 py-1.5 backdrop-blur-sm">
                  <p className="truncate text-xs font-medium">{attachment.originalName}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{formatFileSize(attachment.size)}</span>
                    <span>{CONTEXT_LABELS[attachment.context] ?? attachment.context}</span>
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {attachment.user.name} —{' '}
                    {new Date(attachment.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Dialog */}
      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(open) => !open && setLightboxIndex(null)}
      >
        <DialogContent className="max-w-4xl border-0 bg-black/95 p-0 [&>button]:hidden">
          {lightboxIndex !== null && images[lightboxIndex] && (
            <div className="relative flex h-[80vh] items-center justify-center">
              {/* Close */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-10 text-white hover:bg-white/20"
                onClick={() => setLightboxIndex(null)}
              >
                <X className="size-5" />
              </Button>

              {/* Navigation */}
              {lightboxIndex > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={() => navigateLightbox(-1)}
                >
                  <ChevronLeft className="size-6" />
                </Button>
              )}
              {lightboxIndex < images.length - 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={() => navigateLightbox(1)}
                >
                  <ChevronRight className="size-6" />
                </Button>
              )}

              {/* Image */}
              {/* eslint-disable-next-line @next/next/no-img-element -- lightbox com URL dinâmica */}
              <img
                src={images[lightboxIndex].url}
                alt={images[lightboxIndex].originalName}
                className="max-h-full max-w-full object-contain"
              />

              {/* Bottom bar */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
                <div>
                  <p className="text-sm font-medium text-white">
                    {images[lightboxIndex].originalName}
                  </p>
                  <p className="text-xs text-white/60">
                    {images[lightboxIndex].user.name} —{' '}
                    {new Date(images[lightboxIndex].createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <a
                  href={images[lightboxIndex].url}
                  download={images[lightboxIndex].originalName}
                  className="rounded-lg bg-white/10 p-2 transition-colors hover:bg-white/20"
                >
                  <Download className="size-4 text-white" />
                </a>
              </div>

              {/* Counter */}
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80">
                {lightboxIndex + 1} / {images.length}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
