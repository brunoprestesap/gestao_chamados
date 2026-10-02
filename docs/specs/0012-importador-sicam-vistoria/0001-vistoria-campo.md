# 0012.1. Vistoria em campo com fila offline

## Summary

A gestão abre uma campanha de vistoria. Com o celular, o vistoriador baixa a lista de tudo que é vistoriável, escolhe a sala, lê ou digita o tombo e confirma local, fabricante, modelo e série. Também cadastra ali o equipamento que o Sigma ainda não tem. Sem sinal, cada confirmação fica guardada no aparelho e sobe sozinha quando a conexão volta. Uma tela mostra quanto de cada prédio já foi conferido.

## Requirements

**User stories**:

- Como vistoriador, quero conferir o equipamento na sala onde estou, até no subsolo sem sinal, para não perder trabalho.
- Como vistoriador, quero cadastrar o elevador ou o QGBT que não tem tombo, para que ele passe a receber chamado.
- Como Preposto, quero ver a cobertura por prédio e o que ainda está sem local, para planejar a próxima ida a campo.

**Acceptance criteria**:

- **AC-1**: Admin e Preposto abrem uma campanha com nome em `/ativos/vistoria`. Só uma fica aberta por vez: abrir outra é recusado com "Já existe uma campanha aberta: <nome>". Encerrar grava quem e quando. Campanha encerrada não reabre.
- **AC-2**: `/ativos/vistoria` mostra a Admin, Preposto e Técnico a cobertura da campanha aberta (sem campanha aberta, a da última encerrada). Para cada prédio (nó com `tipo: 'predio'`): quantos ativos vistoriáveis têm hoje local dentro dele (o prédio e tudo abaixo), quantos desses têm conferência na campanha e o percentual. Conferência de ativo que depois saiu do prédio ou deixou de ser vistoriável não conta, então o percentual nunca passa de 100%. À parte, um bloco "Sem local" com a quantidade de vistoriáveis sem `localizacaoId`. Sem nenhuma campanha, a gestão vê o botão para abrir uma e o Técnico vê "Nenhuma campanha aberta".
- **AC-3**: `/ativos/vistoria/campo`, aberta com sinal e com campanha aberta, baixa o pacote (ativos vistoriáveis sem dados patrimoniais, árvore de locais ativa, categorias ativas, conferências já feitas na campanha) e guarda no aparelho, mostrando a hora em que foi baixado e um botão "Atualizar pacote". Sem campanha aberta, a tela diz "Nenhuma campanha aberta" e não abre o campo.
- **AC-4**: Em campo, a pessoa escolhe o prédio e depois qualquer local abaixo dele (ou o próprio andar). A tela lista os ativos do pacote com aquele `localizacaoId`, com os já conferidos na campanha riscados. Tocar num item, ou ler ou digitar o código (normalizado como em `normalizarCodigo`; câmera só em contexto seguro, senão campo de texto e leitor USB), abre o formulário de conferência com fabricante, modelo e série atuais já preenchidos. A operação leva só os campos técnicos que a pessoa mudou em relação ao pacote; os que ela não tocou não vão, para um pacote velho não sobrescrever um valor mais novo do servidor. Ativo com `ausenteNoSicam` mostra o selo "Ausente do SICAM".
- **AC-5**: Confirmar grava a operação na fila do aparelho e, com sinal, sobe na hora. O servidor grava a `ConferenciaVistoria`, põe o `localizacaoId` escolhido e só os campos técnicos que vieram na operação e não estão em branco (em branco mantém o valor atual), passa `statusCadastro` a `validado` se ainda não estava (só então preenche `validadoPor` e `validadoEm`) e grava `AtivoHistory`: um `conferencia` com o nome da campanha e, na observação, os nomes dos campos técnicos que mudaram, mais `alteracao_localizacao` se o local mudou e `validacao` se passou a validado.
- **AC-6**: Sem sinal, a operação fica na fila como "Aguardando envio" e a tela mostra quantas estão pendentes. Quando o navegador volta a ficar online, ou pelo botão "Sincronizar" (que funciona sempre, sem depender de `navigator.onLine`), a fila sobe em ordem de `criadaEm`, em lotes de até 50, e cada item mostra o resultado: "Enviado", "Já conferido" ou "Recusado" com o motivo. Cada operação é validada sozinha: uma malformada volta "Recusado" e não trava as outras. Sessão expirada (401) deixa tudo pendente e mostra "Entre de novo para enviar". Recarregar a página com sinal não perde a fila.
- **AC-7**: Reenviar a mesma operação (mesmo `clientOpId`) não grava nada de novo e devolve o mesmo resultado da primeira vez.
- **AC-8**: A primeira conferência que chega vence. Se o ativo já tem conferência na campanha, a nova volta como "Já conferido por <nome> em <data e hora>", nada no ativo muda, e a tela mostra os dados que a pessoa tinha informado para ela comparar.
- **AC-9**: Operação de campanha já encerrada é aceita nela se `conferidoEm` for até `encerradaEm`; depois disso volta "Recusado: campanha encerrada". `conferidoEm` no futuro (relógio do aparelho adiantado) é gravado igual a `recebidoEm`.
- **AC-10**: Ativo inexistente, ativo `baixado` ou não vistoriável, e local inexistente ou desativado voltam como "Recusado" com o motivo, sem gravar nada.
- **AC-11**: Código lido que não está no pacote oferece "Cadastrar aqui" a Admin, Preposto e Técnico. O cadastro pede origem (patrimoniado, com o tombo lido já preenchido, ou interno), descrição, categoria, tier (A já marcado; A ou B) e usa o local escolhido; fabricante, modelo e série são opcionais. Valida com os mesmos limites do cadastro da 0011 (`shared/ativos/ativo.schemas.ts`). Funciona sem sinal: o ativo novo aparece na lista da sala, riscado e com o código provisório (interno) ou o tombo (patrimoniado), e ler de novo o mesmo código abre esse item da fila em vez de oferecer outro cadastro. Categoria desativada depois do pacote volta "Recusado". O ativo nasce com `statusCadastro` `validado` (`validadoPor` e `validadoEm` de quem cadastrou), `status` `em_operacao`, criticidade padrão da categoria, `AtivoHistory` `cadastro` e a conferência na campanha com `cadastradoEmCampo: true`.
- **AC-12**: O interno cadastrado sem sinal aparece com um código provisório (`PROV-` mais 6 caracteres). Ao sincronizar, o servidor gera o `MNT-####` definitivo, a tela troca o provisório pelo definitivo e mostra "Etiquete como MNT-0042". O código provisório nunca é gravado no servidor.
- **AC-13**: Cadastro patrimoniado cujo código já existe no servidor vira conferência do ativo existente (pelas regras de AC-5, AC-8 e AC-10) e volta com "O ativo <código> já existia; registrado como conferência".
- **AC-14**: Admin e Preposto, com sinal, criam andar, sala ou área técnica abaixo do local escolhido direto na tela de campo, pelas regras de AC-1 e AC-2 da 0011, e o novo local entra no pacote do aparelho na hora. Sem sinal o botão some e a tela orienta a escolher o local mais próximo. O Técnico não vê o botão.
- **AC-15**: A fila é por usuário: cada operação guarda o `userId` e só sobe com a sessão dessa pessoa; outra pessoa logada no mesmo aparelho não vê nem envia a fila alheia. Sair do sistema com operações pendentes mostra um aviso com a quantidade antes de sair, e a fila continua lá no próximo login da mesma pessoa. O `userId` vem da sessão, entregue pela página do servidor e guardado junto com o pacote, para a tela saber de quem é a fila mesmo sem sinal. Ao sair, o pacote do aparelho é apagado (a fila fica).
- **AC-16** (operacional, conferido no banco, sem código novo): existem as categorias `elevador` e `spda` (para os MNT) e `copa_refrigeracao` e `copa_coccao` (para o Tier B do importador), criadas pelo Admin com a criticidade que ele escolher; os ativos MNT de elevador, QGBT (categoria `energia_transformador`), SPDA e hidrante (categoria `combate_incendio`) estão cadastrados com local e conferidos na campanha inicial.
- **Permissões** (parte de AC-2, AC-3, AC-11 e AC-14, conferidas em todos): Solicitante não chega a `/ativos/vistoria` nem ao campo (redireciona para `/dashboard`) e recebe 403 no pacote e na sincronização. O Técnico usa o campo e a sincronização, mas não abre nem encerra campanha e continua recebendo "Sem permissão para esta ação." nas actions de escrita da 0011. O pacote não leva `camposPatrimoniais` para ninguém. A ficha mostra a última conferência (campanha, nome de quem conferiu, papel servidor ou contratada, hora do aparelho) para os quatro perfis, como já mostra o autor na linha do tempo.

