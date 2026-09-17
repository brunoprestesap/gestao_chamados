# 0001. Integração com a IA local: justificativa

Registro da decisão da [spec 0001](index.md). O `/develop` não precisa ler este arquivo.

## Context

> ⚠️ Premise note: esta fundação assume duas coisas que ainda não foram confirmadas. A primeira é que o vLLM da rede interna aceita `response_format` do tipo `json_schema` e `chat_template_kwargs` (a versão dele é desconhecida). A segunda é que o container `next-app` alcança o host do vLLM. Se qualquer uma falhar, a restrição de JSON e o desligamento do thinking caem, e o resto do desenho perde a base. Por isso o Marco 1 do build plan roda um teste de fumaça contra o vLLM real antes de construir qualquer proteção. Ela também depende da funcionalidade 10 (conversa e decisões no banco), que ainda não tem spec; a fundação fica independente dela usando uma referência genérica (`refType`, `refId`).

O escopo planeja abrir chamados por conversa. Um modelo Qwen3 híbrido, servido por vLLM na rede interna do tribunal, escolhe o serviço, define a urgência e encaminha. Pelo menos cinco funcionalidades vão chamar o modelo (abertura pelo chat, calibração sobre chamados históricos, prioridade automática, aviso de duplicado, painel de acurácia). Sem um caminho comum, cada uma reinventaria prazo, fallback, validação e registro, com comportamentos diferentes diante da mesma queda.

As forças que moldam a decisão:

- **GPU compartilhada:** outros sistemas do tribunal usam o mesmo vLLM. O Sigma precisa de um teto de chamadas simultâneas e não pode inundar a fila, nem quando o modelo cai.
- **O chamado não pode depender da IA:** o escopo exige que, com a IA fora do ar ou lenta, o chamado abra mesmo assim. Toda falha precisa virar um resultado que a tela sabe tratar, dentro de um tempo que o usuário aguenta esperar.
- **Saída confiável:** as decisões da IA alimentam SLA contratual e glosa do IMR. A resposta precisa ter forma garantida e ser validada antes de virar dado.
- **Rastreabilidade:** cada decisão precisa guardar a versão do modelo, e o painel de acurácia precisa contar falhas por período.
- **Dados pessoais:** relatos trazem nomes, telefones e locais. Eles não podem sair da rede interna nem se espalhar por logs.
- **Operação atual:** Next.js 16 em um único container (ou um processo PM2), MongoDB, Zod 4, testes em Vitest e Playwright. O padrão da casa para integrações opcionais (LDAP, SMTP, socket) é: configuração só por variável de ambiente, desligada quando falta variável, e nenhuma exceção vazando para a regra de negócio.
- **Conformidade:** o engenheiro definiu que a Resolução CNJ 615/2025 não se aplica a este uso administrativo interno. A spec segue essa premissa; se a governança de TI entender diferente, o registro `LlmCall` e o `meta` já guardam modelo, versão do prompt e resultado de cada chamada.

### Revisão da amostragem padrão (2026-09-17)

> ⚠️ Premise note: o problema chegou como "a amostragem padrão está errada", mas a saída do teste de fumaça que cortou não foi guardada, e não se sabe em qual caso aconteceu. Um corte por limite de tokens tem duas causas bem diferentes: o modelo repetir conteúdo (a amostragem resolve) ou a gramática do JSON deixar espaço em branco sem fim (a amostragem não resolve, e só o servidor do vLLM corrige). Trocar os números sem reproduzir o corte arriscaria declarar resolvido um problema que continua. Por isso a revisão exige provar a causa contra o vLLM real antes de fixar os valores.

Durante o build dos Marcos 1 a 4, o teste de fumaça contra o vLLM real (vLLM 0.25.1, `qwen3-8b`) mostrou respostas que repetiam até bater no limite de tokens. A amostragem da fundação (`temperature 0.2`, `top_p 0.8`, `max_tokens 1024`) tinha sido escrita sem justificativa registrada, e um dos casos do teste ainda pedia `temperature 0`.

As forças desta revisão:

