# Review, main (relatório por contrato, spec 0016), 2026-10-07

**Reviewed by**: Sonnet 5.5 (autor no mesmo modelo, sessão separada)
**Scope**: 38 arquivos, uncommitted (alterados e novos, sem contar a skill vendorizada, o lock e os docs)
**Verdict**: Approve with nits

## Summary

A mudança cria o cadastro de contratos (Admin), o relatório mensal por contrato na tela e o PDF gerado no servidor com registro de emissão e hash. O cálculo reaproveita `calcularFiltro` e `numerosDoAtivo` da spec 0014, então a paridade com o IMR vale por construção. Não achei blocker nem major: a autorização da rota vem antes de qualquer leitura, o PDF só é entregue depois de gravar a emissão, a trava solta no `finally` e o dado patrimonial não é lido. Os pontos abaixo são menores.

Os quatro itens que o autor sinalizou: (a) `verifySession` com `isAdmin` e `{ ok: false }` em vez de `requireAdmin()` é coerente com o padrão de Server Action do AGENTS.md (nunca throw, nunca redirect), então só o texto da spec precisa ser ajustado; (b) a mensagem em inglês do Zod para corpo que não é JSON é cosmética; (c) o log do React com a pilha de componentes não leva dado de negócio; (d) emissão sem PDF recebido está aceita pelo AC-18.

Não rodei `next build` nem o `npm ci` em Alpine com musl. Como entrou uma dependência nova (`@react-pdf/renderer` 4.9.0, fixada sem `^`, confirmada no lock), vale rodar os dois antes do PR, como o AGENTS.md pede.

## Minor

### 🟡 `dataValida` lança exceção com mês 00 ou 13, `shared/contratos/contrato.schemas.ts:27`

**Problem**: o `refine` faz `new Date('2025-13-01T00:00:00.000Z').toISOString()`, que lança `RangeError: Invalid time value` quando o mês ou o dia é impossível por completo (mês 00 ou 13, dia 00). O Zod não captura exceção dentro de `refine`. Dia 30 de fevereiro funciona (vira 2 de março e é recusado), e é o único caso testado.
**Why it matters**: o AC-2 e o AGENTS.md exigem que a validação nunca lance. As três actions chamam `safeParse` fora do `try` de `executar`, então um valor assim, enviado direto à Server Action, vira erro 500 em vez de `{ ok: false }`. O campo `type="date"` do navegador impede o caso na tela, e só Admin chega lá, por isso é menor.
**Suggested fix**: checar `Number.isNaN(data.getTime())` antes do `toISOString`, ou validar mês entre 1 e 12 e dia entre 1 e 31 pela regex. Acrescentar um teste com `2026-13-01` e `2026-00-10`.

### 🟡 A página importa `nomeDoUsuario` de um módulo que carrega o react-pdf, `app/(dashboard)/relatorios/contrato/page.tsx:6`

**Problem**: `nomeDoUsuario` mora em `lib/contratos/pdf/gerar.tsx`, que importa `@react-pdf/renderer` e o componente do PDF. A página da tela passa a puxar todo esse código só para ler um nome.
**Why it matters**: aumenta o bundle e o tempo de carga a frio do servidor da página sem necessidade, e mistura a leitura de usuário com a geração do arquivo.
**Suggested fix**: mover `nomeDoUsuario` para um módulo pequeno (por exemplo `lib/contratos/usuario.ts`) e importar de lá na página e no `gerar.tsx`.

### 🟡 Corretivos só sem ativo mostram tabelas vazias sem aviso, `app/(dashboard)/relatorios/contrato/_components/RelatorioContratoTela.tsx:12` e `lib/contratos/pdf/RelatorioContratoPdf.tsx:223`

**Problem**: o estado vazio só aparece com `corretivosTotal === 0 && preventivasGeradas === 0`. Se houver, por exemplo, 3 corretivos e nenhum com ativo, `ativos` fica vazio e as duas tabelas aparecem só com o cabeçalho (a de categoria pode listar categorias do escopo zeradas), sem nenhuma frase explicando.
**Why it matters**: no PDF que vai para o processo, uma tabela "Por ativo" vazia sem explicação parece erro. O AC-14 trata só o caso sem nenhum chamado, então não é violação, mas é o caso mais provável em contrato novo, antes de o cadastro de ativos cobrir o parque.
**Suggested fix**: quando `ativos.length === 0`, mostrar uma linha curta ("Nenhum corretivo ou preventiva com ativo no período") no lugar da tabela por ativo, na tela e no PDF.

