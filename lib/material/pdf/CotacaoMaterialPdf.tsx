import 'server-only';

import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import type { DetalheCotacao } from '@/lib/material/leitura';
import type { AtoDTO } from '@/lib/material/serializar';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import { formatarYmd } from '@/shared/contratos/janela';
import { TAXA_ADMINISTRACAO_MATERIAL } from '@/shared/material/material.constants';
import {
  CONTROLES,
  ROTULO_ACAO,
  ROTULO_BASE,
  ROTULO_ORIGEM,
  ROTULO_PAPEL,
  ROTULO_SITUACAO,
  textoDoMotivo,
} from '@/shared/material/mensagens';
import { valorDaLinhaCentavos } from '@/shared/material/valores';

/**
 * O PDF da cotação de material (spec 0019, AC-23), para juntar ao processo
 * no SEI: A4 retrato, legível por quem não acompanhou o pedido. Traz o resumo,
 * os itens com a origem do preço, os orçamentos, as conferências, as
 * advertências e a trilha inteira, com autor, papel e limite em cada ato.
 * Rodapé com o código da emissão em toda página.
 */

// Sem hifenização: o padrão quebra os títulos das colunas.
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
  subtitulo: { fontSize: 8.5, color: COR_SUAVE, marginBottom: 10, lineHeight: 1.4 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  campo: { width: '33.33%', marginBottom: 6, paddingRight: 8 },
  rotulo: { fontSize: 6.5, color: COR_SUAVE, textTransform: 'uppercase', marginBottom: 1 },
  valor: { fontSize: 8.5 },
  secao: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 6 },
  explica: { fontSize: 7.5, color: COR_SUAVE, marginBottom: 5, lineHeight: 1.3 },
  vazio: { fontSize: 8, color: COR_SUAVE },
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
  detalhe: { fontSize: 7, color: COR_SUAVE },
  item: { marginBottom: 3 },
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

type Coluna<T> = {
  titulo: string;
  flex: number;
  numero?: boolean;
  valor: (l: T) => ReactNode;
};

