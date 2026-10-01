import { PageHeader } from '@/components/dashboard/header';
import { canManage, requireSession } from '@/lib/dal';

import { LeitorEtiqueta } from './_components/LeitorEtiqueta';

export default async function LerEtiquetaPage() {
  const sessao = await requireSession();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ler etiqueta"
        subtitle="Leia ou digite o tombamento do equipamento para ver a ficha, o que já aconteceu com ele e abrir um chamado."
      />
      <LeitorEtiqueta podeCadastrar={canManage(sessao.role)} />
    </div>
  );
}
