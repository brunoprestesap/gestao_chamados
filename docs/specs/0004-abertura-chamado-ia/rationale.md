# 0004. Abertura do chamado pela IA: raciocínio e opções

Registro da decisão. O `/develop` não precisa deste arquivo; ele constrói pelo [index.md](index.md).

## Context

> ⚠️ Nota sobre a premissa: a trava de confiança das funcionalidades 14 e 15 vai se apoiar na confiança que esta fatia começa a gravar. Essa confiança é o número que o modelo declara sobre a própria resposta, e modelo de linguagem costuma declarar confiança alta mesmo quando erra. Tratar esse número como probabilidade de acerto leva a liberar autonomia cedo demais. O enquadramento certo é: esta fatia grava o número como sinal bruto, e a calibração da 14 mede, contra a triagem humana, a que acerto cada faixa de confiança corresponde antes de qualquer limite valer.

A tela `/conversas` (spec 0003) já recebe o relato e responde aos poucos, mas o assistente só acolhe: confirma o que entendeu e faz no máximo uma pergunta. O chamado continua nascendo pelo formulário, que exige unidade, local exato, tipo, subtipo e serviço do catálogo em três níveis. É justamente o catálogo que o servidor comum não conhece: ele sabe que a luz da sala 204 está piscando, não que isso é `ELET-0001` dentro de Elétrica, dentro de Manutenção Predial.

A fundação já existe. A spec 0002 guarda a conversa antes do chamado, cria o chamado a partir dela numa costura sem transação com reparo e proteção contra clique duplo, e registra cada decisão da IA por campo, com confiança, motivo e modelo. A spec 0001 dá um caminho único até o Qwen3 no vLLM da rede interna, com respostas validadas por schema e falha controlada, numa GPU compartilhada que entrega cerca de 41 tokens por segundo com 4 chamadas simultâneas e aceita no máximo 24.000 caracteres de entrada por chamada. O que falta é a peça do meio: quem transforma a conversa numa proposta de chamado, onde essa proposta espera a confirmação e o que acontece quando a IA não consegue.

Quatro forças pesam. A primeira é a GPU compartilhada: cada vaga ocupada por esta funcionalidade é uma vaga a menos para outros sistemas do tribunal, e a raia interativa tem prazo de 20 segundos para o primeiro conteúdo. A segunda é a liberação para todos de uma vez: a IA vai errar em produção desde o primeiro dia, e o desenho precisa limitar o estrago de um erro e transformar cada erro em dado de medição. A terceira é a regra da 0002 de que confiança e motivo só são lidos pela gestão, o que impede guardá-los em qualquer lugar que o solicitante ou o técnico leiam. A quarta é que o chamado precisa nascer mesmo com a IA fora do ar, e o `Chamado` hoje exige serviço do catálogo, que é exatamente o que a IA fora do ar não consegue dar.

Não decidir mantém o chat como andaime: as pessoas relatam, recebem uma frase de volta e depois precisam abrir o formulário e escolher o serviço do mesmo jeito. As funcionalidades 13 a 18 dependem de o chamado nascer pelo chat, e nenhuma delas começa sem isto.

## Options considered

### Opção 1: uma chamada por mensagem com resposta e extração, cartão pelo servidor e proposta interna

A tarefa `conversa.abertura` substitui o acolhimento. A cada mensagem, o modelo recebe o catálogo ativo e o contexto da pessoa e devolve um objeto com a extração (serviço, prioridade, local, se o relato fala de outro lugar, se está completo) e o texto da resposta. O servidor valida o código contra o banco, guarda a proposta num subdocumento da conversa que nunca sai do servidor e, quando ela está completa, grava um cartão resumo como mensagem. A confirmação lê a proposta do banco e chama `abrirChamadoDaConversa`. Sem IA, o cartão vira manual.

**Pros**:

- Uma vaga de GPU por mensagem, a mesma de hoje.
- A pergunta que a IA faz é coerente com o que ela extraiu, porque as duas coisas saem do mesmo objeto.
- A confirmação não chama o modelo: é rápida, determinística e confirma exatamente o que a pessoa viu.
- Confiança e prioridade nunca chegam ao navegador, sem depender de filtro em leitura.