## Decision

Campanha leve no servidor e fila offline sem service worker no cliente, sincronizada em lote e idempotente.

- **Fila no IndexedDB pela `idb`** (invólucro de cerca de 1 KB com Promises sobre a API nativa). Runner up: Dexie, que sobra para duas tabelas. A API nativa direta é verbosa e fácil de errar.
- **Sem service worker.** A produção está em HTTP, e service worker exige contexto seguro. A tela é aberta com sinal e funciona depois sem ele.
- **Sincronização em lote por rota POST**, não por Server Action: com sinal fraco, uma ida e volta para 50 operações vale mais que 50 idas.
- **Uma só escrita**: com ou sem sinal, a tela sempre grava na fila e chama a sincronização. Não existe um caminho online separado para divergir do offline.
- **`clientOpId`** gerado no aparelho com `crypto.getRandomValues` (UUID v4 montado à mão), porque `crypto.randomUUID` não existe fora de contexto seguro.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**:

| Entidade                                                | Campos (obrigatório, `?` opcional)                                                                                                                                                                                                                                                                                                                                                   | Chaves e índices                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CampanhaVistoria` (`models/CampanhaVistoria.ts`)       | `nome` (trim, até 80), `status` (`aberta` \| `encerrada`), `abertaPor` (ref `User`), `abertaEm`, `encerradaPor?` (ref `User`), `encerradaEm?`, timestamps                                                                                                                                                                                                                            | Único `{ status: 1 }` com `partialFilterExpression: { status: 'aberta' }` (uma aberta por vez). `{ abertaEm: -1 }`                                   |
| `ConferenciaVistoria` (`models/ConferenciaVistoria.ts`) | `campanhaId` (ref), `ativoId` (ref `Ativo`), `autorId` (ref `User`), `papelAutor` (`servidor` \| `contratada`), `localizacaoId` (ref), `fabricante?`, `modelo?`, `numeroSerie?` (o que a pessoa informou), `cadastradoEmCampo` (bool, padrão `false`), `conferidoEm`, `recebidoEm`, `clientOpId` (string, UUID), `efeitoAplicadoEm?` (preenchido quando a escrita no ativo terminou) | Único `{ campanhaId: 1, ativoId: 1 }` (a primeira vence). Único `{ clientOpId: 1 }`. `{ ativoId: 1, conferidoEm: -1 }` (última conferência na ficha) |
| `Ativo` (mudança)                                       | `origemOpId?` (o `clientOpId` do cadastro em campo que criou o ativo)                                                                                                                                                                                                                                                                                                                | Único `{ origemOpId: 1 }` com `partialFilterExpression: { origemOpId: { $type: 'string' } }`                                                         |
| `AtivoHistory` (mudança)                                | nova ação `conferencia`                                                                                                                                                                                                                                                                                                                                                              | sem mudança                                                                                                                                          |

Relações: `CampanhaVistoria` 1:N `ConferenciaVistoria`; `Ativo` 1:N `ConferenciaVistoria` (no máximo uma por campanha); `Localizacao` 1:N `ConferenciaVistoria`; `User` 1:N `ConferenciaVistoria`. Os dois modelos seguem o registro de `models/AGENTS.md`. Constantes e rótulos em `shared/vistoria/vistoria.constants.ts`; schemas Zod em `shared/vistoria/vistoria.schemas.ts`.

**No aparelho** (IndexedDB `sigma-vistoria`, versão 1, módulo cliente `lib/vistoria-offline/`, sem `server-only`):

| Store       | Chave        | Conteúdo                                                                                                                            |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pacote`    | `userId`     | o JSON do pacote (AC-3) com `geradoEm`                                                                                              |
| `operacoes` | `clientOpId` | a operação, `userId`, `estado` (`pendente` \| `enviada` \| `ja_conferido` \| `recusada`), `resultado?`, `criadaEm`; índice `userId` |

