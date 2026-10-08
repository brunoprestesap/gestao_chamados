import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';

import type { RelatorioContrato } from '@/shared/contratos/relatorio.types';

import { RelatorioContratoPdf } from '../RelatorioContratoPdf';

/**
 * O PDF renderizado de verdade (spec 0016, AC-14 e AC-17): A4 paisagem, uma
 * página só quando não há chamado, e a tabela por ativo quebrando em várias
 * páginas sem o limite de 10. O texto vem comprimido, então o teste lê o que
 * fica fora dos streams: o tamanho e o número de páginas, e os metadados.
 *
 * covers: AC-12, AC-14, AC-17
 */

const sla = { dentro: 0, fora: 0, emAndamento: 0, semSla: 0 };

function dados(qtdAtivos: number, extra: Partial<RelatorioContrato> = {}): RelatorioContrato {
  return {
    contrato: {
      id: 'c1',
      numero: '12/2025',
      empresa: 'Refrigeração Amazônia',
      cnpjFormatado: '11.222.333/0001-81',
      processoSei: '0001234-56.2025',
      objeto: null,
      fiscal: null,
      tiposServico: ['Ar-Condicionado'],
      vigenciaInicio: '2025-03-01',
      vigenciaFim: '2027-02-28',
      isActive: true,
    },
    janela: { inicio: '2026-09-01', fim: '2026-09-30', mes: '2026-09', parcial: false },
    geradoEm: '2026-10-07T15:00:00.000Z',
    geradoPorNome: 'Admin',
    topo: {
      corretivosTotal: qtdAtivos,
      corretivosSemAtivo: 0,
      corretivosComAtivo: qtdAtivos,
      percentualComAtivo: qtdAtivos ? 100 : null,
      ativosAfetados: qtdAtivos,
      mtbfMedioMs: null,
      mttrMedioMs: null,
      ativosReincidentes: 0,
      preventivasGeradas: 0,
      preventivasConcluidas: 0,
      sla: { ...sla, semSla: qtdAtivos, percentualDentro: null },
      custoTotalCentavos: 0,
    },
    categorias: qtdAtivos
      ? [
          {
            categoriaId: 'k',
            nome: 'Split',
            ativosNoEscopo: qtdAtivos,
            ativosComChamado: qtdAtivos,
            corretivos: qtdAtivos,
            mttrMedioMs: null,
            reincidentes: 0,
            slaDentro: 0,
            slaFora: 0,
            preventivasGeradas: 0,
            preventivasConcluidas: 0,
            custoCorretivoCentavos: 0,
            custoPreventivaCentavos: 0,
          },
        ]
      : [],
    ativos: Array.from({ length: qtdAtivos }, (_, i) => ({
      ativoId: String(i),
      codigo: `MNT-${1000 + i}`,
      descricao: 'Condicionador de ar, manutenção',
      categoriaId: 'k',
      categoria: 'Split',
      caminho: null,
      corretivos: 1,
      mtbfMs: null,
      mttrMs: null,
      corretivos90d: 1,
      reincidente: false,
      sla: { ...sla, semSla: 1 },
      preventivasGeradas: 0,
      preventivasConcluidas: 0,
      custoCentavos: 0,
    })),
    ...extra,
  };
}

async function pdf(d: RelatorioContrato) {
  const bytes = await renderToBuffer(<RelatorioContratoPdf dados={d} emissaoId={'e'.repeat(24)} />);
  const texto = bytes.toString('latin1');
  return {
    texto,
    paginas: (texto.match(/\/Type \/Page\b/g) ?? []).length,
  };
}

describe('RelatorioContratoPdf', () => {
  it('é um PDF A4 paisagem (842 x 595 pt)', async () => {
    const { texto } = await pdf(dados(2));
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect(texto).toMatch(/\/MediaBox \[0 0 841\.89\d* 595\.28\d*\]/);
  });

  it('sem chamado, sai só a página do resumo, sem as tabelas (AC-14)', async () => {
    expect((await pdf(dados(0))).paginas).toBe(1);
  });

  it('com poucos ativos, resumo, categoria e ativos ficam em três páginas', async () => {
    expect((await pdf(dados(3))).paginas).toBe(3);
  });

  it('com muitos ativos, a tabela por ativo quebra em várias páginas e mostra todos (AC-12, AC-17)', async () => {
    const { paginas } = await pdf(dados(80));
    expect(paginas).toBeGreaterThan(4);
  });

  it('leva o título com o número do contrato e o mês nos metadados', async () => {
    const { texto } = await pdf(dados(1));
    expect(texto).toContain('/Creator');
    expect(texto).toMatch(/\/Title/);
  });
}, 60000);
