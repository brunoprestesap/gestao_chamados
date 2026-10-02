'use client';

import { Camera, CameraOff, Keyboard, Loader2, PackagePlus, ScanLine, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ehCodigoInterno, normalizarCodigo } from '@/lib/ativos/codigo';

import { useLeitorCamera } from '../../_components/useLeitorCamera';

type Resultado =
  | { tipo: 'nao_encontrado'; codigo: string }
  | { tipo: 'erro'; mensagem: string }
  | null;

/**
 * Leitura de etiqueta (spec 0011, AC-11 e AC-12): campo de texto (que também
 * recebe leitor USB, que digita e dá Enter) e câmera, quando o contexto é
 * seguro. Código encontrado leva à ficha.
 */
export function LeitorEtiqueta({ podeCadastrar }: { podeCadastrar: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);
  const camera = useLeitorCamera((valor) => {
    setTexto(normalizarCodigo(valor));
    void buscar(valor);
  });
  const { disponivel: cameraDisponivel, lendo, abrindo, erro: erroCamera, videoRef } = camera;
  const inputRef = useRef<HTMLInputElement>(null);

  async function buscar(bruto: string) {
    const codigo = normalizarCodigo(bruto);
    if (!codigo) return;
    setBuscando(true);
    setResultado(null);
    try {
      const res = await fetch(`/api/ativos/por-codigo/${encodeURIComponent(codigo)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        router.push(`/ativos/${id}`);
        return;
      }
      if (res.status === 404) {
        setResultado({ tipo: 'nao_encontrado', codigo });
      } else {
        setResultado({ tipo: 'erro', mensagem: 'Não foi possível buscar agora. Tente de novo.' });
      }
    } catch {
      setResultado({ tipo: 'erro', mensagem: 'Sem conexão com o servidor. Tente de novo.' });
    } finally {
      setBuscando(false);
    }
  }

  function iniciarCamera() {
    setResultado(null);
    void camera.iniciar();
  }

  const atalhoCadastro =
    resultado?.tipo === 'nao_encontrado' && podeCadastrar && !ehCodigoInterno(resultado.codigo);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section
        aria-labelledby="titulo-digitar"
        className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6 lg:col-span-3"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400"
        />
        <h2 id="titulo-digitar" className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Keyboard className="h-4 w-4" aria-hidden />
          </span>
          Digite ou use o leitor USB
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O leitor USB digita o código e dá Enter sozinho. Zeros à esquerda e espaços não
          atrapalham.
        </p>
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void buscar(texto);
          }}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="codigo-ativo">Tombamento ou código MNT</Label>
            <Input
              id="codigo-ativo"
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoFocus
              autoComplete="off"
              inputMode="text"
              placeholder="Ex.: 11997 ou MNT-0001"
              className="h-11 rounded-xl font-mono text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={buscando || !texto.trim()}
            className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
          >
            {buscando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ScanLine className="h-4 w-4" aria-hidden />
            )}
            Abrir ficha
          </Button>
        </form>

        <div aria-live="polite" className="mt-5 empty:hidden">
          {resultado?.tipo === 'nao_encontrado' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-100">
                <SearchX className="h-4 w-4" aria-hidden />
                Ativo não cadastrado
              </p>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                Nenhum equipamento com o código{' '}
                <span className="font-mono font-semibold">{resultado.codigo}</span>.
              </p>
              {atalhoCadastro && (
                <Button asChild size="sm" variant="outline" className="mt-3 bg-background">
                  <Link href={`/ativos/novo?tombamento=${encodeURIComponent(resultado.codigo)}`}>
                    <PackagePlus className="h-4 w-4" aria-hidden />
                    Cadastrar este ativo
                  </Link>
                </Button>
              )}
            </div>
          )}
          {resultado?.tipo === 'erro' && (
            <p role="alert" className="text-sm text-destructive">
              {resultado.mensagem}
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="titulo-camera"
        className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6 lg:col-span-2"
      >
        <h2 id="titulo-camera" className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Camera className="h-4 w-4" aria-hidden />
          </span>
          Ler pela câmera
        </h2>

        {cameraDisponivel === false && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
            <CameraOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              A câmera só funciona quando o Sigma é aberto por HTTPS. Por enquanto, digite o código
              da etiqueta ou use o leitor USB ao lado.
            </p>
          </div>
        )}

        {cameraDisponivel && (
          <div className="mt-4 space-y-3">
            <div
              className={
                lendo
                  ? 'relative overflow-hidden rounded-xl border border-border/60 bg-black'
                  : 'hidden'
              }
            >
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-[4/3] w-full object-cover"
                aria-label="Imagem da câmera"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500/80"
              />
            </div>
            {lendo ? (
              <Button variant="outline" className="w-full" onClick={camera.parar}>
                <CameraOff className="h-4 w-4" aria-hidden />
                Parar câmera
              </Button>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Aponte para o código de barras ou o QR da etiqueta patrimonial.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={iniciarCamera}
                  disabled={abrindo}
                >
                  {abrindo ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden />
                  )}
                  {abrindo ? 'Abrindo câmera…' : 'Abrir câmera'}
                </Button>
              </>
            )}
            {erroCamera && (
              <p role="alert" className="text-sm text-destructive">
                {erroCamera}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
