# 0016. Relatório mensal por contrato com dimensão de ativo

**Date**: 2026-10-07
**Status**: Accepted

## Summary

O Admin passa a cadastrar os contratos de manutenção (número, empresa, processo SEI, vigência e tipos de serviço cobertos) e a gerar, para um contrato e um mês, um relatório com os chamados por equipamento e por categoria: corretivos, preventivas, tempo de reparo (MTTR), tempo entre falhas (MTBF), reincidência e cumprimento de SLA. Os números saem das mesmas funções da aba Ativos do IMR (spec 0014), então batem com ela. O relatório aparece numa tela e vira um PDF gerado no servidor com `@react-pdf/renderer`, pronto para anexar ao processo; cada PDF gerado deixa um registro com quem gerou, quando e o hash do arquivo. Nada muda no `Chamado`: o chamado pertence ao contrato pelo tipo de serviço e pela data de abertura.

## Requirements

**User stories**:

- Como Admin, quero cadastrar os contratos de manutenção com a vigência e os tipos de serviço que cada um cobre, para o Sigma saber a que contrato cada chamado pertence.
- Como Admin, quero ver, para um contrato e um mês, os chamados, o tempo de reparo, a reincidência e o SLA de cada equipamento, para acompanhar a empresa contratada.
- Como Admin, quero baixar esse relatório em PDF com um código de emissão, para anexar ao processo e provar depois qual versão foi anexada.

**Acceptance criteria**:

_Cadastro de contratos_

- **AC-1**: Tela `/configuracoes/contratos`, só Admin (o `proxy.ts` já barra `/configuracoes` para quem não é Admin, e a página chama `requireAdmin()`). Lista todos os contratos (número, empresa, tipos de serviço, vigência e situação ativo ou inativo), do mais recente pela `vigenciaInicio` para o mais antigo, com criar, editar, inativar e reativar. Não existe apagar.
- **AC-2**: Validação no servidor (Zod, `safeParse`, retorno `{ ok: false, error }`, nunca throw): `numero`, `empresa`, `cnpj`, `processoSei`, `vigenciaInicio`, `vigenciaFim` e `tiposServico` obrigatórios. `numero` sem espaços nas pontas, até 40 caracteres, único sem diferença de maiúscula (índice único em `numeroNormalizado`). `cnpj` aceito com ou sem máscara, gravado só com os 14 dígitos, recusado se não tiver 14 dígitos ou se os dígitos verificadores não baterem. `empresa` até 160, `processoSei` até 40, `objeto` até 300, `fiscal` até 120 caracteres. `vigenciaInicio` e `vigenciaFim` no formato `YYYY-MM-DD`, com início menor ou igual ao fim. `tiposServico` com 1 a 3 valores distintos de `TIPO_SERVICO_OPTIONS`.
- **AC-3**: Sem sobreposição. Ao criar, editar ou reativar, o servidor recusa se outro contrato (ativo ou inativo) tem algum tipo de serviço em comum e vigência que se cruza (`inicioA <= fimB` e `inicioB <= fimA`), com a mensagem "O contrato <numero> já cobre <tipo> de <dd/mm/aaaa> a <dd/mm/aaaa>." Inativar nunca é barrado. Na edição, o servidor também recusa tirar um tipo de serviço ou encurtar a vigência quando já existe `RelatorioContratoEmissao` deste contrato num mês que deixaria de estar coberto (ou que perderia o tipo), com a mensagem "Já há relatório emitido para <mm/aaaa>; a vigência e os tipos desse período não podem mudar." Estender a vigência e acrescentar tipo continuam livres (sujeitos à sobreposição).
- **AC-4**: Inativo continua valendo para o passado. Inativar não muda nenhum chamado nem o pertencimento do AC-7: o contrato continua no seletor do relatório, marcado "(inativo)", e continua gerando relatório e PDF dos meses da vigência. A situação só serve para separar, na lista do cadastro, os contratos encerrados dos vigentes.

_Janela e pertencimento_

