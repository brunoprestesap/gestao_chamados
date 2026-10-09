# 0014. Ativo sugerido no chat e indicadores de ativo no IMR

**Date**: 2026-10-03
**Status**: Accepted

## Summary

Esta é a fatia 4 da gestão de ativos (spec 0011), em duas partes. Na primeira, o cartão resumo da conversa passa a sugerir o equipamento do chamado: o servidor acha o ativo pelo código digitado (tombamento ou `MNT-`) ou cruzando a categoria do serviço que a IA reconheceu com a unidade e o texto do local, e a pessoa confirma, escolhe entre até cinco candidatos ou tira. Nada disso muda o prompt nem passa pelo portão de confiança, então a autonomia da IA continua como está. Na segunda, o IMR ganha uma aba Ativos, só informativa, com MTBF (tempo médio entre falhas), MTTR (tempo médio de reparo), reincidência em 90 dias e os dez ativos com mais corretivos, e a ficha do ativo mostra os números dele dos últimos 12 meses.

## Requirements

**User stories**:

- Como solicitante, quero que o chat já aponte o equipamento quando eu digo o tombamento ou quando só existe um aparelho daquele tipo na minha sala, para não precisar saber o código.
- Como Preposto, quero que o chamado do chat já chegue com o ativo quando a sugestão é segura, e corrigir quando estiver errada, para não vincular tudo na mão.
- Como Admin, quero ver quais equipamentos mais quebram, de quanto em quanto tempo e quanto demoram para voltar, para decidir substituição e preparar o IMR do próximo termo de referência.
- Como técnico, quero ver na ficha se aquele equipamento é reincidente antes de ir atender.

**Acceptance criteria**:

_Ativo no chat_