Operações `enviada` e `ja_conferido` saem da store depois de 7 dias; `pendente` e `recusada` ficam até a pessoa descartar. Sem contexto seguro não dá para pedir armazenamento persistente (`navigator.storage.persist()`), e o Safari do iOS pode apagar o IndexedDB de um site sem uso por cerca de 7 dias: a tela avisa para sincronizar no mesmo dia.

**State transitions**:

- `CampanhaVistoria.status`: `aberta` → `encerrada` (Admin ou Preposto). Sem volta.
- Operação no aparelho: `pendente` → `enviada` \| `ja_conferido` \| `recusada`. Erro de rede, 5xx ou 401 deixa `pendente`. `recusada` não é reenviada sozinha.
- `Ativo.statusCadastro`: `importado` \| `em_vistoria` → `validado` pela conferência (já existia na 0011).

**API surface**:

| Endpoint                                   | Método | Key inputs                                                                  | Key outputs                                                                                                                                                                                                                                                                                                                | Auth                     | Key errors                                                                                                                                    |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `abrirCampanhaAction`                      | Action | `nome`: string (req, 1 a 80)                                                | `{ ok }`                                                                                                                                                                                                                                                                                                                   | Admin, Preposto          | já existe aberta (E11000 do índice parcial vira a mensagem de AC-1)                                                                           |
| `encerrarCampanhaAction`                   | Action | `id`: string (req)                                                          | `{ ok }`                                                                                                                                                                                                                                                                                                                   | Admin, Preposto          | não está aberta                                                                                                                               |
| `GET /api/vistoria/pacote`                 | GET    | nenhum                                                                      | `{ campanha: { id, nome, status, abertaEm }, geradoEm, ativos: [{ id, codigo, descricao, categoriaId, tierManutencao, localizacaoId, fabricante, modelo, numeroSerie, ausenteNoSicam }], locais: [{ id, nome, tipo, parentId, caminho }], categorias: [{ id, nome }], conferidos: [{ ativoId, autorNome, conferidoEm }] }` | Admin, Preposto, Técnico | 401, 403, 409 sem campanha aberta                                                                                                             |
| `POST /api/vistoria/sincronizar`           | POST   | `operacoes`: 1 a 50 de `OperacaoConferencia` \| `OperacaoCadastro` (abaixo) | `{ resultados: [{ clientOpId, estado: 'aceita' \| 'ja_conferido' \| 'recusada', ativoId?, codigo?, mensagem?, conferidoPor?, conferidoEm? }] }`, sempre 200 quando o lote é válido                                                                                                                                         | Admin, Preposto, Técnico | 401, 403, 400 só quando o corpo não é um lote (sem `operacoes`, ou mais de 50); operação malformada dentro de um lote válido volta `recusada` |
| `criarLocalizacaoAction` (já existe, 0011) | Action | `nome`, `tipo`, `parentId`                                                  | `{ ok, id }`                                                                                                                                                                                                                                                                                                               | Admin, Preposto          | nome repetido                                                                                                                                 |

