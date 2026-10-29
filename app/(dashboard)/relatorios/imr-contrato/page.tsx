import Link from 'next/link';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { lerContrato, listarContratos } from '@/lib/contratos/relatorio';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { papelNoImr } from '@/lib/imr-contrato/acesso';
import {
  lerEmissoesDoMes,
  lerFechamento,
  lerHistoricoDoMes,
  lerPontosVigentes,
} from '@/lib/imr-contrato/estado';
import {
  avaliarReincidencia,
  mesTerminou,
  reincidenciaDaFoto,
} from '@/lib/imr-contrato/fechamento.regras';
import { montarPreviaImr } from '@/lib/imr-contrato/leitura';
import { formatarYmd, limitesDoMes, mesAnterior, mesesPermitidos } from '@/shared/contratos/janela';
import type { ContratoDoRelatorio } from '@/shared/contratos/relatorio.types';
import type { Reincidencia } from '@/shared/imr-contrato/imr-contrato.constants';
import type { ApuracaoMes } from '@/shared/imr-contrato/imr-contrato.types';

import { type OpcaoContrato, SeletorContratoMes } from '../contrato/_components/SeletorContratoMes';
import { BotaoPdfImr } from './_components/BotaoPdfImr';
import { FecharMes, ReabrirMes } from './_components/FechamentoImr';
import { EmissoesImr, HistoricoImr } from './_components/HistoricoImr';
import { ImrContratoTela, type VistaImr } from './_components/ImrContratoTela';
import type { OpcaoCotacao } from './_components/MarcacoesImr';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ contratoId?: string; mes?: string; versao?: string }> };

type Montado = {
  contrato: ContratoDoRelatorio;
  apuracao: ApuracaoMes;
  vista: VistaImr;
  reincidencia: Reincidencia;
  opcoesNaoFornecido: OpcaoCotacao[];
};

