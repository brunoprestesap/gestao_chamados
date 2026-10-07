# Review, feat/aviso-chamado-duplicado, 2026-10-07

**Reviewed by**: Sonnet 5.5 (autor em outro modelo)
**Scope**: 67 arquivos, branch contra main (nada commitado ainda, tudo na árvore de trabalho)
**Verdict**: Approve with nits

## Summary

A mudança implementa a spec 0017: o cartão da conversa passa a mostrar até três chamados em andamento parecidos, a pessoa pode acompanhar um deles (coleção `ChamadoInteressado`, vista só de leitura, seção na lateral, aviso de fim no sino) ou abrir mesmo assim, e a gestão vê "possível duplicado de #N" e a contagem de interessados. Li a spec (AC-1 a AC-21) e conferi o código contra ela. Não achei bug nem vazamento que bloqueie o merge. O que sobrou são pontos pequenos de consistência e robustez.

## Minor

### 🟡 O local de outra unidade volta a aparecer depois de acompanhar, `app/(dashboard)/conversas/_lib/acompanhamento.ts:90`

**Problem**: no cartão (AC-6), `localExato` de um chamado de outra pessoa e de outra unidade vem `null` justamente para o texto digitado por alguém de fora não aparecer. Na vista e na lateral (`lerAcompanhamento` e `lerAcompanhandoDaLateral`) o local sai sempre, sem olhar a unidade.
**Why it matters**: quem é de outra unidade e usa o código do equipamento no relato consegue, com um clique em "Acompanhar este", ler o local que o cartão escondeu. A spec AC-14 lista o local na vista, então pode ser intencional, mas a proteção do AC-6 fica só de enfeite.
**Suggested fix**: decidir de forma explícita. Ou aplicar a mesma regra de unidade na vista e na lateral, ou registrar na spec que o local aparece depois de acompanhar e por que isso é aceito.

### 🟡 Interessado que depois vira técnico atribuído continua interessado, `lib/chamados/interessados.ts:178`

**Problem**: `acompanharChamado` barra dono e técnico atribuído na hora de acompanhar, mas nada limpa o interesse se a pessoa for atribuída ao chamado depois. Ela passa a ter o chamado em "Chamados" e em "Acompanhando", aparece na lista de nomes da gestão e recebe também o aviso de fim.
**Why it matters**: duplicidade de item na lateral e contagem inflada em "N usuários relataram o mesmo problema".
**Suggested fix**: na atribuição (ou na leitura da lateral e da contagem), ignorar ou encerrar o interesse de quem já é técnico atribuído. Se for aceito, anotar como limitação.

### 🟡 Janela entre a conferência e a gravação do interesse, `app/(dashboard)/conversas/_lib/acompanhar.ts:88`

**Problem**: o status é conferido (passo 4) e o interesse é gravado depois, sem condição atômica. Se o chamado terminar entre os dois, o interesse nasce com `avisadoFimEm: null` e ninguém dispara o aviso de fim; o item some da lateral.
**Why it matters**: a pessoa descarta o rascunho e fica sem aviso nenhum. A spec aceita a falha do aviso, mas aqui a causa é uma corrida pequena e evitável.
**Suggested fix**: depois de `registrarInteresse`, reler o status e, se já terminou, chamar `notificarFimAosInteressados` ou desfazer e responder `chamado_encerrado`.

### 🟡 Aviso de fim em laço sequencial, `lib/chamados/interessados.ts:152`

**Problem**: para cada interessado há um `updateOne` e um `create` em série.
**Why it matters**: com poucos interessados não pesa, mas não há teto e o trabalho corre solto (`void`) depois da resposta. Uma falha no meio deixa parte das pessoas marcadas como avisadas sem notificação, porque o `avisadoFimEm` é gravado antes do `create`.
**Suggested fix**: se o `NotificationModel.create` falhar, desmarcar `avisadoFimEm` daquela pessoa; opcionalmente processar em lotes pequenos.

### 🟡 Cancelamento continua não atômico, `app/api/chamados/[id]/cancel/route.ts:61`

**Problem**: o status é lido, validado e depois atualizado com `findByIdAndUpdate` sem filtro de status. O aviso de fim novo (`void notificarFimAosInteressados(id, 'cancelado')`) dispara em qualquer corrida, inclusive sobre um chamado que acabou de ser concluído ou encerrado.
**Why it matters**: não é regressão desta mudança, mas ela passa a propagar a corrida para uma notificação ao usuário ("foi cancelado") que pode estar errada.
**Suggested fix**: filtrar o update pelo status lido e só avisar se `matchedCount` for 1.

## Nits

- ⚪ `lib/assistente/proposta.ts:121`, o comentário "A chave estável dos candidatos de equipamento" ficou colado em cima do bloco novo de `chaveDosDuplicados`, e `chaveDoAtivo` perdeu o seu. Reordenar os dois comentários.
- ⚪ `lib/chamados/interessados.ts:235`, `new Set(ativos.map((a) => a.userId))` não deduplica `ObjectId` (comparação por referência). Funciona porque o `$in` aceita repetidos, mas use `String(a.userId)`.
- ⚪ `app/(dashboard)/gestao/_components/ChamadoDetailSheet.tsx:416`, a flag `veAtribuicaoAutomatica` passou a guardar também o duplicado e os interessados. O nome engana; algo como `ehGestao` diria o que é.
- ⚪ `app/(dashboard)/conversas/_constants.ts:1`, `_constants.ts` importa o tipo de `_lib/acompanhar` (que importa `server-only`). Funciona por ser `import type`, mas inverte a direção usual; o tipo `AcompanharFalha` poderia morar em `shared/`.

## Strengths

- Segurança bem feita: o `strictObject` do item do cartão impede dado de quem abriu de sair, os ids do aviso vêm do cartão guardado no banco (nunca do navegador), `avisoDuplicado` e `interessados` só saem na rota da gestão, e a vista devolve o mesmo 404 para "não existe" e "sem interesse".
- A ação de acompanhar confere tudo no servidor em ordem (rascunho do usuário, cartão atual, item do cartão, status relido) e trata a corrida com a confirmação em outra aba desfazendo só o interesse que ela mesma criou.
- Idempotência cuidada: índice único `{ chamadoId, userId }`, tratamento do código 11000, e `avisadoFimEm` condicional para um aviso por fim, com teste de banco para as duas coisas.
- Falhas nunca derrubam o fluxo: `buscarDuplicados` devolve `null` e loga só o nome do erro, o aviso de fim é fogo e esquece, e a lateral falha só na própria seção. Nenhum log leva número, local ou texto, e não há chamada ao modelo.
- Compatibilidade: cartão antigo sem o campo vale chave vazia e não é regravado, e a lógica da chave (`duplicadosChave`) respeita o AC-5a.

## Test coverage

Há cobertura ampla e com intenção: testes unitários da busca, do ordenamento, da ação de acompanhar, do aviso de fim, da linha do tempo e de `notification-url`, testes de componente (`AvisoDuplicados`, `PainelAcompanhamento`, `PainelChamado`) e testes de banco para `duplicados`, `interessados`, `acompanhamento` e contagem na linha do tempo. A suíte completa passou com os testes de banco ligados (4132). Os pontos acima que não têm teste: a janela de corrida entre a conferência e a gravação do interesse, o interesse de quem depois vira técnico atribuído, e a falha do `NotificationModel.create` no meio do laço de avisos.
