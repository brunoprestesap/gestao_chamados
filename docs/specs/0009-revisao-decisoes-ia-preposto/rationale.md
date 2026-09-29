# 0009. Revisão das decisões da IA pelo Preposto: raciocínio

## Context

> ⚠️ Premise note: esta fatia junta três decisões que poderiam andar separadas: a fila de revisão (filtro e painel), a regra de SLA para corrigir a prioridade com o atendimento em curso, e a correção de serviço. Mantive numa spec só porque as três usam as mesmas ações, o mesmo veredito na `DecisaoIa` e a mesma trilha, e porque o marco 1 entrega a revisão sozinho, sem tocar em prazo. A regra de SLA é a parte de risco contratual e fica isolada no marco 2.

Desde as specs 0007 e 0008, a IA valida o chamado e escolhe o técnico sem passar pelo Preposto. Cada decisão fica gravada na `DecisaoIa` (valor, confiança, motivo, situação e correções), mas a única tela que lê esses dados é a de calibração do Admin. O Preposto não tem como separar o que a IA decidiu do que ainda espera triagem, não vê o que a IA escolheu nem por quê, e só corrige a prioridade numa janela estreita (`validado`, sem técnico). A atribuição automática fechou essa janela: um chamado que o Sigma atribuiu sozinho nasce `em atendimento`, e um erro de prioridade ou de serviço nele não tem caminho. Não existe correção de serviço depois da classificação.

O que pesa no desenho. O SLA é contratual e a base da glosa do IMR (Índice de Medição de Resultados): mudar a prioridade muda prazo e pode criar ou apagar uma violação. O Preposto classifica e atribui, e a glosa recai sobre a contratada; baixar uma prioridade dá mais prazo, então quem decide isso precisa de um freio. O prazo de resolução é empurrado pelas pausas (aguardando solicitante ou terceiros) direto no `sla.resolutionDueAt`, sem campo que guarde a soma delas, e o `PauseLog` não registra a pausa "aguardando solicitante". O monitor de SLA mede `now − sla.computedAt − totalPausedMinutes` (o total da vida do chamado), e o relatório de breach e o dashboard agrupam por `computedAt`; mover essa data quebra os três. O estado de cada decisão vive na `DecisaoIa`, e o `Chamado.iaSituacao` vira `revisada` com qualquer veredito, inclusive uma troca de técnico, então não distingue "ninguém olhou". O Mongo de produção roda standalone (sem transação) e o CD não roda migração nem tem `scripts/` na imagem. A rota `/api/meus-chamados` devolve `classificationNotes` ao solicitante, e a correção da 0007 somava o motivo do gestor nesse campo. A spec 0002 fez a `correcao_ia` aparecer a todos os perfis.

Sem esta fatia, o Admin não tem uma saída para erro da IA depois de a atribuição automática ligar, e a fatia 18 não tem como separar "confirmada" de "ninguém olhou". A própria spec 0008 pede que o interruptor só seja ligado depois que a correção de prioridade pós atribuição existir.

## Options considered

### Option 1: Filtro na lista existente, painel por campo e correções atômicas sobre o `resolverDecisao`

A revisão vive na lista e no detalhe que o Preposto já usa: um filtro "Revisão da IA" com quatro recortes, um painel "Serviço, prioridade e técnico" com confirmar e corrigir por campo, e ações que gravam o chamado numa operação condicional e o veredito pelo caminho que já existe.

**Pros**:

- Sem tela nova para manter; reaproveita lista, busca, paginação, detalhe e diálogos.
- O veredito na `DecisaoIa` já existe e já alimenta a calibração; nenhum dado novo para a fatia 18.
- Cada correção é uma gravação condicional só, no padrão de `updateTicketPriorityAction` e `reopenTicketAction`.

**Cons**:

- A lista da Gestão ganha mais um filtro e o detalhe ganha uma seção: mais densidade numa tela que já é cheia.
- A consulta em duas etapas do filtro tem teto de tamanho.

### Option 2: Aba nova "Revisão da IA" ao lado da lista

Uma fila própria, com contadores por recorte, mostrando só o que a IA decidiu ou sugeriu.

**Pros**:

- Fica mais visível e permite contadores e ordenação própria da fila.
- Isola o fluxo de revisão do fluxo de triagem.

**Cons**:

- Duplica a lista e o detalhe, ou obriga a extrair componentes para dois lugares.
- Um chamado revisado sai da aba e da lista ao mesmo tempo em estados diferentes, o que confunde.

### Option 3: Tela própria em `/gestao/revisao-ia`

Rota separada só para revisar, com seu próprio detalhe.

**Pros**:

- Isola por completo, sem risco de mexer na tela existente.

**Cons**:

