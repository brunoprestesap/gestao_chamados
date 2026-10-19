import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Toda ação que leva o chamado a `concluído`, `cancelado` ou `recusado` passa
 * por `lib/material/chamado.ts` (spec 0019, AC-13): a conclusão confere a
 * cotação em trâmite, e o cancelamento e a recusa cancelam a cotação. A
 * varredura acha arquivo novo que grava esses status sem o gancho.
 *
 * covers: AC-12, AC-13
 */

const RAIZ = path.resolve(__dirname, '../../..');

const STATUS_FINAL = /status:\s*'(concluído|cancelado|recusado)'/;

type StatusFinal = 'concluído' | 'cancelado' | 'recusado';

/** O gancho que cada status final exige no mesmo arquivo. */
const GANCHO: Record<StatusFinal, RegExp> = {
  concluído: /impedimentoDeConclusao\(/,
  cancelado: /cancelarCotacaoPeloChamado\([\s\S]*?'chamado_cancelado'/,
  recusado: /cancelarCotacaoPeloChamado\([\s\S]*?'chamado_recusado'/,
};

/**
 * Arquivos que citam o status sem gravá-lo no chamado. Cada um com o motivo;
 * arquivo novo só entra aqui depois de conferido à mão.
 */
const SEM_ESCRITA: Record<string, string> = {
  'app/(dashboard)/dashboard/actions.ts': 'só `$match` de contagem',
  'app/(dashboard)/meus-chamados/[id]/page.tsx': 'estado da tela depois da rota de cancelar',
  'lib/chamados/encerramento-automatico.ts': 'lê `concluído` e grava `encerrado`',
};

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === 'node_modules' || nome === '__tests__') continue;
      out.push(...arquivos(p));
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      out.push(p);
    }
  }
  return out;
}

describe('varredura: o status final do chamado passa pelo gancho do material', () => {
  const candidatos = ['app', 'lib']
    .flatMap((d) => arquivos(path.join(RAIZ, d)))
    .map((p) => ({
      rel: path.relative(RAIZ, p).split(path.sep).join('/'),
      texto: readFileSync(p, 'utf8'),
    }))
    .filter((f) => !f.rel.startsWith('lib/material/'))
    .filter((f) => STATUS_FINAL.test(f.texto));

  it('acha os lugares conhecidos (a varredura não ficou cega)', () => {
    const rels = candidatos.map((c) => c.rel);
    expect(rels).toContain('app/(dashboard)/chamados-atribuidos/actions.ts');
    expect(rels).toContain('app/(dashboard)/gestao/actions.ts');
    expect(rels).toContain('app/api/chamados/[id]/cancel/route.ts');
  });

  it.each(
    ['app', 'lib']
      .flatMap((d) => arquivos(path.join(RAIZ, d)))
      .map((p) => path.relative(RAIZ, p).split(path.sep).join('/'))
      .filter((rel) => !rel.startsWith('lib/material/'))
      .filter((rel) => STATUS_FINAL.test(readFileSync(path.join(RAIZ, rel), 'utf8'))),
  )('%s chama o gancho de cada status final que grava, ou está na lista conferida', (rel) => {
    if (rel in SEM_ESCRITA) return;
    const texto = readFileSync(path.join(RAIZ, rel), 'utf8');
    expect(texto).toContain("from '@/lib/material/chamado'");
    const gravados = new Set(
      [...texto.matchAll(new RegExp(STATUS_FINAL, 'g'))].map((m) => m[1] as StatusFinal),
    );
    for (const status of gravados) expect(texto, status).toMatch(GANCHO[status]);
  });

  it('a conclusão confere a cotação, e cancelar e recusar cancelam a cotação', () => {
    const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
    expect(ler('app/(dashboard)/chamados-atribuidos/actions.ts')).toContain(
      'impedimentoDeConclusao(',
    );
    expect(ler('app/(dashboard)/chamados-atribuidos/actions.ts')).toContain(
      'impedimentoDeRetomada(',
    );
    expect(ler('app/api/chamados/[id]/cancel/route.ts')).toMatch(
      /cancelarCotacaoPeloChamado\([\s\S]*?'chamado_cancelado'/,
    );
    expect(ler('app/(dashboard)/gestao/actions.ts')).toMatch(
      /cancelarCotacaoPeloChamado\([\s\S]*?'chamado_recusado'/,
    );
  });
});