**Cons**:

- O prompt carrega o catálogo em toda mensagem, uns 4 mil caracteres, e disputa o limite de entrada com o histórico.
- O primeiro texto visível demora uns segundos a mais, porque a extração vem antes da resposta.
- Um prompt só faz duas coisas (conversar e classificar), e mudar um lado pode piorar o outro.

### Opção 2: duas chamadas por mensagem, acolhimento e classificação separados

O acolhimento da 0003 continua como está. Depois de cada resposta, uma segunda chamada, sem streaming, recebe a conversa e o catálogo e devolve só a classificação.

**Pros**:

- Cada prompt é pequeno e faz uma coisa só, mais fácil de ajustar e de testar.
- O primeiro texto visível continua tão rápido quanto hoje.

**Cons**:

- Dobra o uso da raia interativa da GPU compartilhada, e dobra a chance de cair no limite por usuário da 0001 (20 chamadas por minuto).
- O acolhimento pergunta sem saber o que a classificação precisa: ele não conhece o catálogo, então não sabe que "piscando" e "apagada" levam ao mesmo serviço e pergunta à toa, ou deixa de perguntar o que importa.
- Duas respostas a conciliar por mensagem: se a segunda falha e a primeira não, a conversa segue sem proposta sem ninguém perceber.

### Opção 3: acolhimento sinaliza, classificação só quando pronto

O acolhimento ganha um campo `pronto`. Só quando ele diz que o relato está completo, uma segunda chamada com o catálogo escolhe o serviço.

**Pros**:

- A maior parte das mensagens roda sem o catálogo no prompt.
- A segunda chamada acontece uma vez por conversa, na maioria dos casos.

**Cons**:

- O acolhimento decide que está pronto sem conhecer o catálogo, então não sabe se o que ele tem basta para escolher entre dois serviços parecidos.
- Se a classificação discorda (não acha serviço), a conversa volta atrás depois de a pessoa já ter visto o sinal de pronto.
- Duas tarefas, dois prompts e duas versões para manter, com a costura entre elas.

### Opção 4: a IA preenche o formulário de sempre

A conversa continua só acolhendo. Um botão leva ao `NewTicketDialog` já preenchido pela IA a partir do relato, e o chamado nasce pelo `createTicketAction` de hoje.

**Pros**:

- Reusa a tela e a ação mais testadas do sistema, sem cartão novo.
- A pessoa vê todos os campos e pode mudar qualquer um, inclusive o serviço.

**Cons**:

- Traz de volta o catálogo em três níveis, que é o que o chat existe para esconder.
- Joga fora a costura da 0002: o chamado não nasce da conversa, e conversa e decisões ficam sem vínculo.
- Com a IA fora do ar, a pessoa cai no formulário vazio, o pior caso de hoje.

## Rationale

A Opção 1 é a escolha porque respeita a restrição mais dura do ambiente, a GPU compartilhada, sem sacrificar a qualidade da pergunta. Uma chamada por mensagem é o custo que a 0003 já aceitou; as Opções 2 e 3 pagam mais vagas ou mais costura para ganhar prompts menores, e o ganho não compensa quando o catálogo inteiro cabe em 4 mil caracteres. A forma de responder coerente com o que falta só existe quando extração e resposta saem do mesmo objeto: na Opção 2 o acolhimento pergunta às cegas, e na Opção 3 ele decide que está pronto às cegas. A Opção 4 é a mais barata de construir e a que mais contraria o propósito da funcionalidade, além de descartar a fundação que a 0002 construiu para isto.

Guardar a proposta num subdocumento interno da conversa, em vez de no `payload` do cartão, decorre da regra da 0002 sobre quem lê confiança e motivo. O `payload` da mensagem é devolvido por `lerConversa` e `lerLinhaDoTempo`, que o solicitante e o técnico usam; esconder campos ali dependeria de um filtro em cada leitura, e um filtro esquecido vaza. O subdocumento nunca entra na projeção de leitura, então o vazamento exige escrever código novo de propósito. Recalcular na confirmação foi descartado porque confirmaria algo diferente do que a pessoa viu e gastaria uma vaga de GPU à toa.