- **AC-1**: Código no relato. O servidor procura, em todas as mensagens do solicitante no rascunho, (a) qualquer `MNT-` seguido de dígitos e (b) um número de 4 ou mais dígitos logo depois de uma das palavras tombo, tombamento, patrimônio, etiqueta ou código (sem diferença de maiúscula nem acento, aceitando `nº`, `n.`, `:` ou `#` entre a palavra e o número). Cada achado passa por `normalizarCodigo` e só vale se existir um ativo com esse `codigo` que passe em `FILTRO_VINCULAVEL`. Valendo, esses ativos são os candidatos, com `origem: 'codigo'`, em qualquer modo de cartão (`ia` ou `manual`) e sem olhar unidade nem categoria: sem repetição, na ordem em que aparecem no texto, e só os 5 primeiros quando houver mais (o teto do AC-3 não esvazia o ramo de código). Número solto sem a palavra não conta. Código que não existe ou não pode receber chamado é ignorado em silêncio. As mensagens lidas são as mesmas que viram `descricao` na confirmação (`autor: 'solicitante'`, `tipo: 'texto'`, o filtro de `montarDescricao`), incluindo a mensagem do turno atual, já gravada antes da comparação. Sem proposta pronta para cartão, o código só aparece quando a pessoa usa "Revisar e abrir".
- **AC-2**: Regra no servidor. Sem código válido e com cartão em modo `ia`, os candidatos são os ativos que passam em `FILTRO_VINCULAVEL`, cuja categoria tem `serviceSubTypeId` igual ao `subtypeId` do serviço da proposta, e cuja `localizacaoId` é um local ativo com `unitId` igual à unidade do cartão ou um descendente ativo dele (por `idsDaSubarvore`, o filho herda a unidade do pai mesmo sem `unitId` próprio). Ativo sem `localizacaoId` ou de categoria sem `serviceSubTypeId` nunca entra pela regra. Com mais de um, as palavras do `localExato` (números e palavras de 3 letras ou mais, sem acento e sem maiúscula, tirando as palavras genéricas `sala`, `andar`, `bloco`, `predio` e `piso`, da constante `PALAVRAS_LOCAL_IGNORADAS`) são comparadas com `caminho` e `descricao` de cada um: ficam só os de maior número de palavras em comum, se esse número for maior que zero; se nenhum casar, ficam todos. O resultado tem `origem: 'regra'`.
- **AC-3**: Teto. O cartão mostra de 1 a 5 candidatos. No ramo de regra, zero ou mais de 5 (depois do desempate) deixa o cartão sem ativo (`ativo: null`), e o chamado abre como hoje, para a gestão vincular.
- **AC-4**: Sem regra quando falta sinal. Cartão em modo `manual`, sem unidade no cartão, ou com `localForaDoPerfil` não recebe candidatos de regra; só o código do AC-1 vale.
- **AC-5**: O cartão mostra a linha Equipamento. Com um candidato (de qualquer origem): código, descrição e caminho do local (ou "—" sem local), já marcado, e um controle para tirar; tirado, o cliente envia `ativoId: null`. Com vários: uma lista de escolha única com os candidatos e a opção "Não sei", que já vem marcada e envia `ativoId: null`. A frase de texto do cartão (`fraseDoCartao`) não menciona o equipamento. O payload do cartão leva só `ativoId`, `codigo`, `descricao` e `caminho` de cada candidato, nunca `camposPatrimoniais`. Cartão antigo (substituído) mostra a linha desabilitada, como o resto dele.
- **AC-6**: Troca de unidade. Se a pessoa muda a unidade no cartão, a linha de candidatos de `origem: 'regra'` some da tela, e reaparece se ela voltar à unidade original (estado derivado de `cartao.unidade.unitId`). No servidor, um `ativoId` de origem `regra` é ignorado quando o `unitId` confirmado é diferente de `cartao.unidade.unitId`. Candidatos de origem `codigo` continuam valendo com qualquer unidade.
- **AC-7**: Cartão novo quando os candidatos mudam. Em `responder.ts`, os candidatos são calculados antes da comparação que decide "cartão mantido", e só quando há código no texto ou a proposta está pronta para cartão (sem consulta ao banco nos outros turnos). `ConteudoVisivel` ganha `ativoChave`, uma string estável (`origem|ids em ordem`, vazia sem ativo); um cartão antigo sem o campo `ativo` vale chave vazia e não é regravado só por isso. Digitar um código numa mensagem nova, sem mudar serviço nem local, gera um cartão novo com o ativo. O payload novo sempre grava `ativo` explícito (`null` quando não há).
- **AC-8**: Confirmação. `confirmarAberturaAction` aceita `ativoId` (ou `null`). O servidor só usa o valor se ele estiver entre os candidatos do cartão confirmado, respeitar o AC-6 e ainda passar em `buscarAtivoVinculavel`. Em qualquer outro caso o chamado abre sem ativo, sem erro para a pessoa (um id fora dos candidatos gera só um `console.warn` com `conversaId`). Um valor que nem é ObjectId também não vira `dados_invalidos`: o campo usa `.catch(null)` no schema. Com ativo, o `Chamado.ativoId` é gravado na criação, e a entrada `abertura` do histórico fica "Chamado aberto pela conversa · Equipamento <codigo>": `garantirHistoricoAbertura` ganha o código como parâmetro opcional, e o reparo (`repararSePreciso`) o lê de `Chamado.ativoId`.
- **AC-9**: Portão intacto. O resultado de `confiancaSuficienteParaPrioridade`, o status de nascimento (`aberto` ou `validado`), o snapshot de SLA e a atribuição automática são os mesmos com ou sem ativo. `PROMPT_VERSION` não muda.
- **AC-10**: Decisão registrada. Quando o chamado abre com ativo vindo do cartão, é gravada uma `DecisaoIa` com `campo: 'ativo'`, `decididoPor: 'regra'`, `confianca: null`, `efeito: 'aplicado'` e `valorIa` = `valorFinal` = `{ ativoId, rotulo: codigo }`. Ela não vai na lista `decisoes` de `abrirChamadoDaConversa` (cuja falha desfaz a abertura): é gravada depois que o chamado existe, num passo que nunca cancela a abertura. Se falhar, o chamado fica com o ativo e sem a decisão, com um `console.error` com `chamadoId`; o reparo não a recria, e essa perda é aceita. Chamado que abre sem ativo não ganha decisão `ativo`.
- **AC-11**: A decisão `ativo` não contamina a IA. `derivarIaSituacao` ignora o campo `ativo` (um chamado só com ela continua `sem_ia`); os dois recortes de `lib/gestao/revisao-ia-filtro.ts` filtram `campo: { $ne: 'ativo' }`; `camposPendentesDeConfirmacao` não a considera; a rota `app/api/gestao/chamados/[id]/decisoes-ia` e o `RevisaoIaPainel` não a mostram; a calibragem já filtra por campo explícito; e `garantirHistoricoDecisao` não grava entrada `decisao_ia` para ela (o que cobre a abertura e o reparo).
- **AC-12**: Correção pela gestão. Quando Admin ou Preposto vincula, troca ou remove o ativo (`vincularAtivoAoChamado`) de um chamado que tem decisão `ativo`, a mesma função atualiza a decisão por um `updateOne` direto: `$set` de `valorFinal` e `situacao` (`corrigida` quando o valor final difere de `valorIa`, `sem_revisao` quando volta a ele) e `$push` em `correcoes` (com `origem: 'gestao'`, limitado como as outras). Remover grava `{ ativoId: null, rotulo: 'Nenhum equipamento' }`. Não passa por `resolverDecisao`, então não muda `iaSituacao` nem grava `correcao_ia`; o `vinculo_ativo` de hoje é o registro da troca. Falha nessa atualização não desfaz o vínculo (só loga). Chamado sem decisão `ativo` segue como hoje.
- **AC-13**: Log sem texto. A linha `[assistente]` de `responder.ts` (o `registrar('proposta', …)`) e a de `[abertura]` em `confirmar.ts` passam a levar a origem do ativo (`codigo`, `regra` ou nenhuma) e a quantidade de candidatos, nunca o código digitado nem o local.

