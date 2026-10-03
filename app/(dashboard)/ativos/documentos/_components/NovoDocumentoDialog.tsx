'use client';

import { FilePlus2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ACCEPT_DOCUMENTO,
  MAX_TAMANHO_DOCUMENTO,
  MAX_TAMANHO_DOCUMENTO_TEXTO,
} from '@/shared/ativos/documento.constants';
import type { ItemSeletorAtivo } from '@/shared/ativos/seletor.types';

import { SeletorAtivo } from '../../_components/SeletorAtivo';

export type OpcaoTipo = { chave: string; nome: string };
export type OpcaoLocal = { id: string; caminho: string };

/**
 * Cadastro de documento com arquivo (spec 0013, AC-3 e AC-15). Envia para
 * `POST /api/ativos/documentos` em multipart. Com `ativoFixo` (ficha), o alvo já
 * vem escolhido; sem ele (painel), escolhe entre um ativo e um local.
 */
export function NovoDocumentoDialog({
  tipos,
  ativoFixo,
  locais,
  tipoInicial,
  rotuloBotao = 'Novo documento',
  variante = 'default',
}: {
  tipos: OpcaoTipo[];
  ativoFixo?: { id: string; codigo: string };
  locais?: OpcaoLocal[];
  tipoInicial?: string;
  rotuloBotao?: string;
  variante?: 'default' | 'outline';
}) {
  const router = useRouter();
  const uid = useId();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState(tipoInicial ?? '');
  const [alvo, setAlvo] = useState<'ativo' | 'local'>('ativo');
  const [ativo, setAtivo] = useState<ItemSeletorAtivo | null>(null);
  const [localId, setLocalId] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [emitidoEm, setEmitidoEm] = useState('');
  const [validadeAte, setValidadeAte] = useState('');
  const [numero, setNumero] = useState('');
  const [emitidoPor, setEmitidoPor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function abrir() {
    setTipo(tipoInicial ?? '');
    setAlvo('ativo');
    setAtivo(null);
    setLocalId('');
    setArquivo(null);
    setEmitidoEm('');
    setValidadeAte('');
    setNumero('');
    setEmitidoPor('');
    setErro(null);
    setAberto(true);
  }

  function escolherArquivo(f: File | null) {
    setErro(null);
    if (f && f.size > MAX_TAMANHO_DOCUMENTO) {
      setArquivo(null);
      setErro(`O arquivo passa de ${MAX_TAMANHO_DOCUMENTO_TEXTO}. Envie um arquivo menor.`);
      return;
    }
    setArquivo(f);
  }

  const ativoId = ativoFixo?.id ?? (alvo === 'ativo' ? ativo?.id : undefined);
  const alvoLocal = !ativoFixo && alvo === 'local' ? localId : '';
  const temAlvo = Boolean(ativoId || alvoLocal);
  const podeEnviar = Boolean(tipo && temAlvo && arquivo && emitidoEm) && !enviando;

  async function enviar() {
    if (!arquivo) return;
    if (arquivo.size > MAX_TAMANHO_DOCUMENTO) {
      setErro(`O arquivo passa de ${MAX_TAMANHO_DOCUMENTO_TEXTO}. Envie um arquivo menor.`);
      return;
    }
    if (validadeAte && emitidoEm && validadeAte < emitidoEm) {
      setErro('A validade não pode ser anterior à emissão.');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const form = new FormData();
      form.set('tipo', tipo);
      if (ativoId) form.set('ativoId', ativoId);
      if (alvoLocal) form.set('localizacaoId', alvoLocal);
      form.set('emitidoEm', emitidoEm);
      if (validadeAte) form.set('validadeAte', validadeAte);
      if (numero.trim()) form.set('numero', numero.trim());
      if (emitidoPor.trim()) form.set('emitidoPor', emitidoPor.trim());
      form.set('arquivo', arquivo);

      const res = await fetch('/api/ativos/documentos', { method: 'POST', body: form });
      const corpo = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        substituidoId?: string;
      } | null;
      if (!res.ok || !corpo?.ok) {
        setErro(
          corpo?.error ??
            (res.status === 413
              ? `O arquivo passa de ${MAX_TAMANHO_DOCUMENTO_TEXTO}. Envie um arquivo menor.`
              : 'Não deu para salvar o documento. Tente de novo.'),
        );
        return;
      }
      toast.success(
        corpo.substituidoId
          ? 'Documento cadastrado. O anterior do mesmo tipo ficou como substituído.'
          : 'Documento cadastrado.',
      );
      setAberto(false);
      router.refresh();
    } catch {
      setErro('Sem conexão com o servidor. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  const id = (s: string) => `${uid}-${s}`;

  return (
    <>
      <Button
        size="sm"
        variant={variante}
        onClick={abrir}
        className={
          variante === 'default'
            ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700'
            : undefined
        }
      >
        <FilePlus2 className="h-4 w-4" aria-hidden />
        {rotuloBotao}
      </Button>

      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo documento</DialogTitle>
            <DialogDescription>
              {ativoFixo
                ? `Laudo ou certificado do ${ativoFixo.codigo}. Se já existe um vigente do mesmo tipo, ele fica como substituído.`
                : 'Laudo ou certificado de um ativo ou de um local. Se já existe um vigente do mesmo tipo, ele fica como substituído.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={id('tipo')}>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => v && setTipo(v)}>
                <SelectTrigger id={id('tipo')} className="w-full" aria-required>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.chave} value={t.chave}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!ativoFixo && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Documento de</legend>
                <div className="flex gap-2" role="radiogroup">
                  {(['ativo', 'local'] as const).map((op) => (
                    <Button
                      key={op}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={alvo === op}
                      variant={alvo === op ? 'default' : 'outline'}
                      onClick={() => setAlvo(op)}
                    >
                      {op === 'ativo' ? 'Um ativo' : 'Um local'}
                    </Button>
                  ))}
                </div>
                {alvo === 'ativo' ? (
                  <SeletorAtivo
                    valor={ativo}
                    onChange={setAtivo}
                    id={id('ativo')}
                    escopo="documentos"
                  />
                ) : (
                  <Select value={localId} onValueChange={(v) => v && setLocalId(v)}>
                    <SelectTrigger id={id('local')} className="w-full" aria-label="Local">
                      <SelectValue placeholder="Selecione o local" />
                    </SelectTrigger>
                    <SelectContent>
                      {(locais ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.caminho}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </fieldset>
            )}

            <div className="space-y-2">
              <Label htmlFor={id('arquivo')}>Arquivo</Label>
              <Input
                id={id('arquivo')}
                type="file"
                accept={ACCEPT_DOCUMENTO}
                aria-required
                aria-describedby={id('arquivo-ajuda')}
                onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              />
              <p id={id('arquivo-ajuda')} className="text-xs text-muted-foreground">
                PDF, JPEG, PNG ou WebP, até {MAX_TAMANHO_DOCUMENTO_TEXTO}.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={id('emitido')}>Emitido em</Label>
                <Input
                  id={id('emitido')}
                  type="date"
                  value={emitidoEm}
                  aria-required
                  onChange={(e) => setEmitidoEm(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={id('validade')}>Validade até (opcional)</Label>
                <Input
                  id={id('validade')}
                  type="date"
                  value={validadeAte}
                  min={emitidoEm || undefined}
                  onChange={(e) => setValidadeAte(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={id('numero')}>Número (opcional)</Label>
                <Input
                  id={id('numero')}
                  value={numero}
                  maxLength={80}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={id('emissor')}>Emitido por (opcional)</Label>
                <Input
                  id={id('emissor')}
                  value={emitidoPor}
                  maxLength={120}
                  onChange={(e) => setEmitidoPor(e.target.value)}
                />
              </div>
            </div>

            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={!podeEnviar}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Salvar documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