- **O fabricante recomenda outra coisa:** o card do Qwen3 traz valores próprios para o modo sem thinking e alerta que a decodificação gulosa leva a repetição sem fim.
- **O servidor completa o que o pedido não manda:** o vLLM usa por padrão o `generation_config.json` do modelo para os campos ausentes. Hoje o `top_k` efetivo do Sigma é decidido por como a equipe da GPU sobe o servidor, e o provedor do AI SDK descarta o `topK` padrão.
- **Um laço custa caro além da chamada:** com 1024 tokens, gerar até o limite pode passar dos 20s da raia interativa. A chamada vira `timeout`, que conta para o disjuntor, e um problema de prompt ou de amostragem pode desligar a IA para todos.
- **As decisões precisam ser estáveis e mensuráveis:** a classificação alimenta prioridade e SLA, e a calibração (funcionalidade 14) mede o acerto. Mais sorteio significa mais variação entre chamadas.
- **Ninguém vê o corte hoje:** o registro não guarda por que a resposta parou, então um laço aparece só como `invalid_output` ou `timeout`, misturado com outras falhas.

## Options considered

### Option 1: AI SDK com `@ai-sdk/openai-compatible`

Biblioteca da Vercel com um provedor genérico para APIs compatíveis com a OpenAI, apontado para o vLLM.

**Pros**:

- Streaming de objeto parcial (`streamText` com `Output.object`), validação Zod do objeto final e prazos de primeiro pedaço e de parada já prontos.
- Repassa campos extras do vLLM no corpo e aceita `fetch` próprio, o que facilita testar.
- A funcionalidade 11 ganha `useChat` e o protocolo de streaming para o navegador sem código novo.

**Cons**:

- Duas dependências de um SDK que quebra API entre versões maiores.
- Um id de modelo em texto aciona o AI Gateway da Vercel por padrão, uma armadilha para dados que não podem sair da rede.
- A política de novas tentativas embutida precisa ser desligada para não se somar à nossa.

### Option 2: `fetch` próprio com Zod

Cliente escrito à mão sobre `fetch`, no estilo de `lib/realtime-emit.ts`, com `z.toJSONSchema()` do Zod 4 para gerar o `response_format`.

**Pros**:

- Nenhuma dependência nova e controle total do corpo e dos prazos.
- Segue o padrão já conhecido pela equipe.

**Cons**:

- Com streaming, é preciso escrever e manter um parser de SSE e um parser de JSON parcial, justamente as partes com mais casos de borda.
- A funcionalidade 11 teria de inventar o protocolo de streaming até o navegador.

### Option 3: SDK `openai` oficial com `baseURL` do vLLM

**Pros**:

- Cliente maduro, com streaming e prazos bons, e muito usado contra o vLLM.

**Cons**:

- Os ajudantes de schema e de parse são pensados para a API da OpenAI e não cobrem o JSON parcial no streaming de objeto.
- Não ajuda em nada na tela; a funcionalidade 11 continua sem protocolo pronto.

### Revisão da amostragem padrão: opções

#### Opção A: card do Qwen3 para o modo sem thinking

`temperature 0.7`, `top_p 0.8`, `top_k 20`, `min_p 0`, `presence_penalty 0`, enviados em todo pedido, com `max_tokens 512`.

**Pros**:

- São os valores que o fabricante testou para exatamente este modo (basis: card do Qwen3-8B, seção de boas práticas).
- Afasta o gatilho conhecido de repetição, que é a temperatura baixa.
- Não paga o risco de mistura de idiomas do `presence_penalty`.

**Cons**:

- Mais variação entre chamadas: um relato ambíguo pode receber serviço ou urgência diferentes.
- A recomendação do card é genérica, não foi medida para classificação com JSON restrito.

#### Opção B: meio termo mais estável

`temperature 0.5`, `top_p 0.8`, `top_k 20`, `min_p 0`.

**Pros**:

- Menos variação na classificação do que a Opção A.
- Ainda longe da decodificação gulosa.

**Cons**:

