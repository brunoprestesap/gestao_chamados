'use client';

import { Plus, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ReferenciaDTO } from '@/lib/material/serializar';
import { formatarReais } from '@/shared/chamados/custo';
import type { ReferenciaEntrada } from '@/shared/material/cotacao.schemas';
import { FONTE_REFERENCIA_MAX, FONTE_REFERENCIA_MIN } from '@/shared/material/material.constants';
import { ROTULO_PAPEL_REFERENCIA } from '@/shared/material/mensagens';
import { normalizarCodigoSinapi, reaisParaCentavos } from '@/shared/material/valores';

import { novoId } from './apoio';

/**
 * As referências de preço de um item do caminho 3 (spec 0019, fatia 4,
 * AC-32): a lista, com quem informou cada uma, e o formulário de uma nova. A
 * referência SINAPI leva só o código: preço e fonte vêm da tabela no servidor.
 */

const dataBr = (ymd: string) => ymd.split('-').reverse().join('/');

/** A lista das referências; a retirada pelo fiscal aparece riscada e não conta. */
export function ListaReferencias({
  referencias,
  onRetirar,
  desabilitado,
}: {
  referencias: readonly ReferenciaDTO[];
  /** Só o fiscal que assumiu retira, e só a referência que ele incluiu. */
  onRetirar?: (referenciaId: string) => void;
  desabilitado?: boolean;
}) {
  if (referencias.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem referência de preço.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {referencias.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={r.retirada ? 'text-muted-foreground line-through' : ''}>
            <span className="font-medium tabular-nums">
              {formatarReais(r.valorUnitarioCentavos)}
            </span>
            {r.unidade ? ` por ${r.unidade}` : ''} · {r.fonte} · {dataBr(r.data)}
          </span>
          <span className="text-muted-foreground">
            ({ROTULO_PAPEL_REFERENCIA[r.papel]}
            {r.autorNome ? `, ${r.autorNome}` : ''}
            {r.retirada ? ', retirada' : ''})
          </span>
          {onRetirar && r.papel === 'fiscal' && r.minha && !r.retirada && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              disabled={desabilitado}
              onClick={() => onRetirar(r.id)}
            >
              <Undo2 className="h-3 w-3" aria-hidden="true" />
              Retirar
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Formulário de uma referência nova. Devolve a entrada já no formato do
 * servidor, ou mostra o erro local (texto curto, valor inválido).
 */
export function FormReferencia({
  onAdicionar,
  desabilitado,
  rotuloBotao = 'Acrescentar referência',
}: {
  onAdicionar: (r: ReferenciaEntrada) => void;
  desabilitado?: boolean;
  rotuloBotao?: string;
}) {
  const id = useId();
  const [tipo, setTipo] = useState<'sinapi' | 'livre'>('sinapi');
  const [codigo, setCodigo] = useState('');
  const [fonte, setFonte] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  function adicionar() {
    setErro(null);
    if (tipo === 'sinapi') {
      const c = normalizarCodigoSinapi(codigo);
      if (!c) {
        setErro('Código SINAPI inválido: use só números.');
        return;
      }
      onAdicionar({ id: novoId(), sinapiCodigo: c });
      setCodigo('');
      return;
    }
    const centavos = reaisParaCentavos(valor);
    if (fonte.trim().length < FONTE_REFERENCIA_MIN) {
      setErro(`Diga a fonte (de ${FONTE_REFERENCIA_MIN} a ${FONTE_REFERENCIA_MAX} caracteres).`);
      return;
    }
    if (!centavos) {
      setErro('Informe o valor em reais, com até 2 casas.');
      return;
    }
    if (!data) {
      setErro('Informe a data da referência.');
      return;
    }
    onAdicionar({ id: novoId(), fonte: fonte.trim(), valorUnitarioCentavos: centavos, data });
    setFonte('');
    setValor('');
    setData('');
  }

  return (
    <fieldset className="space-y-2 rounded-lg border border-dashed border-border p-2">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Nova referência</legend>
      <RadioGroup
        aria-label="Tipo da referência"
        value={tipo}
        onValueChange={(v) => setTipo(v as 'sinapi' | 'livre')}
        className="flex flex-wrap gap-4 text-xs"
      >
        <div className="flex items-center gap-1.5">
          <RadioGroupItem id={`tipo-sinapi-${id}`} value="sinapi" />
          <Label htmlFor={`tipo-sinapi-${id}`} className="text-xs font-normal">
            Insumo do SINAPI
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <RadioGroupItem id={`tipo-livre-${id}`} value="livre" />
          <Label htmlFor={`tipo-livre-${id}`} className="text-xs font-normal">
            Outra fonte
          </Label>
        </div>
      </RadioGroup>
      {tipo === 'sinapi' ? (
        <div className="space-y-1">
          <Label htmlFor={`cod-${id}`} className="text-xs">
            Código SINAPI (o preço vem do mês mais recente)
          </Label>
          <Input
            id={`cod-${id}`}
            inputMode="numeric"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_9rem]">
          <div className="space-y-1">
            <Label htmlFor={`fonte-${id}`} className="text-xs">
              Fonte da referência
            </Label>
            <Input
              id={`fonte-${id}`}
              value={fonte}
              maxLength={FONTE_REFERENCIA_MAX}
              placeholder="Ex.: painel de preços, contrato de outro órgão"
              onChange={(e) => setFonte(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`valor-${id}`} className="text-xs">
              Valor unitário
            </Label>
            <Input
              id={`valor-${id}`}
              inputMode="decimal"
              placeholder="R$"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`data-${id}`} className="text-xs">
              Data da referência
            </Label>
            <Input
              id={`data-${id}`}
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        disabled={desabilitado}
        onClick={adicionar}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {rotuloBotao}
      </Button>
    </fieldset>
  );
}
