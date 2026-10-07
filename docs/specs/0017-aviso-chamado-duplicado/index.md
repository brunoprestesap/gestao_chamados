# 0017. Aviso de chamado duplicado no cartão resumo

**Date**: 2026-10-07
**Status**: Accepted

## Summary

Quando o cartão resumo da conversa fica pronto, o servidor procura chamados em andamento que parecem ser o mesmo problema: mesmo equipamento, ou mesmo subtipo de serviço na mesma unidade com alguma palavra do local em comum. Achando, o cartão mostra até três deles acima do botão de abrir, só com número, serviço, local, equipamento, status e idade, nunca quem abriu nem o relato. A pessoa pode passar a acompanhar um deles (vira interessada, o rascunho é descartado, o chamado aparece na lateral numa vista só de leitura e o sino avisa quando ele termina) ou abrir mesmo assim com o mesmo clique de sempre; nesse caso a gestão vê "possível duplicado de #N" na triagem. Tudo é regra no servidor, sem chamar o modelo, e nenhuma falha da busca impede a abertura.

## Requirements

**User stories**:

- Como solicitante, quero saber, antes de abrir, que alguém já pediu conserto do mesmo problema, para acompanhar aquele em vez de abrir outro.
- Como solicitante que já abriu um chamado e esqueceu, quero que o chat me lembre do meu, para não abrir dois.
- Como interessado, quero ver em que pé está o chamado que passei a acompanhar e ser avisado quando ele terminar, sem precisar perguntar a ninguém.
- Como Preposto, quero ver que um chamado novo foi aberto mesmo depois do aviso, e quantas pessoas relataram o mesmo problema, para cancelar duplicados e priorizar o que afeta mais gente.

**Acceptance criteria**:

_Busca dos parecidos (no servidor, sem modelo)_

- **AC-1**: Ramo do equipamento. Só conta ativo com sinal de identidade: candidatos de `cartao.ativo` com `origem: 'codigo'` (spec 0014), ou o candidato único de `origem: 'regra'` (com 2 a 5 candidatos de regra, o ramo não roda, porque eles são palpites). Com esse ativo, em qualquer modo de cartão e sem olhar unidade nem serviço, são parecidos os chamados com `ativoId` entre esses ids e `status` em `CHAMADO_STATUS_EM_ANDAMENTO` (`aberto`, `validado`, `em atendimento`, `aguardando_solicitante`, `aguardando_terceiros`).
- **AC-2**: Ramo da regra. Só com cartão em modo `ia` e com unidade no cartão: são parecidos os chamados com `unitId` igual a `cartao.unidade.unitId`, `tipoServico` e `subtypeId` iguais aos de `cartao.servico`, `status` em `CHAMADO_STATUS_EM_ANDAMENTO`, e pelo menos uma palavra em comum entre `palavrasDoLocal(chamado.localExato)` e `palavrasDoLocal(cartao.localExato)` (a mesma função e a mesma lista `PALAVRAS_LOCAL_IGNORADAS` da spec 0014). Sem palavra em comum, o chamado não conta, mesmo com serviço e unidade iguais.
- **AC-3**: Sem sinal, sem aviso. Cartão em modo `manual` só usa o ramo do AC-1 (na prática, ativo pelo código digitado). Cartão `ia` sem unidade, ou com `localExato` vazio, só usa o ramo do AC-1. Nenhum ramo achando nada deixa `duplicados: null`.
- **AC-4**: Ordem e teto. Cada ramo lê do banco no máximo `DUPLICADOS_LEITURA_MAX` (50) chamados, ordenados por `createdAt` mais recente; o filtro de palavras do AC-2 roda no servidor sobre essa leitura (um parecido mais antigo que os 50 mais recentes do mesmo subtipo na unidade escapa, e isso é aceito). Os dois ramos se juntam sem repetição e se ordenam por: veio do ramo do equipamento primeiro; depois mais palavras do local em comum (item só do ramo do equipamento conta as palavras do mesmo jeito, podendo ser zero); depois `createdAt` mais recente. O cartão leva só os `DUPLICADOS_CARTAO_MAX` (3) primeiros.
- **AC-5**: Chamados do próprio usuário entram na busca. Cada item leva `proprio: true` quando `chamado.solicitanteId` é o usuário da conversa, e `jaTemAcesso: true` quando o usuário é Preposto, Admin ou o técnico atribuído (`assignedToUserId`) daquele chamado.
- **AC-5a**: A busca só roda quando o cartão é montado com a proposta pronta (em `responder.ts`) ou por `Revisar e abrir`. Num turno em que `montarCartao` roda só porque há código no relato, sem a proposta pronta, o cartão não leva parecidos e mantém a chave do cartão atual.

_O cartão_