function Tabela<T>({ colunas, linhas }: { colunas: Coluna<T>[]; linhas: T[] }) {
  return (
    <View>
      <View style={s.tabelaCabecalho} fixed>
        {colunas.map((c) => (
          <Text key={c.titulo} style={[s.celula, { flex: c.flex }, c.numero ? s.numero : {}]}>
            {c.titulo}
          </Text>
        ))}
      </View>
      {linhas.map((l, i) => (
        <View key={i} style={s.linha} wrap={false}>
          {colunas.map((c) => (
            <View key={c.titulo} style={[s.celula, { flex: c.flex }]}>
              <Text style={c.numero ? s.numero : {}}>{c.valor(l)}</Text>
            </View>
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

const dataHora = (iso: string | null | undefined) => (iso ? formatarDataHoraBelem(iso) : '—');
const reais = (c: number | null | undefined) => (c == null ? '—' : formatarReais(c));
const ato = (a: AtoDTO | null | undefined) =>
  a ? `${dataHora(a.em)} · ${a.porNome ?? 'nome não encontrado'}` : 'Não registrado';

type Props = {
  detalhe: DetalheCotacao;
  emissaoId: string;
  geradoEm: string;
  geradoPorNome: string;
};

export function CotacaoMaterialPdf({ detalhe, emissaoId, geradoEm, geradoPorNome }: Props) {
  const { cotacao: c, chamado } = detalhe;
  const itens = c.itens ?? [];
  const orcamentos = c.orcamentos ?? [];
  const trilha = c.trilha ?? [];
  const conferidos = itens.filter((i) => i.conferencia);
  const descricaoDoItem = (id: string) => itens.find((i) => i.id === id)?.descricao ?? 'item';
  // Cada `<Page>` leva o próprio rodapé `fixed`: ele só se repete nas páginas dela.
  const rodape = (
    <Text
      style={s.rodape}
      fixed
      render={({ pageNumber, totalPages }) =>
        `Sigma · ${c.numero} · Emissão ${emissaoId} · Gerado em ${geradoEm} por ${geradoPorNome} · Página ${pageNumber} de ${totalPages}`
      }
    />
  );

  return (
    <Document
      title={`Cotação de material ${c.numero}`}
      author="Sigma"
      subject={`Chamado ${chamado.numero}`}
    >
      <Page size="A4" style={s.page}>
        <Text style={s.titulo}>Cotação de material {c.numero}</Text>
        <Text style={s.subtitulo}>
          Pedido de material do chamado {chamado.numero} ({chamado.titulo}). Este documento reúne o
          que foi pedido, de onde veio cada preço, os orçamentos apresentados, as conferências do
          fiscal e todos os atos registrados no Sigma, com quem fez, em que papel e, quando houve
          aprovação, com que limite de competência. Valores em reais; datas e horas no horário de
          Belém.
        </Text>

        <Text style={s.secao}>Resumo</Text>
        <View style={s.grade}>
          <Campo rotulo="Situação">{ROTULO_SITUACAO[c.situacao]}</Campo>
          <Campo rotulo="Chamado">{chamado.numero}</Campo>
          <Campo rotulo="Ativo">{chamado.ativo ?? 'Sem ativo vinculado'}</Campo>
          <Campo rotulo="Registrada em">{dataHora(c.criadaEm)}</Campo>
          <Campo rotulo="Valor cotado">{reais(c.valorTotalCentavos)}</Campo>
          <Campo rotulo="Taxa de administração">{formatarReais(TAXA_ADMINISTRACAO_MATERIAL)}</Campo>
          <Campo rotulo="Autorizada em">{dataHora(c.autorizadoEm)}</Campo>
          <Campo rotulo="Valor autorizado">{reais(c.valorAutorizadoCentavos)}</Campo>
          <Campo rotulo="Empenho">{detalhe.empenhoNumero ?? '—'}</Campo>
          <Campo rotulo="Executada em">{dataHora(c.executadoEm)}</Campo>
          <Campo rotulo="Valor executado">{reais(c.valorExecutadoCentavos)}</Campo>
          <Campo rotulo="Recebimento provisório">{ato(c.recebimentoProvisorio)}</Campo>
          <Campo rotulo="Recebimento definitivo">{ato(c.recebimentoDefinitivo)}</Campo>
          <Campo rotulo="Nota fiscal">
            {c.notaFiscal
              ? `Nº ${c.notaFiscal.numero}, de ${formatarYmd(c.notaFiscal.data)}`
              : 'Não registrada'}
          </Campo>
        </View>

        <Text style={s.secao}>Itens</Text>
        <Text style={s.explica}>
          Origem é de onde o preço pode vir; base aplicada é a que valeu. No caminho de três
          orçamentos, o preço do item é o menor entre os orçamentos que o cotaram.
        </Text>
        <Tabela
          linhas={itens}
          colunas={[
            {
              titulo: 'Descrição e motivo',
              flex: 3.4,
              valor: (i) => `${i.descricao}\n${i.motivo}${i.doDiagnostico ? ' (diagnóstico)' : ''}`,
            },
            {
              titulo: 'Quantidade',
              flex: 1.1,
              numero: true,
              valor: (i) => `${formatarQuantidade(i.quantidade)} ${i.unidade}`,
            },
            {
              titulo: 'Origem',
              flex: 1.3,
              valor: (i) => (i.origem ? (ROTULO_ORIGEM[i.origem] ?? i.origem) : '—'),
            },
            {
              titulo: 'Base aplicada',
              flex: 1.2,
              valor: (i) =>
                i.baseAplicada ? (ROTULO_BASE[i.baseAplicada] ?? i.baseAplicada) : '—',
            },
            {
              titulo: 'Preço unitário',
              flex: 1.2,
              numero: true,
              valor: (i) => reais(i.precoAplicadoCentavos),
            },
            {
              titulo: 'Valor',
              flex: 1.2,
              numero: true,
              valor: (i) =>
                i.precoAplicadoCentavos == null
                  ? '—'
                  : formatarReais(valorDaLinhaCentavos(i.quantidade, i.precoAplicadoCentavos)),
            },
            {
              titulo: 'Aplicado',
              flex: 1.5,
              numero: true,
              valor: (i) =>
                i.quantidadeExecutada == null
                  ? '—'
                  : `${formatarQuantidade(i.quantidadeExecutada)} · ${reais(i.valorExecutadoCentavos)}`,
            },
          ]}
        />

        <Text style={s.secao}>Orçamentos</Text>
        {orcamentos.length === 0 ? (
          <Text style={s.vazio}>Nenhum orçamento apresentado.</Text>
        ) : (
          <Tabela
            linhas={orcamentos}
            colunas={[
              { titulo: 'Fornecedor', flex: 2.2, valor: (o) => o.fornecedor },
              { titulo: 'CNPJ', flex: 1.6, valor: (o) => formatarCnpj(o.cnpj) },
              { titulo: 'Data', flex: 0.9, valor: (o) => formatarYmd(o.data) },
              {
                titulo: 'Validade',
                flex: 0.9,
                valor: (o) => (o.validade ? formatarYmd(o.validade) : '—'),
              },
              {
                titulo: 'Preço unitário por item',
                flex: 3.4,
                valor: (o) =>
                  o.precos
                    .map(
                      (p) =>
                        `${descricaoDoItem(p.itemId)}: ${formatarReais(p.valorUnitarioCentavos)}`,
                    )
                    .join('\n'),
              },
            ]}
          />
        )}

        <Text style={s.secao}>Conferências do fiscal</Text>
        {conferidos.length === 0 ? (
          <Text style={s.vazio}>Nenhum item desta cotação exigiu conferência.</Text>
        ) : (
          conferidos.map((i) => (
            <View key={i.id} style={s.item} wrap={false}>
              <Text>
                {i.descricao}: {i.conferencia!.texto}
              </Text>
              <Text style={s.detalhe}>
                {dataHora(i.conferencia!.em)} · {i.conferencia!.porNome ?? '—'}
              </Text>
            </View>
          ))
        )}

        <Text style={s.secao}>Advertências</Text>
        {(c.advertencias ?? []).length === 0 ? (
          <Text style={s.vazio}>Nenhuma advertência registrada.</Text>
        ) : (
          (c.advertencias ?? []).map((a) => (
            <Text key={a} style={s.item}>
              {CONTROLES[a]?.texto ?? a}
            </Text>
          ))
        )}
        {rodape}
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.secao}>Trilha de atos</Text>
        <Text style={s.explica}>
          Cada linha é um ato registrado no Sigma, na ordem em que aconteceu. A trilha não pode ser
          alterada nem apagada. &quot;Sistema&quot; indica ato automático, como a conciliação diária
          do saldo.
        </Text>
        <Tabela
          linhas={trilha}
          colunas={[
            { titulo: 'Data e hora', flex: 1.3, valor: (ev) => dataHora(ev.em) },
            {
              titulo: 'Ato',
              flex: 2.2,
              valor: (ev) => {
                const rotulo =
                  ev.acao === 'conciliar'
                    ? 'Conciliação do saldo'
                    : (ROTULO_ACAO[ev.acao as keyof typeof ROTULO_ACAO] ?? ev.acao);
                return ev.de && ev.de !== ev.para
                  ? // Helvetica não tem a seta: a mudança vai por extenso.
                    `${rotulo}\nde ${ROTULO_SITUACAO[ev.de]} para ${ROTULO_SITUACAO[ev.para]}`
                  : rotulo;
              },
            },
            {
              titulo: 'Autor e papel',
              flex: 2,
              valor: (ev) => `${ev.autorNome ?? 'Sistema'}\n${ROTULO_PAPEL[ev.papel]}`,
            },
            {
              titulo: 'Limite no ato',
              flex: 1.2,
              numero: true,
              valor: (ev) => reais(ev.limiteCentavosNoAto),
            },
            {
              titulo: 'Saldo',
              flex: 1.3,
              numero: true,
              valor: (ev) =>
                ev.valorCentavos == null
                  ? '—'
                  : `${ev.valorCentavos >= 0 ? 'reservado' : 'liberado'} ${formatarReais(Math.abs(ev.valorCentavos))}`,
            },
            {
              titulo: 'Motivo e advertências',
              flex: 2.4,
              valor: (ev) =>
                [
                  textoDoMotivo(ev.motivo),
                  ...(ev.advertencias ?? []).map(
                    (a) => CONTROLES[a as keyof typeof CONTROLES]?.texto ?? a,
                  ),
                ]
                  .filter(Boolean)
                  .join('\n') || '—',
            },
          ]}
        />
        {rodape}
      </Page>
    </Document>
  );
}