_Indicadores_

- **AC-14**: Base dos indicadores. Um corretivo é um chamado com `ativoId`, sem `originTemplateId` e com status diferente de `cancelado` e `recusado`. No IMR, entram os corretivos com `createdAt` dentro do período escolhido na tela, com os mesmos limites de dia em UTC que `computeImrReport` usa (um chamado aberto depois das 21h de Belém no último dia cai no dia seguinte, como no resto do IMR; diferença aceita). Não reaproveitar `STATUS_SEM_VINCULO_ATIVO`, que inclui `encerrado`.
- **AC-15**: Aba Ativos no IMR. `/relatorios/imr` ganha a aba "Ativos" (mesma guarda `requireAdmin()`), com um selo "Informativo, sem efeito contratual". Os números dela não entram no Resumo Geral, nas abas por tipo nem nas penalidades. Dentro da aba, um seletor Todos, Manutenção Predial, Ar-Condicionado, Elevador filtra pelo `tipoServico` do chamado.
- **AC-16**: Números do topo da aba, para o filtro escolhido: corretivos com ativo; percentual dos corretivos do período que têm ativo (chamados sem `originTemplateId`, fora `cancelado` e `recusado`, com e sem ativo); ativos afetados; MTBF médio; MTTR médio; ativos reincidentes.
- **AC-17**: Cálculos. MTBF de um ativo é a média dos intervalos entre o `createdAt` de corretivos seguidos dele no período, e só existe com 2 corretivos ou mais; o MTBF médio da aba é a média dos MTBF dos ativos que têm um. Um corretivo anterior ao início do período não entra no MTBF (só a reincidência olha para trás). MTTR de um corretivo é `max(0, sla.resolvedAt − createdAt − totalPausedMinutes × 60000)`, a mesma fórmula do `tempoPorTipo` do IMR, calculada pela função JS pura `tempoDeReparoMs({ createdAt, resolvedAt, totalPausedMinutes })` e só para quem tem `sla.resolvedAt` (chamado nunca classificado fica fora); o MTTR do ativo e o da aba são médias desses valores. Reincidente é o ativo com 2 corretivos ou mais nos 90 dias que terminam no fim do período, contados a partir de `dataFinal` e não do início do período, dentro do mesmo filtro de tipo.
- **AC-18**: Ranking. A aba lista até 10 ativos: código (com link para a ficha), descrição, categoria, caminho do local, corretivos no período, MTBF, MTTR médio e corretivos em 90 dias. A ordem é corretivos no período (maior primeiro), depois soma dos MTTR (maior primeiro), depois código. Ativo `baixado` continua aparecendo.
- **AC-19**: Vazios. Sem corretivos com ativo no filtro, a aba mostra um texto de vazio no lugar dos números e da tabela. MTBF, MTTR, percentual com denominador zero e local ausente aparecem como "—", nunca como zero (não reaproveitar `pct()` do IMR, que devolve 0).
- **AC-20**: Ficha do ativo. Para Admin, Preposto e Técnico (`podeVerDocumentos`), `/ativos/[id]` mostra uma linha com corretivos nos últimos 12 meses, MTBF, MTTR médio e corretivos em 90 dias, com as mesmas regras do AC-17 e janela que termina no fim de hoje em Belém (`hojeEmBelem()`, que devolve `YYYY-MM-DD`, convertido por um helper novo em `lib/ativos/documentos/situacao.ts` que recebe `agora` para teste; Belém é UTC−3 fixo). O cálculo fica em `carregarFicha`, que já recorta por perfil: para o Solicitante, o servidor não calcula nem devolve esses números.