- **AC-6**: O payload do cartão ganha `duplicados`: `null` ou de 1 a 3 itens, cada um com exatamente `chamadoId`, `ticketNumber`, `rotuloServico`, `localExato` (ou `null`), `ativoCodigo` (ou `null`), `status`, `abertoEm`, `proprio` e `jaTemAcesso`, em `strictObject`. O `localExato` vem `null` quando o chamado parecido é de outra pessoa e de unidade diferente da do cartão (só acontece pelo ramo do equipamento), para o texto digitado por alguém de outra unidade não aparecer. O `rotuloServico` sai de `ServiceCatalog.name` cortado em `DECISAO_ROTULO_MAX`, ou `SERVICO_A_DEFINIR` sem serviço; os rótulos de serviço e os códigos de ativo são lidos em lote (uma consulta `$in` para cada). Nunca nome, matrícula, unidade ou id de quem abriu, `descricao`, título, comentários, anexos, prioridade nem técnico. Cartão gravado antes desta spec não tem o campo e é lido como `null`; o cartão novo sempre grava o campo explícito.
- **AC-7**: Na tela, com `duplicados` preenchido, o cartão mostra um bloco "Parece que já existe um chamado para isso" acima do botão de confirmar, com uma linha por item: "#número · serviço · local · equipamento (se houver) · status · aberto há N dias". O texto nunca afirma "mesmo equipamento" nem "mesmo problema": diz que o chamado parece ser o mesmo. Item com `jaTemAcesso` (sem ser `proprio`) tem o link "Ver chamado", que só navega. Os demais itens de outra pessoa têm o botão "Acompanhar este"; item `proprio` diz "Você já abriu este chamado" e tem o link "Ver meu chamado" para `/conversas/<chamadoId>`, que só navega (o rascunho continua na lateral). O botão de confirmar não muda de texto nem pede passo extra: confirmar é o "abrir mesmo assim". O bloco é uma região com título próprio para o leitor de tela. Cartão substituído mostra o bloco desabilitado, como o resto dele.
- **AC-8**: Cartão novo quando os parecidos mudam. `ConteudoVisivel` ganha `duplicadosChave` (os `chamadoId` na ordem, unidos por `|`, vazia sem parecidos), comparada em `mesmoConteudo`; um cartão antigo sem o campo vale chave vazia e não é regravado só por isso. Em `responder.ts`, `conteudoDaProposta` ganha um quarto parâmetro `duplicadosChave`, igual ao `ativoChave` da 0014: vem do payload montado quando a busca rodou (AC-5a), e do cartão atual (`conteudoDoCartao(atual.payload).duplicadosChave`, ou vazia sem cartão) quando não rodou. Um parecido novo, ou um que saiu de andamento, regrava o cartão no turno seguinte de proposta pronta, e isso é esperado.

_Acompanhar_

- **AC-9**: "Acompanhar este" chama `acompanharChamadoAction({ conversaId, cartaoId, chamadoId })`. O servidor confere, nesta ordem: a conversa é rascunho do usuário e não está reservada; `cartaoId` é o cartão atual da conversa; `chamadoId` está em `duplicados` desse cartão com `proprio: false` e `jaTemAcesso: false`; o chamado ainda está em `CHAMADO_STATUS_EM_ANDAMENTO`. Passando, grava o interesse (cria, ou reativa um registro com `saiuEm` preenchido: `saiuEm: null`, `criadoEm` atual, `avisadoFimEm: null`), sempre com `localVisivel` igual a `item.localExato !== null` do item do cartão (a mesma decisão do AC-6, tomada naquele clique, gravada também na reativação; chamado sem local conta como visível, porque não há nada a esconder). Interesse que já está ativo não muda, nem o `localVisivel`: o clique repetido é idempotente e um segundo cartão nunca alarga nem encolhe a decisão. Desfazer um interesse grava só `saiuEm` e não restaura nenhum outro campo, lê o status do chamado de novo e então descarta o rascunho por `descartarRascunho`. Se o chamado saiu de andamento entre a conferência e a gravação, a ação desfaz o interesse que acabou de gravar e responde `chamado_encerrado`, sem descartar o rascunho. A tela navega para `/conversas/<chamadoId>`. Se o descarte devolver `confirmacao_em_andamento` (a pessoa confirmou o cartão em outra aba no meio do caminho), a ação desfaz o interesse que acabou de gravar (grava `saiuEm`) e responde `confirmacao_em_andamento`: ninguém termina com interesse e chamado novo ao mesmo tempo.
- **AC-10**: Corrida com o fim do chamado. Se o chamado saiu de andamento entre o cartão e o clique, a ação responde `chamado_encerrado`, não grava nada, não descarta o rascunho, e a tela mostra "Esse chamado já foi concluído ou encerrado. Se o problema continua, abra o seu." O cartão segue confirmável.
- **AC-11**: Interesse gravado e descarte falhando por outro motivo (`erro`, `nao_encontrada`) não é erro para a pessoa: a ação devolve `ok: true` com `rascunhoDescartado: false`, a tela navega do mesmo jeito, e o rascunho fica na lateral para ela descartar. Repetir o clique é idempotente (o índice único de `{ chamadoId, userId }` garante um registro só).

_Abrir mesmo assim_

- **AC-12**: Confirmar um cartão com `duplicados` preenchido grava no chamado novo `avisoDuplicado: { chamadoIds, em }`, com os `chamadoId` do cartão confirmado (inclusive os `proprio`), só na criação (uma repetição com `jaExistia` não regrava). Os ids vêm do cartão guardado no banco, nunca do navegador. Cartão sem parecidos deixa `avisoDuplicado: null`.
- **AC-13**: A gestão vê. `GET /api/gestao/chamados` e o detalhe da gestão (`ChamadoDetailSheet`) mostram "Possível duplicado de #N" (números lidos na hora pelos ids, com link para cada um) para Preposto e Admin. Id que não existe mais é omitido; sem nenhum id válido, a linha não aparece. O campo nunca sai para solicitante nem técnico.

