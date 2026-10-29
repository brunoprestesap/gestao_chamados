import 'server-only';

import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import { formatarMes, formatarYmd } from '@/shared/contratos/janela';
import {
  formatarDuracao,
  formatarFator,
  ROTULO_PAPEL,
  ROTULO_SITUACAO,
} from '@/shared/imr-contrato/formato';
import {
  PONTOS_MAXIMOS,
  type Reincidencia,
  TEXTO_REINCIDENCIA_NAO_AVALIADA,
  TEXTO_SEM_REINCIDENCIA,
  TEXTO_SOMA_RN50,
  textoReincidenciaZero,
} from '@/shared/imr-contrato/imr-contrato.constants';
import type {
  FechamentoLido,
  LinhaI3,
  LinhaI4,
  MarcacaoForaDaBase,
  MarcacoesDaLinha,
} from '@/shared/imr-contrato/imr-contrato.types';

/**
 * O PDF do fechamento do IMR do contrato (spec 0023, AC-13, AC-17): A4
 * paisagem, só com o que a foto gravou (nada é recalculado nem lido do
 * cadastro). Mesmo visual do PDF da spec 0016: Helvetica, cabeçalho das
 * tabelas repetido em cada página e rodapé com o código da emissão.
 */

Font.registerHyphenationCallback((palavra) => [palavra]);

const COR_TEXTO = '#1e1b4b';
const COR_SUAVE = '#64748b';
const COR_LINHA = '#e2e8f0';
const COR_FUNDO = '#eef2ff';

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 40,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: COR_TEXTO,
  },
  titulo: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitulo: { fontSize: 9, color: COR_SUAVE, marginBottom: 10 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  campo: { width: '33.33%', marginBottom: 5, paddingRight: 8 },
  rotulo: { fontSize: 6.5, color: COR_SUAVE, textTransform: 'uppercase', marginBottom: 1 },
  valor: { fontSize: 8.5 },
  secao: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 4, marginBottom: 6 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  kpi: {
    width: '16.66%',
    padding: 5,
    borderWidth: 0.5,
    borderColor: COR_LINHA,
    marginBottom: -0.5,
    marginRight: -0.5,
  },
  kpiValor: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  aviso: { fontSize: 8, marginBottom: 3 },
  avisoForte: { fontSize: 8, marginBottom: 3, color: '#991b1b', fontFamily: 'Helvetica-Bold' },
  nota: { fontSize: 7, color: COR_SUAVE, marginBottom: 3 },
  vazio: { marginTop: 4, fontSize: 9, color: COR_SUAVE },
  tabelaCabecalho: {
    flexDirection: 'row',
    backgroundColor: COR_FUNDO,
    borderBottomWidth: 0.75,
    borderBottomColor: '#a5b4fc',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
  },
  linha: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: COR_LINHA },
  celula: { paddingVertical: 3, paddingHorizontal: 3 },
  riscada: { textDecoration: 'line-through', color: COR_SUAVE },
  rodape: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: COR_SUAVE,
    textAlign: 'center',
  },
});

type Coluna<T> = { titulo: string; flex: number; valor: (l: T) => string; riscavel?: boolean };

