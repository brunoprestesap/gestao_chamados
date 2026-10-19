# 0021. Texto do assistente com o cartão na tela

**Date**: 2026-10-19
**Status**: Proposed

## Summary

Quando o cartão resumo aparece no chat, o texto do assistente às vezes ainda faz uma pergunta ("há outros problemas?") ou diz que o chamado foi registrado, antes de a pessoa confirmar qualquer coisa. Decidimos atacar pelos dois lados: o prompt passa a avisar o modelo de que, com serviço e local, o Sigma mostra o resumo na conversa, e a resposta só confirma e manda conferir (versão 3 do prompt). Se mesmo assim o texto vier com pergunta ou afirmando a abertura, o servidor troca por uma frase fixa do Sigma. Os padrões que reconhecem "chamado aberto" também ficam mais largos, sem pegar negação.

## Context

O cartão sai quando a proposta tem serviço válido e local (spec 0020, que mudou o AC-4 da 0004). O modelo não sabe disso: o prompt (`lib/assistente/prompt.ts`) só manda perguntar o que falta e nunca menciona o resumo. Na reprodução contra o vLLM, com o cartão já pronto, ele respondeu "Pode confirmar se há outros problemas?", "O chamado ... foi registrado" e "Já registramos o chamado". Uma pergunta ao lado do cartão confunde a pessoa sobre o que fazer, e afirmar a abertura fere o AC-14 da 0004: até a confirmação, nenhum chamado existe.

Já existe uma segunda trava, `respostaSemAfirmarAbertura` (`lib/assistente/mensagens.ts`), que troca o texto por uma frase fixa quando ele afirma a abertura. Os padrões dela exigem "chamado" colado no verbo, então deixam passar "o chamado para reparo do ar condicionado ... foi registrado" e "registramos o chamado". Ela também não trata pergunta.

O momento ajuda: a amostra de calibração da versão `2` do prompt está em zero (produção, 19/10/2026), e a autonomia está desligada (spec 0020). Subir `PROMPT_VERSION` agora não descarta nada. Depois que a amostra começar a encher, cada mudança de prompt zera a coleta.

A ordem atual em `transmitir` (`lib/assistente/responder.ts`) grava e envia o texto (`fim`) antes de decidir o cartão (`atualizarProposta`, que relê a proposta gravada). A trava precisa saber se haverá cartão antes de gravar o texto, e a única informação disponível nesse momento é a extração desta volta.

## Requirements

**User stories**:

- Como solicitante, quero que, com o resumo na conversa, o assistente só me diga para conferir e confirmar, para eu não ficar em dúvida entre responder e confirmar.
- Como solicitante, quero que o assistente nunca diga que o chamado foi aberto antes de eu confirmar, para eu não ir embora achando que já está feito.

**Acceptance criteria**:

- **AC-1**: O prompt diz ao modelo que, quando ele preenche `servicoCodigo` e `localExato`, o Sigma mostra um resumo do chamado na conversa, e que nesse caso a resposta confirma em uma frase o que entendeu e pede para conferir o resumo, sem pergunta e sem dizer que o chamado foi aberto ou registrado. O texto não diz onde o resumo está ("abaixo"), porque um cartão mantido fica mais acima. `PROMPT_VERSION` passa a `'3'`.
- **AC-2**: A prontidão da volta é calculada uma vez, em `transmitir`, pela extração desta volta já validada contra o catálogo: `validarExtracao` roda uma vez e `propostaProntaParaCartao(extracao.entrada)` decide. O mesmo resultado de `validarExtracao` é passado a `atualizarProposta`, que não valida de novo.
- **AC-3**: Numa volta pronta, se a `resposta` do modelo contém `?`, o texto gravado e enviado no quadro `fim` é a frase fixa `RESPOSTA_COM_CARTAO`: "Confira o resumo do chamado nesta conversa e toque em Confirmar e abrir chamado se estiver tudo certo. Se algo estiver errado, corrija no resumo ou me conte aqui." Vale com cartão novo ou mantido. Numa volta não pronta, a pergunta passa sem troca.
- **AC-4**: Em qualquer volta, texto que afirma a abertura é trocado: por `RESPOSTA_COM_CARTAO` numa volta pronta, por `RESPOSTA_SEM_CHAMADO_AINDA` numa volta não pronta. Os padrões passam a reconhecer, dentro da mesma frase (sem `.`, `!`, `?` ou quebra de linha no meio) e com no máximo 80 caracteres entre o sujeito e o verbo: "chamado", "pedido" ou "solicitação" seguido de foi, está ou ficou (com "já" opcional) e de aberto, criado, registrado ou confirmado, em qualquer gênero; "registramos", "abrimos", "criamos" ou "geramos" seguido, em até três palavras, de chamado, pedido, solicitação ou ocorrência; e "iniciamos", "começamos" ou "demos início a" seguido de "o processo de abertura" ou "o processo de registro". Continuam valendo os padrões de número e protocolo.
- **AC-5**: Os padrões não casam com negação nem com futuro: "Nenhum chamado foi aberto ainda", "o chamado ainda não foi aberto", "o chamado será aberto quando você confirmar" e "o chamado só será criado depois" passam sem troca.
- **AC-6**: Uma função pura, `escolherTextoDaResposta({ resposta, pronta })` em `lib/assistente/mensagens.ts`, devolve `{ texto, motivo }`, com `motivo` `null`, `'afirmava_aberto'` ou `'pergunta_com_cartao'`. Quando o texto tem `?` e também afirma a abertura, vence `'afirmava_aberto'`. Ela substitui a chamada atual a `respostaSemAfirmarAbertura` em `transmitir`; `respostaSemAfirmarAbertura` continua exportada e passa a delegar a ela.
- **AC-7**: Nenhum texto fixo de troca (`RESPOSTA_COM_CARTAO`, `RESPOSTA_SEM_CHAMADO_AINDA`) contém `?`, e nenhum casa com os padrões de abertura, para a troca nunca disparar de novo sobre si mesma.
- **AC-8**: A troca muda só o texto. A extração, a proposta, o cartão e a decisão do portão seguem iguais, e o texto trocado é o que fica gravado na conversa.
- **AC-9**: Cada troca gera uma linha de log `[assistente] resposta trocada` com `conversaId`, `motivo` e `pronta` (booleano), sem texto de relato, de resposta nem de local. Ela substitui a linha atual `resposta afirmava chamado aberto`.
- **AC-10**: O texto parcial continua aparecendo enquanto o modelo escreve; quando há troca, o quadro `fim` traz a frase fixa, e ela substitui o parcial na tela e na região ao vivo (`useEnvio.ts` limpa o parcial e usa o texto do `fim`).

