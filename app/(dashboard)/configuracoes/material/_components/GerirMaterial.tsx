'use client';

import {
  AlertTriangle,
  BadgeCheck,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Plus,
  Power,
  Scale,
  Table2,
  UserCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EmpenhoLinha, PainelMaterial } from '@/lib/material/cadastro';
import type { TabelasPreco } from '@/lib/material/tabelas';
import { formatarReais } from '@/shared/chamados/custo';
import {
  PAPEIS_DESIGNACAO,
  type PapelDesignacao,
  PERFIS_POR_PAPEL,
  TAXA_ADMINISTRACAO_MATERIAL,
} from '@/shared/material/material.constants';
import { ROTULO_PAPEL_DESIGNACAO } from '@/shared/material/mensagens';
import { reaisParaCentavos } from '@/shared/material/valores';

import {
  alterarSituacaoEmpenhoAction,
  criarDesignacaoAction,
  criarEmpenhoAction,
  criarFaixaAction,
  desativarFaixaAction,
  movimentarEmpenhoAction,
  revogarDesignacaoAction,
} from '../actions';
import { AbaAnexoV, AbaSinapi } from './TabelasPreco';

type Resultado = { ok: true } | { ok: false; error: string };

const SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function dataBr(ymd: string | null): string {
  if (!ymd) return 'sem fim';
  const [a, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Abas do cadastro do material (spec 0019, AC-19, e o Anexo V e o SINAPI da fatia 3). */
export function GerirMaterial({
  painel,
  tabelas,
}: {
  painel: PainelMaterial;
  tabelas: TabelasPreco;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function executar(fn: () => Promise<Resultado>, sucesso: string, depois?: () => void) {
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {(painel.faltando.length > 0 || painel.itensSemCodigo.length > 0) && (
        <section
          aria-labelledby="faltando-titulo"
          className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 dark:border-amber-700/50 dark:bg-amber-950/30"
        >
          <h2
            id="faltando-titulo"
            className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />O que falta
          </h2>
          {painel.faltando.length > 0 && (
            <>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-amber-900 dark:text-amber-100">
                {painel.faltando.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/80">
                Sem empenho e designações, a cotação é montada e analisada, mas não é encaminhada
                nem aprovada. Sem Anexo V ou SINAPI, a busca não oferece o caminho dela.
              </p>
            </>
          )}
          {painel.itensSemCodigo.length > 0 && (
            <details className="mt-3 text-sm text-amber-900 dark:text-amber-100">
              <summary className="cursor-pointer font-medium">
                {painel.itensSemCodigo.length} itens do Anexo V sem código SINAPI (sem referência
                para comparar o preço)
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-6">
                {painel.itensSemCodigo.map((i) => (
                  <li key={`${i.contrato}-${i.numero}`}>
                    Contrato {i.contrato}, item {i.numero}: {i.descricao}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Taxa de administração sobre material:{' '}
        <span className="font-medium text-foreground">
          {formatarReais(TAXA_ADMINISTRACAO_MATERIAL)}
        </span>{' '}
        (fixa em zero pelo contrato, sem edição).
      </p>

      <Tabs defaultValue="empenhos">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="empenhos" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <Landmark className="h-4 w-4" aria-hidden="true" />
            Empenhos
          </TabsTrigger>
          <TabsTrigger value="designacoes" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Designações
          </TabsTrigger>
          <TabsTrigger value="faixas" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <Scale className="h-4 w-4" aria-hidden="true" />
            Faixas
          </TabsTrigger>
          <TabsTrigger value="anexo-v" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Anexo V
          </TabsTrigger>
          <TabsTrigger value="sinapi" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <Table2 className="h-4 w-4" aria-hidden="true" />
            SINAPI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empenhos" className="mt-6 focus-visible:outline-none">
          <Empenhos empenhos={painel.empenhos} pendente={pendente} executar={executar} />
        </TabsContent>
        <TabsContent value="designacoes" className="mt-6 focus-visible:outline-none">
          <Designacoes painel={painel} pendente={pendente} executar={executar} />
        </TabsContent>
        <TabsContent value="faixas" className="mt-6 focus-visible:outline-none">
          <Faixas painel={painel} pendente={pendente} executar={executar} />
        </TabsContent>
        <TabsContent value="anexo-v" className="mt-6 focus-visible:outline-none">
          <AbaAnexoV tabelas={tabelas} />
        </TabsContent>
        <TabsContent value="sinapi" className="mt-6 focus-visible:outline-none">
          <AbaSinapi tabelas={tabelas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Executar = (fn: () => Promise<Resultado>, sucesso: string, depois?: () => void) => void;

function Empenhos({
  empenhos,
  pendente,
  executar,
}: {
  empenhos: EmpenhoLinha[];
  pendente: boolean;
  executar: Executar;
}) {
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({
    numero: '',
    exercicio: String(new Date().getFullYear()),
    valor: '',
    vigenciaFim: '',
  });
  const [movendo, setMovendo] = useState<EmpenhoLinha | null>(null);
  const [mov, setMov] = useState({ tipo: 'reforco' as 'reforco' | 'anulacao', valor: '', ato: '' });

  function criar() {
    const valor = reaisParaCentavos(form.valor);
    if (valor == null) {
      toast.error('Informe o valor em reais, como 12.345,67.');
      return;
    }
    executar(
      () =>
        criarEmpenhoAction({
          numero: form.numero,
          exercicio: Number(form.exercicio),
          valorInicialCentavos: valor,
          vigenciaFim: form.vigenciaFim || null,
        }),
      'Empenho cadastrado.',
      () => setNovo(false),
    );
  }

  function movimentar() {
    if (!movendo) return;
    const valor = reaisParaCentavos(mov.valor);
    if (valor == null) {
      toast.error('Informe o valor em reais, como 1.000,00.');
      return;
    }
    executar(
      () =>
        movimentarEmpenhoAction({
          empenhoId: movendo.id,
          tipo: mov.tipo,
          valorCentavos: valor,
          ato: mov.ato,
        }),
      mov.tipo === 'reforco' ? 'Reforço registrado.' : 'Anulação registrada.',
      () => setMovendo(null),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNovo(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo empenho
        </Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Exercício</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="text-right">Comprometido</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empenhos.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Nenhum empenho cadastrado.
                </TableCell>
              </TableRow>
            )}
            {empenhos.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.numero}</TableCell>
                <TableCell>{e.exercicio}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarReais(e.valorLiquidoCentavos)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarReais(e.comprometidoCentavos)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatarReais(e.saldoCentavos)}
                </TableCell>
                <TableCell>{dataBr(e.vigenciaFim)}</TableCell>
                <TableCell>
                  {e.elegivel ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 dark:text-emerald-300"
                    >
                      Elegível
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {e.ativo ? 'Fora do exercício ou vencido' : 'Inativo'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                    onClick={() => {
                      setMovendo(e);
                      setMov({ tipo: 'reforco', valor: '', ato: '' });
                    }}
                  >
                    Movimento
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendente}
                    aria-label={
                      e.ativo ? `Inativar empenho ${e.numero}` : `Reativar empenho ${e.numero}`
                    }
                    onClick={() =>
                      executar(
                        () => alterarSituacaoEmpenhoAction({ empenhoId: e.id, ativo: !e.ativo }),
                        e.ativo ? 'Empenho inativado.' : 'Empenho reativado.',
                      )
                    }
                  >
                    <Power className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Novo empenho</DialogTitle>
            <DialogDescription>
              O valor inicial vira o líquido; reforço e anulação entram depois como movimentos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emp-numero">Número</Label>
              <Input
                id="emp-numero"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                placeholder="2026NE000123"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-exercicio">Exercício</Label>
              <Input
                id="emp-exercicio"
                inputMode="numeric"
                value={form.exercicio}
                onChange={(e) => setForm({ ...form, exercicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-valor">Valor inicial (R$)</Label>
              <Input
                id="emp-valor"
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="50.000,00"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emp-fim">Fim da vigência (opcional)</Label>
              <Input
                id="emp-fim"
                type="date"
                value={form.vigenciaFim}
                onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pendente}>
              {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!movendo} onOpenChange={(o) => !o && setMovendo(null)}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Movimento do empenho {movendo?.numero}</DialogTitle>
            <DialogDescription>
              A anulação é recusada se deixar o líquido abaixo do que já está comprometido.
            </DialogDescription>
          </DialogHeader>
          {movendo && movendo.movimentos.length > 0 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {movendo.movimentos.map((m, i) => (
                <li key={i}>
                  {m.tipo === 'reforco' ? 'Reforço' : 'Anulação'} de{' '}
                  {formatarReais(m.valorCentavos)} · {m.ato} ·{' '}
                  {new Date(m.em).toLocaleDateString('pt-BR')}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-tipo">Tipo</Label>
              <select
                id="mov-tipo"
                className={SELECT}
                value={mov.tipo}
                onChange={(e) => setMov({ ...mov, tipo: e.target.value as 'reforco' | 'anulacao' })}
              >
                <option value="reforco">Reforço</option>
                <option value="anulacao">Anulação</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-valor">Valor (R$)</Label>
              <Input
                id="mov-valor"
                inputMode="decimal"
                value={mov.valor}
                onChange={(e) => setMov({ ...mov, valor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-ato">Ato (documento SEI)</Label>
              <Input
                id="mov-ato"
                value={mov.ato}
                onChange={(e) => setMov({ ...mov, ato: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovendo(null)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={movimentar} disabled={pendente}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Designacoes({
  painel,
  pendente,
  executar,
}: {
  painel: PainelMaterial;
  pendente: boolean;
  executar: Executar;
}) {
  const [nova, setNova] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    papel: 'fiscal' as PapelDesignacao,
    faixaId: '',
    vigenciaInicio: '',
    vigenciaFim: '',
    ato: '',
  });
  const [mostrarRevogadas, setMostrarRevogadas] = useState(false);
  const usuarios = painel.usuarios.filter((u) => PERFIS_POR_PAPEL[form.papel].includes(u.role));
  const faixasAtivas = painel.faixas.filter((f) => f.ativa);
  const lista = painel.designacoes.filter((d) => mostrarRevogadas || !d.revogadaEm);

  function criar() {
    executar(
      () =>
        criarDesignacaoAction({
          userId: form.userId,
          papel: form.papel,
          faixaId: form.papel === 'aprovador' ? form.faixaId || null : null,
          vigenciaInicio: form.vigenciaInicio,
          vigenciaFim: form.vigenciaFim || null,
          ato: form.ato,
        }),
      'Designação registrada.',
      () => setNova(false),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={mostrarRevogadas}
            onChange={(e) => setMostrarRevogadas(e.target.checked)}
          />
          Mostrar revogadas
        </label>
        <Button onClick={() => setNova(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova designação
        </Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Faixa</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Ato</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma designação.
                </TableCell>
              </TableRow>
            )}
            {lista.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.nome}</TableCell>
                <TableCell>{ROTULO_PAPEL_DESIGNACAO[d.papel]}</TableCell>
                <TableCell>{d.faixa ?? '—'}</TableCell>
                <TableCell>
                  {dataBr(d.vigenciaInicio)} a {dataBr(d.vigenciaFim)}
                </TableCell>
                <TableCell className="max-w-[12rem] truncate">{d.ato}</TableCell>
                <TableCell>
                  {d.revogadaEm ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Revogada
                    </Badge>
                  ) : d.vigente ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 dark:text-emerald-300"
                    >
                      Vigente
                    </Badge>
                  ) : (
                    <Badge variant="outline">Fora da vigência</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!d.revogadaEm && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendente}
                      onClick={() =>
                        executar(
                          () => revogarDesignacaoAction({ designacaoId: d.id }),
                          'Designação revogada.',
                        )
                      }
                    >
                      Revogar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nova designação</DialogTitle>
            <DialogDescription>
              Fiscal, gestor e aprovador só podem ser Admin; responsável técnico, Preposto ou
              Técnico. Mudar um limite é criar faixa nova e designar de novo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="des-papel">Papel</Label>
              <select
                id="des-papel"
                className={SELECT}
                value={form.papel}
                onChange={(e) =>
                  setForm({ ...form, papel: e.target.value as PapelDesignacao, userId: '' })
                }
              >
                {PAPEIS_DESIGNACAO.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PAPEL_DESIGNACAO[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="des-user">Pessoa</Label>
              <select
                id="des-user"
                className={SELECT}
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
              >
                <option value="">Escolha</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            {form.papel === 'aprovador' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="des-faixa">Faixa</Label>
                <select
                  id="des-faixa"
                  className={SELECT}
                  value={form.faixaId}
                  onChange={(e) => setForm({ ...form, faixaId: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {faixasAtivas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome} (até {formatarReais(f.limiteCentavos)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="des-inicio">Início</Label>
              <Input
                id="des-inicio"
                type="date"
                value={form.vigenciaInicio}
                onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="des-fim">Fim (opcional)</Label>
              <Input
                id="des-fim"
                type="date"
                value={form.vigenciaFim}
                onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="des-ato">Ato de designação (portaria, documento SEI)</Label>
              <Input
                id="des-ato"
                value={form.ato}
                onChange={(e) => setForm({ ...form, ato: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNova(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pendente}>
              {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Designar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Faixas({
  painel,
  pendente,
  executar,
}: {
  painel: PainelMaterial;
  pendente: boolean;
  executar: Executar;
}) {
  const [form, setForm] = useState({ nome: '', limite: '' });

  function criar() {
    const limite = reaisParaCentavos(form.limite);
    if (limite == null) {
      toast.error('Informe o limite em reais, como 17.600,00.');
      return;
    }
    executar(
      () => criarFaixaAction({ nome: form.nome, limiteCentavos: limite }),
      'Faixa criada.',
      () => setForm({ nome: '', limite: '' }),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-border/50 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="faixa-nome">Nome da faixa</Label>
          <Input
            id="faixa-nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Diretor do Foro"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="faixa-limite">Limite (R$)</Label>
          <Input
            id="faixa-limite"
            inputMode="decimal"
            value={form.limite}
            onChange={(e) => setForm({ ...form, limite: e.target.value })}
          />
        </div>
        <Button onClick={criar} disabled={pendente} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Criar faixa
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Faixa não se edita: o que já foi aprovado guarda o limite do momento.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Limite</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {painel.faixas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Nenhuma faixa criada.
                </TableCell>
              </TableRow>
            )}
            {painel.faixas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.nome}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarReais(f.limiteCentavos)}
                </TableCell>
                <TableCell>
                  {f.ativa ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-300"
                    >
                      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                      Ativa
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Desativada
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {f.ativa && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendente}
                      onClick={() =>
                        executar(() => desativarFaixaAction({ faixaId: f.id }), 'Faixa desativada.')
                      }
                    >
                      Desativar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