- Fica fora do que o fabricante validou, sem medida própria que justifique o número.
- Não há como saber, sem medir, se 0.5 já basta para afastar a repetição.

#### Opção C: manter a temperatura baixa e combater a repetição com penalidade

`temperature 0.2`, `top_p 0.8`, `top_k 20`, `min_p 0`, `presence_penalty 1.0`.

**Pros**:

- A classificação fica mais determinística, o que agrada quem lê o resultado como decisão.
- Ataca a repetição diretamente.

**Cons**:

- O card avisa que o `presence_penalty` pode misturar idiomas e piorar um pouco a qualidade, e os campos de texto são em português (basis: card do Qwen3-8B).
- Mantém o gatilho da repetição e aposta numa compensação.
- A penalidade também pesa sobre palavras que legitimamente se repetem num relato (local, equipamento).

## Rationale

O engenheiro pediu streaming já na fundação, contrariando a recomendação inicial de só respostas completas. É uma escolha defensável: numa GPU compartilhada a resposta pode levar vários segundos, e ver o texto chegando reduz a sensação de espera. Mas o streaming é o que decide entre as opções. Um parser de SSE e de JSON parcial escritos à mão (Option 2) são exatamente o tipo de código que falha em produção nos casos de borda (pedaço cortado no meio de um caractere, conexão que cai no meio de um objeto). O AI SDK resolve isso e ainda entrega o transporte para a funcionalidade 11. O custo real dele (versões instáveis e o AI Gateway como padrão) se controla com versões fixas, teste de fumaça e uma invariante com regra de ESLint. O SDK `openai` (Option 3) resolve o transporte até o vLLM, mas nada além.

A proteção (raias, fila curta, disjuntor, limite por usuário) responde à GPU compartilhada e à exigência de abrir o chamado mesmo sem IA. O estado fica em memória porque o Next roda em uma única instância; um Redis agora seria infraestrutura nova para um problema que ainda não existe.

Decisões menores tomadas na escrita, com a alternativa descartada:

- **`lib/llm` e prefixo `LLM_`**, em vez de `lib/ai` e `AI_`. `AI_` se confunde com as variáveis do próprio AI SDK (ex.: `AI_GATEWAY_API_KEY`).
- **`streamLlmObject` resolve só após o primeiro conteúdo**, em vez de devolver o fluxo na hora. Assim a funcionalidade decide o plano B antes de começar a responder ao navegador, e as novas tentativas acontecem sem o usuário ver nada.
- **Qualquer falha depois do primeiro conteúdo vira `interrupted`**, em vez de motivos separados para parada e teto total. Para quem chama, a ação é a mesma.
- **O disjuntor conta só `timeout`, `unavailable` e `interrupted`, e qualquer resposta HTTP do vLLM zera a contagem ou fecha o disjuntor.** `auth_error`, `bad_request` e `invalid_output` indicam configuração ou prompt errados, não queda; abrir o disjuntor por eles esconderia o problema real. O disjuntor mede disponibilidade, e um servidor que respondeu está disponível.
- **O limite por usuário conta só chamadas aceitas**, em vez de contar também as rejeitadas (como a checagem cruzada sugeriu). Contar rejeições faria quem insiste ficar bloqueado indefinidamente, e rejeitar localmente não custa nada à GPU. O custo que sobra, gravar um documento por rejeição, é limitado a um `rate_limited` por usuário a cada 60s.
- **Vaga de lote dinâmica**, em vez de 1 vaga reservada fixa. A calibração roda raramente; com a reserva fixa, o chat perderia 25% da capacidade o dia inteiro. A regra "vaga liberada vai primeiro para a interativa em espera" resolve a disputa sem desperdício.
- **Limite de entrada por caracteres (24.000)**, em vez de contar tokens: contar tokens exigiria o tokenizador do Qwen no Node. 24.000 caracteres ficam bem abaixo da janela do Qwen3 mesmo em português.
- **Lote com 120s, 30s e 180s e espera de 2s e 4s entre tentativas.** O lote espera atrás das interativas, então o primeiro pedaço demora mais; a espera curta basta para soluços de rede sem prender a calibração.
- **Um `LlmCall` por chamada lógica**, com `attempts`, em vez de um por tentativa. O painel conta o que o usuário viveu, não o que a rede fez.
- **Prazos e limites como constantes, e só as vagas em variável.** A equipe da GPU pode pedir menos vagas sem deploy; os prazos são contrato de UX e mudam junto com o código.
- **Rota de status com JSON 401 e 403**, em vez de `requireAdmin()`, que redireciona e faria uma rota de API responder HTML.
- **Servidor falso em `e2e/fixtures/llm-stub/`, usado também pelo Vitest**, em vez de só simular o modelo com as ferramentas de teste do AI SDK. O servidor falso testa o HTTP real (cabeçalho, corpo, SSE, queda de conexão), que é onde a integração quebra.
- **Thinking sempre desligado.** As tarefas deste escopo são classificação e extração com schema, e o prazo de 20s não comporta o raciocínio longo do Qwen3.