## Options considered

### Option 1: Prompt e trava no servidor

Avisar o modelo do resumo no prompt e, como segunda linha, trocar no servidor a resposta que ainda vier com pergunta ou afirmando a abertura.

**Pros**:

- O texto fica natural quase sempre, e o erro do modelo nunca chega à tela.

**Cons**:

- Duas peças para manter, e a troca no fim ainda aparece como um piscar quando acontece.

### Option 2: Só a trava no servidor

Toda volta com proposta pronta mostra uma frase fixa, sem mexer no prompt.

**Pros**:

- Totalmente garantido e sem mudar a versão do prompt.

**Cons**:

- A conversa fica robótica, perde a confirmação com as palavras da pessoa e pisca em toda volta com cartão.

### Option 3: Só o prompt

Ensinar o modelo e confiar nele.

**Pros**:

- Uma mudança só, sem código novo.

**Cons**:

- O Qwen já ignorou regras parecidas ("não repita a pergunta"); a falha chegaria à tela.

## Decision

**Chosen option**: Option 1: Prompt e trava no servidor

O prompt (versão 3) avisa o modelo do resumo, e o servidor, por `escolherTextoDaResposta`, troca por uma frase fixa a resposta que afirma a abertura ou que pergunta numa volta pronta.

## Rationale

O modelo é bom em confirmar com as palavras da pessoa, e é isso que torna o chat melhor que o formulário; só a trava jogaria isso fora em toda volta com cartão. Mas o modelo não obedece regra de forma confiável, como os logs da 0020 mostraram, então a garantia tem de estar no servidor, igual à trava que já existe para a abertura. O `?` é um sinal simples e determinístico de pergunta. Fazer agora, com a amostra da versão `2` vazia, evita zerar uma coleta que ainda não começou.

## Feature design

**Data model sketch**: nenhuma mudança de schema.

**API surface**: nenhuma rota nova. O quadro `fim` de `POST /api/conversas/mensagens` e `POST /api/conversas/[id]/mensagens` continua com o mesmo formato; muda só o texto que ele pode trazer.

**Value sourcing**:

| Action                              | Value produced / displayed       | Source                                                                                                                             |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `transmitir` (volta do chat)        | a extração validada              | `validarExtracao` sobre `final.data` e o catálogo lido em `lerContexto`, uma vez por volta, repassada a `atualizarProposta`        |
| `transmitir`                        | `pronta`                         | `propostaProntaParaCartao(extracao.entrada)` (serviço válido e `localExato` não vazio)                                             |
| `transmitir`                        | se a resposta tem pergunta       | `final.data.resposta` contém `?`                                                                                                   |
| `transmitir`                        | se a resposta afirma abertura    | `afirmaChamadoJaAberto(final.data.resposta)` com os padrões do AC-4 e as exclusões do AC-5                                         |
| `transmitir`                        | texto gravado e enviado no `fim` | `escolherTextoDaResposta({ resposta, pronta }).texto`: a resposta do modelo, `RESPOSTA_COM_CARTAO` ou `RESPOSTA_SEM_CHAMADO_AINDA` |
| log `[assistente] resposta trocada` | `motivo`, `pronta`               | o retorno de `escolherTextoDaResposta` e o `pronta` da volta                                                                       |

**Key invariants**:

- A prontidão do texto e a do cartão usam a mesma regra (`propostaProntaParaCartao`) sobre a mesma extração validada.
- A troca nunca muda extração, proposta, cartão ou portão.
- Texto fixo da troca é sempre do Sigma, nunca do modelo, e nunca dispara a própria troca.