### 🟡 Lógica de decisão da página do relatório sem teste de unidade, `app/(dashboard)/relatorios/contrato/page.tsx:25`

**Problem**: a página decide entre vazio de contratos, só seletores, texto "Escolha um contrato e um mês" e relatório. Os componentes têm teste, mas a página (Server Component) só é coberta pelo E2E.
**Why it matters**: o AC-5 tem vários ramos (contrato inexistente, mês fora da lista, sem parâmetros). O E2E cobre o caminho feliz melhor do que os de erro.
**Suggested fix**: um teste da página com os módulos mockados, chamando a função async e inspecionando o elemento devolvido, nos três ramos de parâmetro inválido.

## Nits

- ⚪ `lib/contratos/relatorio.ts:252`, o `void somaMttrMs; void reparos;` para descartar campos é um truque; montar a linha sem esses campos (ou guardá-los num mapa à parte) deixa mais claro.
- ⚪ `lib/contratos/relatorio.ts:73`, `media` repete a de `lib/ativos/indicadores.ts:81` (que não é exportada); exportar a original evita duas versões.
- ⚪ `lib/contratos/cadastro.ts:116`, `updateOne` não roda validadores do Mongoose; o Zod cobre, mas é bom saber que o `match` e o `maxlength` do model não valem aqui.
- ⚪ `app/(dashboard)/configuracoes/contratos/actions.ts:38`, o `console.error` recebe o objeto de erro inteiro; o padrão do AC-18 (só mensagem) é mais seguro de seguir também aqui.
- ⚪ `app/api/relatorios/contrato/pdf/route.ts:29`, corpo que não é JSON devolve a mensagem em inglês do Zod; trocar por "Pedido inválido." quando `corpo` for `null` (item b do autor).
- ⚪ `docs/specs/0016-relatorio-mensal-contrato-ativo/index.md`, o AC-20 diz que as actions chamam `requireAdmin()`, mas o código usa `verifySession` com `isAdmin`; ajustar o texto da spec (item a do autor).

## Strengths

- A autorização da rota do PDF vem antes de qualquer leitura (401 e 403), o corpo passa por Zod e a ordem calcular, montar, hash, gravar emissão e só então responder garante que nunca existe PDF entregue sem registro (AC-18).
- A trava em memória solta no `finally`, inclusive nos retornos antecipados de 404 e 422, e o nome do arquivo do `Content-Disposition` é saneado.
- Paridade com o IMR por construção: topo por `calcularFiltro`, linhas por `numerosDoAtivo`, janela de reincidência igual à da 0014, e a regra de SLA (pausado nunca conta como fora) bem isolada em `situacaoSla`.
- Funções puras separadas da leitura (`calcularRelatorio`, `janelaDoMes`, `mesesPermitidos`, `cnpjValido`, `conferirMesesEmitidos`), o que deixa o cálculo testável sem banco.
- Nenhum `camposPatrimoniais` é lido; o único nome de pessoa é o fiscal do contrato e quem gerou, como pede o AC-15.
- Lock com `@react-pdf/renderer` 4.9.0 fixado exatamente, sem `^`.

## Test coverage

Boa para a mudança. Há testes de unidade para janela, CNPJ e schemas, para o cálculo puro e as regras de cadastro (`relatorio.test.ts`), para a geração e a trava do PDF, para o componente do PDF, para a rota (acesso, 400, 404, 422, 429, 500), para as actions, para os quatro componentes de tela, um teste de banco (`relatorio.db.test.ts`, só roda com `MONGO_TEST_URI`) e um E2E. Lacunas: o mês e o dia impossíveis no `dataValida` (menor 1) e os ramos de parâmetro inválido da página do relatório (menor 4). A mudança em `lib/ativos/indicadores.ts` (campo `categoriaId` e export de `lerInfoDosAtivos`) foi acompanhada do ajuste no teste existente e não altera o ranking da 0014.
