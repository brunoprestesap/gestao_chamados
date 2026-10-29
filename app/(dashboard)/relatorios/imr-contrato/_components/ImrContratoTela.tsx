import { Clock, Hammer, PackageCheck, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { CaixaRolavel } from '@/app/(dashboard)/cotacoes/_components/detalhe/CaixaRolavel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatarMes, formatarYmd } from '@/shared/contratos/janela';
import type { ContratoDoRelatorio } from '@/shared/contratos/relatorio.types';
import { ROTULO_PAPEL } from '@/shared/imr-contrato/formato';
import {
  PONTOS_MAXIMOS,
  type Reincidencia,
  TEXTO_PREVIA,
} from '@/shared/imr-contrato/imr-contrato.constants';
import type { ApuracaoMes } from '@/shared/imr-contrato/imr-contrato.types';

import { dataHora, type MesImr, type VistaImr } from './apoio';
import { CartaoIndicador, CartaoSoma, detalheDoCartao, Numero } from './CartoesImr';
import { LinhaDoI3, LinhaDoI4 } from './LinhasImr';
import { MarcarNaoAtendimento, MarcarNaoFornecido, type OpcaoCotacao } from './MarcacoesImr';

/** O IMR do contrato na tela (spec 0023, AC-1 a AC-12, AC-16 e AC-17). */

export type { VistaImr } from './apoio';

/** O que o fiscal escreveu nos pontos lançados, ou de onde eles vêm. */
function detalheLancado(vista: VistaImr, chave: 'i1' | 'i2'): string {
  if (vista.tipo === 'previa') return 'Lançado no fechamento do mês.';
  return vista[chave].observacao ?? 'Lançado no fechamento do mês, sem observação.';
}

export function ImrContratoTela({
  contrato,
  apuracao,
  vista,
  reincidencia,
  acoesDoMes,
  podeMarcar,
  opcoesNaoFornecido,
}: {
  contrato: ContratoDoRelatorio;
  apuracao: ApuracaoMes;
  vista: VistaImr;
  reincidencia: Reincidencia;
  /** Fechar ou reabrir, só para fiscal e gestor (AC-10, AC-11, AC-14). */
  acoesDoMes?: ReactNode;
  /** Fiscal ou gestor designado vigente com o mês aberto; Admin sem designação só lê (AC-9, AC-14). */
  podeMarcar: boolean;
  /** Cotações da base do I4 ainda sem "não fornecido" vigente. */
  opcoesNaoFornecido: OpcaoCotacao[];
}) {
  const { i3, i4, marcacoesForaDaBase } = apuracao;
  const mes: MesImr | null = podeMarcar
    ? { contratoId: contrato.id, competencia: apuracao.competencia }
    : null;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-border/50">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">
              Contrato {contrato.numero} · {formatarMes(apuracao.competencia)}
            </h2>
            {vista.tipo === 'previa' ? (
              <Badge variant="secondary">Prévia, mês aberto</Badge>
            ) : vista.vigente ? (
              <Badge className="bg-emerald-700 text-white">Fechado, versão {vista.versao}</Badge>
            ) : (
              <Badge variant="outline">Versão {vista.versao}, reaberta</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{contrato.empresa}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                {vista.tipo === 'previa' ? 'Apurado em' : 'Fechado em'}
              </dt>
              <dd className="font-medium tabular-nums">
                {dataHora(vista.tipo === 'previa' ? apuracao.apuradoEm : vista.fechadoEm)}
                {vista.tipo === 'foto' ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    por {vista.fechadoPorNome} ({ROTULO_PAPEL[vista.papel]})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Feriados usados nos prazos</dt>
              <dd className="font-medium">
                {apuracao.feriadosUsados.length === 0
                  ? 'Nenhum'
                  : apuracao.feriadosUsados.map(formatarYmd).join(', ')}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {vista.tipo === 'previa'
              ? TEXTO_PREVIA
              : 'Foto gravada no fechamento: os números não mudam, mesmo que os chamados ou o calendário mudem depois.'}
          </p>
          {acoesDoMes ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">{acoesDoMes}</div>
          ) : null}
        </CardContent>
      </Card>

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoIndicador
          numero={1}
          titulo="Pagamento de salários e benefícios"
          icone={<ShieldCheck className="size-4 text-sky-600" aria-hidden="true" />}
          maximo={PONTOS_MAXIMOS.i1}
          pontos={vista.tipo === 'foto' ? vista.i1.pontos : null}
          detalhe={detalheLancado(vista, 'i1')}
          destaque="from-sky-500 to-blue-500"
        />
        <CartaoIndicador
          numero={2}
          titulo="Fornecimento de EPIs e uniformes"
          icone={<Hammer className="size-4 text-violet-600" aria-hidden="true" />}
          maximo={PONTOS_MAXIMOS.i2}
          pontos={vista.tipo === 'foto' ? vista.i2.pontos : null}
          detalhe={detalheLancado(vista, 'i2')}
          destaque="from-violet-500 to-indigo-500"
        />
        <CartaoIndicador
          numero={3}
          titulo="Tempo de resposta e não atendimento"
          icone={<Clock className="size-4 text-amber-600" aria-hidden="true" />}
          maximo={PONTOS_MAXIMOS.i3}
          pontos={i3.pontos}
          detalhe={detalheDoCartao(i3, 'não atendimento')}
          destaque="from-amber-500 to-orange-500"
        />
        <CartaoIndicador
          numero={4}
          titulo="Fornecimento de materiais e ferramentas"
          icone={<PackageCheck className="size-4 text-emerald-600" aria-hidden="true" />}
          maximo={PONTOS_MAXIMOS.i4}
          pontos={i4.pontos}
          detalhe={detalheDoCartao(i4, 'não fornecimento')}
          destaque="from-emerald-500 to-teal-500"
        />
      </section>

      <CartaoSoma vista={vista} i3={i3.pontos} i4={i4.pontos} reincidencia={reincidencia} />

      <Card className="rounded-2xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Indicador 3: tempo de resposta</CardTitle>
          <p className="text-sm text-muted-foreground">
            Prazo: fim do expediente do primeiro dia útil depois da abertura. Conta a primeira
            atribuição ao técnico; preventivas ficam fora.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Numero rotulo="Chamados com prazo no mês" valor={i3.base} />
            <Numero rotulo="Atendidos no prazo" valor={i3.noPrazo} />
            <Numero rotulo="Atrasos" valor={i3.ocorrencias} />
            <Numero
              rotulo="Aguardando o prazo"
              valor={i3.aguardandoPrazo}
              ajuda="Sem técnico, prazo ainda por vencer"
            />
            <Numero
              rotulo="Sem registro de início"
              valor={i3.semRegistroDeInicio}
              ajuda="Dado antigo, não conta"
            />
          </div>

          {mes ? (
            <div className="flex flex-wrap justify-end">
              <MarcarNaoAtendimento mes={mes} />
            </div>
          ) : null}

          {i3.linhas.length === 0 ? (
            <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              Nenhum atraso nem não atendimento no tempo de resposta neste mês.
            </p>
          ) : (
            <div className="rounded-xl border">
              <CaixaRolavel rotulo="Ocorrências do indicador 3">
                <Table>
                  <caption className="sr-only">Ocorrências do indicador 3</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chamado</TableHead>
                      <TableHead>Solicitante</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead>Solicitado em</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Tempo até o início</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Situação</TableHead>
                      {mes ? <TableHead>Ações</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {i3.linhas.map((l) => (
                      <LinhaDoI3 key={l.chamadoId} l={l} mes={mes} />
                    ))}
                  </TableBody>
                </Table>
              </CaixaRolavel>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Indicador 4: fornecimento de material</CardTitle>
          <p className="text-sm text-muted-foreground">
            Prazo: fim do expediente do N-ésimo dia útil depois da autorização da cotação, com o N
            dos parâmetros do material. Conta a execução registrada; preventivas entram.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Numero rotulo="Cotações com prazo no mês" valor={i4.base} />
            <Numero rotulo="Fornecidas no prazo" valor={i4.noPrazo} />
            <Numero rotulo="Atrasos" valor={i4.ocorrencias} />
            <Numero
              rotulo="Aguardando o prazo"
              valor={i4.aguardandoPrazo}
              ajuda="Sem execução, prazo ainda por vencer"
            />
          </div>
          {i4.prazosEstimados > 0 ? (
            <p className="text-xs text-muted-foreground">
              {i4.prazosEstimados === 1
                ? '1 cotação foi autorizada antes do prazo de fornecimento existir no Sigma; o prazo dela é estimado com 5 dias úteis.'
                : `${i4.prazosEstimados} cotações foram autorizadas antes do prazo de fornecimento existir no Sigma; o prazo delas é estimado com 5 dias úteis.`}
            </p>
          ) : null}

          {mes ? (
            <div className="flex flex-wrap justify-end">
              <MarcarNaoFornecido mes={mes} opcoes={opcoesNaoFornecido} />
            </div>
          ) : null}

          {i4.linhas.length === 0 ? (
            <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              Nenhum atraso nem não fornecimento de material neste mês.
            </p>
          ) : (
            <div className="rounded-xl border">
              <CaixaRolavel rotulo="Ocorrências do indicador 4">
                <Table>
                  <caption className="sr-only">Ocorrências do indicador 4</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cotação</TableHead>
                      <TableHead>Chamado</TableHead>
                      <TableHead>Autorizada em</TableHead>
                      <TableHead>Prazo de fornecimento</TableHead>
                      <TableHead>Execução</TableHead>
                      <TableHead>Situação</TableHead>
                      {mes ? <TableHead>Ações</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {i4.linhas.map((l) => (
                      <LinhaDoI4 key={l.cotacaoId} l={l} mes={mes} />
                    ))}
                  </TableBody>
                </Table>
              </CaixaRolavel>
            </div>
          )}
        </CardContent>
      </Card>

      {marcacoesForaDaBase.length > 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Marcações fora da base</CardTitle>
            <p className="text-sm text-muted-foreground">
              O alvo destas marcações não está mais na base do mês (o tipo do chamado mudou, por
              exemplo). Elas não contam na pontuação.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {marcacoesForaDaBase.map((m) => (
                <li
                  key={`${m.indicador}:${m.alvoId}:${m.tipo}`}
                  className="rounded-xl border px-3 py-2"
                >
                  <p className="font-medium">
                    Indicador {m.indicador} · {m.indicador === 3 ? 'chamado' : 'cotação'}{' '}
                    {m.alvoNumero || 'removido'} ·{' '}
                    {m.tipo === 'desconsiderar'
                      ? 'desconsiderada'
                      : m.indicador === 3
                        ? 'não atendimento'
                        : 'não fornecido'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.motivo} ({m.porNome}, {ROTULO_PAPEL[m.papel]}, {dataHora(m.em)})
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