**Divergências aceitas** (raras; nelas o texto pode citar um resumo que não mudou nesta volta, o que continua verdadeiro sobre a conversa):

- Duas abas: a proposta desta volta chega depois de uma mais nova (`proposta_velha`) e não é gravada; o cartão que vale é o da outra resposta.
- Serviço desativado entre a leitura do catálogo e `montarCartao`: não sai cartão da IA nesta volta.
- `gravarCartao` perde uma corrida: quem chegou depois decide o cartão.
- Cartão manual mantido (nascido da reserva) com conteúdo igual ao da extração pronta: fica o manual, e "confira o resumo" continua verdadeiro.

**Riscos conhecidos**:

- O histórico (`montarHistorico`) devolve ao modelo a frase fixa como se fosse dele; ele pode imitá-la numa volta sem cartão. A reprodução do plano cobre isso com três voltas seguidas.
- Numa volta pronta, uma pergunta legítima do modelo (por exemplo, duas salas possíveis) vira a frase fixa; a pessoa corrige o local no cartão.

**Security model**: sem mudança. Os logs seguem sem texto de conversa (regra do `lib/assistente/AGENTS.md`).

**Critical test scenarios**:

- Volta pronta e resposta com `?`: o `fim` e a mensagem gravada trazem `RESPOSTA_COM_CARTAO`, e o cartão sai igual, verifica **AC-3**, **AC-8**
- Cartão mantido e resposta com `?`: troca também, verifica **AC-3**
- Volta sem local e resposta com `?`: passa sem troca, verifica **AC-3**
- `?` e afirmação de abertura juntos: motivo `afirmava_aberto`, verifica **AC-6**
- Cada frase real da reprodução ("O chamado para reparo do ar-condicionado da sala do 1º piso do prédio foi registrado.", "Já registramos o chamado", "Seu pedido foi registrado", "Já iniciamos o processo de abertura") é reconhecida, verifica **AC-4**
- As frases de negação e futuro do AC-5, e "iniciamos o processo de coleta", não são reconhecidas, verifica **AC-5**
- Os textos fixos não têm `?` e não casam com os padrões, verifica **AC-7**
- `validarExtracao` roda uma vez por volta, verifica **AC-2**
- A linha de log traz `motivo` e `pronta` e não traz texto, verifica **AC-9**
- `montarSistema` traz a regra do resumo sem "abaixo", e `PROMPT_VERSION` é `'3'`, verifica **AC-1**

## Build plan

Tracer Bullet: a trava no servidor primeiro, porque ela sozinha já protege a tela; o prompt depois.

1. Em `lib/assistente/mensagens.ts`: padrões novos com exclusão de negação e futuro, `RESPOSTA_COM_CARTAO`, `escolherTextoDaResposta` e `respostaSemAfirmarAbertura` delegando a ela; testes por frase real, pelas exclusões e pelos textos fixos, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**
2. Em `lib/assistente/responder.ts`: validar a extração uma vez em `transmitir`, calcular `pronta`, escolher o texto com `escolherTextoDaResposta` antes de gravar, gravar e enviar esse texto no `fim`, logar a troca e passar a extração a `atualizarProposta`; testes em `responder.test.ts`, satisfies **AC-2**, **AC-3**, **AC-8**, **AC-9**, **AC-10**
3. Acrescentar ao prompt a regra do resumo e subir `PROMPT_VERSION` para `'3'`; procurar com grep os testes e trechos de `lib/ia-confianca` e `lib/assistente` que fixam `'2'` e ajustar, satisfies **AC-1**
4. Repetir a reprodução contra o vLLM (as cinco falas da 0020, com e sem unidade no perfil, e uma conversa de três voltas seguidas com o cartão já valendo) e o teste de fumaça do AC-19 da 0004 com a versão 3, satisfies **AC-1**, **AC-3**

## Consequences

**Positive**:

- Com o cartão na conversa, a pessoa só vê a instrução de conferir e confirmar.
- Afirmar a abertura antes da confirmação fica bloqueado nas formas reais que o modelo usa, sem pegar negação.

**Negative / tradeoffs**:

- Subir para a versão 3 zera a amostra da calibração (hoje vazia) e desliga a autonomia até o Admin salvar a calibração de novo (hoje já desligada).
- Quando há troca, a pessoa vê a pergunta por um instante antes da frase fixa.
- O `?` não distingue pergunta retórica nem `?` dentro de aspas; uma resposta boa com `?` vira a frase fixa.

**Neutral**:

- Os padrões mais largos podem pegar alguma frase inocente; a troca é segura (só muda para uma frase fixa verdadeira), e os testes fixam o que não deve casar.

## Follow-up

- [ ] Depois do deploy, olhar quantas linhas `[assistente] resposta trocada` aparecem por semana, separadas por `motivo` e `pronta`; se forem muitas, o prompt da versão 3 não está funcionando e vale rever a redação antes de a amostra da calibração crescer