### Revisão da amostragem padrão: por que a Opção A

O engenheiro escolheu a Opção A, que também era a recomendação. O argumento central é que a temperatura baixa é o gatilho documentado de repetição neste modelo, e a Opção C tenta compensar esse gatilho com uma penalidade que o próprio fabricante diz prejudicar a qualidade em outra língua. A variação maior entre chamadas (o custo da Opção A) é real, mas é o tipo de custo que a calibração da funcionalidade 14 existe para medir. Já uma repetição que corta a resposta não é medida por ninguém: ela só vira falha. A Opção B troca um número validado pelo fabricante por um número sem medida.

A escolha sozinha não fecha o problema, por causa da premissa: a causa do corte não foi observada. Por isso a revisão tem duas redes de segurança que valem qualquer que seja a causa. A primeira é o limite de tokens (512 no desenho, 448 depois da medição da tarefa 20), conferido contra a velocidade real da GPU, que faz um laço terminar como `invalid_output` dentro do prazo em vez de virar `timeout` e abrir o disjuntor. A segunda é o `finishReason` no registro, que torna o corte visível. Em cima disso, a comparação de três configurações contra o vLLM real separa repetição de conteúdo de espaço em branco antes de o Marco 5 terminar.

Decisões menores desta revisão, com a alternativa descartada:

- **Enviar todos os campos em todo pedido**, em vez de confiar no padrão do servidor. A documentação do Qwen para o vLLM pede isso, e o `--generation-config` do vLLM completa os campos ausentes com o que estiver no servidor (basis: documentação de implantação do Qwen com vLLM; argumentos do motor do vLLM). `frequency_penalty` e `repetition_penalty` também vão fixos nos valores neutros, pelo mesmo motivo, mas não entram no `sampling` porque nenhuma decisão aqui pede ajustá-los.
- **`top_k`, `min_p` e `repetition_penalty` por `providerOptions.vllm`**, em vez do `topK` padrão do AI SDK. O provedor `openai-compatible` descarta o `topK` com um aviso e copia para o corpo os campos desconhecidos de `providerOptions` (basis: `node_modules/@ai-sdk/openai-compatible/dist/index.js`, montagem do corpo do chat; documentação dos provedores compatíveis com a OpenAI no AI SDK). O `transformRequestBody` do provedor não serve, porque é fixo por provedor e a amostragem muda por chamada.
- **`maxOutputTokens` 512 com medição e piso de 256 (a medição da tarefa 20 baixou para 448)**, em vez de manter 1024 ou cair para 256. Uma classificação com motivo curto usa por volta de 100 a 200 tokens. O teto de 12s deixa, dentro dos 20s da raia interativa, até 5s para a fila e folga para a leitura do prompt. A medição roda com `LLM_MAX_CONCURRENCY` gerações simultâneas, e não com uma só na raia de lote (como estava no primeiro rascunho), porque a GPU gera mais devagar por pedido quando atende vários ao mesmo tempo, e medir sozinho superestimaria a velocidade que o chat vai ter. Mesmo assim, só mede a carga do próprio Sigma, não a dos outros sistemas na mesma GPU. Resultado em 2026-09-17: com 512 tokens a mediana deu 12.373,5 ms (41,4 tokens por segundo), acima de 12s, e a regra baixou o limite para 448, o maior múltiplo de 64 que cabe nessa velocidade; com 448 a mediana deu 10.989,5 ms.
- **`finishReason` no `LlmCall`**, em vez de um novo motivo `truncated`. Para quem chama a ação é a mesma (seguir sem IA), pela mesma lógica que juntou parada e teto em `interrupted`; quem opera ganha a distinção no registro.
- **`sampling` inteiro no `LlmCall`**, em vez de confiar que cada funcionalidade troque o `promptVersion` quando mexer na amostragem. São seis números por documento, e a calibração e o painel deixam de depender de disciplina.
- **`sampling` sobrescreve os seis campos, sem `seed`**. O vLLM diz que o servidor online não garante reprodução, porque o agrupamento de pedidos concorrentes muda o resultado; um `seed` exposto prometeria o que não entrega (basis: documentação de reprodutibilidade do vLLM).
- **Faixas validadas no Sigma, com `bad_request` local**, em vez de deixar o vLLM responder 400. Um erro de digitação numa funcionalidade não gasta vaga nem aparece como falha do vLLM, e o registro guarda `sampling: null` para não gravar número inválido. `temperature 0` continua aceito porque há usos legítimos de depuração, mas a spec da funcionalidade precisa justificar. O teto de 8192 para `maxOutputTokens` não vem de nenhuma fonte: é uma trava contra erro de digitação, bem abaixo do contexto nativo de 32k tokens do Qwen3-8B. O `--max-model-len` real do servidor pode ser menor, e por isso entrou na pergunta à equipe da GPU; se um pedido passar dele, o vLLM responde 400, que já vira `bad_request`.
- **Laço de repetição não abre o disjuntor**, mesmo sem nunca acabar. Um corte é resposta HTTP 200, e o disjuntor mede disponibilidade, não qualidade; cada corte já cai rápido na alternativa sem IA. A visibilidade fica com o `finishReason` e com o painel da funcionalidade 18, em vez de um alarme novo agora, que seria mecanismo sem destino (o projeto ainda não tem para onde mandar alerta da aplicação).
- **`presence_penalty` 0, subindo para 1.0 só se a comparação pedir**, em vez de ligar desde já. Paga o risco de mistura de idiomas apenas com evidência de que a temperatura não bastou.
- **Laço de espaço em branco resolvido no servidor**, em vez de uma gramática própria por pedido. O pedido aceita `structured_outputs.disable_any_whitespace`, mas o backend xgrammar lê a opção só da configuração do motor, então só a equipe da GPU consegue ligar (basis: `vllm/v1/structured_output/backend_xgrammar.py`). Escrever gramática à mão para cada schema tiraria o Sigma do caminho padrão do AI SDK.
- **Comparação com três configurações (antiga, gulosa e padrão)**, em vez de testar só a nova. Sem reproduzir o corte com a antiga, não há como dizer que a nova resolveu; a gulosa entra porque o próprio teste de fumaça a usava. O limite estatístico fica registrado: 0 corte em 40 execuções só descarta, com 95% de confiança, uma taxa de corte acima de cerca de 7,5% (regra do três: 3 dividido por 40). Taxas menores passam despercebidas nesta checagem, e quem as vigia em produção é o `finishReason` no `LlmCall`. Aumentar a amostra ocuparia a GPU compartilhada por muito mais tempo para ganhar pouco, já que o limite de 448 tokens torna cada corte barato.
- **Relatos fictícios e fixos no teste de fumaça**, em vez de relatos reais. Não expõe dados pessoais e deixa a comparação repetível entre versões.

### Evidência: amostragem, vLLM e AI SDK

Levantada em 2026-09-17, na conversa de revisão.