`OperacaoConferencia`: `{ clientOpId, tipo: 'conferencia', campanhaId, ativoId, localizacaoId, fabricante?, modelo?, numeroSerie?, conferidoEm }`.
`OperacaoCadastro`: `{ clientOpId, tipo: 'cadastro', campanhaId, origemCodigo: 'patrimonio' | 'interno', tombamento? (obrigatório se patrimonio), descricao, categoriaId, tierManutencao: 'A' | 'B', localizacaoId, fabricante?, modelo?, numeroSerie?, conferidoEm }`.

Processamento de cada operação, em ordem, uma por vez (`lib/vistoria/sincronizacao.ts`). Toda escrita no `Ativo` é por `updateOne` com `$set` por campo, nunca `save()` de um documento carregado, para não pisar na importação nem na edição da ficha:

1. Valida a operação pelo schema (malformada: `recusada`).
2. `clientOpId` já existe em `ConferenciaVistoria`: se `efeitoAplicadoEm` está preenchido, devolve o resultado reconstruído dela (AC-7); se não, refaz o passo 6 e devolve `aceita`.
3. Valida a campanha (AC-9), o local (AC-10) e, na conferência, o ativo (AC-10).
4. Cadastro: procura `Ativo` com `origemOpId` igual ao `clientOpId` (retomada após queda). Não achou: patrimoniado com código existente segue como conferência desse ativo (AC-13); senão cria o ativo pelo `criarAtivo` da 0011 (com `origemOpId`, `statusCadastro` `validado`, e o `MNT-####` do contador quando interno) e o `AtivoHistory` `cadastro`. E11000 em `codigo` (outra pessoa cadastrou o mesmo tombo no mesmo instante) também segue como conferência do existente.
5. Grava a `ConferenciaVistoria` com `efeitoAplicadoEm` vazio (no cadastro de ativo novo, já preenchido, porque o efeito foi a criação). E11000 em `{ campanhaId, ativoId }` vira `ja_conferido` com quem e quando (AC-8); E11000 em `clientOpId` volta ao passo 2.
6. Escreve local e campos técnicos com `$set`, grava os `AtivoHistory` só para o que mudou de fato e preenche `efeitoAplicadoEm`. Falha aqui devolve erro transitório: a operação continua `pendente` no aparelho e o reenvio cai no passo 2. Uma queda depois do histórico e antes de `efeitoAplicadoEm` pode repetir uma linha `conferencia` no histórico; é aceito.