O caminho sem IA nasce sem serviço, e não com a cascata do catálogo, porque o objetivo declarado é o chamado abrir mesmo assim com o texto como descrição, e o Preposto já escolhe o serviço na classificação de qualquer chamado. O afrouxamento em `Chamado` é pequeno e localizado: `required` por função, dispensado só quando `canalAbertura` é `chat`, o mesmo padrão que a 0002 usou no `userId` do `ChamadoHistory`. A classificação continua exigindo o serviço, então o invariante de que chamado validado tem serviço continua valendo, e os leitores atuais já tratam o nulo porque existem chamados antigos sem serviço.

As escolhas menores seguem a mesma linha, a de limitar o estrago do erro da IA:

- **O catálogo inteiro vai no prompt**, ordenado por `code` e antes do bloco da pessoa, para o cache de prefixo do vLLM servir entre pessoas diferentes. A busca por texto antes (segunda colocada) só se paga com catálogo grande, e o de produção é da ordem do seed. O teto de 12 mil caracteres existe para o dia em que o catálogo crescer: acima dele, a extração de serviço desliga e o cartão vira manual, em vez de toda chamada falhar como `bad_request`.
- **O modelo devolve o `code`, não o `ObjectId`.** Código é curto, legível e único, e um código inventado é detectado com uma consulta. Segunda colocada: o número da linha no prompt, que é mais curto mas muda quando o catálogo muda e faz uma proposta antiga apontar para outro serviço.
- **A extração vem antes da resposta no schema.** A resposta sai coerente com o que foi decidido. Segunda colocada: resposta primeiro, que mostra texto mais cedo mas pode perguntar uma coisa e extrair outra.
- **`maxOutputTokens` fica no padrão de 448.** Resposta de até 600 caracteres (uns 170 tokens) mais a extração (uns 120) cabe com folga. A 0003 usava 300, que não comporta os dois.
- **A amostragem fica no padrão da 0001** (`temperature 0.7`). Baixar a temperatura daria classificação mais estável, mas a 0001 registrou que temperatura baixa traz de volta o risco de repetição no Qwen3 e exige justificativa medida. A variação fica visível no cartão que troca e na medição da 14.
- **A proposta atual entra no bloco da pessoa**, para o modelo manter a continuidade quando o histórico é cortado e para reduzir a troca de serviço entre voltas.
- **O histórico corta o meio, não o começo, e só por caractere.** A primeira mensagem do solicitante costuma ser o relato inteiro; cortar pelo começo jogaria fora justamente ela. Por isso o teto de 20 mensagens da 0003, que cortava pelo começo, sai. O orçamento é a entrada inteira contada como a admissão da 0001 conta (`system` mais mensagens), e o histórico fica com o que sobra depois do prompt de sistema real, para um catálogo maior nunca empurrar a chamada para `bad_request` em silêncio.
- **A proposta obedece à ordem das mensagens.** Sem transação e com duas abas possíveis, uma resposta lenta de uma mensagem antiga pode terminar depois da resposta de uma mensagem nova. A gravação compara o `_id` da mensagem que cada proposta responde e só aceita o maior. Segunda colocada: comparar a data da mensagem, que empata em mensagens do mesmo segundo.
- **O título do chat usa o nome do serviço.** O formulário monta o título com o tipo porque é o que ele tem de mais legível; o chat tem o serviço escolhido, que diz mais na lista da gestão (`Troca de lâmpada — sala 204` contra `Manutenção Predial — sala 204`). No modo manual, sem serviço, volta ao tipo, como o formulário.
- **A confiança é a declarada pelo modelo**, um número de 0 a 1 por campo. É o único sinal disponível sem uma segunda chamada, e a nota sobre a premissa diz o que a 14 precisa fazer com ele.
- **A prioridade é gravada e escondida de todos.** Mostrar ao Preposto ajudaria na triagem, mas ancoraria a escolha, e o acerto medido pelos ganchos da 0002 deixaria de ser honesto justo quando ele é a base da calibração.
- **A descrição é o texto do solicitante, sem resumo.** Um resumo da IA leria melhor na triagem, mas poria texto do modelo no registro oficial do chamado, e seria diferente do caminho sem IA.
- **A unidade nunca é do modelo.** Nome de unidade escrito do jeito da pessoa casa mal com o cadastro; o perfil e uma lista resolvem sem erro. O modelo só avisa que o relato fala de outro lugar, e aí a unidade fica em branco para a pessoa escolher.
- **O cartão não entra no teto de 30.** Senão a pessoa que conversou muito perde a conversa inteira justo na hora de abrir o chamado.
- **Os motivos novos da confirmação ficam fora de `CONVERSA_FALHAS`.** `cartao_desatualizado` e `dados_invalidos` são da confirmação, não da conversa; pôr na união da 0002 obrigaria frases e mapeamentos de status em lugares que nunca os veem.
- **O cartão grava o ponteiro antes da mensagem**, com o id gerado antes, pelo mesmo raciocínio do `chamadoIdReservado` da 0002: o estado que sobra de uma falha no meio é um ponteiro sem mensagem, que conta como cartão desatualizado e se conserta com `Revisar e abrir`, e nunca uma mensagem de cartão órfã numa conversa já ligada.
- **A notificação sai só com `jaExistia: false`.** Uma falha exatamente entre criar o chamado e notificar perde a notificação daquele chamado, que continua na lista da gestão. Notificar de novo numa repetição mandaria email duplicado a cada clique duplo, o que é pior.

