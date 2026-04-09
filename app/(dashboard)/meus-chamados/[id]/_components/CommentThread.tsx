'use client';

import { Eye, EyeOff, Loader2, MessageSquare, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addCommentAction } from '@/app/(dashboard)/meus-chamados/actions';
import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import type { CommentListItem, CommentVisibility } from '@/shared/chamados/comment.schemas';

type Props = {
  chamadoId: string;
  userRole: string;
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function CommentThread({ chamadoId, userRole }: Props) {
  const timezone = useInstitutionalTimezone();
  const tzOpt = { timeZone: timezone };
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [comments, setComments] = useState<CommentListItem[]>([]);
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('publico');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const canToggleVisibility =
    userRole === 'Admin' || userRole === 'Preposto' || userRole === 'Técnico';

  const fetchComments = useCallback(async () => {
    try {
      setFetchError(false);
      const res = await fetch(`/api/chamados/${chamadoId}/comments`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setComments((data.items ?? []) as CommentListItem[]);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [chamadoId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Scroll to bottom when new comments arrive
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (comments.length > prevCountRef.current && prevCountRef.current > 0) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = comments.length;
  }, [comments.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await addCommentAction({
      chamadoId,
      content: content.trim(),
      visibility,
    });

    if (result.ok) {
      setContent('');
      setVisibility('publico');
      await fetchComments();
    } else {
      setError(result.error);
    }

    setSubmitting(false);
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comentários
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : fetchError ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Erro ao carregar comentários.{' '}
            <button
              type="button"
              onClick={fetchComments}
              className="text-primary underline hover:no-underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nenhum comentário ainda. Seja o primeiro a comentar.
          </div>
        ) : (
          <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
            {comments.map((comment) => (
              <div
                key={comment._id}
                className={`rounded-xl border p-3 transition-colors ${
                  comment.visibility === 'interno'
                    ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20'
                    : 'border-border/50 bg-card'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar initials */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {getInitials(comment.userName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{comment.userName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(comment.createdAt, tzOpt)}
                      </span>
                      {comment.visibility === 'interno' && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                        >
                          <EyeOff className="mr-1 h-3 w-3" />
                          Interno
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <div ref={listEndRef} />
          </div>
        )}

        {/* New comment form */}
        <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Adicione um comentário..."
            rows={3}
            maxLength={5000}
            className="resize-none rounded-xl"
            disabled={submitting}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            {canToggleVisibility ? (
              <button
                type="button"
                onClick={() => setVisibility((v) => (v === 'publico' ? 'interno' : 'publico'))}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  visibility === 'interno'
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {visibility === 'interno' ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    Interno
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    Público
                  </>
                )}
              </button>
            ) : (
              <div />
            )}

            <Button
              type="submit"
              disabled={!content.trim() || submitting}
              size="sm"
              className="gap-1.5 bg-linear-to-r from-indigo-600 to-blue-600 shadow-sm shadow-indigo-500/20"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
