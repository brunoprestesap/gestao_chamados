import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { ABAS_FILA_ALMOXARIFADO, abasDaFila, acoesDisponiveis } from '../leitura';
import type { Papeis } from '../papeis';
import { podeConcluirChecagem } from '../papeis';
import {
  type CotacaoBruta,
  podeBaixar,
  serializarCotacao,
  serializarParaSolicitante,
  visaoDe,
} from '../serializar';

/**
 * Quem vê o quê na checagem do almoxarifado (spec 0024). O teste de vazamento lê
 * o JSON inteiro de cada visão: saldo, preço, motivo e nome só para TRF1 e
 * almoxarifado, e orçamento e empenho nunca para o almoxarifado.
 *
 * covers: AC-14, AC-24, AC-25, AC-26, AC-27
 */

function papeis(lista: string[], role = 'Solicitante'): Papeis {
  const tem = (p: string) => lista.includes(p);
  const ladoTrf1 = ['fiscal', 'gestor', 'aprovador'].some(tem);
  return {
    userId: 'eu',
    role,
    designacoes: lista.map((papel, n) => ({
      id: String(n),
      papel: papel as Papeis['designacoes'][number]['papel'],
      faixaId: null,
      limiteCentavos: null,
    })),
    tem: tem as Papeis['tem'],
    ladoTrf1,
    leitorAdmin: role === 'Admin' && !ladoTrf1,
    contratada: tem('responsavel_tecnico'),
    almoxarifado: tem('almoxarifado'),
  };
}

const itemId = new Types.ObjectId();
const SEGREDOS = {
  saldo: 1234,
  reservado: 567,
  preco: 98765,
  valor: 87654,
  motivo: 'motivo-secreto-do-almoxarifado',
  nome: 'Servidor do Almoxarifado',
  material: 'MATERIAL-DO-SICAM',
  coMat: '302477',
};

function cotacao(extra: Partial<CotacaoBruta> = {}): CotacaoBruta {
  const agora = new Date('2026-11-05T12:00:00.000Z');
  return {
    _id: new Types.ObjectId(),
    numero: 'COT-2026-0001',
    chamadoId: new Types.ObjectId(),
    situacao: 'rascunho',
    emTramite: true,
    versao: 2,
    itens: [
      {
        _id: itemId,
        descricao: 'Torneira',
        unidade: 'UN',
        quantidade: 6,
        motivo: 'motivo-do-tecnico',
        doDiagnostico: true,
        origem: 'orcamento',
        precoAplicadoCentavos: 55555,
        quantidadeExecutada: null,
        valorExecutadoCentavos: null,
      },
    ],
    orcamentos: [
      {
        _id: new Types.ObjectId(),
        fornecedor: 'FORNECEDOR-X',
        cnpj: '11222333000181',
        data: agora,
        validade: agora,
        arquivoId: new Types.ObjectId(),
        precos: [{ itemId, valorUnitarioCentavos: 55555 }],
      },
    ],
    montadoPorUserId: null,
    diagnosticadoPorUserId: new Types.ObjectId(),
    diagnosticadoEm: agora,
    valorTotalCentavos: 333330,
    empenhoId: new Types.ObjectId(),
    valorAutorizadoCentavos: null,
    autorizadoEm: null,
    executadoEm: null,
    valorExecutadoCentavos: null,
    advertencias: [],
    checagem: {
      prazoAte: null,
      voltarPara: null,
      abriuPausa: false,
      itens: [
        {
          itemId,
          descricao: 'Torneira',
          unidade: 'UN',
          quantidadePedida: 10,
          resultado: 'usar',
          automatico: false,
          palavrasBuscadas: ['torneira'],
          origem: 'sicam',
          consultadoEm: agora,
          coMat: SEGREDOS.coMat,
          materialDescricao: SEGREDOS.material,
          materialUnidade: 'UN',
          saldoVisto: SEGREDOS.saldo,
          reservadoVisto: SEGREDOS.reservado,
          quantidadeAtendida: 4,
          quantidadeSaida: 4,
          quantidadeLiberada: 6,
          precoUnitarioCentavos: SEGREDOS.preco,
          valorCentavos: SEGREDOS.valor,
          precoOrigem: 'sicam',
          motivo: SEGREDOS.motivo,
          porUserId: new Types.ObjectId(),
          porNome: SEGREDOS.nome,
          papel: 'almoxarifado',
          em: agora,
        },
      ],
    },
    createdAt: agora,
    updatedAt: agora,
    ...extra,
  };
}