_A vista do interessado_

- **AC-14**: `/conversas/[id]` resolve, nesta ordem: conversa, chamado (dono, técnico atribuído, gestão, como hoje) e, por último, acompanhamento, quando o usuário tem interesse ativo (`saiuEm: null`) naquele chamado. A vista de acompanhamento sai de uma leitura própria (`lerAcompanhamento`), com tipo próprio, e mostra só: número, serviço, local (só quando o interesse tem `localVisivel === true`, comparação estrita; com `false` ou o campo ausente, a linha do local não aparece), código do equipamento, status atual, data de abertura, desde quando acompanha e os marcos (cada entrada de `ChamadoHistory` com `statusNovo` diferente de `statusAnterior`, como "Em atendimento, 08/10 às 14:20", com o rótulo de `CHAMADO_STATUS_LABELS`). Nunca autor, técnico, comentário, texto do histórico, relato, anexo, avaliação ou prioridade. Sem composer de comentário. Quem não tem interesse ativo recebe o mesmo 404 de conversa inexistente (mesma página `notFound()`, sem diferença de conteúdo entre "não existe", "sem permissão" e "sem interesse"). `lerAcompanhamento` só roda quando a leitura de chamado falhou por falta de permissão.
- **AC-15**: A lateral de `/conversas` ganha a seção "Acompanhando", entre rascunhos e chamados, com os interesses ativos do usuário cujo chamado está em andamento, ou cujo `avisadoFimEm` é de no máximo `ACOMPANHANDO_DIAS_APOS_FIM` (7) dias atrás, até `CHAMADOS_POR_PAGINA` itens, ordenados por `criadoEm` do interesse (mais recente primeiro), sem "carregar mais". Cada `ItemLateral` de tipo `acompanhamento` tem `titulo` "#número · serviço", `apoio` com o local exato só quando o interesse tem `localVisivel === true` (senão vazio; o valor vem do próprio registro de interesse, lido junto da lista), `situacao` com `CHAMADO_STATUS_LABELS[status]`, `statusChave` com o status, `em` com `criadoEm` e `href` `/conversas/<chamadoId>`. Interesse de quem virou o técnico atribuído daquele chamado não aparece (ele já o vê em "Chamados"). Seção vazia não aparece. Ela vem pronta na primeira pintura, como o resto da lateral, e uma falha na leitura deixa só ela vazia. Interesse cujo chamado terminou sem `avisadoFimEm` (o aviso falhou) some da lateral, mas a vista continua abrindo: limitação aceita.
- **AC-16**: "Deixar de acompanhar" na vista chama `deixarDeAcompanharAction({ chamadoId })`, que grava `saiuEm` no registro do próprio usuário (idempotente) e volta para `/conversas`. Depois disso a vista responde 404 e o item some da lateral. O registro nunca é apagado.

_O aviso de fim_

- **AC-17**: Quando o chamado vai para `concluído` (técnico registra a conclusão), `cancelado` (rota de cancelamento) ou `recusado` (`rejectTicketAction`), cada interessado ativo com `avisadoFimEm: null`, fora o técnico atribuído do chamado, recebe uma `Notification` do tipo `interesse:fim`, com o texto por status em `title` ("O chamado #N que você acompanha foi concluído", "...foi cancelado. Se o problema continua, abra um novo chamado", "...foi recusado. Se o problema continua, abra um novo chamado"), `body` vazio e `data: { chamadoId, ticketNumber, status }`. A chamada acontece só depois de a mudança de status ter sido gravada, e o `avisadoFimEm` é gravado de forma condicional (`avisadoFimEm: null` no filtro), então cada pessoa recebe no máximo um aviso por fim. Só no sino, sem evento do Socket.IO. Se a `Notification` de uma pessoa falha, o `avisadoFimEm` dela volta a `null`, para uma nova chamada ainda poder avisá-la. Falha aqui nunca derruba a ação que mudou o status (fogo e esquece, com log). A rota de cancelamento só grava `cancelado` se o status ainda for o que ela leu; se mudou no meio, responde 409 sem histórico e sem aviso. Depois de "deixar de acompanhar", o link de uma notificação antiga dá 404, como o de qualquer chamado sem acesso.
- **AC-18**: As duas reaberturas de `concluído` para `em atendimento`, `reopenTicketAction` (gestão) e `refuseServiceAction` (o solicitante recusa o serviço), zeram `avisadoFimEm` dos interesses do chamado, para o próximo fim avisar de novo. `concluído` para `encerrado` (avaliação ou encerramento automático) não avisa outra vez.

_Visibilidade e trilha_

- **AC-19**: Contagem e nomes. Preposto e Admin veem, no detalhe da gestão, "N usuários relataram o mesmo problema" e os nomes dos interessados ativos. Quem acompanhava e depois virou o técnico atribuído não entra na contagem nem nos nomes, em nenhum lugar (o registro fica, e volta a contar se a pessoa deixar de ser a técnica). O técnico atribuído vê só a contagem, no `PainelChamado` de `/conversas`. O dono do chamado não vê nada sobre interessados. Nenhuma entrada de `ChamadoHistory` é criada por interesse, entrada ou saída: a coleção `ChamadoInteressado` é a trilha.

