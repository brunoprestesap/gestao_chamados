import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { ConferenciaVistoriaModel } from '@/models/ConferenciaVistoria';
import { LocalizacaoModel } from '@/models/Localizacao';

import { FILTRO_VISTORIAVEL } from './filtro';

/**
 * Cobertura da campanha por prédio (spec 0012, AC-2), calculada na leitura.
 * O total do prédio são os vistoriáveis com local hoje dentro dele (o prédio
 * e tudo abaixo, pelo prefixo do `caminho`, como `idsDaSubarvore`). Só conta
 * como conferido quem está nesse total: conferência de ativo que saiu do
 * prédio ou deixou de ser vistoriável não entra, e o percentual nunca passa
 * de 100%.
 */

export type CoberturaPredio = {
  id: string;
  nome: string;
  total: number;
  conferidos: number;
  percentual: number;
};

export type CoberturaCampanha = {
  predios: CoberturaPredio[];
  semLocal: number;
  total: number;
  conferidos: number;
};

type LocalLean = {
  _id: Types.ObjectId;
  nome: string;
  tipo: string;
  caminho: string;
  isActive: boolean;
};

function percentual(conferidos: number, total: number): number {
  return total === 0 ? 0 : Math.floor((conferidos / total) * 100);
}

export async function calcularCobertura(campanhaId: string): Promise<CoberturaCampanha> {
  const [locais, ativos, conferencias] = await Promise.all([
    // Desativados também: um ativo pode ainda estar num local desativado abaixo do prédio.
    LocalizacaoModel.find().select('nome tipo caminho isActive').lean<LocalLean[]>(),
    AtivoModel.find(FILTRO_VISTORIAVEL)
      .select('localizacaoId')
      .lean<{ _id: Types.ObjectId; localizacaoId?: Types.ObjectId | null }[]>(),
    ConferenciaVistoriaModel.find({ campanhaId: new Types.ObjectId(campanhaId) })
      .select('ativoId')
      .lean<{ ativoId: Types.ObjectId }[]>(),
  ]);

  const predios = locais
    .filter((l) => l.tipo === 'predio')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));

  // Cada local vai para o prédio cujo `caminho` é ele mesmo ou prefixo dele.
  const predioDoCaminho = (caminho: string) =>
    predios.find((p) => caminho === p.caminho || caminho.startsWith(`${p.caminho}/`));
  const predioDoLocal = new Map<string, string>();
  for (const l of locais) {
    const p = predioDoCaminho(l.caminho);
    if (p) predioDoLocal.set(String(l._id), String(p._id));
  }

  const conferidos = new Set(conferencias.map((c) => String(c.ativoId)));
  const porPredio = new Map<string, { total: number; conferidos: number }>();
  let semLocal = 0;
  for (const a of ativos) {
    if (!a.localizacaoId) {
      semLocal++;
      continue;
    }
    const predioId = predioDoLocal.get(String(a.localizacaoId));
    if (!predioId) continue;
    const c = porPredio.get(predioId) ?? { total: 0, conferidos: 0 };
    c.total++;
    if (conferidos.has(String(a._id))) c.conferidos++;
    porPredio.set(predioId, c);
  }

  const linhas = predios.flatMap((p) => {
    const c = porPredio.get(String(p._id)) ?? { total: 0, conferidos: 0 };
    // Prédio desativado só aparece se ainda tem vistoriável dentro.
    if (!p.isActive && c.total === 0) return [];
    return {
      id: String(p._id),
      nome: p.nome,
      total: c.total,
      conferidos: c.conferidos,
      percentual: percentual(c.conferidos, c.total),
    };
  });

  return {
    predios: linhas,
    semLocal,
    total: linhas.reduce((s, l) => s + l.total, 0),
    conferidos: linhas.reduce((s, l) => s + l.conferidos, 0),
  };
}