- Duas telas de chamado para manter e testar, e o Preposto alterna entre elas.
- Mais rota, mais permissão (`proxy.ts` e `requireManager`) e mais navegação, para uma fila que é um recorte da mesma lista.

## Rationale

A opção 1 vence porque o problema é de descoberta e de saída, não de tela: o Preposto já trabalha na lista da Gestão e o que falta é separar o que a IA decidiu e dar uma saída de correção que respeite o contrato. Uma aba ou uma tela nova só duplicaria lista e detalhe, e o custo de manter dois lugares supera o ganho de visibilidade. O filtro usa uma busca `distinct` sem teto, sobre um índice novo que a cobre: o volume de decisões é pequeno, e um campo derivado no `Chamado` traria divergência e um backfill que o CD não roda.

A regra de SLA assimétrica segue o que o contrato exige de cada lado. Uma correção para cima, feita depois de a prioridade errada ter valido por horas, geraria uma violação que a contratada não tinha como evitar se o prazo contasse da classificação; por isso o prazo novo conta de agora. Mas contar de agora, sozinho, pode dar mais tempo (uma ALTA de 8h com 6h decorridas ficaria com 8h de novo) e o IMR "lavaria" a violação mantida; por isso o prazo é o menor entre o atual e o novo, e subir nunca estende. Uma correção para baixo mede o chamado contra a prioridade certa desde o início: sem técnico conta da classificação (como a 0007), e com técnico soma ao prazo atual a diferença entre os alvos, o que carrega as pausas sem derivá-las (o `PauseLog` é incompleto e recalcular a base com os feriados de hoje transformaria feriado cadastrado depois em "pausa"). A violação só é zerada quando o prazo novo ainda está no futuro, senão o monitor a remarcaria com data nova e reenviaria o aviso. Baixar dá mais prazo e mexe na glosa, e quem o usa é quem pode se beneficiar dele; por isso, com técnico atribuído, só o Admin baixa, e o motivo é sempre obrigatório. `computedAt` nunca se move, para monitor, relatório de breach e dashboard continuarem coerentes, e os alvos gravados só mudam quando o prazo se move, para a soma da diferença de alvos nunca acrescentar prazo por cima de um prazo que uma subida manteve.

A confirmação é um update condicional só em decisões `aplicado`: reusar o `resolverDecisao` leria e regravaria o valor (perdendo uma correção concorrente), e confirmar uma `sugestao` inflaria os acertos da calibração, que conta `confirmada`.

O motivo sai de `classificationNotes` porque esse campo chega ao solicitante, e o texto neutro escolhido para a linha do tempo não faria sentido se o motivo vazasse por outro lado. O motivo mora na `DecisaoIa` e numa entrada só da gestão (`correcao_gestao`), que existe mesmo sem decisão da IA, para a auditoria nunca depender de o chamado ter vindo do chat. A confirmação opcional dá à fatia 18 a distinção entre "confirmada" e "ninguém olhou".

### Decisões menores