- **AC-5**: Tela `/relatorios/contrato`, com `requireAdmin()`, com o contrato e o mês na URL (`?contratoId=<id>&mes=YYYY-MM`), formulário GET como o do IMR. O seletor de mês só oferece os meses que cruzam a vigência e não estão depois do mês atual em Belém (`hojeEmBelem()`), do mais recente para o mais antigo, calculados pela função pura `mesesPermitidos({ vigenciaInicio, vigenciaFim }, hoje)` em `shared/contratos/janela.ts`. Contrato cuja vigência ainda não começou mostra "Este contrato ainda não tem meses para relatar." Sem contratos cadastrados, a tela mostra um texto de vazio com link para `/configuracoes/contratos`. Sem `contratoId` ou `mes`, mostra só os seletores. `contratoId` inexistente, ou `mes` fora da lista permitida, mostra "Escolha um contrato e um mês da vigência." sem números.
- **AC-6**: Janela do relatório, calculada pela função pura `janelaDoMes(mes, vigenciaInicio, vigenciaFim)` em `shared/contratos/janela.ts`, que devolve as datas e as strings `YYYY-MM-DD` (último dia do mês por `new Date(Date.UTC(ano, mes, 0))`, certo em ano bissexto; cada string vira data por `new Date('YYYY-MM-DDT00:00:00.000Z')`). `inicio = startOfDay(max(primeiro dia do mês, vigenciaInicio))` e `fim = endOfDay(min(último dia do mês, vigenciaFim))`, com `startOfDay` e `endOfDay` de `lib/imr-service.ts` (limites de dia em UTC, os mesmos do IMR, e com a mesma diferença aceita na 0014 para chamado aberto depois das 21h de Belém no último dia). O cabeçalho mostra o intervalo real (`dd/mm/aaaa a dd/mm/aaaa`). Quando o mês escolhido é o mês atual em Belém, a tela e o PDF mostram o selo "Mês em andamento, números parciais".
- **AC-7**: Pertencimento. Um chamado é do contrato quando o `tipoServico` dele está em `tiposServico` e o `createdAt` está na janela do AC-6. Corretivo segue `filtroCorretivo` da 0014 (sem `originTemplateId`, status fora de `cancelado` e `recusado`). Preventiva é o chamado com `originTemplateId`, `ativoId` e status fora de `cancelado` e `recusado`. Chamado não ganha campo novo.

_Conteúdo_

- **AC-8**: Cabeçalho (tela e PDF): número, empresa, CNPJ formatado (`00.000.000/0000-00`), processo SEI, objeto e fiscal quando preenchidos, tipos de serviço cobertos, vigência, intervalo do relatório, "Gerado em <dd/mm/aaaa hh:mm>" no fuso de Belém e o nome de quem gerou.
- **AC-9**: Topo. Para o contrato e a janela: corretivos do contrato, mostrados como total, com ativo e sem ativo (sem ativo = total menos com ativo); percentual de cobertura (com ativo sobre o total, "—" com total zero); ativos afetados; MTBF médio (média dos MTBF dos ativos que têm um, como na 0014, não média de todos os intervalos); MTTR médio (média de todos os tempos de reparo dos corretivos com ativo resolvidos); ativos reincidentes; preventivas com ativo geradas e concluídas; SLA dos corretivos com ativo (dentro, fora, em andamento, sem SLA e percentual dentro sobre dentro mais fora, "—" com zero).
- **AC-10**: Paridade com o IMR. Os seis números da 0014 no topo (corretivos com ativo, percentual com ativo, ativos afetados, MTBF médio, MTTR médio, ativos reincidentes) saem de `calcularFiltro` de `lib/ativos/indicadores.ts`, com `janelaDoPeriodo(inicio, fim, fim)` e os corretivos filtrados pelos `tiposServico` do contrato. Para um contrato de um só tipo cuja vigência cobre o mês inteiro, esses seis números são iguais aos de `calcularIndicadoresAtivos({ inicio, fim, fimReincidencia: fim }).porTipo[tipo].topo` para o mesmo mês. A reincidência olha 90 dias para trás a partir do fim da janela, mesmo antes da `vigenciaInicio`, como no IMR.
- **AC-11**: Tabela por categoria. Uma linha por categoria que está no escopo do contrato (categoria ativa cujo `serviceSubTypeId` leva a um `ServiceType` para o qual `tipoServicoDoNomeDoTipo(name)` devolve um dos `tiposServico`; mais de um `ServiceType` pode levar ao mesmo tipo) ou que aparece em algum ativo da tabela por ativo. Colunas: categoria, ativos no escopo (contagem de `Ativo` com `FILTRO_VINCULAVEL` agrupada por `categoriaId`, numa aggregation), ativos com chamado na janela (linhas da tabela por ativo da categoria), corretivos (soma das linhas), MTTR médio (média de todos os tempos de reparo dos corretivos da categoria, não média das médias), reincidentes (linhas da categoria com `corretivos90d >= 2`), SLA dentro e fora (soma das linhas, só corretivos com ativo), preventivas geradas e concluídas. A soma dos reincidentes por categoria pode ser menor que o reincidentes do topo, porque o topo (pela 0014) conta também ativo reincidente sem chamado na janela; a diferença é aceita e o topo é o que bate com o IMR. Ordem alfabética do nome da categoria; ativo sem categoria entra numa linha "Sem categoria" no fim. "Ativos no escopo" é o retrato do momento da geração, não do mês.
- **AC-12**: Tabela por ativo. Uma linha por ativo com pelo menos um corretivo ou uma preventiva do contrato na janela, sem o limite de 10 do ranking da 0014 (as linhas saem de `numerosDoAtivo` com os corretivos da janela e os dos 90 dias, nunca de `ranking`; um ativo só com preventiva recebe `numerosDoAtivo([], seus corretivos dos 90 dias)`). Colunas: código, descrição, categoria, local (`caminho`, ou "—"), corretivos, MTBF, MTTR médio, corretivos em 90 dias (com a marca "reincidente" quando 2 ou mais), SLA dentro, fora e em andamento, preventivas geradas e concluídas. Ordem: nome da categoria, depois corretivos (maior primeiro), soma dos tempos de reparo (maior primeiro) e código. Ativo `baixado` aparece. Na tela o código é link para a ficha.
- **AC-13**: Regra do SLA, só para corretivo com ativo e com `sla.resolutionDueAt`: dentro quando `sla.resolvedAt <= sla.resolutionDueAt`; fora quando `sla.resolvedAt > sla.resolutionDueAt`, ou quando `sla.resolvedAt` é nulo, o status não é `aguardando_solicitante` nem `aguardando_terceiros`, e `sla.resolutionDueAt` já passou do instante da geração; em andamento quando `sla.resolvedAt` é nulo e o prazo ainda não passou, ou quando o chamado está pausado num dos dois status de espera (o `resolutionDueAt` só é estendido na retomada, então um pausado nunca conta como fora). Corretivo sem `sla.resolutionDueAt` conta só em "sem SLA". Preventiva concluída é a que tem `sla.resolvedAt`.
- **AC-14**: Vazios. Sem nenhum chamado do contrato na janela, a tela e o PDF mostram o cabeçalho, o topo zerado com "—" onde não há denominador, e o texto "Nenhum chamado deste contrato no período." no lugar das tabelas. MTBF, MTTR, percentuais com denominador zero e local ausente aparecem como "—", nunca como zero.
- **AC-15**: Nenhum dado patrimonial. Nem a tela nem o PDF leem ou mostram `camposPatrimoniais`. O único nome de pessoa no relatório é o `fiscal` do contrato e o nome de quem gerou.

