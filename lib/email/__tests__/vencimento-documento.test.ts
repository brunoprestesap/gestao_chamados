import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * E-mail do aviso de vencimento (spec 0013, AC-12): pula sem SMTP ou sem
 * e-mail, escapa o texto no HTML, leva o link absoluto e nunca lança.
 */

const smtp = vi.hoisted(() => ({ configurado: true, enviar: vi.fn() }));
vi.mock('../transporter', () => ({
  FROM_ADDRESS: 'sigma@teste.local',
  get smtpConfigured() {
    return smtp.configurado;
  },
  get transporter() {
    return smtp.configurado ? { sendMail: smtp.enviar } : null;
  },
}));

import type { AvisoVencimento } from '@/lib/ativos/documentos/aviso';

import { APP_URL } from '../templates';
import { enviarEmailVencimento } from '../vencimento-documento';

const aviso: AvisoVencimento = {
  titulo: 'AVCB do <Prédio> vence em 7 dias',
  corpo: 'Tipo: AVCB\nLocal: Prédio & Anexo',
  data: { documentoId: 'd', tipo: 'avcb', limite: '30' },
};
const URL_AVISO = '/ativos/documentos?predio=abc';

beforeEach(() => {
  vi.clearAllMocks();
  smtp.configurado = true;
  smtp.enviar.mockResolvedValue({});
});

describe('enviarEmailVencimento', () => {
  it('sem SMTP configurado não envia e devolve false', async () => {
    smtp.configurado = false;
    expect(await enviarEmailVencimento({ email: 'a@x', name: 'A' }, aviso, URL_AVISO)).toBe(false);
  });

  it('usuário sem e-mail não envia', async () => {
    expect(await enviarEmailVencimento({ email: null, name: 'A' }, aviso, URL_AVISO)).toBe(false);
    expect(smtp.enviar).not.toHaveBeenCalled();
  });

  it('o título é o assunto, o texto leva o corpo e o link absoluto', async () => {
    expect(await enviarEmailVencimento({ email: 'a@x', name: 'Ana' }, aviso, URL_AVISO)).toBe(true);
    const msg = smtp.enviar.mock.calls[0][0];
    expect(msg).toMatchObject({ from: 'sigma@teste.local', to: 'a@x' });
    expect(msg.subject).toBe('[Sigma] AVCB do <Prédio> vence em 7 dias');
    expect(msg.text).toContain('Local: Prédio & Anexo');
    expect(msg.text).toContain(`${APP_URL}${URL_AVISO}`);
    expect(msg.html).toContain(`href="${APP_URL}${URL_AVISO}"`);
    expect(msg.html).toContain('Ver documento');
  });

  it('texto digitado entra escapado no HTML', async () => {
    await enviarEmailVencimento({ email: 'a@x', name: '<b>Ana</b>' }, aviso, URL_AVISO);
    const { html } = smtp.enviar.mock.calls[0][0];
    expect(html).toContain('AVCB do &lt;Prédio&gt;');
    expect(html).toContain('Prédio &amp; Anexo');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(html).not.toContain('<b>Ana</b>');
  });

  it('falha do SMTP devolve false, sem lançar', async () => {
    smtp.enviar.mockRejectedValue(new Error('conexão recusada'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enviarEmailVencimento({ email: 'a@x' }, aviso, URL_AVISO)).resolves.toBe(false);
  });
});