- **Card do Qwen3-8B:** modo sem thinking com `Temperature=0.7`, `TopP=0.8`, `TopK=20`, `MinP=0`; modo com thinking com `0.6`, `0.95`, `20`, `0`. Alerta: "DO NOT use greedy decoding, as it can lead to performance degradation and endless repetitions". O `presence_penalty` entre 0 e 2 reduz repetição, mas valores altos podem causar mistura de idiomas e pequena perda de desempenho.
- **`generation_config.json` do Qwen3-8B:** `temperature 0.6`, `top_k 20`, `top_p 0.95` (os valores do modo com thinking).
- **vLLM, `--generation-config`:** o padrão `auto` carrega o `generation_config.json` do modelo como padrão para os campos que o pedido não envia; o valor do pedido sempre vence.
- **Qwen com vLLM:** a documentação recomenda ajustar a amostragem para a aplicação e sempre enviar os parâmetros de amostragem na API.
- **vLLM, reprodutibilidade:** o servidor online não garante reprodução, porque o escalonamento dos pedidos não é determinístico e o agrupamento influencia a geração.
- **vLLM, espaço em branco no JSON:** `StructuredOutputsParams` tem `disable_any_whitespace` e o pedido pode enviá-lo junto com `response_format`, mas o backend xgrammar monta a gramática com `any_whitespace=not self.disable_any_whitespace`, lido de `structured_outputs_config` do motor. A opção do pedido não chega à compilação.
- **AI SDK (`@ai-sdk/openai-compatible` 3.0.51, `ai` 7.0.105):** o corpo do chat leva `max_tokens`, `temperature`, `top_p`, `frequency_penalty`, `presence_penalty` e `seed`; `topK` gera o aviso `unsupported` e não vai; campos de `providerOptions.vllm` fora das opções conhecidas são copiados para o corpo. O `finishReason` normalizado é `stop`, `length`, `content-filter`, `tool-calls`, `error` ou `other`, e o `NoObjectGeneratedError` também o expõe.

## References

Referências da revisão da amostragem padrão (2026-09-17).

**Project sources**:

- `lib/llm/config.ts` (`LLM_SAMPLING_DEFAULTS`), `lib/llm/model-call.ts`, `lib/llm/provider.ts`, `lib/llm/__tests__/llm.smoke.test.ts`
- `node_modules/@ai-sdk/openai-compatible/dist/index.js`, montagem do corpo do chat (versão 3.0.51)
- `node_modules/ai/dist/index.d.ts`, tipos `FinishReason` e `NoObjectGeneratedError` (versão 7.0.105)
- `docs/specs/0001-integracao-ia-local/verify.md`, contexto do build (vLLM 0.25.1, `qwen3-8b`)
- `docs/scope/scope.md`, funcionalidades 11, 12, 14 e 18

**Practices & standards**:

- Seguir os parâmetros de amostragem validados pelo fabricante do modelo antes de ajustar por medida própria
- Não depender de padrões do servidor para comportamento que o cliente precisa garantir
- Reproduzir a falha antes de declarar a correção
- Falhar rápido dentro do prazo, para que um erro de conteúdo não se pareça com indisponibilidade

**Links** (conferidos na web durante a conversa):

- Card do Qwen3-8B: https://huggingface.co/Qwen/Qwen3-8B
- `generation_config.json` do Qwen3-8B: https://huggingface.co/Qwen/Qwen3-8B/raw/main/generation_config.json
- vLLM, argumentos do motor (`--generation-config`): https://docs.vllm.ai/en/stable/configuration/engine_args/
- vLLM, reprodutibilidade: https://docs.vllm.ai/en/latest/usage/reproducibility/
- Qwen, implantação com vLLM: https://qwen.readthedocs.io/en/latest/deployment/vllm.html
- vLLM, backend xgrammar: https://github.com/vllm-project/vllm/blob/main/vllm/v1/structured_output/backend_xgrammar.py
- vLLM, configuração de structured outputs: https://github.com/vllm-project/vllm/blob/main/vllm/config/structured_outputs.py
- AI SDK, provedores compatíveis com a OpenAI: https://ai-sdk.dev/providers/openai-compatible-providers