_Nunca impede_

- **AC-20**: Qualquer falha da busca (banco, dado torto) deixa o cartão com `duplicados: null` e uma linha de log `[assistente]` com `operacao: 'buscarDuplicados'`, `conversaId` e o nome do erro; o cartão e a confirmação seguem como hoje. Nenhum log leva número de chamado, local ou texto. A linha de log do cartão ganha só `duplicadosTotal`.
- **AC-21**: Nada desta spec chama o modelo, muda o prompt ou o `PROMPT_VERSION`, ou entra em `DecisaoIa`. A autonomia e a calibração da IA ficam como estão.

## Decision

**Chosen option**: Option 1: Regra no servidor dentro do cartão, com interessado em coleção própria.

O cartão resumo passa a trazer os chamados em andamento parecidos, achados por regra (mesmo ativo, ou mesmo subtipo e unidade com palavra do local em comum), e quem escolhe acompanhar vira `ChamadoInteressado`, com vista só de leitura, lateral e aviso no fim.

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

_Coleção nova `ChamadoInteressado`_ (`models/ChamadoInteressado.ts`, padrão de registro de `models/AGENTS.md`):

| Campo          | Tipo                    | Obrigatório | Nota                                                                                                  |
| -------------- | ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `_id`          | ObjectId                | sim         | chave                                                                                                 |
| `chamadoId`    | ObjectId, ref `Chamado` | sim         | o chamado acompanhado                                                                                 |
| `userId`       | ObjectId, ref `User`    | sim         | quem acompanha                                                                                        |
| `origem`       | enum `aviso_duplicado`  | sim         | único valor hoje                                                                                      |
| `criadoEm`     | Date                    | sim         | entrada, ou a volta depois de sair                                                                    |
| `saiuEm`       | Date ou `null`          | não         | padrão `null`; preenchido por "deixar de acompanhar"                                                  |
| `avisadoFimEm` | Date ou `null`          | não         | padrão `null`; gravado com o aviso de fim, zerado na reabertura                                       |
| `localVisivel` | Boolean                 | não         | padrão `false`; `item.localExato !== null` do cartão no clique de acompanhar, regravado na reativação |

Índices: único `{ chamadoId: 1, userId: 1 }`; `{ userId: 1, saiuEm: 1, criadoEm: -1 }` para a lateral; `{ chamadoId: 1, saiuEm: 1 }` para contagem e aviso de fim. Sem TTL, nunca apagado.

_Campo novo em `Chamado`_: `avisoDuplicado: { chamadoIds: ObjectId[] (1 a 3), em: Date } | null`, padrão `null`, sem índice (só lido junto do chamado). Sai só em endpoint de gestão, como `atribuicaoAutomatica`.

_Campo novo em `CartaoPayload`_ (`shared/conversas/conversa.schemas.ts`): `duplicados: duplicadoDoCartaoSchema[] (1 a 3) | null`, opcional para cartão antigo. Item em `strictObject`: `chamadoId` (objectId), `ticketNumber` (string), `rotuloServico` (até `DECISAO_ROTULO_MAX`), `localExato` (até `LOCAL_EXATO_MAX`, ou `null`), `ativoCodigo` (string ou `null`), `status` (enum `CHAMADO_STATUSES`), `abertoEm` (ISO string), `proprio` (boolean), `jaTemAcesso` (boolean).

_Tipo novo em `Notification`_: `interesse:fim`, só gravado (sem Socket.IO), com o texto em `title`, `body` vazio e `data: { chamadoId, ticketNumber, status }`. Entra em `NOTIFICATION_TYPES` (`models/Notification.ts`), no `switch` de `components/realtime/NotificationsBell.tsx`, em `getNotificationUrl` (aponta para `/conversas/<chamadoId>`) e em `getNotificationMeta`.

_Constante nova_ em `shared/chamados/chamado.constants.ts`: `CHAMADO_STATUS_EM_ANDAMENTO` (`aberto`, `validado`, `em atendimento`, `aguardando_solicitante`, `aguardando_terceiros`).

Relações: `Chamado` 1:N `ChamadoInteressado`; `User` 1:N `ChamadoInteressado`; `Chamado.avisoDuplicado.chamadoIds` aponta para outros `Chamado` (só ids, lidos na hora).

**State transitions**:

Interesse: (nenhum) → `ativo` (`acompanharChamadoAction`) → `saiu` (`deixarDeAcompanharAction`) → `ativo` (novo aviso e novo "acompanhar"). Em paralelo, `avisadoFimEm`: `null` → data (fim do chamado) → `null` (reabertura).

**API surface**:

| Ação ou rota                                                       | Tipo          | Entrada                                                     | Saída                                                              | Auth                                  | Erros principais                                                                                                                                                        |
| ------------------------------------------------------------------ | ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buscarDuplicados` (`lib/assistente/duplicados.ts`, interno)       | função        | `{ userId, cartao }` (servico, unidade, localExato, ativo)  | `DuplicadoDoCartao[] \| null`                                      | chamada só por `montarCartao`         | nunca lança; falha vira `null` (AC-20)                                                                                                                                  |
| `montarCartao` (muda)                                              | função        | ganha `userId`                                              | payload com `duplicados`                                           | interna                               | inalterados                                                                                                                                                             |
| `acompanharChamadoAction` (`app/(dashboard)/conversas/actions.ts`) | Server Action | `conversaId`, `cartaoId`, `chamadoId` (Zod, `strictObject`) | `{ ok: true, chamadoId, rascunhoDescartado }`                      | `requireSession()`, dono do rascunho  | `nao_encontrada` (rascunho alheio ou inexistente), `confirmacao_em_andamento`, `cartao_desatualizado`, `fora_do_cartao`, `chamado_encerrado`, `dados_invalidos`, `erro` |
| `deixarDeAcompanharAction`                                         | Server Action | `chamadoId`                                                 | `{ ok: true }`                                                     | `requireSession()`, dono do interesse | `nao_encontrada`, `erro`                                                                                                                                                |
| `lerAcompanhamento` (`app/(dashboard)/conversas/_lib/`)            | leitura       | `viewer`, `chamadoId`                                       | `AcompanhamentoLido` (campos do AC-14)                             | interesse ativo                       | `nao_encontrada` (vira 404)                                                                                                                                             |
| `montarLateral` (muda)                                             | leitura       | `viewer`                                                    | ganha `acompanhando: ItemLateral[]` (tipo `acompanhamento`)        | sessão                                | falha deixa a seção vazia                                                                                                                                               |
| `notificarFimAosInteressados` (`lib/chamados/interessados.ts`)     | função        | `chamadoId`, `status` final                                 | nada (fogo e esquece)                                              | interna                               | nunca lança                                                                                                                                                             |
| `zerarAvisoDeFim` (`lib/chamados/interessados.ts`)                 | função        | `chamadoId`                                                 | nada                                                               | interna                               | nunca lança                                                                                                                                                             |
| `GET /api/gestao/chamados` e detalhe da gestão (mudam)             | rota          | inalteradas                                                 | ganham `avisoDuplicado` (números) e `interessados` (total e nomes) | Preposto e Admin                      | inalterados                                                                                                                                                             |
| `lerLinhaDoTempo` (muda)                                           | leitura       | inalterada                                                  | ganha `interessadosTotal` só para técnico atribuído e gestão       | inalterada                            | inalterados                                                                                                                                                             |

**Value sourcing**:

| Ação                          | Valor                                              | Fonte                                                                                                                                       |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `buscarDuplicados`            | ids de ativo para o AC-1                           | `cartao.ativo.candidatos[].ativoId`, já resolvido por `resolverAtivoDoCartao` no mesmo `montarCartao`                                       |
| idem                          | unidade, tipo, subtipo, local do AC-2              | `cartao.unidade.unitId`, `cartao.servico.tipoServico`, `cartao.servico.subtypeId`, `cartao.localExato`                                      |
| idem                          | palavras em comum                                  | `palavrasDoLocal` de `lib/assistente/ativo-do-cartao.ts` sobre `Chamado.localExato` e `cartao.localExato`                                   |
| idem                          | `proprio`                                          | `Chamado.solicitanteId` comparado com o `userId` passado a `montarCartao` (`viewer.userId` em `revisarAbertura` e em `responderNaConversa`) |
| idem                          | `jaTemAcesso`                                      | `viewer.role` (Preposto ou Admin) ou `Chamado.assignedToUserId` igual ao `userId`; `montarCartao` passa a receber `role` junto do `userId`  |
| idem                          | `localExato` nulo em outra unidade                 | `Chamado.unitId` diferente de `cartao.unidade.unitId` (ou cartão sem unidade) e `proprio: false`                                            |
| idem                          | `ticketNumber`, `localExato`, `status`, `abertoEm` | `Chamado.ticket_number`, `Chamado.localExato` (cortado em `LOCAL_EXATO_MAX`), `Chamado.status`, `Chamado.createdAt`                         |
| idem                          | `rotuloServico`                                    | `ServiceCatalog.name` por `Chamado.catalogServiceId`, lido na hora; sem serviço, `SERVICO_A_DEFINIR`                                        |
| idem                          | `ativoCodigo`                                      | `Ativo.codigo` por `Chamado.ativoId`; sem ativo, `null`                                                                                     |
| tela do cartão                | "aberto há N dias"                                 | derivado de `abertoEm` e o relógio do navegador, com o mesmo formatador de `_components/tempo.ts`                                           |
| `acompanharChamadoAction`     | o cartão que vale                                  | `cartaoAtual` de `lerProposta(viewer, conversaId)`                                                                                          |
| idem                          | status atual do chamado                            | `Chamado.status` lido de novo no servidor                                                                                                   |
| confirmação (AC-12)           | `avisoDuplicado.chamadoIds`                        | `duplicados[].chamadoId` do cartão confirmado, lido do banco por `cartaoId`                                                                 |
| idem                          | `avisoDuplicado.em`                                | relógio do servidor na criação do chamado                                                                                                   |
| gestão (AC-13)                | números dos possíveis duplicados                   | `Chamado.ticket_number` por `avisoDuplicado.chamadoIds`, lido na hora                                                                       |
| gestão (AC-19)                | total e nomes dos interessados                     | `ChamadoInteressado` com `saiuEm: null`, nome por `User.name`                                                                               |
| `lerAcompanhamento`           | marcos                                             | `ChamadoHistory` do chamado com `statusNovo` diferente de `statusAnterior`, só `statusNovo` e `createdAt`                                   |
| idem                          | local exato na vista                               | `Chamado.localExato`, só quando `ChamadoInteressado.localVisivel` é `true`                                                                  |
| idem                          | desde quando acompanha                             | `ChamadoInteressado.criadoEm`                                                                                                               |
| lateral (AC-15)               | `apoio` (local)                                    | `Chamado.localExato`, só quando `ChamadoInteressado.localVisivel` é `true`; senão vazio                                                     |
| `acompanharChamadoAction`     | `localVisivel`                                     | `item.localExato !== null` do item do cartão atual, lido do banco no clique                                                                 |
| lateral (AC-15)               | janela de 7 dias                                   | `ChamadoInteressado.avisadoFimEm` e `ACOMPANHANDO_DIAS_APOS_FIM`                                                                            |
| `notificarFimAosInteressados` | status final e número no texto                     | parâmetro `status` de quem chamou e `Chamado.ticket_number`                                                                                 |

**Key invariants**:

- `localVisivel` só vale para o leitor interessado (AC-14, AC-15). Dono, técnico atribuído e gestão leem o chamado pelo caminho de sempre e não são afetados.
- Um registro de `ChamadoInteressado` por `{ chamadoId, userId }` (índice único).
- O dono de um chamado nunca é interessado dele, nem quem já o enxerga (técnico atribuído, gestão): `acompanharChamadoAction` recusa item `proprio` ou `jaTemAcesso` (`fora_do_cartao`).
- Ninguém termina com interesse e chamado novo do mesmo rascunho (AC-9, desfaz o interesse se a confirmação ganhou a corrida).
- Só se acompanha um chamado que estava no cartão atual da própria conversa e ainda está em andamento; o navegador nunca escolhe um chamado arbitrário.
- O payload do cartão nunca leva dado de quem abriu o outro chamado (`strictObject`, AC-6).
- `avisoDuplicado` só nasce na criação do chamado e só com ids lidos do cartão no banco.
- Cada interessado recebe no máximo um aviso por fim (`avisadoFimEm` condicional).
- A busca e o aviso nunca impedem nem atrasam a abertura por erro (AC-20).

**Security model**:

- Escopo LGPD: a busca lê chamados de outros solicitantes, então o que sai deles é fechado no schema do item (AC-6) e na leitura de acompanhamento (AC-14); `localExato` sai porque descreve o lugar do problema, mas só quando o chamado é da mesma unidade do cartão (ou do próprio usuário), e o restante (descrição, comentários, autoria) nunca sai. A vista e a lateral do interessado seguem a mesma regra pelo `localVisivel` gravado no clique: acompanhar nunca revela um local que o cartão escondeu.
- Qualquer perfil pode acompanhar a partir do próprio rascunho; só o próprio usuário sai do próprio interesse.
- A vista de acompanhamento exige interesse ativo, e responde o mesmo 404 de conversa inexistente para qualquer outro caso, sem revelar que o chamado existe.
- Nomes dos interessados só para Preposto e Admin; técnico atribuído só a contagem; dono nada.
- `avisoDuplicado` só em resposta de gestão.
- Sem `ChamadoHistory` por interesse, para nenhum nome de interessado chegar ao dono pela linha do tempo.

**Configuration required**:

Nenhuma variável de ambiente nova. Constantes em `lib/assistente/config.ts`: `DUPLICADOS_LEITURA_MAX = 50`, `DUPLICADOS_CARTAO_MAX = 3`, `ACOMPANHANDO_DIAS_APOS_FIM = 7`. Uma carga de índices (`createIndexes()` no primeiro uso, como os outros modelos).

**Critical test scenarios**:

- Caminho feliz: cartão `ia` de ar condicionado na unidade X, sala "205"; existe chamado `validado` de outra pessoa com mesmo subtipo, unidade X e local "sala 205 norte"; o cartão mostra 1 item sem dados do outro solicitante; "Acompanhar este" grava o interesse, descarta o rascunho e abre a vista com os marcos. Verifica **AC-2**, **AC-6**, **AC-7**, **AC-9**, **AC-14**.
- Mesmo ativo em outra unidade e em cartão manual com código digitado: aparece pelo ramo do AC-1. Verifica **AC-1**, **AC-3**.
- Mesmo subtipo e unidade, local "sala 101" contra "sala 305": sem aviso. Verifica **AC-2**, **AC-3**.
- Quatro parecidos: o de mesmo ativo vem primeiro e só três aparecem. Verifica **AC-4**.
- Chamado próprio parecido: item com "Ver meu chamado", sem botão de acompanhar; mandar esse id para a ação devolve `fora_do_cartao`. Verifica **AC-5**, **AC-7**, **AC-9**.
- Corrida: o chamado é concluído antes do clique; a ação devolve `chamado_encerrado`, nada gravado, rascunho intacto. Verifica **AC-10**.
- Duplo clique em "Acompanhar este": um registro só. Verifica **AC-11**.
- Confirmar com aviso: o chamado novo nasce com `avisoDuplicado` dos ids do cartão; repetição com `jaExistia` não regrava; a gestão vê "possível duplicado de #N" e o solicitante e o técnico não recebem o campo. Verifica **AC-12**, **AC-13**.
- Permissão: outro usuário sem interesse abre `/conversas/<chamadoId>` e recebe 404 com o mesmo conteúdo de um id inexistente; depois de sair, o próprio interessado também recebe 404. Verifica **AC-14**, **AC-16**.
- Corrida acompanhar e confirmar: o descarte devolve `confirmacao_em_andamento`; o interesse fica com `saiuEm` e a ação responde esse erro. Verifica **AC-9**.
- Ativo de regra com 3 candidatos: o ramo do equipamento não roda; com 1 candidato, roda. Item de outra unidade vem com `localExato: null`. Verifica **AC-1**, **AC-6**.
- Preposto no chat com um parecido: o item mostra "Ver chamado", e mandar o id para a ação devolve `fora_do_cartao`. Verifica **AC-5**, **AC-7**, **AC-9**.
- Recusa do serviço pelo solicitante zera `avisadoFimEm`, e a nova conclusão avisa de novo. Verifica **AC-18**.
- Fim: concluir o chamado gera uma `Notification` por interessado ativo; concluir de novo depois de reabrir gera outra; `encerrado` depois de `concluído` não gera. Notificação falhando não derruba a conclusão. Verifica **AC-17**, **AC-18**.
- Lateral: interesse com chamado terminado há 8 dias não aparece; há 6 aparece. Verifica **AC-15**.
- Local escondido continua escondido: alguém de outra unidade acompanha pelo código do equipamento (item com `localExato: null`); a vista não mostra a linha do local e o item da lateral vem com `apoio` vazio. Quem é da mesma unidade vê o local nos dois. Reativar a partir de um cartão novo regrava `localVisivel`; clicar de novo com o interesse ativo mantém o valor; registro sem o campo vale `false` na vista e na lateral. Verifica **AC-6**, **AC-9**, **AC-14**, **AC-15**.
- Quem acompanhava e virou o técnico atribuído some de "Acompanhando", da contagem, dos nomes e do aviso de fim. Verifica **AC-15**, **AC-17**, **AC-19**.
- Busca com o banco falhando (mock rejeita): cartão com `duplicados: null` e confirmação normal. Verifica **AC-20**.
- Nenhum `generateLlmObject` chamado em todo o fluxo. Verifica **AC-21**.
- Teste de banco real (`*.db.test.ts`): índice único de `{ chamadoId, userId }` e o `avisadoFimEm` condicional sob duas chamadas simultâneas. Verifica **AC-11**, **AC-17**.

## Build plan

Ordem em Tracer Bullet: a primeira fatia é o fio fino de ponta a ponta (achar, mostrar, abrir mesmo assim, gestão ver), e as seguintes engrossam com o acompanhar e o aviso de fim.

_Fatia 1: o aviso de ponta a ponta_

1. `CHAMADO_STATUS_EM_ANDAMENTO` em `shared/chamados/chamado.constants.ts`; `duplicadoDoCartaoSchema` e `duplicados` opcional no `cartaoPayloadSchema`; constantes em `lib/assistente/config.ts`. Satisfaz **AC-6**.
2. `lib/assistente/duplicados.ts` com `buscarDuplicados` (os dois ramos, ordem, teto, `proprio`, `jaTemAcesso`, local nulo de outra unidade, leituras em lote, nunca lança, log), e `montarCartao` recebendo `userId`, `role` e um sinal `buscarDuplicados` que só `responder.ts` com proposta pronta e `revisarAbertura` ligam, chamando a busca depois de `resolverAtivoDoCartao`. Satisfaz **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-5a**, **AC-6**, **AC-20**, **AC-21**.
3. `duplicadosChave` em `ConteudoVisivel`, `mesmoConteudo` e no quarto parâmetro de `conteudoDaProposta` em `responder.ts`. Satisfaz **AC-8**.
4. Bloco de aviso em `CartaoResumo.tsx` (itens de outra pessoa com "Acompanhar este" ainda desabilitado até a fatia 2, itens próprios com "Ver meu chamado", itens `jaTemAcesso` com "Ver chamado"), acessível. Satisfaz **AC-7**.
5. `Chamado.avisoDuplicado` no modelo; `confirmarAbertura` grava a partir do cartão do banco só na criação. Satisfaz **AC-12**.
6. Gestão: `GET /api/gestao/chamados` e `ChamadoDetailSheet` mostram "Possível duplicado de #N"; conferir que nenhum endpoint de solicitante ou técnico leva o campo. Satisfaz **AC-13**.

_Fatia 2: acompanhar_

7. `models/ChamadoInteressado.ts` com os índices; `lib/chamados/interessados.ts` com `registrarInteresse` (upsert, reativação) e `sairDoInteresse`. Satisfaz **AC-9**, **AC-11**, **AC-16**.
8. `acompanharChamadoAction` (conferências na ordem do AC-9, `chamado_encerrado`, descarte depois do interesse, desfazer o interesse em `confirmacao_em_andamento`) e o botão ligado no cartão, com a mensagem de corrida. Satisfaz **AC-9**, **AC-10**, **AC-11**.
9. `lerAcompanhamento` e o terceiro passo de `abrirConversa`, com a vista só de leitura (`PainelAcompanhamento`) e o botão "Deixar de acompanhar" (`deixarDeAcompanharAction`). Satisfaz **AC-14**, **AC-16**.
10. Seção "Acompanhando" em `montarLateral` e `ListaLateral`. Satisfaz **AC-15**.

_Fatia 3: fim e visibilidade_

11. Tipo `interesse:fim` em `NOTIFICATION_TYPES`, no `switch` do `NotificationsBell`, em `getNotificationUrl` e `getNotificationMeta`; `notificarFimAosInteressados` chamada (fogo e esquece, depois da gravação do status) em `registerExecutionAction` (`chamados-atribuidos/actions.ts`), em `rejectTicketAction` e em `app/api/chamados/[id]/cancel/route.ts`; `zerarAvisoDeFim` em `reopenTicketAction` e em `refuseServiceAction` (`meus-chamados/actions.ts`). Satisfaz **AC-17**, **AC-18**.
12. Contagem e nomes: `interessados` na gestão, `interessadosTotal` em `lerLinhaDoTempo` só para técnico atribuído e gestão, e a linha no `PainelChamado`. Satisfaz **AC-19**.

_Fatia 4: ajustes da revisão de 2026-10-07_

13. `localVisivel` em `models/ChamadoInteressado.ts` (padrão `false`); `registrarInteresse(chamadoId, userId, localVisivel)` com o terceiro parâmetro obrigatório, gravado no `$set` do ramo de reativação (ao lado de `saiuEm`, `criadoEm` e `avisadoFimEm`) e no `$setOnInsert` da criação, sem depender do padrão do schema; com interesse já ativo, nada muda; `acompanharChamado` passa `item.localExato !== null`; `lerAcompanhamento` e `lerAcompanhandoDaLateral` leem `localVisivel` do registro de interesse e só mostram o local com `localVisivel === true`. Sem migração: interesse ativo gravado antes do campo perde o local até a pessoa sair e voltar. Satisfaz **AC-9**, **AC-14**, **AC-15**.

As outras correções da mesma revisão já estão construídas: técnico atribuído fora da contagem, da lateral e do aviso de fim (AC-15, AC-17, AC-19); nova leitura do status depois de gravar o interesse (AC-9); `avisadoFimEm` desfeito quando a notificação falha e cancelamento só com o status lido (AC-17).

## Consequences

**Positive**:

- Menos chamados repetidos chegando à triagem, e os que chegam vêm marcados para o Preposto decidir rápido.
- A gestão ganha um sinal de impacto (quantas pessoas sofrem com o mesmo problema) sem nenhum formulário a mais.
- Nenhum custo de GPU e nenhum efeito na calibração da IA: a regra é explicável e testável.

**Negative / tradeoffs**:

- A decisão de mostrar o local é tomada no clique em "Acompanhar este", mas a vista mostra o texto atual do chamado. Se o dono corrigir o local depois, ou a gestão mudar a unidade na classificação, quem acompanha lê o texto novo sob a decisão antiga. Risco baixo, aceito na revisão de 2026-10-07.
- A regra perde duplicados com local escrito de jeitos diferentes ("copa" e "cozinha do 2º") e pode avisar sobre um problema diferente na mesma sala. O usuário sempre pode abrir mesmo assim, então o erro custa um clique, não um chamado perdido.
- O local digitado por outro solicitante aparece no cartão. Em regra é só o lugar, mas pode conter um nome ("sala do Dr. Fulano"); foi aceito porque sem o local o aviso não serve para decidir.
- Um conceito novo de leitor (interessado) além de dono, técnico e gestão, com rota de leitura própria e mais uma seção na lateral para manter.
- O teto de 50 leituras por ramo deixa escapar um parecido mais antigo numa unidade com muitos chamados abertos do mesmo subtipo. Na prática a fila de um subtipo numa unidade raramente passa disso.
- O ramo do equipamento ignora ativo sugerido por regra com mais de um candidato, então perde alguns casos reais para não avisar com base em palpite.
- Três pontos de fim e duas reaberturas passam a chamar o aviso; um caminho novo de cancelamento ou recusa que esqueça a chamada deixa o interessado sem sino (a lateral ainda mostra o status certo).
- Sem `ChamadoHistory` por interesse, a trilha de quem acompanhou mora numa coleção à parte, fora da linha do tempo.

**Neutral**:

- Uma coleção nova e dois campos novos (um no `Chamado`, um no payload do cartão), todos opcionais, sem migração de dados.
- A busca acontece a cada montagem de cartão; com o índice `{ unitId, tipoServico, subtypeId, status }` e o teto de 50 leituras, o custo é de duas consultas pequenas.

## Follow-up

- [ ] Enroll no escopo, como adiado: "Cancelar como duplicado" na triagem, que cancela o chamado novo, grava o solicitante como interessado do original e avisa (decisão própria: motivo de cancelamento e texto ao solicitante).
- [ ] Depois de algumas semanas em produção, medir quantos cartões mostram aviso e quantos viram acompanhamento versus abertura (dá para contar por `ChamadoInteressado` e `Chamado.avisoDuplicado`) e decidir se a regra precisa da segunda etapa com o modelo julgando o texto.
- [ ] `/sync`: registrar `ChamadoInteressado`, `interesse:fim` e o terceiro leitor de `/conversas` em `models/AGENTS.md`, `app/(dashboard)/conversas/AGENTS.md`, `lib/assistente/AGENTS.md` e na lista de tipos só gravados do `AGENTS.md` raiz.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