const eventos = () => [
  {
    _id: new Types.ObjectId(),
    de: 'em_checagem' as const,
    para: 'rascunho' as const,
    acao: 'concluir_checagem',
    autorNome: SEGREDOS.nome,
    papel: 'almoxarifado' as const,
    limiteCentavosNoAto: null,
    motivo: null,
    empenhoId: null,
    valorCentavos: null,
    advertenciasNoAto: [],
    checagemNoAto: cotacao().checagem!.itens,
    em: new Date('2026-11-05T12:00:00.000Z'),
  },
];

describe('visaoDe (AC-25)', () => {
  const ctx = (p: Papeis, extra = {}) => ({
    userId: 'eu',
    papeis: p,
    ehTecnicoAtribuido: false,
    ehSolicitante: false,
    ...extra,
  });

  it('almoxarifado vê só com checagem, inclusive em rascunho', () => {
    const p = papeis(['almoxarifado']);
    expect(visaoDe(ctx(p), cotacao())).toBe('almoxarifado');
    expect(visaoDe(ctx(p), cotacao({ checagem: null }))).toBeNull();
    expect(visaoDe(ctx(p), cotacao({ situacao: 'em_analise' }))).toBe('almoxarifado');
  });

  it('o fiscal vê em checagem pela visão trf1, e não o rascunho', () => {
    const p = papeis(['fiscal'], 'Admin');
    expect(visaoDe(ctx(p), cotacao({ situacao: 'em_checagem' }))).toBe('trf1');
    expect(visaoDe(ctx(p), cotacao())).toBeNull();
  });

  it('trf1 vem antes de almoxarifado; ser solicitante não amplia', () => {
    expect(
      visaoDe(ctx(papeis(['almoxarifado', 'fiscal'], 'Admin')), cotacao({ situacao: 'enviada' })),
    ).toBe('trf1');
    expect(
      visaoDe(ctx(papeis(['almoxarifado']), { ehSolicitante: true }), cotacao({ checagem: null })),
    ).toBe('solicitante');
  });

  it('almoxarifado nunca entra em lado TRF1 (AC-25)', () => {
    expect(papeis(['almoxarifado']).ladoTrf1).toBe(false);
  });
});

