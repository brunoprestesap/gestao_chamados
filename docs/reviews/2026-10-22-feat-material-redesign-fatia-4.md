# Review, feat/material-redesign-fatia-4, 2026-10-22

**Reviewed by**: Claude Sonnet 5.5 (autor em outro modelo)
**Escopo**: 13 arquivos, branch contra main (PR #85)
**Veredito**: Approve with nits

## Resumo

A fatia 4 troca os diálogos de motivo, encaminhar e aprovar por versões novas (DialogMotivo, DialogEncaminhar renumerado, DialogAprovar com barras e faixa). Não achei bug que quebre o comportamento: os mínimos e máximos de cada ação batem com os schemas Zod do servidor, o payload do encaminhar é o mesmo de antes, a faixa do leitor só sai na visão TRF1 em aprovação, e nenhuma regra, action ou rota mudou. Os pontos abaixo são de acabamento, acessibilidade e cobertura.

## Conferências feitas

- devolver, reprovar e cancelar usam `TransicaoComMotivoSchema` (5 a 2000, agora por `MOTIVO_MIN`/`MOTIVO_MAX`, mesmos valores de antes). `recusar_urgencia` usa `RecusarUrgenciaSchema` com `textoCurto` (10 a 500). O mapa `MOTIVO` em `DetalheCotacaoView.tsx` bate com os dois.
- `faixaDoLeitor` e `empenho.barras` ficam dentro do bloco `visao === 'trf1'` de `lib/material/leitura.ts`. Nada novo vai para contratada ou solicitante.
- `Designado.faixaNome` tem só dois produtores/consumidores relevantes (`designadosVigentes` e `leitura.ts`); `avisos.ts` só lê `userId`/`nome`. Sem quebra.
- Aprovar: `saldoDepoisCentavos >= 0` equivale ao antigo `saldoCentavos >= valorTotal`; o saldo exibido (`saldoDepois + esta`) volta ao saldo de agora no modo `aprovacao`.

## Minor

### 🟡 Erro do servidor antigo reaparece ao reenviar, `app/(dashboard)/cotacoes/_components/compartilhado/DialogMotivo.tsx:56`

**Problem**: `confirmar()` zera `editadoDepoisDoErro`, mas o pai (`DetalheCotacaoView`) só limpa `erroMotivo` ao abrir o diálogo. Depois de uma recusa do servidor e uma edição do texto, ao clicar de novo em confirmar o erro antigo volta a aparecer enquanto a nova chamada está pendente, até a resposta chegar.
**Why it matters**: pisca uma mensagem velha como se fosse nova. Não perde dado.
**Suggested fix**: o pai limpar `erroMotivo` no início do `onConfirmar` (ou o diálogo ignorar `erroServidor` enquanto `pendente`).

### 🟡 Erro do campo não é anunciado por leitor de tela, `DialogMotivo.tsx:99`

**Problem**: o `<p>` do erro não tem `role="alert"` nem região `aria-live`. O `aria-describedby` só é lido quando o foco volta ao campo; o erro do servidor (que chega sem mudança de foco) fica mudo. O toast cobre em parte, mas o AC-26 pede acessibilidade real.
**Suggested fix**: `role="alert"` no parágrafo do erro.

### 🟡 Dois botões "Cancelar" com sentido diferente, `shared/material/mensagens.ts:920` e `:945`

**Problem**: `ROTULO_FECHAR_DIALOGO` é "Cancelar", e no diálogo de cancelar a cotação o botão destrutivo é "Cancelar cotação". Na tela "Cancelar a cotação?" o usuário vê "Cancelar" (fecha, não faz nada) ao lado de "Cancelar cotação" (faz). Fácil de errar para o lado da ação destrutiva, ou de achar que "Cancelar" desfaz o cancelamento.
**Suggested fix**: usar "Voltar" no botão de fechar desses diálogos (era o rótulo antigo), ou mudar o rótulo da ação para "Confirmar cancelamento". Vale também para "Descartar rascunho".

### 🟡 Empenho escolhido não é revalidado depois do refresh, `app/(dashboard)/cotacoes/_components/detalhe/DialogAprovar.tsx:185`

**Problem**: `empenhoId` é inicializado uma vez. Se a ação falhar, `agir` faz `router.refresh()` com o diálogo ainda aberto; as `barras` mudam, mas a escolha antiga pode apontar para um empenho que agora não cabe, e o botão continua habilitado (o radio fica desabilitado, mas o valor selecionado permanece).
**Why it matters**: o servidor confere o saldo e recusa, então não há dano; só gera uma segunda recusa evitável.
**Suggested fix**: desabilitar o botão quando o empenho escolhido não estiver em `comSaldo`.

### 🟡 Lógica nova de `faixaDoLeitor` e `faixaNome` sem teste no servidor, `lib/material/leitura.ts:287`

**Problem**: os testes novos são de componente (`DialogosCotacao.test.tsx`). Nenhum teste de `lerDetalhe`/`designadosVigentes` cobre que `faixaDoLeitor` só existe para TRF1, em `em_aprovacao`, para aprovador cuja faixa cobre o valor, e que não sai para contratada (invariante AC-24). O código está certo pela leitura, mas é justamente a regra de visibilidade que o módulo protege.
**Suggested fix**: um caso em `detalhe.db.test.ts` para as quatro condições.

### 🟡 `faixaNome` de todos os aprovadores vai ao cliente TRF1, `lib/material/leitura.ts:286`

**Problem**: `detalhe.aprovadoresQueCobrem` inteiro (agora com `faixaNome`) é serializado para qualquer leitor TRF1, e o leitor só precisa da própria faixa. O limite já ia antes; o nome da faixa é dado novo, de baixo risco, só TRF1.
**Suggested fix**: opcional, manter o nome fora de `aprovadoresQueCobrem` e usá-lo só para montar `faixaDoLeitor`.

## Nits

- ⚪ `DialogAprovar.tsx:251`, a barra tem `role="img"` com `aria-label` dentro de um `<label>`, então o nome do radio repete o texto da linha logo abaixo. Funciona, só fica longo no leitor de tela.
- ⚪ `DialogAprovar.tsx:197`, `id="aprovar-empenho"` fixo; ok enquanto houver um diálogo só, `useId` seria mais seguro.
- ⚪ `DialogMotivo.tsx:116`, o "Cancelar" usa `onClick={onFechar}` sem a trava de `pendente` do `onOpenChange`; fica coberto porque o botão está `disabled` em `pendente`.
- ⚪ Contexto conhecido, não é desta fatia: o X do shadcn tem nome "Close" em inglês, e a advertência de orçamento vencido continua no painel "Sua vez" depois de confirmada.

## Strengths

- Mínimos e máximos extraídos para `MOTIVO_MIN`/`MOTIVO_MAX` e usados pelo schema e pela tela, sem duplicar o número; o servidor continua conferindo tudo.
- `DialogMotivo` montado só quando aberto (`key={motivo}`), então abre limpo; trava o fechamento durante `pendente` e foca o campo no erro.
- Os radios e checkboxes são controles reais do shadcn/Radix com `label htmlFor`, e os textos moram em `mensagens.ts`, como manda o módulo.
- `DialogEncaminhar` mantém o mesmo payload de `EncaminharSchema` e agora mostra o progresso (N de M) com texto para leitor de tela.
- A fatia não mexe em regra, action, schema de contrato nem rota (AC-29).

## Test coverage

`DialogosCotacao.test.tsx` cobre o mínimo e o erro do DialogMotivo, o contador, a recusa do servidor, o rótulo do botão de fechar, a numeração e a diferença em % do Encaminhar, a habilitação só com todos os pontos resolvidos, e o destaque, a trava e a confirmação do Aprovar. Falta: caso do reenvio depois de erro do servidor (o ponto do erro antigo), a parte de servidor de `faixaDoLeitor`/`faixaNome` (ver Minor), e o payload exato do `onConfirmar` do Encaminhar com urgência e vencidos.

## Depois da revisão (2026-10-22)

Os seis pontos Minor foram corrigidos no mesmo PR:

- Erro antigo no reenvio: o `DetalheCotacaoView` limpa `erroMotivo` antes de cada envio.
- Anúncio do erro: o parágrafo do erro do `DialogMotivo` ganhou `role="alert"`.
- Dois "Cancelar": o botão de fechar segue "Cancelar" (AC-11), e a ação do diálogo de cancelar a cotação passou a "Confirmar cancelamento".
- Empenho sem saldo depois do refresh: o `DialogAprovar` só habilita o botão com a escolha entre os empenhos com saldo; o id do rótulo agora vem de `useId`.
- Teste no servidor: `detalhe.db.test.ts` cobre `faixaDoLeitor` (TRF1 em aprovação com faixa que cobre; nada para a contratada, acima do limite ou fora de aprovação).
- `faixaNome` a mais: `aprovadoresQueCobrem` sai sem o nome da faixa; só `faixaDoLeitor` o leva.

Testes novos também em `DialogosCotacao.test.tsx` (erro do servidor anunciado e some ao editar; botão trava quando a escolha perde o saldo). Suíte de cotações, `lib/material` e `shared/material` com banco: 630 passam.
