import 'server-only';

import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';

/**
 * Nome de quem gera o relatório, lido do banco pelo `userId` da sessão
 * (spec 0016, AC-8). Fica fora de `pdf/gerar.tsx` para a página da tela não
 * puxar o `@react-pdf/renderer` só por causa dele.
 */
export async function nomeDoUsuario(userId: string): Promise<string> {
  await dbConnect();
  const u = await UserModel.findById(userId)
    .select('name username')
    .lean<{ name?: string; username?: string } | null>();
  return u?.name?.trim() || u?.username || 'Usuário';
}