describe('vazamento (AC-24, AC-25)', () => {
  const segredos = Object.values(SEGREDOS).map(String);
  const contem = (json: string) => segredos.filter((s) => json.includes(s));

  it('contratada e técnico só recebem o resultado por item', () => {
    for (const visao of ['contratada', 'tecnico'] as const) {
      const dto = serializarCotacao(cotacao(), visao, { userId: 'eu' }, { eventos: eventos() });
      expect(contem(JSON.stringify(dto))).toEqual([]);
      expect(dto.checagem).toBeUndefined();
      expect(dto.temChecagem).toBe(true);
      expect(dto.resultadoChecagem).toEqual([
        {
          itemId: String(itemId),
          descricao: 'Torneira',
          unidade: 'UN',
          resultado: 'atendido',
          quantidadeAtendida: 4,
          quantidadeLiberada: 6,
        },
      ]);
    }
  });

  it('o solicitante continua só com a fase', () => {
    const dto = serializarParaSolicitante(cotacao({ situacao: 'em_checagem' }));
    expect(dto.fase).toBe('pedido');
    expect(serializarParaSolicitante(cotacao({ situacao: 'atendida_almoxarifado' })).fase).toBe(
      'encerrada',
    );
    expect(contem(JSON.stringify(dto))).toEqual([]);
  });

  it('o almoxarifado vê a checagem, e nunca orçamento, preço da cotação ou empenho', () => {
    const dto = serializarCotacao(
      cotacao(),
      'almoxarifado',
      { userId: 'eu' },
      { eventos: eventos() },
    );
    const json = JSON.stringify(dto);
    expect(dto.checagem?.entradas[0]).toMatchObject({
      saldoVisto: SEGREDOS.saldo,
      motivo: SEGREDOS.motivo,
      porNome: SEGREDOS.nome,
    });
    expect(dto.orcamentos).toBeUndefined();
    expect(dto.arquivos).toBeUndefined();
    expect(dto.valorTotalCentavos).toBeUndefined();
    expect(dto.empenhoId).toBeUndefined();
    expect(json).not.toContain('FORNECEDOR-X');
    expect(json).not.toContain('55555');
    expect(json).not.toContain('333330');
    expect(json).not.toContain('motivo-do-tecnico');
    expect(dto.itens?.[0]).toMatchObject({ descricao: 'Torneira', unidade: 'UN', quantidade: 6 });
  });

  it('o TRF1 lê a checagem inteira, com o que há em cada ato', () => {
    const dto = serializarCotacao(
      cotacao({ situacao: 'em_checagem' }),
      'trf1',
      { userId: 'eu' },
      { eventos: eventos() },
    );
    expect(dto.checagem?.entradas).toHaveLength(1);
    expect(dto.trilha?.[0]?.checagem?.[0]?.motivo).toBe(SEGREDOS.motivo);
  });

  it('o almoxarifado não baixa arquivo nenhum (AC-25)', () => {
    for (const tipo of ['orcamento', 'evidencia', 'nota_fiscal'] as const) {
      expect(podeBaixar('almoxarifado', tipo)).toBe(false);
    }
  });

  it('cotação antiga segue sem etapa nova e sem resultado (AC-27)', () => {
    const dto = serializarCotacao(cotacao({ checagem: null }), 'tecnico', { userId: 'eu' });
    expect(dto.temChecagem).toBe(false);
    expect(dto.resultadoChecagem).toBeNull();
  });
});

describe('ações e fila (AC-15, AC-26, AC-27)', () => {
  it('só almoxarifado e fiscal concluem, e só em checagem', () => {
    expect(podeConcluirChecagem('em_checagem', papeis(['almoxarifado']))).toBe(true);
    expect(podeConcluirChecagem('em_checagem', papeis(['fiscal'], 'Admin'))).toBe(true);
    expect(podeConcluirChecagem('rascunho', papeis(['almoxarifado']))).toBe(false);
    expect(podeConcluirChecagem('em_checagem', papeis(['gestor'], 'Admin'))).toBe(false);
    expect(podeConcluirChecagem('em_checagem', papeis(['responsavel_tecnico']))).toBe(false);
    expect(podeConcluirChecagem('em_checagem', null)).toBe(false);
  });

  it('o almoxarifado tem Minhas ações e Todas', () => {
    expect(abasDaFila('almoxarifado')).toEqual(ABAS_FILA_ALMOXARIFADO);
    expect(ABAS_FILA_ALMOXARIFADO).toEqual(['minhas', 'todas']);
  });

  it('nenhuma ação de preço ou de análise para o almoxarifado', () => {
    const a = acoesDisponiveis(
      cotacao({ situacao: 'em_checagem' }),
      papeis(['almoxarifado']),
      false,
    );
    expect(a.concluirChecagem).toBe(true);
    const outras = Object.entries(a).filter(([k, v]) => v && k !== 'concluirChecagem');
    expect(outras).toEqual([]);
  });

  it('reenviar só com item não checado', () => {
    const rt = papeis(['responsavel_tecnico'], 'Preposto');
    expect(acoesDisponiveis(cotacao(), rt, false).reenviarChecagem).toBe(false);
    const comNovo = cotacao();
    comNovo.itens = [{ ...comNovo.itens[0]!, _id: new Types.ObjectId() }];
    expect(acoesDisponiveis(comNovo, rt, false).reenviarChecagem).toBe(true);
    expect(acoesDisponiveis(cotacao({ checagem: null }), rt, false).reenviarChecagem).toBe(false);
  });
});
