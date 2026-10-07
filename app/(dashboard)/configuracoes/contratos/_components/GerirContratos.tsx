'use client';

import { FileSignature, Loader2, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import type { TipoServico } from '@/shared/chamados/tipo-servico';
import { formatarYmd } from '@/shared/contratos/janela';
import type { ContratoDoRelatorio } from '@/shared/contratos/relatorio.types';

import {
  alterarSituacaoContratoAction,
  criarContratoAction,
  editarContratoAction,
} from '../actions';

type Formulario = {
  numero: string;
  empresa: string;
  cnpj: string;
  processoSei: string;
  objeto: string;
  fiscal: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  tiposServico: TipoServico[];
};

const VAZIO: Formulario = {
  numero: '',
  empresa: '',
  cnpj: '',
  processoSei: '',
  objeto: '',
  fiscal: '',
  vigenciaInicio: '',
  vigenciaFim: '',
  tiposServico: [],
};

function doContrato(c: ContratoDoRelatorio): Formulario {
  return {
    numero: c.numero,
    empresa: c.empresa,
    cnpj: c.cnpjFormatado,
    processoSei: c.processoSei,
    objeto: c.objeto ?? '',
    fiscal: c.fiscal ?? '',
    vigenciaInicio: c.vigenciaInicio,
    vigenciaFim: c.vigenciaFim,
    tiposServico: [...c.tiposServico],
  };
}

/** Lista e cadastro de contratos (spec 0016, AC-1 a AC-4). Não existe apagar. */
export function GerirContratos({ contratos }: { contratos: ContratoDoRelatorio[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<ContratoDoRelatorio | 'novo' | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const [alternando, setAlternando] = useState<string | null>(null);

  function abrir(c: ContratoDoRelatorio | 'novo') {
    setEditando(c);
    setErro(null);
    setForm(c === 'novo' ? VAZIO : doContrato(c));
  }

  function campo<K extends keyof Formulario>(k: K, v: Formulario[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function alternarTipo(tipo: TipoServico, marcado: boolean) {
    setForm((f) => ({
      ...f,
      tiposServico: marcado
        ? TIPO_SERVICO_OPTIONS.filter((t) => t === tipo || f.tiposServico.includes(t))
        : f.tiposServico.filter((t) => t !== tipo),
    }));
  }

  function salvar() {
    if (!editando) return;
    setErro(null);
    iniciar(async () => {
      const r =
        editando === 'novo'
          ? await criarContratoAction(form)
          : await editarContratoAction({ id: editando.id, ...form });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(editando === 'novo' ? 'Contrato cadastrado.' : 'Contrato atualizado.');
      setEditando(null);
      router.refresh();
    });
  }

  async function alternarSituacao(c: ContratoDoRelatorio) {
    setAlternando(c.id);
    const r = await alterarSituacaoContratoAction({ id: c.id, isActive: !c.isActive });
    setAlternando(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      c.isActive
        ? `Contrato ${c.numero} inativado. Os relatórios dos meses da vigência continuam disponíveis.`
        : `Contrato ${c.numero} reativado.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Inativo continua valendo para o passado: ele segue no{' '}
          <Link href="/relatorios/contrato" className="font-medium text-primary hover:underline">
            relatório por contrato
          </Link>
          .
        </p>
        <Button
          onClick={() => abrir('novo')}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Novo contrato
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        {contratos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileSignature className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium">Nenhum contrato cadastrado</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Cadastre o contrato com a vigência e os tipos de serviço que ele cobre para gerar o
              relatório mensal.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Tipos de serviço</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratos.map((c) => (
                  <TableRow key={c.id} className={c.isActive ? undefined : 'opacity-70'}>
                    <TableCell>
                      <p className="font-medium">{c.numero}</p>
                      <p className="text-xs text-muted-foreground">{c.empresa}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.tiposServico.map((t) => (
                          <Badge key={t} variant="secondary" className="rounded-full">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatarYmd(c.vigenciaInicio)} a {formatarYmd(c.vigenciaFim)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full">
                        {c.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrir(c)}
                          aria-label={`Editar contrato ${c.numero}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void alternarSituacao(c)}
                          disabled={alternando === c.id}
                          aria-label={
                            c.isActive
                              ? `Inativar contrato ${c.numero}`
                              : `Reativar contrato ${c.numero}`
                          }
                          className="text-muted-foreground"
                        >
                          {alternando === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : c.isActive ? (
                            <PowerOff className="h-4 w-4" aria-hidden />
                          ) : (
                            <Power className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editando === 'novo' ? 'Novo contrato' : `Editar contrato ${editando?.numero ?? ''}`}
            </DialogTitle>
            <DialogDescription>
              Dois contratos não podem cobrir o mesmo tipo de serviço em vigências que se cruzam.
              Mês com relatório emitido não perde tipo nem vigência.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contrato-numero">Número</Label>
              <Input
                id="contrato-numero"
                value={form.numero}
                maxLength={40}
                onChange={(e) => campo('numero', e.target.value)}
                placeholder="12/2025"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-processo">Processo SEI</Label>
              <Input
                id="contrato-processo"
                value={form.processoSei}
                maxLength={40}
                onChange={(e) => campo('processoSei', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contrato-empresa">Empresa contratada</Label>
              <Input
                id="contrato-empresa"
                value={form.empresa}
                maxLength={160}
                onChange={(e) => campo('empresa', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-cnpj">CNPJ</Label>
              <Input
                id="contrato-cnpj"
                value={form.cnpj}
                inputMode="numeric"
                maxLength={18}
                onChange={(e) => campo('cnpj', e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-fiscal">Fiscal (opcional)</Label>
              <Input
                id="contrato-fiscal"
                value={form.fiscal}
                maxLength={120}
                onChange={(e) => campo('fiscal', e.target.value)}
                aria-describedby="contrato-fiscal-ajuda"
              />
              <p id="contrato-fiscal-ajuda" className="text-xs text-muted-foreground">
                Sai no cabeçalho do PDF.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-inicio">Início da vigência</Label>
              <Input
                id="contrato-inicio"
                type="date"
                value={form.vigenciaInicio}
                onChange={(e) => campo('vigenciaInicio', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-fim">Fim da vigência</Label>
              <Input
                id="contrato-fim"
                type="date"
                value={form.vigenciaFim}
                onChange={(e) => campo('vigenciaFim', e.target.value)}
              />
            </div>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">Tipos de serviço cobertos</legend>
              <div className="flex flex-wrap gap-4 pt-1">
                {TIPO_SERVICO_OPTIONS.map((tipo) => {
                  const id = `contrato-tipo-${tipo}`;
                  return (
                    <div key={tipo} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={form.tiposServico.includes(tipo)}
                        onCheckedChange={(v) => alternarTipo(tipo, v === true)}
                      />
                      <Label htmlFor={id} className="font-normal">
                        {tipo}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contrato-objeto">Objeto (opcional)</Label>
              <Textarea
                id="contrato-objeto"
                value={form.objeto}
                maxLength={300}
                rows={2}
                onChange={(e) => campo('objeto', e.target.value)}
              />
            </div>
            {erro && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
