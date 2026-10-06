# Review, feat/ativo-chat-indicadores, 2026-10-06

**Reviewed by**: Sonnet 5.5 (autor em outro modelo)
**Scope**: 56 arquivos, branch contra main (commit 49400bb)
**Verdict**: Approve with nits

## Summary

A mudança entrega a spec 0014 em duas partes. No chat, o cartão resumo sugere o equipamento pelo código digitado ou por uma regra no servidor, e a confirmação só aceita o que estava entre os candidatos. No IMR e na ficha, entram os indicadores de ativo (MTBF, MTTR, reincidência e ranking). Li o código contra os 20 critérios da spec e contra as regras do AGENTS.md, e não achei bug, falha de segurança nem quebra de contrato. Ficaram só pontos menores de custo por turno, acoplamento e texto de log.

## Minor

### 🟡 O cartão é remontado a cada turno com proposta pronta, `lib/assistente/responder.ts:395`

**Problem**: Quando a proposta está pronta, `montarCartao` roda em todo turno, mesmo quando o cartão acaba "mantido". Cada chamada faz `lerMensagens` de novo dentro de `resolverAtivoDoCartao` (o `relato` já está em memória) e mais cinco ou seis consultas (categorias, locais, subárvores, ativos, caminhos).
**Why it matters**: Antes dessa spec, o turno com cartão mantido não tocava o banco para isso. Em volume baixo não pesa, mas o custo é novo e fica em todo turno de conversa longa.
**Suggested fix**: Deixar `resolverAtivoDoCartao` aceitar as mensagens já lidas como parâmetro opcional, para não ler duas vezes. Opcionalmente, pular a regra quando serviço, unidade e local não mudaram e só o ramo de código pode ter novidade.

### 🟡 `ehMensagemDoRelato` mora em `confirmar.ts`, `lib/assistente/ativo-do-cartao.ts:24`

**Problem**: O módulo da regra do cartão importa um helper de dentro de `confirmar.ts`, que é um módulo grande com várias dependências (atribuição, notificação, conversas).
**Why it matters**: Cria um acoplamento de leitura entre cartão e confirmação, e uma dependência circular fica a uma importação de distância se `confirmar` um dia usar o cartão.
**Suggested fix**: Mover o helper para um arquivo pequeno (por exemplo `lib/assistente/relato.ts`) e importar de lá nos dois lados.

### 🟡 Decisão `ativo` faz `temDecisoes` virar verdadeiro, `lib/conversas/decisoes.ts:674`

**Problem**: Um chamado do chat com só a decisão `ativo` passa a ser "chamado com decisão" para o gancho `aplicarVeredito`, que então roda `resolverDecisao` por campo (uma leitura cada) até cair em `nao_encontrada`.
**Why it matters**: O resultado fica correto (o `nao_encontrada` é tolerado e nada é gravado), mas o comentário do gancho promete saída em silêncio e sem custo para chamado sem decisão da IA, e isso deixou de valer para esses chamados.
**Suggested fix**: Fazer `temDecisoes` ignorar `campo: 'ativo'`, no mesmo espírito do AC-11.

### 🟡 `idsDaSubarvore` por local raiz da unidade, `lib/assistente/ativo-do-cartao.ts:353`

**Problem**: A regra chama `idsDaSubarvore` uma vez para cada local ativo com `unitId` da unidade, em paralelo.
**Why it matters**: Unidade com muitos locais marcados com o próprio `unitId` gera muitas consultas num caminho quente (turno de chat). O volume atual é pequeno, então não bloqueia.
**Suggested fix**: Se o número de raízes crescer, buscar a subárvore uma vez só (por `caminho` materializado com prefixo ou uma consulta única) em vez de uma por raiz.

## Nits

- ⚪ `app/(dashboard)/relatorios/imr/page.tsx:62`, `lib/ativos/ficha.ts:276` e `lib/conversas/decisoes.ts:1738`: os logs usam `err.message`, que em erro do Mongo pode trazer valores. O resto da spec usa só `err.name` (como `resolverAtivoDoCartao`). Vale padronizar.
- ⚪ `lib/ativos/indicadores.ts:994`: a janela de 12 meses começa em `fim − 365 dias`, ou seja, às 23:59:59.999 daquele dia, então os chamados da primeira hora do dia inicial ficam de fora. Efeito desprezível, mas dá para começar no início do dia.
- ⚪ `app/(dashboard)/relatorios/imr/_components/imr-ativos.tsx:106`: o texto "Até {ranking.length} equipamentos" mostra o tamanho real da lista, não o teto de 10. Trocar por "Os {n} equipamentos com mais corretivos".
- ⚪ `lib/ativos/indicadores.ts:810`: `tempoDeReparoMs(c)` recebe o objeto inteiro e depende de os nomes dos campos baterem por acaso. Passar os três campos de forma explícita, como em `numerosDoAtivo`, evita regressão silenciosa.

## Strengths

- Todas as barreiras do ativo ficam no servidor: só candidato do cartão, só ativo que ainda passa em `buscarAtivoVinculavel`, regra descartada quando a unidade muda, e `.catch(null)` no schema para que dado torto nunca vire erro de abertura. A tela não é a única trava.
- A decisão `ativo` foi isolada com cuidado (`DECISAO_CAMPOS_DA_IA`, `derivarIaSituacao`, filtros da revisão, rota, painel, histórico e schema de confirmação), e há teste para cada uma dessas saídas.
- Os logs levam só origem e quantidade de candidatos, nunca o código digitado nem o local, e o payload do cartão é `strictObject` sem `camposPatrimoniais`, como a LGPD pede.
- Os indicadores ficam fora do `$facet` do IMR, com cálculo puro e testável, MTTR com função única e teste de paridade com o pipeline, e a ficha só calcula para quem pode ver (o Solicitante nem recebe o campo).
- Todo caminho de falha do ativo termina em "abre sem ativo", e o prompt, o portão de confiança e o SLA ficam intactos (AC-9).

## Test coverage

A cobertura é boa e acompanha os critérios: `codigosNoTexto` e a regra (unitário e com banco), confirmação com id forjado, ativo baixado e regra com unidade trocada, cartão novo quando o candidato muda (`responder.test.ts`), schemas, decisão `ativo` com o Mongo real, indicadores (puro e com banco), paridade do MTTR, componentes do cartão e da aba, e a rota `decisoes-ia`. Os `*.db.test.ts` só rodam com `MONGO_TEST_URI`, então não consegui confirmar a execução deles aqui. O que não achei coberto: `temDecisoes` com decisão só de `ativo` (ligado ao achado Minor acima) e um teste direto de que `carregarFicha` não devolve `indicadores` para o Solicitante (o `ativos.db.test.ts` pode cobrir, não abri em detalhe).