**Value sourcing**:

| Action                | Value produced / displayed | Source                                                                                                       |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| cobertura (AC-2)      | total por prédio           | contagem de `Ativo` vistoriável com `localizacaoId` em `idsDaSubarvore(predio)`, calculada na leitura        |
| cobertura             | conferidos por prédio      | `ConferenciaVistoria` da campanha cujo ativo é hoje vistoriável e está na subárvore do prédio                |
| cobertura             | "Sem local"                | `Ativo` vistoriável com `localizacaoId: null`                                                                |
| cobertura             | qual campanha              | a `aberta`; sem ela, a de maior `encerradaEm`                                                                |
| pacote                | `ausenteNoSicam`           | `camposPatrimoniais.ausenteNoSicamDesde` existe (spec 0002 desta pasta)                                      |
| pacote                | `conferidos[].autorNome`   | `User.name` do `autorId`                                                                                     |
| conferência           | `autorId`                  | sessão, nunca o corpo da requisição                                                                          |
| conferência           | `papelAutor`               | perfil da sessão na hora: Técnico vira `contratada`, Admin e Preposto viram `servidor`                       |
| conferência           | `conferidoEm`              | operação (relógio do aparelho), limitado a `recebidoEm`                                                      |
| conferência           | `recebidoEm`               | `new Date()` no servidor                                                                                     |
| cadastro              | `codigo`                   | patrimonio: `normalizarCodigo(tombamento)`; interno: `proximoCodigoInterno()`                                |
| cadastro              | `criticidade`              | `CategoriaAtivo.criticidadePadrao`                                                                           |
| cadastro              | código provisório          | gerado no aparelho, só para exibição (AC-12)                                                                 |
| ficha                 | última conferência         | `ConferenciaVistoria` mais recente por `conferidoEm` do ativo, com nome da campanha, do autor e `papelAutor` |
| aviso ao sair (AC-15) | quantidade pendente        | store `operacoes` filtrada por `userId` e `estado: 'pendente'`                                               |
| campo                 | `userId` da fila           | sessão, passada pela página do servidor como prop e guardada com o pacote                                    |
| conferência           | campos técnicos enviados   | só os que a pessoa mudou em relação ao pacote (calculado no aparelho)                                        |

