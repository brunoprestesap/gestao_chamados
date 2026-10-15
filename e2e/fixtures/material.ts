import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';

/**
 * O cadastro do fluxo de material (spec 0019) que os E2E de cotação usam:
 * empenho com saldo, faixa ativa e designações vigentes. Idempotente: roda a
 * cada execução e só cria o que falta, sem nunca revogar nem apagar (o
 * modelo é só de inclusão).
 *
 * Papéis: `preposto` é o responsável técnico; `admin` é fiscal, gestor e
 * aprovador (quem monta nunca é o `admin`, então a regra "quem montou não
 * aprova" não atrapalha).
 */

export const EMPENHO_E2E = 'E2E-MATERIAL';
const FAIXA_E2E = 'E2E Grande';

function carregarMongoUri(): string | undefined {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return undefined;
  for (const linha of readFileSync(p, 'utf8').split('\n')) {
    const t = linha.trim();
    if (!t.startsWith('MONGODB_URI=')) continue;
    return t.slice('MONGODB_URI='.length).replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/** Hoje e o ano em Belém, como o servidor conta a vigência e o exercício. */
function hojeEmBelem(): { hoje: string; ano: number } {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return { hoje, ano: Number(hoje.slice(0, 4)) };
}

export async function garantirCadastroMaterial(): Promise<void> {
  const uri = carregarMongoUri();
  if (!uri) throw new Error('MONGODB_URI não definido: o E2E de cotação precisa do banco.');
  const conexao = await mongoose.createConnection(uri).asPromise();
  try {
    const db = conexao.db!;
    const { hoje, ano } = hojeEmBelem();
    const agora = new Date();
    const users = db.collection('users');
    const admin = await users.findOne({ username: 'admin' });
    const preposto = await users.findOne({ username: 'preposto' });
    if (!admin || !preposto) throw new Error('Usuários E2E ausentes: rode o global-setup.');

    // Faixa ativa com limite folgado.
    const faixas = db.collection('faixascompetencia');
    let faixa = await faixas.findOne({ nome: FAIXA_E2E, ativa: true });
    if (!faixa) {
      const { insertedId } = await faixas.insertOne({
        nome: FAIXA_E2E,
        limiteCentavos: 100_000_000,
        ativa: true,
        criadoPorUserId: admin._id,
        em: agora,
      });
      faixa = await faixas.findOne({ _id: insertedId });
    }

    // Designações vigentes, só quando ainda não há uma para a pessoa e o papel.
    const designacoes = db.collection('designacoesmaterial');
    const vigente = {
      revogadaEm: null,
      vigenciaInicio: { $lte: hoje },
      $or: [{ vigenciaFim: null }, { vigenciaFim: { $gte: hoje } }],
    };
    for (const [user, papel] of [
      [preposto, 'responsavel_tecnico'],
      [admin, 'fiscal'],
      [admin, 'gestor'],
      [admin, 'aprovador'],
    ] as const) {
      const existe = await designacoes.findOne({ userId: user._id, papel, ...vigente });
      if (existe) continue;
      await designacoes.insertOne({
        userId: user._id,
        papel,
        faixaId: papel === 'aprovador' ? faixa!._id : null,
        vigenciaInicio: '2000-01-01',
        vigenciaFim: null,
        ato: 'E2E',
        criadoPorUserId: admin._id,
        em: agora,
        revogadaEm: null,
        revogadaPorUserId: null,
      });
    }

    // Empenho do exercício corrente com saldo de sobra.
    const empenhos = db.collection('empenhosmaterial');
    const empenho = await empenhos.findOne({ numero: EMPENHO_E2E });
    if (!empenho) {
      await empenhos.insertOne({
        numero: EMPENHO_E2E,
        exercicio: ano,
        contratoId: null,
        valorInicialCentavos: 100_000_000,
        movimentos: [],
        valorLiquidoCentavos: 100_000_000,
        reservas: [],
        comprometidoCentavos: 0,
        vigenciaFim: null,
        ativo: true,
        criadoPorUserId: admin._id,
        createdAt: agora,
        updatedAt: agora,
      });
    } else {
      await empenhos.updateOne(
        { _id: empenho._id },
        { $set: { exercicio: ano, ativo: true, vigenciaFim: null, updatedAt: agora } },
      );
      if (empenho.valorLiquidoCentavos - empenho.comprometidoCentavos < 1_000_000) {
        await empenhos.updateOne(
          { _id: empenho._id },
          { $inc: { valorLiquidoCentavos: 100_000_000 } },
        );
      }
    }
  } finally {
    await conexao.close();
  }
}

/** Um PDF mínimo (só a assinatura importa para o upload). */
export function pdf(nome: string) {
  return {
    name: nome,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  };
}
