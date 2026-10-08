import 'server-only';

import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { formatarReais } from '@/shared/chamados/custo';
import {
  formatarDataHoraBelem,
  formatarPercentual,
  formatarTempo,
  SELO_INFORMATIVO,
  SELO_PARCIAL,
  TEXTO_SEM_CHAMADOS,
} from '@/shared/contratos/formato';
import { formatarYmd } from '@/shared/contratos/janela';
import type { RelatorioContrato } from '@/shared/contratos/relatorio.types';

/**
 * O PDF do relatório por contrato (spec 0016, AC-17): A4 paisagem, fontes
 * padrão do PDF (Helvetica cobre os acentos), cabeçalho das tabelas repetido
 * em cada página e rodapé com o código da emissão em toda página. Cada tabela
 * fica numa `<Page>` própria, para o cabeçalho `fixed` só repetir nas páginas
 * dela.
 */

// Sem hifenização: o padrão quebra os títulos das colunas ("den-tro").
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
  selos: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  selo: {
    fontSize: 7.5,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: COR_FUNDO,
  },
  seloParcial: { backgroundColor: '#fef3c7', color: '#92400e' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
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
  vazio: { marginTop: 10, fontSize: 9, color: COR_SUAVE },
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
  numero: { textAlign: 'right' },
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

type Coluna<T> = { titulo: string; flex: number; numero?: boolean; valor: (l: T) => string };

function Tabela<T>({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: Coluna<T>[];
  linhas: T[];
}) {
  return (
    <View>
      <View fixed>
        <Text style={s.secao}>{titulo}</Text>
        <View style={s.tabelaCabecalho}>
          {colunas.map((c) => (
            <Text key={c.titulo} style={[s.celula, { flex: c.flex }, c.numero ? s.numero : {}]}>
              {c.titulo}
            </Text>
          ))}
        </View>
      </View>
      {linhas.map((l, i) => (
        <View key={i} style={s.linha} wrap={false}>
          {colunas.map((c) => (
            <Text key={c.titulo} style={[s.celula, { flex: c.flex }, c.numero ? s.numero : {}]}>
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

type LinhaAtivo = RelatorioContrato['ativos'][number];
type LinhaCategoria = RelatorioContrato['categorias'][number];

const COLUNAS_CATEGORIA: Coluna<LinhaCategoria>[] = [
  { titulo: 'Categoria', flex: 3, valor: (l) => l.nome },
  { titulo: 'Ativos no escopo', flex: 1.2, numero: true, valor: (l) => String(l.ativosNoEscopo) },
  {
    titulo: 'Ativos com chamado',
    flex: 1.2,
    numero: true,
    valor: (l) => String(l.ativosComChamado),
  },
  { titulo: 'Corretivos', flex: 1, numero: true, valor: (l) => String(l.corretivos) },
  { titulo: 'MTTR médio', flex: 1.3, numero: true, valor: (l) => formatarTempo(l.mttrMedioMs) },
  { titulo: 'Reincidentes', flex: 1, numero: true, valor: (l) => String(l.reincidentes) },
  { titulo: 'SLA dentro', flex: 0.9, numero: true, valor: (l) => String(l.slaDentro) },
  { titulo: 'SLA fora', flex: 0.9, numero: true, valor: (l) => String(l.slaFora) },
  {
    titulo: 'Preventivas geradas',
    flex: 1.2,
    numero: true,
    valor: (l) => String(l.preventivasGeradas),
  },
  {
    titulo: 'Preventivas concluídas',
    flex: 1.3,
    numero: true,
    valor: (l) => String(l.preventivasConcluidas),
  },
  {
    titulo: 'Custo corretivo',
    flex: 1.4,
    numero: true,
    valor: (l) => formatarReais(l.custoCorretivoCentavos),
  },
  {
    titulo: 'Custo preventiva',
    flex: 1.4,
    numero: true,
    valor: (l) => formatarReais(l.custoPreventivaCentavos),
  },
];

const COLUNAS_ATIVO: Coluna<LinhaAtivo>[] = [
  { titulo: 'Código', flex: 1.1, valor: (l) => l.codigo },
  { titulo: 'Descrição', flex: 2.4, valor: (l) => l.descricao || '—' },
  { titulo: 'Categoria', flex: 1.5, valor: (l) => l.categoria ?? 'Sem categoria' },
  { titulo: 'Local', flex: 2.2, valor: (l) => l.caminho ?? '—' },
  { titulo: 'Corretivos', flex: 0.9, numero: true, valor: (l) => String(l.corretivos) },
  { titulo: 'MTBF', flex: 1, numero: true, valor: (l) => formatarTempo(l.mtbfMs) },
  { titulo: 'MTTR médio', flex: 1, numero: true, valor: (l) => formatarTempo(l.mttrMs) },
  {
    titulo: 'Em 90 dias',
    flex: 1.1,
    numero: true,
    valor: (l) => (l.reincidente ? `${l.corretivos90d} reincidente` : String(l.corretivos90d)),
  },
  { titulo: 'SLA dentro', flex: 0.8, numero: true, valor: (l) => String(l.sla.dentro) },
  { titulo: 'SLA fora', flex: 0.7, numero: true, valor: (l) => String(l.sla.fora) },
  { titulo: 'Em andamento', flex: 0.9, numero: true, valor: (l) => String(l.sla.emAndamento) },
  { titulo: 'Prev. geradas', flex: 0.9, numero: true, valor: (l) => String(l.preventivasGeradas) },
  {
    titulo: 'Prev. concluídas',
    flex: 1,
    numero: true,
    valor: (l) => String(l.preventivasConcluidas),
  },
  { titulo: 'Custo', flex: 1.3, numero: true, valor: (l) => formatarReais(l.custoCentavos) },
];

export function RelatorioContratoPdf({
  dados,
  emissaoId,
}: {
  dados: RelatorioContrato;
  emissaoId: string;
}) {
  const { contrato, janela, topo } = dados;
  const geradoEm = formatarDataHoraBelem(dados.geradoEm);
  const vazio = topo.corretivosTotal === 0 && topo.preventivasGeradas === 0;
  const pagina = { size: 'A4', orientation: 'landscape', wrap: true, style: s.page } as const;

  return (
    <Document
      title={`Relatório do contrato ${contrato.numero} · ${janela.mes}`}
      author="Sigma"
      creator="Sigma"
      producer="Sigma"
      language="pt-BR"
    >
      <Page {...pagina}>
        <Text style={s.titulo}>Relatório mensal do contrato {contrato.numero}</Text>
        <Text style={s.subtitulo}>
          Período de {formatarYmd(janela.inicio)} a {formatarYmd(janela.fim)}
        </Text>
        <View style={s.selos}>
          <Text style={s.selo}>{SELO_INFORMATIVO}</Text>
          {janela.parcial ? <Text style={[s.selo, s.seloParcial]}>{SELO_PARCIAL}</Text> : null}
        </View>

        <View style={s.grade}>
          <Campo rotulo="Empresa">{contrato.empresa}</Campo>
          <Campo rotulo="CNPJ">{contrato.cnpjFormatado}</Campo>
          <Campo rotulo="Processo SEI">{contrato.processoSei}</Campo>
          {contrato.objeto ? <Campo rotulo="Objeto">{contrato.objeto}</Campo> : null}
          {contrato.fiscal ? <Campo rotulo="Fiscal">{contrato.fiscal}</Campo> : null}
          <Campo rotulo="Tipos de serviço">{contrato.tiposServico.join(', ')}</Campo>
          <Campo rotulo="Vigência">
            {formatarYmd(contrato.vigenciaInicio)} a {formatarYmd(contrato.vigenciaFim)}
          </Campo>
          <Campo rotulo="Gerado em">
            {geradoEm} por {dados.geradoPorNome}
          </Campo>
        </View>

        <Text style={s.secao}>Resumo do período</Text>
        <View style={s.kpis}>
          <Kpi rotulo="Corretivos" valor={topo.corretivosTotal} />
          <Kpi rotulo="Com ativo" valor={topo.corretivosComAtivo} />
          <Kpi rotulo="Sem ativo" valor={topo.corretivosSemAtivo} />
          <Kpi rotulo="Cobertura de ativo" valor={formatarPercentual(topo.percentualComAtivo)} />
          <Kpi rotulo="Ativos afetados" valor={topo.ativosAfetados} />
          <Kpi rotulo="Ativos reincidentes" valor={topo.ativosReincidentes} />
          <Kpi rotulo="MTBF médio" valor={formatarTempo(topo.mtbfMedioMs)} />
          <Kpi rotulo="MTTR médio" valor={formatarTempo(topo.mttrMedioMs)} />
          <Kpi rotulo="Preventivas geradas" valor={topo.preventivasGeradas} />
          <Kpi rotulo="Preventivas concluídas" valor={topo.preventivasConcluidas} />
          <Kpi rotulo="SLA dentro" valor={topo.sla.dentro} />
          <Kpi rotulo="SLA fora" valor={topo.sla.fora} />
          <Kpi rotulo="SLA em andamento" valor={topo.sla.emAndamento} />
          <Kpi rotulo="Sem SLA" valor={topo.sla.semSla} />
          <Kpi rotulo="Cumprimento de SLA" valor={formatarPercentual(topo.sla.percentualDentro)} />
          <Kpi rotulo="Custo total do mês" valor={formatarReais(topo.custoTotalCentavos)} />
        </View>
        <Text style={{ fontSize: 7, color: COR_SUAVE }}>
          SLA conta só os corretivos com ativo. A reincidência olha os 90 dias que terminam no fim
          do período. {'"Ativos no escopo"'} é o retrato do momento da geração. Custos lançados até{' '}
          {geradoEm} (horário de Belém).
        </Text>

        {vazio ? <Text style={s.vazio}>{TEXTO_SEM_CHAMADOS}</Text> : null}
        <Rodape emissaoId={emissaoId} geradoEm={geradoEm} />
      </Page>

      {vazio ? null : (
        <Page {...pagina}>
          <Tabela titulo="Por categoria" colunas={COLUNAS_CATEGORIA} linhas={dados.categorias} />
          <Rodape emissaoId={emissaoId} geradoEm={geradoEm} />
        </Page>
      )}

      {vazio ? null : (
        <Page {...pagina}>
          <Tabela titulo="Por ativo" colunas={COLUNAS_ATIVO} linhas={dados.ativos} />
          <Rodape emissaoId={emissaoId} geradoEm={geradoEm} />
        </Page>
      )}
    </Document>
  );
}
