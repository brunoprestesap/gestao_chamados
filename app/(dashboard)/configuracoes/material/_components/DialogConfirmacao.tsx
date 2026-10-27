'use client';

import { DialogMotivo } from '@/app/(dashboard)/cotacoes/_components/compartilhado/DialogMotivo';
import { TEXTO_CURTO_MAX, TEXTO_CURTO_MIN } from '@/shared/material/material.constants';

/**
 * A confirmação do cadastro (spec 0021, AC-21): revogar designação, desativar
 * faixa e inativar ou reativar empenho dizem o efeito antes de agir. Desde a
 * spec 0022 (AC-5), pede também o motivo, com o mesmo campo do diálogo de
 * motivo da cotação: rótulo, contador, mínimo e erro no campo. Montado só
 * enquanto aberto, então o texto zera a cada abertura.
 */
export function DialogConfirmacao({
  titulo,
  efeito,
  rotuloConfirmar,
  destrutiva = false,
  pendente,
  erroMotivo,
  onFechar,
  onConfirmar,
}: {
  titulo: string;
  efeito: string;
  rotuloConfirmar: string;
  destrutiva?: boolean;
  pendente: boolean;
  /** A recusa do servidor ao motivo, mostrada no campo. */
  erroMotivo?: string | null;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  return (
    <DialogMotivo
      titulo={titulo}
      descricao={efeito}
      rotuloConfirmar={rotuloConfirmar}
      destrutiva={destrutiva}
      min={TEXTO_CURTO_MIN}
      max={TEXTO_CURTO_MAX}
      pendente={pendente}
      erroServidor={erroMotivo}
      onFechar={onFechar}
      onConfirmar={onConfirmar}
    />
  );
}