## Decision

**Chosen option**: Regra determinística no servidor para o ativo do chat, e um módulo próprio de indicadores de ativo reaproveitado pelo IMR e pela ficha.

O ativo do chat sai do código digitado ou do cruzamento categoria, unidade e local, sem nova chamada ao modelo e sem mudar o prompt; os indicadores saem de uma aggregation separada em `lib/ativos/indicadores.ts`, fora do `$facet` único do IMR.

Calls made with full design context (pick, why, runner up):

- **Onde a regra mora**: `lib/assistente/ativo-do-cartao.ts` (`resolverAtivoDoCartao`), chamado em `responder.ts` antes da comparação de "cartão mantido" (AC-7) e em `revisarAbertura`, e o resultado entra no payload montado por `montarCartao`. Fica junto do cartão, porque só o cartão usa. Runner up: dentro de `lib/ativos/seletor.ts`, que concentraria as regras de ativo mas puxaria texto de relato para o módulo de ativos.
- **Detecção de código**: função pura `codigosNoTexto(texto)` em `lib/ativos/codigo.ts` (sem `server-only`, como o resto do arquivo), testável sem banco. Runner up: regex inline no assistente, mais difícil de testar.
- **Locais da unidade**: uma consulta por `Localizacao` ativa com `unitId` da unidade, depois `idsDaSubarvore` de cada uma (o apoio que já existe em `lib/ativos/localizacao.ts`). Runner up: `$graphLookup`, mais código para o mesmo volume.
- **Correção do ativo sem `resolverDecisao`**: `resolverDecisao` marca o chamado como `revisada` e grava `correcao_ia`, efeitos que pertencem à revisão da IA. Um `updateOne` direto em `vincularAtivoAoChamado` mede o acerto sem esses efeitos. Runner up: um parâmetro `silencioso` em `resolverDecisao`, que espalharia uma exceção pelo fluxo de revisão.
- **Decisão `ativo` fora da transação da abertura**: a abertura nunca pode falhar por causa do ativo; a perda rara (crash entre chamado e decisão) só tira um ponto da medição. Runner up: dentro de `decisoes`, que é reparável, mas faz uma falha no ativo cancelar o chamado.
- **Indicadores fora do `$facet` do IMR**: o IMR filtra por `closedAt` e só `encerrado`; o corretivo de ativo filtra por `createdAt` e inclui os abertos. Uma segunda aggregation, em `lib/ativos/indicadores.ts`, com o cálculo de MTBF, reincidência e ranking em JS sobre os documentos lidos (dezenas a centenas por período), testável sem banco. Runner up: mais facets no pipeline único, que obrigaria trocar o `$match` comum e quebraria a regra de "uma só aggregation" do IMR.
- **Fórmula do MTTR**: o `tempoPorTipo` é uma expressão de pipeline, então a fórmula vira a função JS pura `tempoDeReparoMs` em `lib/imr-service.ts` (ou vizinha), usada pelos indicadores, e um teste de paridade prova que ela e o `tempoPorTipo` dão o mesmo valor para os mesmos chamados. Runner up: calcular o MTTR no pipeline dos indicadores, que espalharia o cálculo entre Mongo e JS.
- **Ranking e filtro por tipo**: o servidor calcula o resultado para "Todos" e para cada `TIPO_SERVICO_OPTIONS` numa só leitura e manda tudo para a aba; o seletor só troca a vista no cliente, como as abas de hoje. Runner up: parâmetro na URL com nova leitura por troca, mais lento e sem ganho no volume atual.
- **Percentual de corretivos com ativo**: entra no topo da aba (AC-16) porque sem ele o Admin não sabe se o ranking representa o parque ou só os poucos chamados vinculados. Runner up: deixar fora e explicar em texto.

