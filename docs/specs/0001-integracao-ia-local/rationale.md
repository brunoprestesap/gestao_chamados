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
