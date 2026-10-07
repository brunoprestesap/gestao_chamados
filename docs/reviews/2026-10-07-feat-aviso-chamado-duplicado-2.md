# Review 2, feat/aviso-chamado-duplicado, 2026-10-07

**Reviewed by**: Sonnet 5.5 (autor em outro modelo)
**Scope**: 68 arquivos (45 alterados e 23 novos), branch contra main, nada commitado ainda
**Verdict**: Approve with nits

## Summary

Segunda passada sobre a spec 0017 (aviso de chamado duplicado, acompanhar, aviso de fim). Reli o código novo e o diff contra a spec (AC-1 a AC-21 e a fatia 4). Não achei blocker nem major. As correções da primeira revisão estão feitas, menos três nits de estilo. Sobraram só detalhes pequenos, e a divergência de hidratação (`useId`) que você viu já existia antes desta branch.

## Situação dos achados da primeira revisão

| Achado                                                                      | Situação                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local de outra unidade reaparecia depois de acompanhar                      | Corrigido. `localVisivel` é gravado no clique (`acompanhar.ts:95`, `interessados.ts:49` e `:62`) e lido com `=== true` na vista (`acompanhamento.ts:84`) e na lateral (`lateral.ts`, campo `apoio`). Registro antigo sem o campo vale `false`.                        |
| Interessado que vira técnico atribuído continuava contando                  | Corrigido. `semTecnicoAtribuido` vale para o aviso de fim, a contagem, os nomes da gestão, a contagem da linha do tempo e a lateral.                                                                                                                                  |
| Janela entre conferir o status e gravar o interesse                         | Corrigido. `acompanhar.ts:99` relê o status depois de gravar e desfaz o interesse novo. Conferi a ordem contra o `notificarFimAosInteressados`: se o fim vier depois da releitura, o aviso já enxerga o interesse; se vier antes, a releitura pega. Não sobra buraco. |
| Aviso de fim: falha da `Notification` deixava a pessoa marcada como avisada | Corrigido (`interessados.ts:169`, volta `avisadoFimEm` a `null`). O laço em série e sem teto continua, ver Minor 2.                                                                                                                                                   |
| Cancelamento não atômico                                                    | Corrigido. `cancel/route.ts` filtra pelo status lido, responde 409 e só então grava histórico e avisa.                                                                                                                                                                |
| Nit: comentários trocados em `proposta.ts`                                  | Ainda aberto.                                                                                                                                                                                                                                                         |
| Nit: `new Set` de `ObjectId` em `interessados.ts`                           | Ainda aberto.                                                                                                                                                                                                                                                         |
| Nit: nome `veAtribuicaoAutomatica`                                          | Ainda aberto.                                                                                                                                                                                                                                                         |
| Nit: `_constants.ts` importa tipo de `_lib/acompanhar`                      | Ainda aberto.                                                                                                                                                                                                                                                         |

## Sobre o erro de hidratação (`useId` em `CartaoResumo`)

Já existia antes desta branch. O `useId` do `CartaoResumo` (`CartaoResumo.tsx:112`) e os `aria-labelledby` e `htmlFor` que saem dele não foram tocados no diff, e esta branch não mexe na árvore acima do cartão (`PainelConversa`, `[id]/page.tsx` só ganhou um ramo novo para outro tipo de página). O `useId` do React depende da posição na árvore, então um `AvisoDuplicados` novo dentro do cartão dá ids próprios a ele e não muda os do pai. Quando esse id diverge, a causa costuma ser a árvore de cima ser diferente no servidor e no navegador (algo que só renderiza no cliente, ou uma fronteira que muda), e isso vem de antes. Não consegui rodar o navegador para provar; é o que o diff mostra. O que esta branch piora um pouco é outra coisa, descrita no Minor 1.

## Minor

### 🟡 "aberto há N dias" depende do relógio e do fuso de quem renderiza, `app/(dashboard)/conversas/_components/tempo.ts:64`