function Tabela<T>({
  titulo,
  colunas,
  linhas,
  riscada,
  vazio,
}: {
  titulo: string;
  colunas: Coluna<T>[];
  linhas: T[];
  riscada?: (l: T) => boolean;
  vazio: string;
}) {
  return (
    <View>
      <View fixed>
        <Text style={s.secao}>{titulo}</Text>
        <View style={s.tabelaCabecalho}>
          {colunas.map((c) => (
            <Text key={c.titulo} style={[s.celula, { flex: c.flex }]}>
              {c.titulo}
            </Text>
          ))}
        </View>
      </View>
      {linhas.length === 0 ? <Text style={s.vazio}>{vazio}</Text> : null}
      {linhas.map((l, i) => (
        <View key={i} style={s.linha} wrap={false}>
          {colunas.map((c) => (
            <Text
              key={c.titulo}
              style={[s.celula, { flex: c.flex }, c.riscavel && riscada?.(l) ? s.riscada : {}]}
            >
              {c.valor(l)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <View style={s.campo}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{children}</Text>
    </View>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <View style={s.kpi}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.kpiValor}>{String(valor)}</Text>
    </View>
  );
}

function Rodape({ emissaoId, geradoEm }: { emissaoId: string; geradoEm: string }) {
  return (
    <Text
      style={s.rodape}
      fixed
      render={({ pageNumber, totalPages }) =>
        `Sigma · Emissão ${emissaoId} · Gerado em ${geradoEm} · Página ${pageNumber} de ${totalPages}`
      }
    />
  );
}

function dataHora(d: Date | null): string {
  return d ? formatarDataHoraBelem(d.toISOString()) : '—';
}

/** A situação e, quando houver, o ajuste do fiscal ou do gestor com motivo e autor. */
function situacao(l: MarcacoesDaLinha & { situacao: LinhaI3['situacao'] }): string {
  const rotulo = ROTULO_SITUACAO[l.situacao];
  const m = l.marcacao;
  if (!m) return rotulo;
  return `${rotulo}: ${m.motivo} (${m.porNome}, ${ROTULO_PAPEL[m.papel]}, ${dataHora(m.em)})`;
}

const COLUNAS_I3: Coluna<LinhaI3>[] = [
  { titulo: 'Chamado', flex: 1.2, valor: (l) => l.ticketNumber, riscavel: true },
  { titulo: 'Solicitante', flex: 1.5, valor: (l) => l.solicitanteNome },
  { titulo: 'Setor', flex: 1.3, valor: (l) => l.setor },
  { titulo: 'Solicitado em', flex: 1.1, valor: (l) => dataHora(l.solicitadoEm) },
  { titulo: 'Descrição', flex: 2.2, valor: (l) => l.descricao },
  {
    titulo: 'Início',
    flex: 1.1,
    valor: (l) => (l.iniciadoEm ? dataHora(l.iniciadoEm) : 'sem início'),
  },
  {
    titulo: 'Tempo até o início',
    flex: 1,
    valor: (l) => (l.tempoAteInicioMin === null ? '—' : formatarDuracao(l.tempoAteInicioMin)),
  },
  { titulo: 'Prazo', flex: 1.1, valor: (l) => dataHora(l.prazo) },
  { titulo: 'Situação', flex: 2.6, valor: situacao },
];

const COLUNAS_I4: Coluna<LinhaI4>[] = [
  { titulo: 'Cotação', flex: 1.2, valor: (l) => l.numero, riscavel: true },
  { titulo: 'Chamado', flex: 1.2, valor: (l) => l.chamadoTicketNumber },
  { titulo: 'Autorizada em', flex: 1.2, valor: (l) => dataHora(l.autorizadoEm) },
  {
    titulo: 'Prazo de fornecimento',
    flex: 1.4,
    valor: (l) => `${dataHora(l.prazo)}${l.prazoEstimado ? ' (estimado)' : ''}`,
  },
  {
    titulo: 'Execução',
    flex: 1.2,
    valor: (l) => (l.executadoEm ? dataHora(l.executadoEm) : 'sem execução'),
  },
  { titulo: 'Situação', flex: 3.4, valor: situacao },
];

const COLUNAS_FORA: Coluna<MarcacaoForaDaBase>[] = [
  { titulo: 'Indicador', flex: 0.7, valor: (m) => String(m.indicador) },
  { titulo: 'Alvo', flex: 1.2, valor: (m) => m.alvoNumero || 'não encontrado' },
  {
    titulo: 'Marcação',
    flex: 1.4,
    valor: (m) =>
      m.tipo === 'desconsiderar'
        ? 'Desconsiderar atraso'
        : m.indicador === 3
          ? 'Não atendimento'
          : 'Não fornecido',
  },
  { titulo: 'Motivo', flex: 3.4, valor: (m) => m.motivo },
  {
    titulo: 'Por',
    flex: 2,
    valor: (m) => `${m.porNome} (${ROTULO_PAPEL[m.papel]}), ${dataHora(m.em)}`,
  },
];

function TextoReincidencia({ r }: { r: Reincidencia }) {
  if (!r.avaliada) return <Text style={s.aviso}>{TEXTO_REINCIDENCIA_NAO_AVALIADA[r.motivo]}</Text>;
  if (r.zerados.length === 0) return <Text style={s.aviso}>{TEXTO_SEM_REINCIDENCIA}</Text>;
  return (
    <>
      {r.zerados.map((n) => (
        <Text key={n} style={s.avisoForte}>
          {textoReincidenciaZero(n)}
        </Text>
      ))}
    </>
  );
}

export function ImrFechamentoPdf({
  foto,
  reincidencia,
  emissaoId,
  geradoEm,
  geradoPorNome,
}: {
  foto: FechamentoLido;
  reincidencia: Reincidencia;
  emissaoId: string;
  /** `dd/mm/aaaa hh:mm` em Belém. */
  geradoEm: string;
  geradoPorNome: string;
}) {
  const { i1, i2, i3, i4, parametros: p } = foto;
  const pagina = { size: 'A4', orientation: 'landscape', wrap: true, style: s.page } as const;
  const riscada = (l: { situacao: string }) => l.situacao === 'desconsiderada';

  return (
    <Document
      title={`IMR do contrato ${foto.contratoNumero} · ${foto.competencia} · versão ${foto.versao}`}
      author="Sigma"
      creator="Sigma"
      producer="Sigma"
      language="pt-BR"
    >
      <Page {...pagina}>
        <Text style={s.titulo}>IMR do contrato {foto.contratoNumero}</Text>
        <Text style={s.subtitulo}>
          {formatarMes(foto.competencia)} · fechamento versão {foto.versao}
        </Text>

        <View style={s.grade}>
          <Campo rotulo="Fechado em">
            {dataHora(foto.fechadoEm)} por {foto.fechadoPorNome} ({ROTULO_PAPEL[foto.papel]})
          </Campo>
          <Campo rotulo="Vigência do contrato">
            {formatarYmd(p.vigencia.inicio)} a {formatarYmd(p.vigencia.fim)}
          </Campo>
          <Campo rotulo="Tipos de serviço">{p.tiposServico.join(', ')}</Campo>
          <Campo rotulo="Expediente">
            {p.expediente.inicio} às {p.expediente.fim} ({p.expediente.fuso})
          </Campo>
          <Campo rotulo="Prazo de fornecimento (indicador 4)">
            {p.prazoFornecimentoDiasUteis} dias úteis depois da autorização
          </Campo>
          <Campo rotulo="Feriados usados nos prazos">
            {p.feriados.length === 0 ? 'Nenhum' : p.feriados.map(formatarYmd).join(', ')}
          </Campo>
          <Campo rotulo="Gerado em">
            {geradoEm} por {geradoPorNome}
          </Campo>
        </View>

        <Text style={s.secao}>Pontuação</Text>
        <View style={s.kpis}>
          <Kpi rotulo="Indicador 1" valor={`${i1.pontos} de ${PONTOS_MAXIMOS.i1}`} />
          <Kpi rotulo="Indicador 2" valor={`${i2.pontos} de ${PONTOS_MAXIMOS.i2}`} />
          <Kpi rotulo="Indicador 3" valor={`${i3.pontos} de ${PONTOS_MAXIMOS.i3}`} />
          <Kpi rotulo="Indicador 4" valor={`${i4.pontos} de ${PONTOS_MAXIMOS.i4}`} />
          <Kpi rotulo="Soma" valor={`${foto.total} de 100`} />
          <Kpi
            rotulo="Faixa de pagamento"
            valor={`${foto.faixa.percentual}% · fator ${formatarFator(foto.faixa.fator)}`}
          />
        </View>
        <Text style={s.nota}>{TEXTO_SOMA_RN50}</Text>
        <Text style={s.nota}>
          Indicador 1 (pagamento de salários e benefícios):{' '}
          {i1.observacao ?? 'lançado no fechamento, sem observação.'}
        </Text>
        <Text style={s.nota}>
          Indicador 2 (fornecimento de EPIs e uniformes):{' '}
          {i2.observacao ?? 'lançado no fechamento, sem observação.'}
        </Text>

        <Text style={s.secao}>Reincidência de zero</Text>
        <TextoReincidencia r={reincidencia} />

        <Text style={s.secao}>Indicador 3: tempo de resposta</Text>
        <Text style={s.aviso}>
          {i3.base} chamados com prazo no mês · {i3.noPrazo} no prazo · {i3.ocorrencias} atrasos que
          contam · {i3.desconsideradas} desconsiderados · {i3.aguardandoPrazo} aguardando o prazo ·{' '}
          {i3.semRegistroDeInicio} sem registro de início
          {i3.zeradoPorMarcacao ? ' · zerado por não atendimento' : ''}
        </Text>
        <Text style={s.secao}>Indicador 4: fornecimento de material</Text>
        <Text style={s.aviso}>
          {i4.base} cotações com prazo no mês · {i4.noPrazo} no prazo · {i4.ocorrencias} atrasos que
          contam · {i4.desconsideradas} desconsiderados · {i4.aguardandoPrazo} aguardando o prazo ·{' '}
          {i4.prazosEstimados} com prazo estimado
          {i4.zeradoPorMarcacao ? ' · zerado por não fornecimento' : ''}
        </Text>
        <Rodape emissaoId={emissaoId} geradoEm={geradoEm} />
      </Page>

      <Page {...pagina}>
        <Tabela
          titulo="Indicador 3: ocorrências"
          colunas={COLUNAS_I3}
          linhas={i3.linhas}
          riscada={riscada}
          vazio="Nenhuma ocorrência no indicador 3."
        />
        <Rodape emissaoId={emissaoId} geradoEm={geradoEm} />
      </Page>

      <Page {...pagina}>
        <Tabela
          titulo="Indicador 4: ocorrências"
          colunas={COLUNAS_I4}
          linhas={i4.linhas}
          riscada={riscada}
          vazio="Nenhuma ocorrência no indicador 4."
        />
        <Rodape emissaoId={emissaoId} geradoEm={geradoEm} />
      </Page>

      {foto.marcacoesForaDaBase.length === 0 ? null : (
        <Page {...pagina}>
          <Tabela
            titulo="Marcações fora da base"
            colunas={COLUNAS_FORA}
            linhas={foto.marcacoesForaDaBase}
            vazio=""
          />
          <Text style={s.nota}>Marcações cujo alvo saiu da base do mês: não contam.</Text>
          <Rodape emissaoId={emissaoId} geradoEm={geradoEm} />
        </Page>
      )}
    </Document>
  );
}