## Evidência

**Medidas herdadas da 0001** (`docs/specs/0001-integracao-ia-local/verify.md`, 2026-09-17): 40,8 tokens por segundo com 448 tokens e 4 chamadas simultâneas, mediana de 10,99 segundos; 0 corte com conteúdo repetido e 0 com espaço em branco na amostragem padrão, o que cumpre a condição prévia que a 0001 impôs às funcionalidades 11 e 12. Limite de entrada: `LLM_MAX_INPUT_CHARS = 24_000`.

**Tamanho do catálogo**: o `scripts/seed.js` cria 3 tipos, 12 subtipos e 27 serviços; o catálogo de produção é da mesma ordem, pela resposta do engenheiro. Com código, nome, subtipo, tipo e 120 caracteres de descrição, cada linha tem uns 150 caracteres, uns 4 mil no total.

**Nomes dos tipos**: o seed grava `Manutenção Predial`, `Ar-Condicionado` e `Elevador`, os mesmos de `TIPO_SERVICO_OPTIONS`. O formulário não compara o nome exato: `buildTypeIdByTipo` normaliza, e a proposta passa a usar a mesma normalização, extraída para `shared/chamados/`.

**Leitores de `catalogServiceId`** (levantamento de 2026-09-18, fora formulário, recorrência e modelos de chamado, que sempre gravam o serviço):

| Leitor                                                                                                                          | Como trata o nulo hoje                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/api/meus-chamados/route.ts`, `app/api/meus-chamados/[id]/route.ts`                                                         | converte para `null`                                               |
| `app/api/gestao/chamados/route.ts`                                                                                              | converte para `null`                                               |
| `app/api/chamados-atribuidos/route.ts`, `app/api/chamados-atribuidos/[id]/route.ts`                                             | converte para `null`                                               |
| `app/api/gestao/chamados/[id]/eligible-technicians/route.ts` e `...-reassign/route.ts`                                          | já testa a ausência (atribuição só ocorre depois da classificação) |
| `app/(dashboard)/gestao/_components/AtribuirChamadoDialog.tsx`                                                                  | já tem `needsCatalog`                                              |
| `app/(dashboard)/gestao/_components/ClassificarChamadoDialog.tsx`                                                               | pré preenche com `?? ''` e exige escolher                          |
| `app/(dashboard)/dashboard/actions.ts`                                                                                          | filtra `{ $exists: true, $ne: null }` antes do `$lookup`           |
| `app/(dashboard)/meus-chamados/_components/ChamadoCard.tsx`, `meus-chamados/[id]/page.tsx`, `chamados-atribuidos/[id]/page.tsx` | tipo `string \| null`; a tarefa 9 confere o que cada um exibe      |