| Decisão | Escolha | Alternativas | Por quê |
| --- | --- | --- | --- |
| Onde vive a revisão | Filtro na lista atual | Aba nova; tela própria | O problema é separar e corrigir, na tela que o Preposto já usa |
| Recortes do filtro | Sem revisão, triagem, corrigidos, sem técnico | Só os dois do escopo | A 0008 pediu "atribuído pela regra"; "corrigidos" lê o que a fatia 18 vai medir; "sem técnico" hoje só tem selo |
| Confirmar sem corrigir | Botão opcional | Só corrigir conta | Sem ele a fila "sem revisão" nunca esvazia e a métrica não separa "confirmada" de "ninguém olhou" |
| Painel | Três linhas sempre visíveis na janela, com os dados da IA quando há decisão | Painel só quando há decisão, botões no cabeçalho | Uma entrada só para corrigir, valendo também para chamado do formulário |
| Regra de SLA | Assimétrica: sobe pelo menor prazo, desce pelo prazo novo, `computedAt` fixo | Sempre do `classifiedAt`; sempre da hora da correção; mover `computedAt`; SLA imutável | Nem cria violação retroativa nem dá prazo de graça; mover `computedAt` quebra o monitor, o relatório de breach e o dashboard; a imutabilidade deixaria o IMR por prioridade divergir do prazo cobrado |
| Quem baixa com técnico | Só o Admin | Preposto e Admin com motivo; sem diferença | Separa quem sofre a glosa de quem decide o prazo; afrouxar depois é mais fácil que apertar |
| Janela de status | `validado` e `em atendimento` | Também pausados; até `concluído` | Relógio parado e `slaPausedAt` aberto tornam o recálculo frágil; corrigir chamado fechado muda o IMR do que já acabou |
| Serviço com técnico | Mantém se a especialidade bate; senão exige outro | Sempre novo técnico; voltar para `validado` | Só isso alcança os chamados que a regra atribuiu sozinha, sem mexer no início da resposta do SLA |
| Consulta do filtro | Duas etapas sobre a `DecisaoIa`, `distinct` sem teto, índice novo | Campos derivados no `Chamado`; `$lookup`; teto de ids | Sem campo novo, migração nem divergência; um teto contaria decisões e não chamados, e seria aplicado antes de `q` e `status`, gerando falso vazio |
| Pausa na descida com técnico | Soma da diferença de alvos ao prazo atual | Derivar a extensão de `computedAt` e dos alvos; somar o `PauseLog`; campo novo `sla.pauseExtensionMinutes`; `totalPausedMinutes` | Sem campo nem migração; as pausas já estão no prazo atual; o `PauseLog` não cobre "aguardando solicitante"; derivar com os feriados de hoje trata feriado novo como pausa |
| Alvos gravados na correção | Só mudam quando o prazo se move (sobe) ou sempre (desce) | Sempre atualizar | Se uma subida mantém o prazo e o alvo gravado muda, a descida seguinte somaria a diferença por cima do prazo antigo |
| Confirmar | Update condicional só em `aplicado` e `sem_revisao`, comparando com o valor atual | Reusar `resolverDecisao`; confirmar também `sugestao` | `resolverDecisao` lê e regrava; confirmar `sugestao` infla os acertos da calibração e tira o chamado do recorte `triagem` |
| Autenticação das rotas GET | `verifySession` mais papel, com 401 e 403 | `requireManager` | `requireManager` redireciona, e dentro de uma rota vira 500 |
| Monitor de SLA | O `updateOne` filtra pelo prazo lido | Deixar como está | Uma descida no meio do ciclo do monitor seria desfeita e a violação ressuscitada |
| `tipoServico` na correção de serviço | Derivado de `ServiceType.name` por `tipoServicoDoNomeDoTipo` | Usar `resolverValorNoBanco` | Ele só repete o valor recebido; o IMR agrupa por esse campo |
| Motivo | Obrigatório na prioridade; opcional em serviço | Sempre; categoria fixa; opcional | Prioridade mexe em prazo e glosa; a categoria cria lista para manter |
| Onde o motivo vive | `DecisaoIa` e `correcao_gestao`, nunca `classificationNotes` | Continuar somando em `classificationNotes` | `classificationNotes` chega ao solicitante |
| Trilha da correção | `correcao_gestao` nova, só da gestão | Reusar `correcao_ia` | `correcao_ia` pressupõe decisão da IA e o rótulo enganaria no chamado do formulário |
| Visibilidade | Entrada neutra; ações da gestão escondidas | Como hoje; esconder tudo | O solicitante vê o efeito sem a confiança, o motivo ou o valor antigo |
| Aviso ao técnico | Técnico atual e técnico novo | Solicitante ao vivo; ninguém | O prazo e o trabalho de quem executa mudam; o técnico novo hoje recebe em silêncio |
| Evento do aviso | `ticket:corrected` novo | Reusar `ticket:classified` | O toast precisa de texto próprio e o handler atual de `ticket:classified` é silencioso |
| Nível | GA | Beta | Mexe em prazo contratual e glosa, como a 0007 e a 0008 |
| Dívida `catalogo_atualizado` (0002) | Fora do escopo | Consertar aqui | O caminho de serviço novo não depende dela |
| Painel mostra a sugestão de prioridade "às cegas"? | Mostra o valor sempre; esconde confiança, motivo e `divergente` enquanto a decisão for cega (`efeito: 'sugestao'`, `situacao: 'sem_revisao'`) | Mostrar tudo sempre; esconder tudo até julgar, como `decisoesOcultas()` esconde na linha do tempo (`CAMPOS_OCULTOS`) | O valor tem precedente: a 0007 (AC-8) já pré-preenche essa mesma sugestão, rotulada "Sugestão da IA", no diálogo de classificação, e suas Consequences dizem que "a medição às cegas de verdade acaba" para o valor desde ali. Mas a 0007 nunca mostrou a confiança nem o motivo, e mostrá-los aqui vazaria o corte de confiança que a fatia 18 usa (o Preposto tende a aceitar mais uma sugestão de confiança alta à vista, o que enviesaria a acurácia por faixa). `divergente` também só conta depois de julgada, senão todo chamado ainda em triagem apareceria como divergente sem nunca ter sido decidido. Achado pelo `/check verify` do marco 1 (leu como vazamento total) e refinado por uma conferência com outro modelo (spec 0009), que separou o que a 0007 já abriu (o valor) do que continua fechado (confiança, motivo, `divergente`) |
