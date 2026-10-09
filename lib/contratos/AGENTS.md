# lib/contratos: contratos e relatório mensal por contrato

Cadastro dos contratos de manutenção e o relatório mensal por contrato com dimensão de ativo, com PDF gerado no servidor. Spec: [0016](../../docs/specs/0016-relatorio-mensal-contrato-ativo/index.md).

## Arquivos

| Arquivo                        | O que faz                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `relatorio.ts`                 | `calcularRelatorio` (puro, testável sem banco), `montarRelatorioContrato` (lê e calcula), `situacaoSla`, `listarContratos`, `listarEmissoes` |
| `cadastro.ts`                  | Regras de escrita: `criarContrato`, `editarContrato`, `alterarSituacaoContrato`, `conferirSobreposicao`, `conferirMesesEmitidos`             |
| `usuario.ts`                   | `nomeDoUsuario`, separado do PDF para a página da tela não puxar o `@react-pdf/renderer`                                                     |
| `pdf/RelatorioContratoPdf.tsx` | O documento em JSX do `@react-pdf/renderer` (A4 paisagem)                                                                                    |
| `pdf/gerar.tsx`                | `gerarPdfContrato`: trava, recálculo, render, SHA-256 e gravação da emissão; nunca lança                                                     |
| `pdf/trava.ts`                 | Uma geração de PDF por vez no processo (variável de módulo)                                                                                  |

Fora daqui: `shared/contratos/` (schemas Zod, CNPJ, janela do mês, formatação e tipos serializáveis), `models/Contrato.ts`, `models/RelatorioContratoEmissao.ts`, a tela `app/(dashboard)/relatorios/contrato/`, o cadastro `app/(dashboard)/configuracoes/contratos/` e a rota `app/api/relatorios/contrato/pdf/route.ts`.

## Regras

- **Paridade com o IMR por construção.** O topo sai de `calcularFiltro` e as linhas por ativo de `numerosDoAtivo`, os dois de `lib/ativos/indicadores.ts`. Nunca recalcule MTBF, MTTR ou reincidência com outra fórmula; mudança nessas funções muda os dois relatórios juntos, e o teste de banco (`relatorio.db.test.ts`) compara os seis números com `calcularIndicadoresAtivos`.
- **O chamado não ganha campo.** Pertence ao contrato pelo `tipoServico` e pelo `createdAt` na janela; a categoria entra no escopo pelo catálogo (`serviceSubTypeId` → `ServiceType.name` → `tipoServicoDoNomeDoTipo`).
- **Datas da vigência são strings `YYYY-MM-DD`** e viram `Date` só na janela (`janelaDoMes`, depois `startOfDay`/`endOfDay` de `lib/imr-service.ts`). O "hoje" é sempre `hojeEmBelem(agora)`, e `agora` é um parâmetro único para SLA, selo de mês parcial e "Gerado em".
- **Sobreposição e trava de mês emitido** são conferidas na aplicação, não por índice: dois contratos não cobrem o mesmo tipo em vigências que se cruzam (inativo também conta), e mês com `RelatorioContratoEmissao` não perde tipo nem encolhe a janela.
- **Emissão antes do arquivo.** A rota recalcula tudo, cria o `_id` da emissão, monta o PDF com esse código no rodapé, calcula o hash e grava; só então responde. Falha em qualquer passo devolve 500 sem PDF, e o log leva só `contratoId`, `mes` e a mensagem.
- **Nada de `camposPatrimoniais`.** O relatório lê só código, descrição, categoria e local do ativo (`lerInfoDosAtivos`).
- **Custo (spec 0018)** sai de `lerCustosDosChamados`/`custoPorAtivo` (`lib/ativos/custo.ts`), só dos chamados abertos dentro do mês (a leitura começa antes por causa da reincidência). Sem `catch`: a falha da leitura de custo derruba o relatório, para nunca sair PDF com custo zerado. O PDF traz "Custos lançados até" com a hora de Belém da geração.
- **Server Actions do cadastro** seguem o padrão das telas de configuração (`verifySession` mais `isAdmin`, retorno `{ ok: false, error }`), não `requireAdmin()`, que redireciona por exceção.
- **A trava de PDF é em memória**: vale enquanto o Next roda numa instância só, como os limites de `lib/llm`.

## PDF (`@react-pdf/renderer`)

- Versão exata no `package.json`, sem `^`. Funciona no build e no `standalone` sem `serverExternalPackages`.
- Fonte padrão Helvetica (cobre os acentos), sem arquivo de fonte. A hifenização fica desligada (`Font.registerHyphenationCallback`), senão os títulos das colunas quebram.
- Cada tabela fica numa `<Page>` própria, para o cabeçalho `fixed` repetir só nas páginas dela; o rodapé `fixed` com `render` dá o "Página X de Y".
- O texto do PDF sai comprimido: o teste de unidade confere o tamanho da página e o número de páginas; para ler o conteúdo use `pdftotext` fora da suíte.

## Testes

- `__tests__/relatorio.test.ts` e `pdf/__tests__/`: cálculo puro, trava, mapeamento de erros e o PDF renderizado.
- `__tests__/relatorio.db.test.ts`: banco real (só com `MONGO_TEST_URI`), com paridade com o IMR, janela cortada, sobreposição, número único e PDF com hash.
- E2E: `e2e/relatorio-contrato.spec.ts` cria o contrato `E2E-0016` e apaga no fim; confere a emissão pelo hash, nunca pelo nome do Admin (o seed do CI usa outro nome).

## Agent skills

- [react-pdf](../../.agents/skills/react-pdf/): `molefrog/skills`, componentes, estilos e paginação do `@react-pdf/renderer`

_Drafted by /sync from the introducing change, worth a quick human pass._