**Key invariants**:

- No máximo uma campanha `aberta` (índice único parcial).
- No máximo uma conferência por ativo por campanha (índice único); a que gravou primeiro é a que vale.
- Um `clientOpId` produz no máximo um efeito no servidor: uma conferência (índice único) e no máximo um ativo criado (`origemOpId` único).
- A conferência nunca apaga campo técnico e nunca muda `status`, `categoriaId`, `criticidade`, `tierManutencao` nem `camposPatrimoniais`.
- `validadoPor` e `validadoEm` só são escritos na passagem para `validado`.
- O autor é sempre o usuário da sessão; uma operação de outro `userId` nunca é enviada pelo cliente.

**Security model**:

- Escrita de campanha: Admin e Preposto (actions com `verifySession()` e conferência de papel, como em `lib/ativos/AGENTS.md`).
- Pacote e sincronização: Admin, Preposto e Técnico; Solicitante recebe 403. As telas usam `requireSession()` e redirecionam o Solicitante.
- Criar local em campo: só Admin e Preposto (a action já confere).
- Dado pessoal (LGPD): o pacote não traz `camposPatrimoniais`, nem nomes de responsável. O que fica no aparelho é código, descrição, local e dados técnicos, mais o nome de quem já conferiu (colega de vistoria, mesma informação que a ficha mostra).
- `/ativos` já está em `protectedPrefixes`; nada muda no `proxy.ts` para esta parte.

**Configuration required**: nenhuma variável nova. Dependências com versão exata: `idb` (runtime) e `fake-indexeddb` (desenvolvimento). Depois de instalar, rodar a conferência do lock para o Alpine descrita no `AGENTS.md` raiz.

**Critical test scenarios**:

