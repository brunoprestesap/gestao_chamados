import type { Query, Schema } from 'mongoose';

/**
 * Registro só de inclusão (spec 0019, AC-9, AC-19): trilha, designações,
 * faixas e emissões de PDF recusam alteração e exclusão no próprio schema.
 * A única saída é a opção `ESCRITA_PROPRIA` passada pelas funções que o
 * schema autoriza (`revogarDesignacao`, `desativarFaixa`); o hook confere que
 * o `$set` só toca os campos permitidos.
 */

export const ESCRITA_PROPRIA = 'escritaPropriaMaterial';

/** As opções que as funções próprias passam ao `updateOne`. */
export const OPCAO_ESCRITA_PROPRIA = { [ESCRITA_PROPRIA]: true } as unknown as Record<
  string,
  never
>;

const OPERACOES = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const;

export class EscritaProibidaError extends Error {
  constructor(modelo: string, op: string) {
    super(`${modelo} é só de inclusão: ${op} não é permitido.`);
    this.name = 'EscritaProibidaError';
  }
}

/**
 * Registra os hooks. `camposPermitidos` vazio: nada muda nunca. Com campos,
 * só um `updateOne`/`findOneAndUpdate` com a opção `ESCRITA_PROPRIA` e `$set`
 * restrito a eles passa.
 */
export function somenteInclusao(
  schema: Schema,
  modelo: string,
  camposPermitidos: readonly string[] = [],
): void {
  for (const op of OPERACOES) {
    schema.pre(op, function (this: Query<unknown, unknown>) {
      const opcoes = this.getOptions() as Record<string, unknown>;
      if (
        camposPermitidos.length > 0 &&
        opcoes[ESCRITA_PROPRIA] === true &&
        (op === 'updateOne' || op === 'findOneAndUpdate')
      ) {
        const update = (this.getUpdate() ?? {}) as Record<string, unknown>;
        const chaves = Object.keys(update);
        const set = (update.$set ?? {}) as Record<string, unknown>;
        const soSet = chaves.every((k) => k === '$set');
        const soPermitidos = Object.keys(set).every((k) => camposPermitidos.includes(k));
        if (soSet && soPermitidos && Object.keys(set).length > 0) return;
      }
      throw new EscritaProibidaError(modelo, op);
    });
  }
  // `bulkWrite` passaria por cima dos hooks de query: o modelo recusa inteiro.
  schema.pre('bulkWrite', function () {
    throw new EscritaProibidaError(modelo, 'bulkWrite');
  });
  // `doc.save()` de um documento já gravado também é alteração.
  schema.pre('save', function (this: { isNew: boolean }) {
    if (!this.isNew) throw new EscritaProibidaError(modelo, 'save');
  });
  schema.pre('deleteOne', { document: true, query: false }, function () {
    throw new EscritaProibidaError(modelo, 'deleteOne');
  });
}
