import type { TierManutencao } from '../../../shared/ativos/ativo.constants';

/**
 * Classificação da linha do SICAM pela descrição do material (spec 0012,
 * AC-19), portada de `docs/extrair.py`. A ordem importa: a primeira regra que
 * casa vence. Veículo vem antes de climatização porque a descrição de picape
 * cita "ar condicionado" como item de série. As regras moram só aqui.
 */

type Regra = { tier: TierManutencao; categoria: string; padrao: RegExp };

export const REGRAS_CLASSIFICACAO: readonly Regra[] = [
  {
    tier: 'D',
    categoria: 'veiculo',
    padrao:
      /(VE.CULO|AUTOM.VEL|CAMINH.O|MOTOCICLETA|EMBARCA..O|LANCHA|VOADEIRA|\bPICAPE\b|PICK.?UP)/,
  },
  {
    tier: 'A',
    categoria: 'climatizacao',
    padrao:
      /(AR[ -]CONDICIONADO|CONDICIONADOR DE AR|\bSPLIT\b|CASSETE|EVAPORADOR|CONDENSAD|CHILLER|FAN ?COIL|SELF ?CONTAINED|\bVRF\b)/,
  },
  {
    tier: 'A',
    categoria: 'energia_nobreak',
    padrao: /(NO ?-?BREAK|NOBREAK|\bUPS\b|SISTEMA ELETRONICO DE TENS)/,
  },
  {
    tier: 'A',
    categoria: 'energia_gerador',
    padrao: /(GRUPO.{0,12}GERADOR|GERADOR.{0,15}(ENERGIA|DIESEL)|GRUPO DIESEL)/,
  },
  {
    tier: 'A',
    categoria: 'energia_transformador',
    padrao: /(TRANSFORMADOR|SUBESTA|\bQGBT\b|QUADRO DE DISTRIBUI|CABINE PRIM)/,
  },
  {
    tier: 'A',
    categoria: 'hidraulica_bomba',
    padrao: /((BOMBA|MOTOBOMBA)\b(?!.*ODONTOL)|PRESSURIZADOR)/,
  },
  {
    tier: 'A',
    categoria: 'exaustao_ventilacao',
    padrao:
      /(EXAUSTOR|CLIMATIZADOR(?! DE AR CONDICIONADO)|COIFA|CORTINA DE AR|VENTILADOR DE (COLUNA|PAREDE|TETO))/,
  },
  {
    tier: 'A',
    categoria: 'combate_incendio',
    padrao: /(EXTINTOR|HIDRANTE|ALARME DE INC|DETECTOR DE FUMA|SPRINKLER)/,
  },
  {
    tier: 'A',
    categoria: 'controle_acesso',
    padrao: /(CATRACA|PORT.O AUTOM|CANCELA|DETECTOR DE METAIS|P.RTICO DETECTOR|PORTA GIRAT)/,
  },
  {
    tier: 'A',
    categoria: 'ar_comprimido',
    padrao: /(COMPRESSOR DE AR(?!.*ODONTOL)|CALDEIRA|VASO DE PRESS)/,
  },
  {
    tier: 'B',
    categoria: 'copa_refrigeracao',
    padrao: /(BEBEDOURO|PURIFICADOR DE .GUA|FRIGOBAR|GELADEIRA|REFRIGERADOR|FREEZER)/,
  },
  { tier: 'B', categoria: 'copa_coccao', padrao: /(MICRO ?-?ONDAS|FOG.O|FORNO EL)/ },
  {
    tier: 'C',
    categoria: 'ti_rede',
    padrao: /(\bSWITCH\b|ACCESS ?POINT|ACESS ?POINT|ROTEADOR|FIREWALL|\bSTORAGE\b|\bRACK\b)/,
  },
  {
    tier: 'C',
    categoria: 'ti_cftv',
    padrao: /(C.MERA|\bCFTV\b|\bDVR\b|\bNVR\b|MINI ?DOME|\bBULLET\b)/,
  },
  { tier: 'C', categoria: 'ti_telefonia', padrao: /(\bPABX\b|CENTRAL TELEF)/ },
];

/** Acessório e peça solta: descartado antes de qualquer regra. */
export const RUIDO =
  /^(SUPORTE|CABO|FONTE|BATERIA|CONTROLE REMOTO|KIT |ADAPTADOR|CAPA |LICEN.A|SOFTWARE|PE.A)/;

export type Classificacao = { tier: TierManutencao; categoria: string } | null;

export function classificar(descricao: string): Classificacao {
  const d = descricao.toUpperCase();
  if (RUIDO.test(d.trim())) return null;
  for (const r of REGRAS_CLASSIFICACAO) {
    if (r.padrao.test(d)) return { tier: r.tier, categoria: r.categoria };
  }
  return null;
}