**Problem**: `abertoHa` chama `new Date()` e usa `getDate()` no fuso local, durante a renderização. O cartão já vem renderizado do servidor na conversa de rascunho, então o texto pode sair diferente no servidor (fuso do container) e no navegador, sobretudo perto da meia-noite.
**Why it matters**: gera aviso de hidratação de texto e um "hoje" que pisca para "há 1 dia". É o mesmo tipo de risco que `hora()` e `quando()` já têm, mas agora há mais um ponto, dentro de um aviso que a pessoa lê para decidir.
**Suggested fix**: ou aceitar como as outras datas, ou desenhar a idade só depois de montar no cliente (estado inicial vazio ou com a data, preenchido num efeito), ou usar `suppressHydrationWarning` só nesse trecho. Não bloqueia.

### 🟡 Aviso de fim ainda corre em série e sem teto, `lib/chamados/interessados.ts:153`

**Problem**: para cada interessado há um `updateOne` e um `create`, um depois do outro, solto depois da resposta (`void`).
**Why it matters**: com poucas pessoas não pesa, mas não há limite, e um processo que cair no meio do laço deixa quem já foi marcado sem notificação (o desfazer só roda se o `create` falhar com erro, não se o processo morrer).
**Suggested fix**: se quiser endurecer, gravar a notificação primeiro e marcar `avisadoFimEm` em seguida com o filtro condicional, ou processar em lotes. Pode ficar como está se a fila de interessados for pequena, e vale uma linha na spec dizendo isso.

## Nits

- ⚪ `lib/assistente/proposta.ts:122`, o comentário "A chave estável dos candidatos de equipamento" continua colado em cima do bloco de `chaveDosDuplicados`, e `chaveDoAtivo` ficou sem o dele. Reordenar.
- ⚪ `lib/chamados/interessados.ts:274`, `new Set(ativos.map((a) => a.userId))` não deduplica `ObjectId` (compara por referência). Funciona porque o `$in` aceita repetidos, mas `String(a.userId)` diz o que se quer.
- ⚪ `app/(dashboard)/gestao/_components/ChamadoDetailSheet.tsx:321`, `veAtribuicaoAutomatica` agora também guarda "pode ver duplicado e interessados". Um nome como `ehGestao` descreve melhor.
- ⚪ `app/(dashboard)/conversas/_constants.ts:4`, importa o tipo `AcompanharFalha` de um módulo `server-only`. Funciona por ser `import type`, mas o tipo poderia morar em `shared/`.

## Strengths

- A correção do local escondido foi feita no ponto certo: a decisão é tomada no clique, vem do cartão guardado no banco, é regravada na reativação e preservada no clique repetido, e os registros antigos caem em `false`. Tudo isso tem teste.
- A ordem de conferências em `acompanharChamado` (rascunho, cartão atual, item do cartão, status, dono e técnico, gravar, reler, descartar) fecha as corridas e desfaz só o interesse que a própria ação criou.
- `buscarDuplicados` nunca lança, não registra número nem local, não chama o modelo, e o schema do item do cartão em `strictObject` impede que dado de quem abriu saia.
- Gestão, técnico e dono veem cada um só o que a spec permite: nomes só para Preposto e Admin, contagem para o técnico atribuído, nada para o dono, e `avisoDuplicado` só na rota da gestão.

## Test coverage

Boa e com intenção: testes unitários da busca, da ordenação, da ação de acompanhar (inclusive as corridas e o `localVisivel`), do aviso de fim, da linha do tempo e do `notification-url`; testes de componente para `AvisoDuplicados`, `PainelAcompanhamento` e `PainelChamado`; testes de banco para índice único, `avisadoFimEm` condicional, lateral e contagem. O autor rodou a suíte inteira com Mongo local (4158 passando) e eu não a reexecutei. Sem lacuna relevante; só não vi teste para o processo cair no meio do laço do aviso de fim, que é difícil de simular e está coberto na pior das hipóteses pela limitação descrita no Minor 2.