_PDF e emissão_

- **AC-16**: A tela tem o botão "Gerar PDF" (só com contrato e mês válidos). Ele chama `POST /api/relatorios/contrato/pdf` com `{ contratoId, mes }`; o servidor recalcula tudo (nunca usa números vindos da tela), cria o `_id` da emissão, monta o PDF com esse código, calcula o SHA-256 dos bytes, grava o `RelatorioContratoEmissao` e só então responde `application/pdf` com `Content-Disposition: attachment; filename="relatorio-contrato-<numero>-<YYYY-MM>.pdf"` (o número com tudo que não for letra, dígito ou hífen trocado por `-`). O navegador baixa o arquivo; durante a geração o botão fica desabilitado com "Gerando…". O PDF traz data de criação embutida, então dois PDFs do mesmo contrato e mês nunca têm o mesmo hash: o hash prova qual arquivo foi anexado, não que os números são iguais. Só um PDF é montado por vez no processo: uma trava em memória faz a rota responder 429 com "Outro relatório está sendo gerado. Tente em alguns segundos." enquanto outro roda (o render ocupa a CPU do único processo do Next), e a tela mostra essa mensagem num toast.
- **AC-17**: O PDF é A4 paisagem, com cabeçalho, topo, tabela por categoria e tabela por ativo (AC-8 a AC-14), com o cabeçalho das tabelas repetido em cada página e, no rodapé de toda página, "Sigma · Emissão <id> · Gerado em <dd/mm/aaaa hh:mm> · Página X de Y". Leva o selo "Indicadores informativos, sem efeito contratual" e, no mês atual, o selo do AC-6.
- **AC-18**: Falhas. Se a montagem do PDF falha, a rota responde 500 e nada é gravado. Se a gravação da emissão falha, a rota responde 500 e o PDF não é entregue (nunca existe PDF entregue sem registro; o contrário, um registro cujo PDF não chegou por queda entre a gravação e a resposta, é aceito e fica visível na lista do AC-19). A tela mostra um toast "Não foi possível gerar o PDF. Tente de novo." nos dois casos, e o log (`console.error`) leva só `contratoId`, `mes` e a mensagem do erro.
- **AC-19**: Lista de emissões. Abaixo do relatório, a tela lista as emissões daquele contrato e mês (mais recente primeiro, até 20): data e hora em Belém, nome de quem gerou (`geradoPorNome`, gravado na emissão), código da emissão e os 12 primeiros caracteres do hash, com o hash inteiro num `title`. A lista atualiza depois de gerar um PDF (`router.refresh()`).

_Acesso_

- **AC-20**: Acesso. A rota `POST /api/relatorios/contrato/pdf` responde 401 sem sessão e 403 para quem não é Admin, antes de qualquer leitura; corpo inválido (Zod: `contratoId` ObjectId, `mes` `YYYY-MM`) responde 400; contrato inexistente responde 404; mês fora da lista do AC-5 responde 422 com "Mês fora da vigência do contrato."; outra geração em curso responde 429 (AC-16). As Server Actions do cadastro conferem a sessão com `verifySession()` mais `isAdmin()` e, sem sessão ou sem perfil Admin, devolvem `{ ok: false, error: ERRO_SEM_PERMISSAO }` sem tocar o banco (nunca redirecionam nem lançam, no padrão das telas de configuração). `/relatorios/contrato` usa `requireAdmin()`.

