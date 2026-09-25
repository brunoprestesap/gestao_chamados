import { describe, expect, it } from 'vitest';

import {
  atribuidoPeloSistema,
  tituloDeAtribuicaoAoTecnico,
  tituloDeChamadoValidado,
} from '../aviso-atribuicao';

/**
 * Os títulos dos avisos da atribuição, os mesmos na Notification, no email e no
 * toast (spec 0008, AC-11 e AC-13).
 *
 * covers: AC-11 (aviso ao técnico), AC-13 (aviso à gestão)
 */

describe('atribuidoPeloSistema', () => {
  it('só reconhece o autor sistema', () => {
    expect(atribuidoPeloSistema({ id: 'sistema' })).toBe(true);
    expect(atribuidoPeloSistema({ id: '6aad5286df6f201a25eda222' })).toBe(false);
    expect(atribuidoPeloSistema(undefined)).toBe(false);
    expect(atribuidoPeloSistema(null)).toBe(false);
  });
});

describe('tituloDeAtribuicaoAoTecnico', () => {
  it.each([
    ['N1', false, 'Chamado #N1 atribuído a você'],
    ['N1', true, 'Chamado #N1 atribuído a você automaticamente'],
    ['', false, 'Chamado atribuído a você'],
    [null, true, 'Chamado atribuído a você automaticamente'],
    [undefined, false, 'Chamado atribuído a você'],
  ] as const)('número %j, automática %s: "%s"', (numero, automatica, esperado) => {
    expect(tituloDeAtribuicaoAoTecnico(numero, automatica)).toBe(esperado);
  });
});

describe('tituloDeChamadoValidado', () => {
  it('atribuído: diz a quem', () => {
    expect(tituloDeChamadoValidado('CHM-1', { resultado: 'atribuido', tecnicoNome: 'Carla' })).toBe(
      'Chamado #CHM-1 validado e atribuído a Carla',
    );
  });

  it.each(['sem_especialidade', 'sem_vaga', 'erro'] as const)(
    'sem técnico por %s: não revela o motivo no título',
    (motivo) => {
      expect(tituloDeChamadoValidado('CHM-1', { resultado: 'sem_tecnico', motivo })).toBe(
        'Chamado #CHM-1 validado, sem técnico disponível',
      );
    },
  );

  it.each([undefined, null])('sem o resultado (%s): o texto da 0007', (atribuicao) => {
    expect(tituloDeChamadoValidado('CHM-1', atribuicao)).toBe(
      'Chamado #CHM-1 validado automaticamente',
    );
  });

  it('sem número do chamado, não deixa espaço duplo', () => {
    expect(tituloDeChamadoValidado('', undefined)).toBe('Chamado validado automaticamente');
    expect(tituloDeChamadoValidado(undefined, { resultado: 'sem_tecnico', motivo: 'erro' })).toBe(
      'Chamado validado, sem técnico disponível',
    );
  });
});