- Happy path (E2E): Preposto abre a campanha, abre o campo, confere um ativo sem local numa sala, e a cobertura do prédio passa de 0 para 1; verifica **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**.
- Offline (E2E com `context.setOffline(true)`): conferir dois ativos sem sinal, ver "2 pendentes", voltar online e ver os dois "Enviado"; verifica **AC-6**.
- Idempotência (banco real): o mesmo lote enviado duas vezes deixa uma conferência e um conjunto de históricos; verifica **AC-7**.
- Corrida (banco real): duas conferências do mesmo ativo na mesma campanha ao mesmo tempo geram uma `aceita` e uma `ja_conferido`, e o ativo tem os dados da aceita; verifica **AC-8**.
- Campanha encerrada: operação com `conferidoEm` antes de `encerradaEm` é aceita, depois é recusada; `conferidoEm` futuro vira `recebidoEm`; verifica **AC-9**.
- Recusas: ativo `baixado`, Tier C e local desativado voltam `recusada` sem gravar nada; verifica **AC-10**.
- Cadastro interno offline: a operação com provisório volta com `MNT-` e a tela troca o código; queda simulada depois de criar o ativo e antes da conferência, e o reenvio acha o ativo por `origemOpId` sem gastar outro `MNT-`; verifica **AC-11**, **AC-12**, **AC-7**.
- Queda na conferência: conferência gravada sem `efeitoAplicadoEm`; o reenvio aplica o local e responde `aceita`; verifica **AC-7**, **AC-5**.
- Pacote velho: campo não tocado no formulário não vai na operação e não sobrescreve o valor mais novo do servidor; verifica **AC-4**, **AC-5**.
- Lote misto: uma operação malformada volta `recusada` e as outras do lote são aceitas; 401 deixa tudo pendente; verifica **AC-6**.
- Tombo repetido: cadastro patrimoniado de código existente vira conferência; verifica **AC-13**.
- Fila por usuário (unitário com `fake-indexeddb`): operações do usuário A não aparecem nem sobem com a sessão do B; o aviso de saída conta só as pendentes do usuário atual; verifica **AC-15**.
- Campo em branco: conferência sem série mantém a série atual; verifica **AC-5**.
- Permissão: Solicitante recebe 403 em pacote e sincronização e é redirecionado nas telas; Técnico recebe `ok: false` em `abrirCampanhaAction` e não vê "Criar local"; verifica **AC-1**, **AC-14** e as permissões.

## Build plan

- **V1. O fio**: modelos `CampanhaVistoria` e `ConferenciaVistoria` com testes de índice (banco real), ação `conferencia` no `AtivoHistory`, `abrirCampanhaAction`, `GET /api/vistoria/pacote`, `POST /api/vistoria/sincronizar` só com `conferencia`, `idb` com as stores `pacote` e `operacoes`, e uma tela de campo mínima (prédio, local, código digitado, formulário) que sempre grava na fila e sincroniza; `/ativos/vistoria` mostra a campanha e a contagem simples; satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-7**
- **V2. Sem sinal de verdade**: estado da fila na tela, contador de pendentes, disparo no evento `online` e no botão, resultado por item, lotes de 50, regra da primeira que chega com os dados da recusada, campanha encerrada, recusas por estado, fila por usuário, `userId` com o pacote, pacote apagado e aviso ao sair (gancho no cliente antes da action de logout); satisfies **AC-6**, **AC-8**, **AC-9**, **AC-10**, **AC-15**
- **V3. Cadastro em campo**: `OperacaoCadastro` (patrimoniado e interno), código provisório e troca pelo `MNT-`, `Ativo.origemOpId` e retomada após queda, tombo repetido vira conferência, criar local em campo para a gestão; satisfies **AC-11**, **AC-12**, **AC-13**, **AC-14**
- **V4. Cobertura e acabamento**: cobertura por prédio e "Sem local" calculada na leitura, encerrar campanha, lista de esperados na sala com riscados, selo "Ausente do SICAM", última conferência na ficha, câmera reaproveitada de `/ativos/ler` quando houver contexto seguro, item "Vistoria" no `components/dashboard/nav.ts` para Admin, Preposto e Técnico; satisfies **AC-1**, **AC-2**, **AC-4**
- **V5. Testes**: banco real (idempotência, corrida, retomada do cadastro), unitários da fila com `fake-indexeddb`, permissão das rotas e actions, E2E do fio feliz e do offline; satisfies **AC-5** a **AC-15**
- **V6. Operação**: categorias novas pela tela e cadastro dos MNT em campo (ver `index.md`); satisfies **AC-16**

## Rationale (short)

A campanha leve guarda quem conferiu, quando e em qual rodada sem mexer no ativo, então um inventário anual futuro cabe no mesmo modelo. A fila sem service worker é o que funciona hoje em HTTP e resolve o caso real (abrir com sinal na entrada, descer para o subsolo). "A primeira que chega" usa um índice único do Mongo como árbitro, sem transação e sem fila de revisão. Opções e comparação completas: [rationale.md](rationale.md).