## Decision

**Chosen option**: Option 1: Cadastro de contrato derivado por tipo e data, relatório calculado na leitura com as funções da 0014, PDF no servidor com registro de emissão.

O contrato é uma coleção nova que não toca no `Chamado`; o relatório é recalculado a cada leitura a partir de `calcularFiltro` e das janelas da 0014, e o PDF é montado em JSX com `@react-pdf/renderer` dentro de uma rota de API que grava a emissão antes de entregar o arquivo.

**Implementation skills**: `react-pdf` (`molefrog/skills`, `.agents/skills/react-pdf/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

Calls made with full design context (pick, why, runner up):

- **Onde o cálculo mora**: `lib/contratos/relatorio.ts`, com `montarRelatorioContrato({ contratoId, mes, agora })` que lê e devolve um `RelatorioContrato` serializável, usado pela tela e pela rota do PDF. A parte pura (`calcularRelatorio`, recebendo chamados, info dos ativos, categorias e `agora`) fica separada da leitura, testável sem banco. Runner up: dentro de `lib/ativos/indicadores.ts`, que já está grande e não deveria conhecer contrato.
- **Reaproveitar `calcularFiltro` em vez de reescrever**: é a única forma de o AC-10 valer por construção. O relatório chama `calcularFiltro` para o topo e `numerosDoAtivo` por ativo; MTBF e reincidência nunca são recalculados por outra fórmula. Runner up: um pipeline novo no Mongo, que daria números parecidos e um dia diferentes.
- **Leitura**: duas consultas em paralelo, ambas com `tipoServico: { $in: tiposServico }`: (1) corretivos e preventivas com `ativoId` de `leituraDesde` (o menor entre o início da janela e o início da reincidência) até `fim`, com a `PROJECAO_CORRETIVO` mais `originTemplateId`, `status` e `sla.resolutionDueAt`, lidos num tipo local `ChamadoDoContrato` (todos os campos de `CorretivoLido` mais `originTemplateId`, `status` e `resolutionDueAt`); esse resultado é separado em corretivos (sem `originTemplateId`, a lista inteira para a reincidência, recortada por `dentro()` para a janela) e preventivas (com `originTemplateId`, só as de `createdAt` na janela), e os corretivos viram `CorretivoLido` só na chamada de `calcularFiltro` e `numerosDoAtivo`; (2) a contagem de corretivos do contrato na janela, com e sem ativo (`filtroCorretivo` sem restrição de `ativoId`). Depois `lerInfoDosAtivos` (passa a ser exportada, e `InfoDoAtivo` ganha `categoriaId: string | null`, que a 0014 ignora) e uma aggregation de `Ativo` com `FILTRO_VINCULAVEL` agrupada por `categoriaId` para os ativos no escopo. Os índices existentes (`{ ativoId: 1, createdAt: -1 }` parcial e `{ tipoServico: 1, status: 1 }`) atendem o volume de dezenas a centenas de chamados por mês.
- **Mapeamento categoria para tipo de serviço**: `CategoriaAtivo.serviceSubTypeId` → `ServiceSubType.typeId` → `ServiceType.name`, convertido por `tipoServicoDoNomeDoTipo` de `shared/chamados/tipo-servico.ts` (o mesmo usado por `buildTypeIdByTipo`; `normalizeTypeName` sozinho não chega ao valor de `TIPO_SERVICO_OPTIONS`). Runner up: um campo `tipoServico` novo na categoria, que duplicaria o catálogo.
- **Hora da geração**: `agora` é um parâmetro (padrão `new Date()`) usado no SLA "em andamento" (AC-13), no selo de mês atual e no "Gerado em"; a rota do PDF passa o mesmo `agora` que grava em `geradoEm`. Runner up: ler `Date.now()` em cada ponto, que deixa o teste frágil e a tela incoerente com o rodapé.
- **Código no rodapé e hash fora do PDF**: o PDF não consegue conter o próprio hash, então o rodapé leva o `_id` da emissão, criado antes da montagem com `new Types.ObjectId()`, e o hash fica no registro ligado a esse código. Runner up: hash de um JSON dos números, que não prova qual arquivo foi anexado.
- **Rota de API e não Server Action para o PDF**: Server Action não devolve arquivo binário de forma natural. A rota fica em `app/api/relatorios/contrato/pdf/route.ts` com `export const runtime = 'nodejs'`, checa sessão e perfil por `verifySession()` como as outras rotas (o `proxy.ts` ignora `/api`) e responde com `new Response(buffer)`. Runner up: `GET` com query, que permitiria gerar emissões só abrindo um link (efeito colateral num GET).
- **PDF com `@react-pdf/renderer`**: `renderToBuffer(<RelatorioContratoPdf dados={...} emissaoId={...} />)` (API de Node, compatível com React 19 desde a v4.1), `<Page size="A4" orientation="landscape" wrap>`, cabeçalho da tabela com `fixed` e rodapé com `<Text fixed render={({ pageNumber, totalPages }) => ...} />`. Fontes padrão do PDF (Helvetica), que cobrem os acentos do português, sem arquivo de fonte. O componente fica em `lib/contratos/pdf/RelatorioContratoPdf.tsx`, com `server-only`. Não entra em `serverExternalPackages` a não ser que o build falhe (a documentação só pede isso para Next anterior a 14.1.1).
- **Sobreposição conferida na aplicação**: uma consulta `ContratoModel.findOne({ _id: { $ne: id }, tiposServico: { $in: tipos }, vigenciaInicio: { $lte: fim }, vigenciaFim: { $gte: inicio } })` antes de gravar. A corrida entre dois Admins salvando ao mesmo tempo é aceita: o cadastro tem um ou dois usuários e poucos contratos por ano. Runner up: uma transação com lock, desproporcional ao uso.
- **Datas da vigência como string `YYYY-MM-DD`**: é como o contrato fala ("de 01/03/2025 a 28/02/2026"), sem fuso, e vira `Date` só na janela do AC-6. Runner up: `Date`, que traz o problema do fuso para um dado que não tem hora.
- **Validação do CNPJ com dígito verificador**: função pura `cnpjValido` em `shared/contratos/cnpj.ts`, sem consulta externa. Pega erro de digitação num documento que vai para o processo. Runner up: só contar 14 dígitos.
- **Cadastro por Server Actions**: `app/(dashboard)/configuracoes/contratos/actions.ts` (`criarContratoAction`, `editarContratoAction`, `alterarSituacaoContratoAction`), no padrão das telas de configuração (`verifySession` mais `isAdmin` com `{ ok: false }`, nunca o `requireAdmin()`, que redireciona por exceção; `dbConnect`, `safeParse`, `revalidatePath`, retorno `{ ok }`). Runner up: rotas REST como `/api/catalog`, mais código para uma tela só de Admin.
- **Navegação**: um item "Relatório por contrato" no grupo Admin de `components/dashboard/nav.ts`, ao lado do IMR, e "Contratos" junto das outras configurações. Runner up: um link dentro do IMR, menos visível.

## Feature design

**Data model sketch**:

`Contrato` (coleção nova, `models/Contrato.ts`, padrão de `models/AGENTS.md`, `timestamps: true`)

| Campo               | Tipo                | Regra                                                       |
| ------------------- | ------------------- | ----------------------------------------------------------- |
| `_id`               | ObjectId            | PK                                                          |
| `numero`            | String              | obrigatório, trim, até 40                                   |
| `numeroNormalizado` | String              | obrigatório, `numero` em minúsculas, índice único           |
| `empresa`           | String              | obrigatório, trim, até 160                                  |
| `cnpj`              | String              | obrigatório, 14 dígitos, sem máscara                        |
| `processoSei`       | String              | obrigatório, trim, até 40                                   |
| `objeto`            | String              | opcional, padrão `null`, até 300                            |
| `fiscal`            | String              | opcional, padrão `null`, até 120 (dado pessoal, sai no PDF) |
| `tiposServico`      | [String]            | 1 a 3 valores distintos de `TIPO_SERVICO_OPTIONS`           |
| `vigenciaInicio`    | String `YYYY-MM-DD` | obrigatório                                                 |
| `vigenciaFim`       | String `YYYY-MM-DD` | obrigatório, maior ou igual a `vigenciaInicio`              |
| `isActive`          | Boolean             | padrão `true`                                               |

Índices: `{ numeroNormalizado: 1 }` único; `{ tiposServico: 1, vigenciaInicio: 1 }` para a checagem de sobreposição.

`RelatorioContratoEmissao` (coleção nova, `models/RelatorioContratoEmissao.ts`, sem `timestamps`, nunca alterada nem apagada)

| Campo           | Tipo                  | Regra                                                                                |
| --------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `_id`           | ObjectId              | PK, criado antes do PDF, impresso no rodapé                                          |
| `contratoId`    | ObjectId → `Contrato` | obrigatório, N:1                                                                     |
| `mes`           | String `YYYY-MM`      | obrigatório                                                                          |
| `geradoPor`     | ObjectId → `User`     | obrigatório, N:1                                                                     |
| `geradoPorNome` | String                | obrigatório, nome de quem gerou no momento (o histórico não muda se o usuário mudar) |
| `geradoEm`      | Date                  | obrigatório, o mesmo `agora` do cálculo                                              |
| `hashSha256`    | String                | obrigatório, 64 caracteres hexadecimais                                              |

Índice: `{ contratoId: 1, mes: 1, geradoEm: -1 }` (lista do AC-19).

Relações derivadas, sem campo novo: `Chamado` pertence a `Contrato` por `tipoServico ∈ tiposServico` e `createdAt` na vigência (no máximo um, pelo AC-3). `CategoriaAtivo` está no escopo de `Contrato` por `serviceSubTypeId → ServiceSubType.typeId → ServiceType.name`.

Tipo de saída (`shared/contratos/relatorio.types.ts`, serializável, sem `Date`): `RelatorioContrato = { contrato: { id, numero, empresa, cnpjFormatado, processoSei, objeto, fiscal, tiposServico, vigenciaInicio, vigenciaFim, isActive }, janela: { inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD', mes, parcial }, geradoEm: ISO, topo: {...}, categorias: LinhaCategoria[], ativos: LinhaAtivo[] }`, com tempos em milissegundos ou `null`.

**State transitions**:

`Contrato`: `ativo` ⇄ `inativo` (`alterarSituacaoContratoAction`; reativar passa pela checagem do AC-3). `RelatorioContratoEmissao` só é criado.

**API surface**:

| Endpoint / ação                 | Método        | Key inputs                                         | Key outputs                            | Auth  | Key errors                                                  |
| ------------------------------- | ------------- | -------------------------------------------------- | -------------------------------------- | ----- | ----------------------------------------------------------- |
| `/configuracoes/contratos`      | página        | nenhum                                             | lista de contratos                     | Admin | redireciona quem não é Admin                                |
| `criarContratoAction`           | Server Action | campos do AC-2                                     | `{ ok: true, id }`                     | Admin | `{ ok: false, error }` por validação, número repetido, AC-3 |
| `editarContratoAction`          | Server Action | `id`, campos do AC-2                               | `{ ok: true }`                         | Admin | idem, mais "Contrato não encontrado."                       |
| `alterarSituacaoContratoAction` | Server Action | `id`, `isActive: boolean`                          | `{ ok: true }`                         | Admin | AC-3 ao reativar                                            |
| `/relatorios/contrato`          | página        | `contratoId?`, `mes?` (query)                      | `RelatorioContrato`, lista de emissões | Admin | texto do AC-5 para parâmetro inválido                       |
| `/api/relatorios/contrato/pdf`  | POST          | `contratoId: ObjectId` (req), `mes: YYYY-MM` (req) | `application/pdf` (anexo)              | Admin | 401, 403, 400, 404, 422, 429, 500                           |

**Value sourcing**:

| Action            | Value produced / displayed                     | Source                                                                                                                        |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| tela e PDF        | meses permitidos                               | `mesesPermitidos(vigência, hojeEmBelem(agora))` (`shared/contratos/janela.ts`)                                                |
| tela e PDF        | `inicio`, `fim` da janela                      | `janelaDoMes(mes, vigenciaInicio, vigenciaFim)` com `startOfDay`/`endOfDay` de `lib/imr-service.ts` (AC-6)                    |
| tela e PDF        | selo de mês parcial                            | `mes` igual ao mês de `hojeEmBelem(agora)`                                                                                    |
| tela e PDF        | chamados do contrato                           | `Chamado.tipoServico`, `createdAt`, `originTemplateId`, `status`, `ativoId`                                                   |
| tela e PDF        | corretivos com ativo, MTBF, MTTR, reincidência | `calcularFiltro` e `numerosDoAtivo` da 0014 sobre `createdAt`, `sla.resolvedAt`, `totalPausedMinutes`                         |
| tela e PDF        | dentro, fora, em andamento, sem SLA            | `Chamado.sla.resolutionDueAt`, `sla.resolvedAt`, `status` e `agora` (AC-13)                                                   |
| tela e PDF        | categoria de cada ativo                        | `InfoDoAtivo.categoriaId` e `categoria` (de `lerInfoDosAtivos`)                                                               |
| tela e PDF        | preventivas concluídas                         | `Chamado.sla.resolvedAt` não nulo                                                                                             |
| tela e PDF        | código, descrição, local, categoria do ativo   | `lerInfoDosAtivos` (`Ativo.codigo`, `descricao`, `Localizacao.caminho`, `CategoriaAtivo.nome`)                                |
| tela e PDF        | ativos no escopo por categoria                 | contagem de `Ativo` com `FILTRO_VINCULAVEL` por `categoriaId`, categorias mapeadas como na Decision                           |
| tela e PDF        | cabeçalho do contrato                          | campos do `Contrato`; CNPJ formatado por `formatarCnpj` (`shared/contratos/cnpj.ts`)                                          |
| tela e PDF        | "Gerado em" e quem gerou                       | `agora` em Belém; `User.name` lido pelo `userId` da sessão (`verifySession()`), gravado em `geradoPorNome`                    |
| cadastro          | meses com emissão (trava da edição, AC-3)      | `RelatorioContratoEmissao.mes` do contrato                                                                                    |
| rota do PDF       | trava de uma geração por vez                   | variável de módulo em `lib/contratos/pdf/trava.ts` (vale enquanto o Next roda em uma instância, como os limites de `lib/llm`) |
| PDF               | código da emissão                              | `new Types.ObjectId()` criado na rota antes do `renderToBuffer`                                                               |
| PDF               | página X de Y                                  | `render` de `@react-pdf/renderer` (`pageNumber`, `totalPages`)                                                                |
| emissão           | `hashSha256`                                   | `crypto.createHash('sha256')` dos bytes devolvidos por `renderToBuffer`                                                       |
| lista de emissões | nome de quem gerou                             | `RelatorioContratoEmissao.geradoPor` → `User.name`                                                                            |
| nome do arquivo   | `relatorio-contrato-<numero>-<mes>.pdf`        | `Contrato.numero` saneado e `mes`                                                                                             |

**Key invariants**:

- Dois contratos nunca compartilham um tipo de serviço em vigências que se cruzam (AC-3), então um chamado pertence a no máximo um contrato.
- `Chamado` não é alterado por esta funcionalidade.
- Os seis números da 0014 no topo saem sempre de `calcularFiltro` (AC-10).
- Todo PDF entregue tem um `RelatorioContratoEmissao` com o hash dos bytes entregues; nunca existe PDF entregue sem registro (AC-18).
- A vigência e os tipos de um mês que já tem emissão não mudam (AC-3).
- O relatório nunca lê `camposPatrimoniais` (AC-15).

**Security model**:

Só Admin vê, cadastra e gera (páginas com `requireAdmin()`, Server Actions com `verifySession()` mais `isAdmin()`, rota com 401 e 403 antes de ler, `proxy.ts` já cobrindo `/configuracoes`). O relatório mostra dados da empresa contratada (CNPJ, que é público) e um nome de pessoa (o `fiscal`, que já aparece no processo administrativo). Nenhum dado do solicitante, nenhum `camposPatrimoniais`. A emissão guarda quem gerou e quando, que é a trilha de auditoria da funcionalidade. O cadastro de contratos não tem auditoria própria além de `timestamps` (aceito: só Admin, e cada PDF já guarda o hash do que foi emitido).

**Configuration required**: nenhuma variável nova. Dependência nova: `@react-pdf/renderer` (versão exata no `package.json`, sem `^`, como o AI SDK).

**Critical test scenarios**:

- Happy path: contrato de Ar-Condicionado com dois ativos, três corretivos e uma preventiva no mês; a tela mostra topo, categoria e ativos, e o PDF baixa com o código no rodapé e uma emissão gravada com o hash dos bytes, verifies **AC-5**, **AC-9**, **AC-12**, **AC-16**, **AC-17**
- Paridade: para o mesmo mês e um só tipo, os seis números do topo são iguais aos de `calcularIndicadoresAtivos(...).porTipo[tipo].topo` (teste de banco real), verifies **AC-10**
- Janela cortada: vigência começa no dia 15; chamado do dia 10 fica fora, e o cabeçalho diz "15/mm a fim do mês", verifies **AC-6**, **AC-7**
- SLA: corretivo aberto com prazo vencido conta como fora; aberto no prazo conta como em andamento; sem snapshot conta em "sem SLA", verifies **AC-13**
- Sobreposição: criar um contrato de Elevador que cruza a vigência de outro, inativo, é recusado com a mensagem do AC-3; encurtar a vigência sobre um mês já emitido também é recusado, verifies **AC-3**
- Pausa: corretivo em `aguardando_terceiros` com `resolutionDueAt` passado conta em andamento, não fora, verifies **AC-13**
- Mapeamento: categoria ligada a um subtipo do `ServiceType` "AR CONDICIONADO" entra no contrato de "Ar-Condicionado", verifies **AC-11**
- Mais de 10 ativos: a tabela por ativo mostra todos, verifies **AC-12**
- Falha: `create` da emissão lança; a rota responde 500 e não devolve PDF, verifies **AC-18**
- Auth/permission: Preposto chama `POST /api/relatorios/contrato/pdf` e recebe 403 sem nenhuma leitura de chamado; abre `/relatorios/contrato` e é redirecionado, verifies **AC-20**

## Build plan

Ordem de Tracer Bullet: o primeiro passo já leva um número real do banco até um PDF baixado, e os seguintes engrossam o fio.

1. [x] O fio: `models/Contrato.ts` e `models/RelatorioContratoEmissao.ts` com os índices; `shared/contratos/` (schema Zod do contrato e do pedido de PDF, `cnpjValido`, `formatarCnpj`, `janelaDoMes`, `mesesPermitidos`, tipos do relatório); `lib/contratos/relatorio.ts` com janela (AC-6), pertencimento (AC-7) e só o topo por `calcularFiltro` (exportando `lerInfoDosAtivos`); a rota `POST /api/relatorios/contrato/pdf` com auth, recálculo, `@react-pdf/renderer` instalado com versão exata e um PDF de cabeçalho mais topo, código no rodapé, hash, emissão gravada com `geradoPorNome` e a trava de uma geração por vez; um contrato criado à mão no banco de teste, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-10**, **AC-16**, **AC-18**, **AC-20**
2. [x] Cadastro: `/configuracoes/contratos` com lista, diálogo de criar e editar, inativar e reativar, as três Server Actions, validação, sobreposição e a trava de meses emitidos; item no menu, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**
3. [x] Tela do relatório: `/relatorios/contrato` com seletores (meses permitidos), cabeçalho, topo, selo de parcial, vazios e o botão "Gerar PDF" com toast de erro; item no menu, satisfies **AC-5**, **AC-6**, **AC-14**, **AC-16**, **AC-18**
4. [x] Profundidade do cálculo: `categoriaId` em `InfoDoAtivo`, SLA por corretivo com a regra da pausa (AC-13), preventivas geradas e concluídas, tabela por ativo e tabela por categoria com ativos no escopo (mapeamento por `tipoServicoDoNomeDoTipo`), na tela e no PDF (cabeçalho fixo de tabela, A4 paisagem, selos), satisfies **AC-9**, **AC-11**, **AC-12**, **AC-13**, **AC-15**, **AC-17**
5. [x] Lista de emissões na tela e `router.refresh()` depois de gerar, satisfies **AC-19**
6. [x] Testes de banco real (`*.db.test.ts`): paridade com `calcularIndicadoresAtivos`, índice único do número e checagem de sobreposição; conferência do lock para Alpine (`npx npm@11.19.0 ci --dry-run --ignore-scripts --os=linux --cpu=x64 --libc=musl`) `npm run build` e, com o build rodando (`npm start`), uma chamada real à rota que abre o PDF e confere acentos, cabeçalho repetido e "Página X de Y" num relatório de mais de uma página (o problema de empacotamento pode aparecer só em execução), satisfies **AC-3**, **AC-10**, **AC-16**, **AC-17**

## Consequences

**Positive**:

- O fiscal recebe um documento por contrato e mês com números que batem com a aba Ativos do IMR, e um código que prova qual versão foi anexada.
- Nenhuma migração de chamado: o contrato vale para os chamados antigos assim que é cadastrado.
- O cadastro de contrato fica pronto para o próximo termo de referência transformar indicadores em regra contratual.

**Negative / tradeoffs**:

- Dependência nova (`@react-pdf/renderer` e as dependências dela, como `yoga-layout` e `pdfkit`) para manter atualizada, e um segundo layout (o PDF) que precisa andar junto com a tela.
- O relatório é recalculado a cada geração: um chamado vinculado a um ativo depois da emissão muda o próximo PDF do mesmo mês. O hash prova o que foi anexado, mas o Sigma não guarda o arquivo para baixar de novo idêntico.
- Editar a vigência ou os tipos de um contrato ainda muda os meses passados que nunca foram emitidos, sem trilha própria; os meses com emissão ficam protegidos pela trava do AC-3.
- A trava de uma geração por vez é em memória: vale enquanto o Next roda numa única instância, como o limitador da IA.
- A reincidência olha 90 dias para trás mesmo antes da vigência, então um contrato novo pode herdar reincidência de chamados da empresa anterior (escolhido para manter a paridade com o IMR).
- "Ativos no escopo" é o retrato de hoje, não do mês: num relatório de meses atrás o número pode não corresponder ao parque daquela época.

**Neutral**:

- Duas coleções novas e um módulo novo `lib/contratos/` (pede um `AGENTS.md` aninhado depois do `/sync`).
- `lerInfoDosAtivos` deixa de ser privada em `lib/ativos/indicadores.ts`.
- A geração do PDF roda no processo do Next; com dezenas de páginas no máximo, leva poucos segundos e não pede fila.

## Follow-up

- [x] Depois de instalar `@react-pdf/renderer`, conferir o lock para a imagem Alpine antes do PR (o deploy de 01/10/2026 quebrou por isso) e rodar `npm run build`; só acrescentar `serverExternalPackages: ['@react-pdf/renderer']` no `next.config.ts` se o build falhar.
- [ ] `/sync`: registrar `lib/contratos/` e a nova linha da tabela de referência rápida no `AGENTS.md`, e a skill `react-pdf` (`molefrog/skills`, instalada em `.agents/skills/react-pdf/` em 07/10/2026) na seção `## Agent skills`. Ela é da área de relatórios, então cabe num `lib/contratos/AGENTS.md`, com só um ponteiro na raiz.
- [ ] Previstas x realizadas da preventiva por periodicidade da categoria ficou fora desta spec (está no Deferred do escopo).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