## Feature design

**Data model sketch** (nenhuma coleção nova, nenhum índice novo):

| Onde                                                                                | Mudança                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/conversas/conversa.schemas.ts` → `cartaoPayloadSchema`                      | campo novo `ativo: { origem: 'codigo' \| 'regra', candidatos: [{ ativoId, codigo, descricao, caminho \| null }] (min 1, max 5) } \| null`, em `strictObject`; cartões antigos sem o campo continuam válidos (`.optional()` na leitura, tratado como `null`) |
| `shared/conversas/abertura.schemas.ts` → `confirmarAberturaSchema`                  | campo novo `ativoId: objectIdSchema.nullable().optional().catch(null)`                                                                                                                                                                                      |
| `shared/conversas/conversa.constants.ts` → `DECISAO_CAMPOS`, `DECISAO_CAMPO_LABELS` | ganha `'ativo'`, com o rótulo "Equipamento"; o teste que fixa a lista é atualizado                                                                                                                                                                          |
| `shared/conversas/conversa.schemas.ts` → `valorDecisaoSchema`, `ValorDecisaoInput`  | ramo explícito `valorAtivoSchema` (`ativoId` nullable, `rotulo`); o ramo final deixa de tratar campo desconhecido como técnico                                                                                                                              |
| `models/DecisaoIa.ts` → `valorIa`, `valorFinal`, `correcoes[].valor`                | ganham `ativoId: ObjectId \| null`, padrão `null` (o `rotulo`, obrigatório, guarda o código ou "Nenhum equipamento")                                                                                                                                        |
| `lib/conversas/decisoes.ts`                                                         | `VALOR_VAZIO` com `ativoId: null`; `mesmoValor` compara `ativoId`; `resolverValorNoBanco` e `valorParaInput` com ramo `ativo` explícito                                                                                                                     |
| `Chamado`                                                                           | nada novo: `ativoId` passa a ser gravado na abertura pelo chat                                                                                                                                                                                              |
| `Conversa.propostaIa`                                                               | nada novo: o ativo não vem do modelo                                                                                                                                                                                                                        |

O índice parcial `{ ativoId: 1, createdAt: -1 }` de `Chamado` já atende a ficha e o IMR.

**API surface**:

| Superfície                                                                  | Tipo                                              | Entradas                          | Saídas                                                          | Quem                                                                  | Erros                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `resolverAtivoDoCartao({ conversaId, servico, unidade, localExato, modo })` | função de servidor                                | dados do cartão montado           | `CartaoPayload['ativo']`                                        | interno                                                               | nunca lança; falha de banco devolve `null` e loga                                             |
| `codigosNoTexto(texto)`                                                     | função pura                                       | texto                             | códigos normalizados, em ordem, sem repetição                   | interno                                                               | nenhum                                                                                        |
| `confirmarAberturaAction`                                                   | Server Action (existente)                         | + `ativoId?: string \| null`      | igual a hoje                                                    | dono da conversa                                                      | os de hoje; `ativoId` inválido nunca vira erro (AC-8)                                         |
| `vincularAtivoChamadoAction`                                                | Server Action (existente)                         | igual                             | igual                                                           | Admin, Preposto                                                       | igual; `vincularAtivoAoChamado` passa a atualizar a decisão `ativo` quando ela existe (AC-12) |
| `calcularIndicadoresAtivos({ inicio, fim, fimReincidencia })`               | função de servidor em `lib/ativos/indicadores.ts` | datas                             | `{ geral, porTipo: Record<TipoServico, …> }` com topo e ranking | não autoriza: quem chama confere (hoje a página com `requireAdmin()`) | nunca lança na página: erro mostra o vazio com aviso                                          |
| `indicadoresDoAtivo(ativoId, agora?)`                                       | função de servidor, chamada por `carregarFicha`   | id e instante opcional            | `{ corretivos12m, mtbfMs, mttrMs, corretivos90d }`              | Admin, Preposto, Técnico                                              | idem                                                                                          |
| `/relatorios/imr` aba Ativos                                                | página (existente)                                | `dataInicial`, `dataFinal` da URL | aba nova                                                        | Admin                                                                 | —                                                                                             |
| `/ativos/[id]`                                                              | página (existente)                                | id                                | linha de indicadores                                            | todos leem a ficha; a linha só para `podeVerDocumentos`               | —                                                                                             |

**Value sourcing**:

| Action        | Value produced / displayed       | Source                                                                                                 |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| montar cartão | texto para achar código          | `ConversaMensagem` do solicitante no rascunho (mesma leitura que vira `descricao` na confirmação)      |
| montar cartão | categoria esperada               | `CategoriaAtivo.serviceSubTypeId` = `servico.subtypeId` da proposta                                    |
| montar cartão | unidade                          | `cartao.unidade.unitId` (perfil, `lerPerfil`)                                                          |
| montar cartão | locais da unidade                | `Localizacao.unitId` e descendentes pela árvore                                                        |
| montar cartão | palavras do local                | `cartao.localExato` (já limpo por `limparLocal`)                                                       |
| montar cartão | `codigo`, `descricao`, `caminho` | `Ativo.codigo`, `Ativo.descricao`, `Localizacao.caminho` do `localizacaoId`                            |
| confirmar     | ativo aceito                     | `entrada.ativoId` ∩ candidatos do cartão `cartaoId`, AC-6, `buscarAtivoVinculavel`                     |
| confirmar     | observação da `abertura`         | `Ativo.codigo` do ativo aceito                                                                         |
| confirmar     | decisão `ativo`                  | ativo aceito; `decididoPor: 'regra'`, `efeito: 'aplicado'` fixos                                       |
| vincular      | correção                         | novo `ativoId` da action (ou `null`) e `Ativo.codigo` como `rotulo`                                    |
| aba Ativos    | período                          | `dataInicial`/`dataFinal` da página, convertidos como em `computeImrReport` (`startOfDay`, `endOfDay`) |
| aba Ativos    | janela de reincidência           | `endOfDay(dataFinal)` menos 90 dias até `endOfDay(dataFinal)`                                          |
| aba Ativos    | corretivo                        | `Chamado.ativoId`, `originTemplateId`, `status`, `createdAt`, `tipoServico`                            |
| aba Ativos    | MTTR                             | `sla.resolvedAt`, `createdAt` e o tempo pausado, pela função extraída do IMR                           |
| aba Ativos    | descrição, categoria, local      | `Ativo.descricao`, `CategoriaAtivo.nome`, `Localizacao.caminho`                                        |
| confirmar     | rótulo da decisão                | `Ativo.codigo`; ao remover, o texto fixo "Nenhum equipamento"                                          |
| ficha         | janela de 12 meses e de 90 dias  | `hojeEmBelem(agora)` convertido para o fim do dia em Belém (UTC−3), menos 365 e 90 dias                |
| ficha         | quem vê                          | `podeVerDocumentos(viewer.role)`                                                                       |

**Key invariants**:

- Nada do ativo impede a abertura pelo chat: todo caminho de falha termina em "abre sem ativo".
- Só ativo que passa em `FILTRO_VINCULAVEL` vira candidato e só ativo que passa em `buscarAtivoVinculavel` na confirmação vai para o chamado; a tela nunca é a única barreira.
- O servidor nunca aceita `ativoId` que não esteja nos candidatos do cartão confirmado.
- O prompt, o `PROMPT_VERSION` e o portão de confiança não mudam.
- A decisão `ativo` nunca altera `iaSituacao`, a fila de revisão nem a calibragem.
- Indicadores de ativo nunca entram em números contratuais do IMR.
- Payload de cartão nunca leva `camposPatrimoniais`.

**Security model**:

- Cartão: só o dono do rascunho o recebe (regra atual de `lerConversa`). Os dados do candidato (código, descrição, local) já são de leitura para todos em `/ativos`.
- Confirmação: o dono da conversa; o `ativoId` vale só se estava no cartão dele.
- Correção do ativo: Admin e Preposto, como hoje.
- Aba Ativos: Admin (`requireAdmin()` da página do IMR).
- Linha da ficha: Admin, Preposto e Técnico; o Solicitante não recebe os números do servidor.
- Sem dado pessoal novo; os logs não levam texto do relato (LGPD).

**Configuration required**: nenhuma variável nova. O teto de 5 candidatos vira a constante `ATIVO_CANDIDATOS_MAX` em `lib/assistente/config.ts`.

**Critical test scenarios**:

- Relato "o ar de tombo 11997 pinga" com o ativo 11997 Tier A: cartão com um candidato `codigo`, confirmação grava `ativoId` e decisão `ativo`, verifies **AC-1**, **AC-8**, **AC-10**
- "ramal 11997" sem palavra de código: nenhum candidato de código, verifies **AC-1**
- Cartão manual com `MNT-0012` digitado: candidato aparece; sem código, nenhum, verifies **AC-1**, **AC-4**
- Serviço de ar condicionado, unidade com 3 aparelhos e "sala 302" casando com um caminho: um candidato; sem casar: três, com "Não sei" marcado, verifies **AC-2**, **AC-5**
- Unidade com 8 aparelhos sem desempate: cartão sem ativo, verifies **AC-3**
- Pessoa troca a unidade e confirma com o `ativoId` de regra: chamado sem ativo; com `ativoId` de código: chamado com ativo, verifies **AC-6**
- Código digitado numa mensagem depois do primeiro cartão: cartão novo, verifies **AC-7**
- `ativoId` forjado fora dos candidatos, e ativo baixado entre cartão e confirmação: chamado abre sem ativo e sem erro, verifies **AC-8**
- Mesmo cartão com e sem ativo e autonomia ligada: mesmo status, mesmo SLA, mesma atribuição, verifies **AC-9**
- Chamado com decisão `ativo` e só ela `aplicado`: `iaSituacao` continua o das outras decisões (`sem_ia` quando é a única), o chamado não aparece na Revisão da IA, nem em `camposPendentesDeConfirmacao`, nem na rota `decisoes-ia`, e nenhuma entrada `decisao_ia` aparece, nem depois do reparo, verifies **AC-11**
- Falha simulada ao gravar a decisão `ativo`: o chamado abre com o ativo e sem a decisão, verifies **AC-10**
- Preposto troca o ativo e depois remove: duas correções, `situacao: 'corrigida'`, `iaSituacao` e histórico `correcao_ia` intocados, verifies **AC-12**
- Cartão antigo sem o campo `ativo` numa conversa que continua: não é regravado só por isso, verifies **AC-7**
- `ativoId: "xyz"` na confirmação: chamado abre sem ativo, sem `dados_invalidos`, verifies **AC-8**
- `tempoDeReparoMs` e `tempoPorTipo` dão o mesmo valor para os mesmos chamados, com pausa e com resultado negativo cortado em zero, verifies **AC-17**
- Ativo com corretivos em 1, 11 e 31 de um mês: MTBF de 15 dias; um preventivo e um cancelado no meio não contam; resolvido com pausa desconta a pausa, verifies **AC-14**, **AC-17**
- Período de 1 a 31 com corretivos em 20/12 e 05/01: reincidente em janeiro (janela de 90 dias), verifies **AC-17**
- Desempate do ranking por soma de MTTR e depois por código, ativo baixado presente, verifies **AC-18**
- Filtro por tipo e período sem dado: texto de vazio, "—" no lugar de zero, verifies **AC-15**, **AC-19**
- Solicitante abre a ficha: sem a linha e sem os números no payload; Técnico vê, verifies **AC-20**

## Build plan

Tracer Bullet: o fio do chat passa primeiro pelo caso mais estreito e exato (código digitado), de ponta a ponta até o chamado e a decisão; depois engrossa com a regra; os indicadores são um segundo fio independente.

1. O fio do chat pelo código: `codigosNoTexto` em `lib/ativos/codigo.ts`; `ativo` no `cartaoPayloadSchema` e no `confirmarAberturaSchema`; `resolverAtivoDoCartao` só com o ramo de código, chamado onde `montarCartao` roda; `conteudoDoCartao`/`mesmoConteudo` considerando os candidatos; linha Equipamento com um candidato e "tirar" no `CartaoResumo`; `confirmarAbertura` aceitando, conferindo e gravando `ativoId` com a observação na `abertura`; log `[assistente]` com origem e quantidade, satisfies **AC-1**, **AC-4**, **AC-5**, **AC-7**, **AC-8**, **AC-9**, **AC-13**
2. Decisão `ativo`: `'ativo'` em `DECISAO_CAMPOS` e no rótulo, `ativoId` nos valores da `DecisaoIa`, ramos explícitos em `valorDecisaoSchema`, `resolverValorNoBanco`, `valorParaInput`, `VALOR_VAZIO` e `mesmoValor`; exclusões em `derivarIaSituacao`, `revisao-ia-filtro.ts`, `camposPendentesDeConfirmacao`, rota `decisoes-ia`, `RevisaoIaPainel` e `garantirHistoricoDecisao`; gravação depois do chamado, sem cancelar a abertura; atualização direta da decisão em `vincularAtivoAoChamado`, satisfies **AC-10**, **AC-11**, **AC-12**
3. O fio engrossa com a regra: ramo de regra em `resolverAtivoDoCartao` (categoria pelo subtipo, locais da unidade e descendentes, desempate pelo texto, teto de 5); lista com "Não sei" marcado no cartão; a lista de regra some na troca de unidade e o servidor aplica o AC-6, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**
4. O fio dos indicadores: `tempoDeReparoMs` com o teste de paridade contra o `tempoPorTipo`; `lib/ativos/indicadores.ts` com a leitura dos corretivos e o cálculo puro (MTBF, MTTR, reincidência, ranking, percentual) por tipo e geral; aba Ativos com selo, seletor de tipo, números do topo, tabela e vazio, satisfies **AC-14**, **AC-15**, **AC-16**, **AC-17**, **AC-18**, **AC-19**
5. Ficha: helper de fim do dia em Belém, `indicadoresDoAtivo` chamado por `carregarFicha` só quando `podeVerDocumentos`, e a linha em `/ativos/[id]`, satisfies **AC-20**

## Consequences

**Positive**:

- O chamado do chat passa a chegar com equipamento quando a pessoa dá o código ou quando o cadastro não deixa dúvida, sem custo de GPU e sem desligar a autonomia.
- A taxa de acerto da sugestão fica medida pela própria `DecisaoIa`, pronta para decidir se vale levar o ativo ao prompt depois.
- O Admin ganha uma visão por equipamento que hoje só existe somando chamados na mão.

**Negative / tradeoffs**:

- A regra só alcança ativos com `localizacaoId` preenchido. Enquanto a vistoria não cobre um prédio, os ativos dele só aparecem pelo código digitado. A cobertura da sugestão cresce junto com a vistoria (spec 0012), não com esta spec.
- Frases como "o ar da janela" ou "o aparelho perto da porta" não são entendidas: sem modelo, o desempate é por palavras do local.
- Os indicadores valem só para chamados com ativo; com pouco vínculo, o ranking representa pouco. O percentual do AC-16 deixa isso visível.
- Quem digita o tombamento de um equipamento de outra unidade abre o chamado com ele, sem aviso; é o mesmo comportamento do formulário, e a gestão corrige. Risco aceito.
- Um crash entre a criação do chamado e a gravação da decisão `ativo` deixa o chamado sem a decisão; a medição perde esse ponto. Perda aceita.
- `DECISAO_CAMPOS` com `'ativo'` exige que todo consumidor novo de `DecisaoIa` lembre de filtrar o campo quando falar de "decisão da IA".

**Neutral**:

- Cartões já gravados sem o campo `ativo` continuam válidos e abrem sem ativo.
- Sem migração de dados: nenhum chamado antigo ganha decisão `ativo`.

## Follow-up

- [x] Custo acumulado por ativo (da proposta de ativos, fatia 4) ficou fora: decidir antes a fonte do custo (cotação aprovada ou campo novo no fechamento). Decidido e feito na spec 0018.
- [ ] "Abrir chamado deste ativo" na ficha levar ao chat com `?ativo=<id>`, em vez do formulário.
- [ ] Revisitar o modelo escolhendo entre candidatos no prompt quando a decisão `ativo` mostrar taxa de correção alta ou muitos cartões sem ativo com a vistoria já completa.
- [ ] Recalcular candidatos para a unidade nova quando a pessoa troca a unidade no cartão, se a gestão sentir falta.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
