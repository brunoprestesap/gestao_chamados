import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/dashboard/header';
import { canManage, requireSession } from '@/lib/dal';
import { podeVistoriar } from '@/shared/vistoria/vistoria.constants';

import { CampoVistoria } from './_components/CampoVistoria';

/**
 * Tela de campo da vistoria (spec 0012, AC-3 a AC-15). Precisa ser aberta com
 * sinal; depois funciona sem ele, gravando tudo na fila do aparelho. O
 * `userId` sai da sessão aqui e fica guardado com o pacote, para a tela saber
 * de quem é a fila mesmo sem sinal (AC-15).
 */
export default async function CampoVistoriaPage() {
  const sessao = await requireSession();
  if (!podeVistoriar(sessao.role)) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vistoria: campo"
        subtitle="Escolha o prédio e a sala, leia ou digite o código e confirme os dados. Sem sinal, tudo fica guardado e sobe quando a conexão voltar."
      />
      <CampoVistoria userId={sessao.userId} podeCriarLocal={canManage(sessao.role)} />
    </div>
  );
}