/** O dia seguinte ao último do mês, quando o fechamento passa a valer (AC-10). */
function primeiroDiaParaFechar(competencia: string): string {
  const d = new Date(`${limitesDoMes(competencia).ultimo}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatarYmd(d.toISOString().slice(0, 10));
}

/** A foto gravada de uma versão, sem recalcular nada (AC-1, AC-11). */
async function montarFoto(
  contratoId: string,
  competencia: string,
  versao: number,
  vigente: boolean,
): Promise<Montado | null> {
  const [foto, contrato] = await Promise.all([
    lerFechamento(contratoId, competencia, versao),
    lerContrato(contratoId),
  ]);
  if (!foto || !contrato) return null;
  return {
    contrato,
    apuracao: {
      competencia,
      apuradoEm: foto.fechadoEm,
      feriadosUsados: foto.parametros.feriados,
      i3: foto.i3,
      i4: foto.i4,
      marcacoesForaDaBase: foto.marcacoesForaDaBase,
    },
    vista: {
      tipo: 'foto',
      versao: foto.versao,
      vigente,
      fechadoPorNome: foto.fechadoPorNome,
      papel: foto.papel,
      fechadoEm: foto.fechadoEm,
      i1: foto.i1,
      i2: foto.i2,
      total: foto.total,
      faixa: foto.faixa,
    },
    reincidencia: reincidenciaDaFoto(foto),
    opcoesNaoFornecido: [],
  };
}

/** A prévia ao vivo do mês aberto, com a reincidência só de I3 e I4 (AC-1, AC-12). */
async function montarPrevia(
  contratoId: string,
  competencia: string,
  agora: Date,
): Promise<Montado | null> {
  const [previa, anterior] = await Promise.all([
    montarPreviaImr({ contratoId, competencia, agora }),
    lerPontosVigentes(contratoId, mesAnterior(competencia)),
  ]);
  if (!previa.ok) return null;
  const { i3, i4 } = previa.apuracao;
  return {
    contrato: previa.contrato,
    apuracao: previa.apuracao,
    vista: { tipo: 'previa' },
    reincidencia: avaliarReincidencia({
      competencia,
      vigenciaInicio: previa.contrato.vigenciaInicio,
      atual: { i1: null, i2: null, i3: i3.pontos, i4: i4.pontos },
      anterior,
    }),
    opcoesNaoFornecido: [...previa.baseI4.values()]
      .filter((l) => !l.naoAtendimento)
      .map((l) => ({
        cotacaoId: l.cotacaoId,
        rotulo: `cotação ${l.numero} (chamado ${l.chamadoTicketNumber})`,
      })),
  };
}

/**
 * IMR do contrato (spec 0023, AC-1, AC-10, AC-11 e AC-14). A leitura é de
 * Admin: as designações `fiscal` e `gestor` só valem para o perfil Admin
 * (`PERFIS_POR_PAPEL`), então `requireAdmin` cobre Admin e designados. Mês
 * aberto mostra a prévia; mês fechado, a foto da versão vigente; `versao` na
 * URL mostra qualquer versão gravada.
 */
export default async function ImrContratoPage({ searchParams }: Props) {
  const sessao = await requireAdmin();
  const params = await searchParams;
  const agora = new Date();
  const hoje = hojeEmBelem(agora);
  const contratos = await listarContratos();

  const opcoes: OpcaoContrato[] = contratos.map((c) => ({
    id: c.id,
    rotulo: `${c.numero} · ${c.empresa}${c.isActive ? '' : ' (inativo)'}`,
    meses: mesesPermitidos(c, hoje),
  }));

  // Sem escolha, o primeiro contrato; mês fora da vigência cai no mais recente permitido.
  const opcao = opcoes.find((o) => o.id === params.contratoId) ?? opcoes[0];
  const mes =
    opcao && params.mes && opcao.meses.includes(params.mes) ? params.mes : opcao?.meses[0];
  const mesAlvo = opcao && mes ? { contratoId: opcao.id, competencia: mes } : null;

  await dbConnect();
  const [historico, papel, emissoes] = await Promise.all([
    mesAlvo ? lerHistoricoDoMes(mesAlvo.contratoId, mesAlvo.competencia) : null,
    papelNoImr(sessao.userId, sessao.role),
    mesAlvo ? lerEmissoesDoMes(mesAlvo.contratoId, mesAlvo.competencia) : [],
  ]);
  const estado = historico?.estado;

  const versaoPedida = Number(params.versao);
  const versaoNaTela = historico?.versoes.some((v) => v.versao === versaoPedida)
    ? versaoPedida
    : estado?.fechado
      ? estado.maiorVersao
      : null;
  const fotoVigente =
    versaoNaTela !== null && estado?.fechado === true && versaoNaTela === estado.maiorVersao;

  let montado: Montado | null = null;
  if (mesAlvo) {
    montado =
      versaoNaTela === null
        ? await montarPrevia(mesAlvo.contratoId, mesAlvo.competencia, agora)
        : await montarFoto(mesAlvo.contratoId, mesAlvo.competencia, versaoNaTela, fotoVigente);
  }

  // Só fiscal e gestor agem (AC-14); o Admin sem designação vê a tela sem ações.
  const naPrevia = montado?.vista.tipo === 'previa';
  let acoesDoMes: ReactNode = null;
  if (mesAlvo && montado && naPrevia && papel) {
    acoesDoMes = mesTerminou(mesAlvo.competencia, hoje) ? (
      <FecharMes mes={mesAlvo} i3={montado.apuracao.i3.pontos} i4={montado.apuracao.i4.pontos} />
    ) : (
      <p className="text-sm text-muted-foreground">
        O mês pode ser fechado a partir de {primeiroDiaParaFechar(mesAlvo.competencia)}.
      </p>
    );
  } else if (mesAlvo && montado && fotoVigente && estado) {
    // O PDF sai só da versão vigente, para Admin, fiscal e gestor (AC-13).
    acoesDoMes = (
      <>
        <BotaoPdfImr contratoId={mesAlvo.contratoId} competencia={mesAlvo.competencia} />
        {papel ? <ReabrirMes mes={mesAlvo} versao={estado.maiorVersao} /> : null}
      </>
    );
  } else if (mesAlvo && montado && !naPrevia && !fotoVigente) {
    acoesDoMes = (
      <Link
        href={`/relatorios/imr-contrato?contratoId=${mesAlvo.contratoId}&mes=${mesAlvo.competencia}`}
        className="text-sm font-medium text-primary hover:underline"
      >
        {estado?.fechado ? 'Ver a versão vigente' : 'Ver a prévia do mês'}
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="IMR do contrato"
        subtitle="Os quatro indicadores do Instrumento de Medição de Resultado, por contrato e mês, com a pontuação que entra na glosa."
      />

      {contratos.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">Nenhum contrato cadastrado</p>
            <p className="text-sm text-muted-foreground">
              Cadastre os contratos em{' '}
              <Link
                href="/configuracoes/contratos"
                className="font-medium text-primary hover:underline"
              >
                Contratos
              </Link>{' '}
              para apurar o IMR.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Contrato e mês</CardTitle>
            </CardHeader>
            <CardContent>
              <SeletorContratoMes
                opcoes={opcoes}
                contratoId={opcao?.id}
                mes={mes}
                action="/relatorios/imr-contrato"
                rotuloBotao="Ver IMR"
              />
            </CardContent>
          </Card>
          {montado && mesAlvo ? (
            <>
              <ImrContratoTela
                contrato={montado.contrato}
                apuracao={montado.apuracao}
                vista={montado.vista}
                reincidencia={montado.reincidencia}
                acoesDoMes={acoesDoMes}
                podeMarcar={papel !== null && naPrevia}
                opcoesNaoFornecido={montado.opcoesNaoFornecido}
              />
              <HistoricoImr
                mes={mesAlvo}
                versoes={historico?.versoes ?? []}
                reaberturas={historico?.reaberturas ?? []}
                versaoVista={versaoNaTela}
              />
              <EmissoesImr emissoes={emissoes} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
