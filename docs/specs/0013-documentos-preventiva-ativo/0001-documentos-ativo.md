# Parte 1. Documentos do ativo e alerta de vencimento

## Summary

O Admin cadastra os tipos de documento (o sistema já começa com PMOC, AVCB, ART, laudo de SPDA e garantia). Admin e Preposto sobem o documento com arquivo, preso a um ativo ou a um local, e o novo do mesmo tipo substitui o anterior sem apagá-lo. Um job roda todo dia às 08:00 de Belém e avisa Admin e Preposto, pelo sino e por e-mail, quando faltam 90, 60 e 30 dias e quando o documento vence, cada aviso uma vez só. A ficha do ativo e um painel geral mostram o que está em dia, o que vence, o que venceu e o que falta.

## Requirements

**Acceptance criteria**:

- **AC-1**: O Admin cria, renomeia, ativa e desativa tipos de documento em `/configuracoes/tipos-documento`. A `chave` é minúscula, única e não muda depois de criada; o `nome` é único. Uma carga idempotente (no `scripts/seed.js` e num script de carga para a produção) cria `pmoc`, `avcb`, `art`, `laudo_spda` e `garantia` só se não existirem. Tipo desativado some das escolhas de cadastro e de exigência, mas documentos já cadastrados com ele continuam visíveis e alertando.
- **AC-2**: Em `/configuracoes/categorias-ativo`, `exigeDocumento` passa a ser escolhido de uma lista dos tipos ativos (várias escolhas), gravando as chaves. Um valor já gravado que não é chave de nenhum tipo aparece na tela com o selo "não reconhecido", não entra no cruzamento do que falta e some quando a categoria é salva de novo (ao salvar, a ação guarda só chaves que existem em `TipoDocumento`, ativas ou não). A chave de um tipo desativado continua gravada na categoria, mas não conta no que falta enquanto o tipo estiver desativado.
- **AC-3**: Admin e Preposto cadastram um documento informando tipo (ativo), alvo (um ativo **ou** um local, nunca os dois, nunca nenhum), arquivo, emitido em, e opcionalmente validade até, número e emitido por. O arquivo é obrigatório, até 20 MB, PDF, JPEG, PNG ou WebP, conferido pelos bytes iniciais (não pela extensão). A validade, quando existe, não pode ser anterior à emissão. Ativo `baixado` e local desativado não recebem documento novo. Cada violação é recusada com mensagem em português e nada é gravado (nem arquivo, nem documento).
- **AC-4**: Ao cadastrar um documento de um tipo num alvo que já tem documento `vigente` desse tipo, o anterior vira `substituido` (com `substituidoPorId` e `substituidoEm`) na mesma operação, para de alertar e continua consultável. Nunca existem dois `vigente` do mesmo tipo no mesmo alvo: duas gravações simultâneas resultam em uma aceita e outra recusada com 409 ("outro documento deste tipo acabou de ser cadastrado, recarregue"), e o arquivo da recusada é apagado do disco.
- **AC-5**: Admin e Preposto corrigem número, emitido por, emitido em e validade até de um documento `vigente`. O arquivo não muda (arquivo errado se resolve substituindo). Mudar a validade apaga de `alertasEnviados` os limites que deixaram de ser alcançados com a nova data, para que voltem a ser avisados na hora certa.
- **AC-6**: Admin e Preposto excluem um documento `vigente` ou `substituido` informando um motivo (obrigatório, até 500 caracteres). Ele vira `excluido`, some das telas, do painel e dos alertas, e o arquivo continua no disco. Excluir o `vigente` não devolve o substituído anterior: o alvo fica sem vigente daquele tipo (e, se a categoria exige, passa a aparecer em Faltando), e o diálogo de exclusão diz isso antes de confirmar.
- **AC-7**: Cadastro, substituição, correção e exclusão de documento de ativo gravam `AtivoHistory` com as ações novas `documento_cadastrado`, `documento_substituido`, `documento_corrigido` e `documento_excluido` (rótulos em `shared/ativos/ativo.constants.ts`), com o tipo e, na exclusão, o motivo. Documento de local guarda a autoria nos próprios campos (`cadastradoPorId`, `excluidoPorId`, `motivoExclusao`).
- **AC-8**: A ficha do ativo (`/ativos/[id]`), para Admin, Preposto e Técnico, ganha a seção Documentos com: os documentos `vigente` do ativo, cada um com a situação calculada (em dia, vence em N dias, vence hoje, vencido, sem validade) e o link para baixar; os `substituido` do ativo num bloco recolhido; os `vigente` dos locais acima do ativo (sala, andar, prédio), só leitura, com o nome do local; e a lista do que falta. Admin e Preposto veem os botões Novo documento (com o ativo já escolhido), Corrigir e Excluir.
- **AC-9**: O painel `/ativos/documentos` (Admin, Preposto, Técnico) tem duas visões. "Documentos": os `vigente`, paginados de 50 em 50, ordenados pela validade (sem validade por último), com filtros por tipo, situação (vencido, vence em até 30, 60 ou 90 dias, em dia, sem validade) e prédio, mostrando alvo (código do ativo ou caminho do local), tipo, número, validade e situação. "Faltando": cada par (ativo não baixado, tipo ativo exigido pela categoria) sem documento `vigente` desse tipo no ativo nem em nenhum local acima dele, paginado de 50 em 50, ordenado pelo caminho do prédio e depois pelo código do ativo, filtrável por tipo e prédio. Um documento vencido conta como existente (aparece em Documentos como vencido, não em Faltando). O prédio de um documento ou de um ativo é o do seu local (ver o contrato no `index.md`); ativo sem local não herda documento de local, aparece em Faltando quando lhe falta algo e só é listado quando o filtro de prédio está vazio. Documentos de local desativado continuam valendo, contando na herança e alertando. Admin e Preposto veem o botão Novo documento, que escolhe ativo ou local.
- **AC-10**: Baixar o arquivo (`GET /api/ativos/documentos/[id]/arquivo`) exige sessão de Admin, Preposto ou Técnico; Solicitante recebe 403, não vê a seção na ficha nem o item do painel no menu, e `/ativos/documentos` o manda para `/dashboard`. Documento `excluido` responde 404. Cadastrar, corrigir e excluir por Técnico ou Solicitante é recusado no servidor.
- **AC-11**: O job `POST /api/cron/documentos-vencimento` (header `x-cron-secret`, recusa tudo se `CRON_SECRET` estiver vazio) roda pelo container `cron` todo dia às 08:00 de Belém. Para cada documento `vigente` com validade e alvo elegível, calcula os dias restantes pelo calendário de America/Belem e acha os limites alcançados: `90` (até 90 dias), `60`, `30` e `vencido` (validade já passou). Se há limites alcançados ainda não marcados, envia **um** aviso, pelo mais urgente deles, e marca todos os alcançados. Um documento cadastrado já a 20 dias de vencer recebe só o aviso de 30 dias.
- **AC-12**: O aviso é uma `Notification` `documento:vencimento` para cada Admin e Preposto ativo, com título como "AVCB do Prédio Sede vence em 30 dias" ou "PMOC do MNT-0003 venceu", que no sino leva à ficha do ativo (documento de ativo) ou ao painel filtrado pelo prédio (documento de local), e um e-mail com o título como assunto, o mesmo texto no corpo e o link, quando o SMTP está configurado e o usuário tem e-mail. Falha no envio de e-mail não impede a marca nem o próximo documento. Falha ao gravar as notificações desfaz a marca (`$pull` dos limites recém marcados), para o aviso sair na próxima rodada.
- **AC-13**: Rodar o job duas vezes no mesmo dia (ou em paralelo) não repete aviso: a marca é gravada por atualização condicional que só vale se o limite ainda não estava marcado, e só quem gravou a marca envia o aviso.
- **AC-14**: Documento de ativo `baixado` não alerta, e ativo `baixado` não aparece em Faltando. Documento de local sempre alerta. Documento sem validade nunca alerta.
- **AC-15**: O nginx aceita corpo de até 21M só em `/api/ativos/documentos`; o resto do site continua em 10M. A tela confere o tamanho antes de enviar e mostra a mensagem em português para arquivo acima de 20 MB; a rota recusa com 413 e mensagem em português o que passar de 20 MB e chegar até ela. Acima de 21M quem recusa é o nginx, com a página padrão dele (aceito, porque a tela já barrou antes).

## Feature design

**Data model sketch**:

`TipoDocumento` (`models/TipoDocumento.ts`, registro do modelo no padrão de `models/AGENTS.md`)

| Campo      | Tipo    | Regra                                                        |
| ---------- | ------- | ------------------------------------------------------------ |
| `chave`    | string  | obrigatório, minúsculo, `^[a-z0-9_]{2,40}$`, único, imutável |
| `nome`     | string  | obrigatório, até 80, único (collation `pt`, força 2)         |
| `isActive` | boolean | padrão `true`                                                |
| timestamps |         |                                                              |

`DocumentoAtivo` (`models/DocumentoAtivo.ts`)

| Campo              | Tipo                                         | Regra                                                           |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------- |
| `tipo`             | string                                       | obrigatório, chave de `TipoDocumento`                           |
| `ativoId`          | ObjectId?                                    | ref `Ativo`                                                     |
| `localizacaoId`    | ObjectId?                                    | ref `Localizacao`; exatamente um dos dois (validação do schema) |
| `arquivo`          | `{ filename, originalName, mimeType, size }` | obrigatório; `filename` é o nome em disco                       |
| `numero`           | string?                                      | até 80                                                          |
| `emitidoPor`       | string?                                      | até 120                                                         |
| `emitidoEm`        | Date                                         | obrigatório, data sem hora                                      |
| `validadeAte`      | Date?                                        | data sem hora, `>= emitidoEm`                                   |
| `situacao`         | `vigente` \| `substituido` \| `excluido`     | padrão `vigente`                                                |
| `substituidoPorId` | ObjectId?                                    | ref `DocumentoAtivo`                                            |
| `substituidoEm`    | Date?                                        |                                                                 |
| `excluidoPorId`    | ObjectId?                                    | ref `User`                                                      |
| `excluidoEm`       | Date?                                        |                                                                 |
| `motivoExclusao`   | string?                                      | até 500                                                         |
| `alertasEnviados`  | string[]                                     | valores de `'90' \| '60' \| '30' \| 'vencido'`, padrão `[]`     |
| `cadastradoPorId`  | ObjectId                                     | ref `User`                                                      |
| timestamps         |                                              |                                                                 |

Índices: único parcial `{ tipo: 1, ativoId: 1 }` com `{ situacao: 'vigente', ativoId: { $type: 'objectId' } }`; único parcial `{ tipo: 1, localizacaoId: 1 }` com `{ situacao: 'vigente', localizacaoId: { $type: 'objectId' } }`; `{ situacao: 1, validadeAte: 1 }` (job e painel); `{ ativoId: 1, situacao: 1 }`; `{ localizacaoId: 1, situacao: 1 }`.

Nota: o modelo confirmado na conversa mostrava `alertasEnviados` como lista de números; a forma em texto (`'vencido'` ao lado de `'90'`) é a mesma ideia sem um número mágico para "já venceu".

**Datas sem hora.** `emitidoEm` e `validadeAte` chegam como `YYYY-MM-DD` e são gravadas como meia noite UTC daquele dia. "Hoje" é a data de America/Belem (`lib/sla-timezone.ts`), como texto `YYYY-MM-DD`. Dias restantes = diferença em dias entre o `YYYY-MM-DD` de `validadeAte` (lido em UTC, porque foi gravado como meia noite UTC) e o `YYYY-MM-DD` de hoje em Belém, os dois convertidos para meia noite UTC antes de subtrair. Nunca subtrair `validadeAte` de `new Date()` direto (é a origem clássica do erro de um dia). A consulta do job (`validadeAte <=` hoje + 90 dias) usa a mesma base. A situação é calculada na leitura, nunca gravada:

| Dias restantes | Situação        |
| -------------- | --------------- |
| sem validade   | sem validade    |
| `< 0`          | vencido         |
| `0`            | vence hoje      |
| `1` a `90`     | vence em N dias |
| `> 90`         | em dia          |

Limites alcançados: `90` se dias `<= 90`, `60` se `<= 60`, `30` se `<= 30`, `vencido` se `< 0`. Ordem de urgência: `vencido`, `30`, `60`, `90`. Funções puras em `lib/ativos/documentos/situacao.ts` (`situacaoDoDocumento`, `limitesAlcancados`), usadas pela ficha, pelo painel, pela correção (AC-5) e pelo job.

**State transitions**: `vigente → substituido` (novo do mesmo tipo e alvo) · `vigente → excluido` · `substituido → excluido`. Nada volta. `vencido` não é estado.

**Arquivo em disco.** `data/uploads/documentos/<documentoId>/<timestamp>-<nomeSanitizado>.<ext>`, no mesmo volume dos anexos (`./uploads:/app/data/uploads`). Reaproveita a sanitização de nome, a checagem de bytes iniciais e as guardas de caminho de `app/api/upload/route.ts`, extraídas para um apoio comum em `lib/uploads/` em vez de copiadas (refatoração da rota existente, coberta pelos testes atuais dela). A rota lê o corpo com `request.formData()`, que guarda o arquivo inteiro em memória; aceito para 20 MB com poucos envios por dia. Limites em `shared/ativos/documento.schemas.ts`: `MAX_TAMANHO_DOCUMENTO = 20 * 1024 * 1024`, tipos `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.

**Gravar com substituição** (`lib/ativos/documentos/gravar.ts`, `cadastrarDocumento`), sem transação (o Mongo de produção é standalone):

1. Valida tudo (Zod, tipo ativo, alvo existe e, para ativo, não está `baixado`; para local, `isActive`), sem tocar em disco.
2. Lê o `_id` do vigente atual do mesmo tipo e alvo (`anteriorId`, ou nenhum).
3. Gera o `_id` do documento novo e grava o arquivo.
4. Se há `anteriorId`: `updateOne({ _id: anteriorId, situacao: 'vigente' }, { $set: { situacao: 'substituido', substituidoPorId: novoId, substituidoEm: agora } })`. Se não alterou nada, outra gravação já substituiu esse documento: apaga o arquivo e devolve `conflito` (409). Marcar sempre pelo `_id` lido, nunca por `{ tipo, alvo, situacao }`, para quem perde a corrida não marcar o documento que o vencedor acabou de criar.
5. `create` do novo `vigente` (`alertasEnviados` começa vazio). Qualquer erro (chave duplicada, que é a corrida sem anterior, ou validação): desfaz o passo 4 com `updateOne({ _id: anteriorId, substituidoPorId: novoId }, { $set: { situacao: 'vigente' }, $unset: { substituidoPorId: 1, substituidoEm: 1 } })`, apaga o arquivo e devolve `conflito` (409) para chave duplicada ou a mensagem do erro para o resto.
6. Grava `AtivoHistory` pelo `gravarHistoricoOuDesfazer` de `lib/ativos/auditoria.ts` (documento de ativo).

Queda do processo entre os passos 4 e 5 deixa o alvo sem vigente (o anterior aparece como substituído por um `_id` que não existe). É raro e visível (o alvo cai em Faltando); aceito sem rotina de reparo.

Cadastro em ativo `baixado` é recusado ("ativo baixado não recebe documento").

**API surface**:

| Endpoint / ação                                                                                                                                     | Método         | Key inputs                                                                                                                                               | Key outputs                                                                 | Auth                     | Key errors                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| `/api/ativos/documentos`                                                                                                                            | POST multipart | `arquivo`: File (req), `tipo`: string (req), `ativoId` ou `localizacaoId` (um req), `emitidoEm`: date (req), `validadeAte`, `numero`, `emitidoPor` (opt) | `{ ok, id, substituidoId? }` 201                                            | Admin, Preposto          | 400 campos, 403, 404 alvo, 409 corrida, 413, 415 |
| `/api/ativos/documentos/[id]/arquivo`                                                                                                               | GET            | `id`                                                                                                                                                     | arquivo, `Content-Disposition` com `originalName`, `Cache-Control: private` | Admin, Preposto, Técnico | 403, 404 (inexistente ou excluído)               |
| `corrigirDocumentoAction` (`app/(dashboard)/ativos/documentos/actions.ts`)                                                                          | Server Action  | `id`, `numero`, `emitidoPor`, `emitidoEm`, `validadeAte`                                                                                                 | `{ ok }`                                                                    | `requireManager`         | não vigente, validade < emissão                  |
| `excluirDocumentoAction`                                                                                                                            | Server Action  | `id`, `motivo` (req)                                                                                                                                     | `{ ok }`                                                                    | `requireManager`         | já excluído, motivo vazio                        |
| `criarTipoDocumentoAction`, `editarTipoDocumentoAction`, `alternarTipoDocumentoAction` (`app/(dashboard)/configuracoes/tipos-documento/actions.ts`) | Server Action  | `chave`, `nome` / `id`, `nome` / `id`                                                                                                                    | `{ ok }`                                                                    | `requireAdmin`           | chave ou nome repetido, chave inválida           |
| `/api/cron/documentos-vencimento`                                                                                                                   | POST           | header `x-cron-secret`                                                                                                                                   | `{ avaliados, avisados, erros }`                                            | segredo do cron          | 401                                              |

As ações seguem o padrão de Server Action do `AGENTS.md` (`{ ok: false, error }`, nunca lança) e chamam `revalidatePath` da ficha e do painel.

**Value sourcing**:

| Ação                  | Valor                           | Fonte                                                                                                                               |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro              | `cadastradoPorId`               | sessão (`verifySession`)                                                                                                            |
| Cadastro              | tipos aceitos                   | `TipoDocumento` com `isActive: true`                                                                                                |
| Ficha / painel        | situação e dias restantes       | `validadeAte` + data de hoje em America/Belem (`situacaoDoDocumento`)                                                               |
| Ficha                 | documentos herdados             | `ativo.localizacaoId` → ancestrais pelo `parentId` (apoio novo `ancestraisDe` em `lib/ativos/localizacao.ts`)                       |
| Ficha / Faltando      | tipos exigidos                  | `CategoriaAtivo.exigeDocumento` filtrado pelos tipos ativos                                                                         |
| Painel, filtro prédio | prédio de um documento ou ativo | o próprio local ou o ancestral mais próximo com `tipo: 'predio'` (`ancestraisDe`); ativo sem local ou cadeia sem prédio: sem prédio |
| Painel / ficha        | rótulo do alvo                  | `Ativo.codigo` e `descricao`, ou `Localizacao.caminho`                                                                              |
| Job                   | destinatários                   | `User` com `role` em `Admin`, `Preposto` e `isActive: true`                                                                         |
| Job / e-mail          | título e corpo do aviso         | tabela de títulos acima, `TipoDocumento.nome` e os campos do documento                                                              |
| Job / e-mail          | link do aviso                   | `getNotificationUrl` com o `data` acima; o e-mail usa a mesma base de `lib/email/templates.ts` (`AUTH_URL`)                         |
| Job                   | nome do tipo no título          | `TipoDocumento.nome` (inclusive inativo)                                                                                            |
| Correção              | marcas a apagar                 | `alertasEnviados` menos `limitesAlcancados(novaValidade, hoje)`                                                                     |

**Faltando** (`lib/ativos/documentos/faltando.ts`): carrega as categorias com `exigeDocumento` não vazio, os ativos não baixados dessas categorias, os documentos `vigente` dos tipos exigidos e a árvore de locais; cruza em memória (o parque é de centenas de ativos) e pagina o resultado. Sem índice novo.

**Job** (`lib/ativos/documentos/alerta-job.ts`, `processarVencimentos`): busca `situacao: 'vigente'` com `validadeAte` até hoje + 90 dias; descarta documento de ativo `baixado` (AC-14); para cada um calcula os limites alcançados e não marcados; grava com `updateOne({ _id, alertasEnviados: { $nin: novos } }, { $addToSet: { alertasEnviados: { $each: novos } } })`; só se `modifiedCount === 1` cria as `Notification` (`insertMany`) e dispara os e-mails. Se o `insertMany` falhar, desfaz a marca com `$pull: { alertasEnviados: { $in: novos } }`. Queda do processo entre a marca e o `insertMany` perde aquele aviso (os seguintes saem normalmente); aceito, porque a alternativa (enviar antes de marcar) troca a perda por repetição. Erro num documento conta em `erros` e segue para o próximo.

Um documento novo que substitui outro começa sem marcas: se já nasce dentro de um limite, recebe o aviso mais urgente na próxima rodada, como qualquer cadastro (AC-11).

Conteúdo do aviso (`lib/ativos/documentos/aviso.ts`, usado pela notificação e pelo e-mail):

| Limite           | Título                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `90`, `60`, `30` | `<nome do tipo> do <alvo> vence em N dias` (N = dias restantes reais; `vence hoje` quando N = 0) |
| `vencido`        | `<nome do tipo> do <alvo> venceu em DD/MM/AAAA`                                                  |

`<alvo>` é o código do ativo (`MNT-0003`) ou o nome do local (`Prédio Sede`). O corpo traz tipo, alvo completo (código e descrição, ou caminho), número, validade e emissor. `Notification.data`: `{ documentoId, tipo, limite, ativoId?, localizacaoId?, predioId? }`; `getNotificationUrl` leva a `/ativos/<ativoId>` quando há `ativoId`, senão a `/ativos/documentos?predio=<predioId>` (sem prédio, `/ativos/documentos`). E-mail por `lib/email/vencimento-documento.ts` (render com escape de HTML e envio pelo `transporter` existente, mesmas guardas de SMTP ausente e usuário sem e-mail de `send-notification-email.ts`); não passa por `sendNotificationEmail`, que é tipado pelos eventos do socket.

**Crontab**: `0 11 * * * /usr/local/bin/chamar-cron documentos-vencimento` (o container `cron` roda em UTC; 11:00 UTC é 08:00 em Belém, que não tem horário de verão).

**nginx** (`nginx/default.conf`): bloco `location /api/ativos/documentos` antes de `location /`, com o mesmo `proxy_pass` e cabeçalhos, e `client_max_body_size 21M`.

**Telas**:

- `/configuracoes/tipos-documento` (Admin, já coberto pelo `proxy.ts`): lista com chave, nome e ativo, diálogo de criar e editar. Item no menu de Admin perto de Categorias de ativo.
- `/configuracoes/categorias-ativo`: o campo de texto de documentos vira escolha múltipla dos tipos ativos, com o selo "não reconhecido" para valor antigo.
- `/ativos/[id]`: seção Documentos (AC-8), diálogo Novo documento com upload e diálogos Corrigir e Excluir.
- `/ativos/documentos` (página nova, `requireSession` e recusa de Solicitante): abas Documentos e Faltando, filtros em query string, diálogo Novo documento com escolha de ativo (a busca do `SeletorAtivo` existente, sem a restrição de tier, mas ainda sem `baixado`) ou local (a árvore de `listarLocaisAtivos`). Item "Documentos" no grupo de ativos do menu, oculto para Solicitante.

**Key invariants**:

- No máximo um `vigente` por `(tipo, ativoId)` e por `(tipo, localizacaoId)`, garantido pelo índice.
- Exatamente um de `ativoId` e `localizacaoId`.
- Cada limite é avisado no máximo uma vez por documento; só quem grava a marca envia.
- Documento nunca é apagado do banco nem do disco por esta feature.

**Security model**: Escrita (documento) só Admin e Preposto, conferida no servidor em cada rota e ação. Escrita (tipo) só Admin. Leitura de metadado e arquivo: Admin, Preposto e Técnico. Solicitante não lê nada desta parte. O caminho do arquivo é montado do `_id` do documento e do `filename` gravado pelo servidor, nunca de entrada do usuário, com a guarda de caminho atual. O documento não carrega dado pessoal além do nome de quem emitiu (empresa ou responsável técnico), que é dado profissional e já público no próprio laudo.

**Configuration required**: nenhuma variável nova. Usa `CRON_SECRET`, `SMTP_*` e `AUTH_URL` existentes.

**Critical test scenarios**:

- Happy path: Preposto sobe AVCB para o prédio, depois um segundo AVCB; o primeiro vira substituído e a ficha de um ativo do prédio mostra o segundo como herdado. Verifies **AC-3**, **AC-4**, **AC-8**
- Corrida: duas gravações simultâneas do mesmo tipo e alvo no Mongo real, uma vez sem vigente anterior e outra com; nos dois casos uma 201, outra 409, um só vigente, o anterior substituído pelo vencedor e um só arquivo novo em disco. Verifies **AC-4**
- Datas: validade `2026-12-31` lida às 23:30 de 30/12 em Belém conta 1 dia, não 0 nem 2. Verifies **AC-11**
- Job: documento a 20 dias recebe só o aviso de 30 e fica com `['90','60','30']`; segunda rodada não avisa nada; mudar a validade para 100 dias limpa as marcas. Verifies **AC-11**, **AC-13**, **AC-5**
- Job em paralelo (banco real): duas chamadas simultâneas geram uma notificação por gestor, não duas. Verifies **AC-13**
- Ativo baixado: documento não alerta e o ativo não aparece em Faltando. Verifies **AC-14**
- Faltando: categoria exige PMOC e AVCB; ativo com PMOC vencido e AVCB no prédio não aparece em Faltando; outro sem nada aparece duas vezes. Verifies **AC-9**
- Permissão: Técnico baixa, mas recebe recusa ao cadastrar; Solicitante recebe 403 no download e é mandado para `/dashboard` no painel. Verifies **AC-10**
- Upload: PDF de 21 MB recebe 413; arquivo `.pdf` com bytes de executável recebe 415. Verifies **AC-3**, **AC-15**

## Build plan

- **D1. O fio**: modelos `TipoDocumento` e `DocumentoAtivo` com índices, carga dos cinco tipos (seed e script de carga), `situacao.ts`, apoio de upload extraído para `lib/uploads/`, `POST /api/ativos/documentos` só para ativo, download, seção Documentos na ficha com Novo documento, bloco do nginx. Satisfies **AC-1** (carga), **AC-3**, **AC-8** (documentos do próprio ativo), **AC-10**, **AC-15**
- **D2. Substituição, correção e exclusão**: passos 3 e 4 com o desfazer, ações Corrigir e Excluir, ações novas de `AtivoHistory`, bloco de substituídos na ficha. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**
- **D3. Documento de local e herança**: alvo `localizacaoId`, `ancestraisDe`, documentos herdados na ficha. Satisfies **AC-3**, **AC-8**
- **D4. Tipos e exigência**: `/configuracoes/tipos-documento`, escolha múltipla em categorias com o selo de valor antigo, lista do que falta na ficha. Satisfies **AC-1**, **AC-2**, **AC-8**
- **D5. Painel**: `/ativos/documentos` com as duas abas, filtros, Novo documento com escolha de alvo, item no menu. Satisfies **AC-9**, **AC-10**
- **D6. Alerta**: `processarVencimentos`, rota do cron, linha no crontab, tipo `documento:vencimento` no modelo e no sino, e-mail. Satisfies **AC-11**, **AC-12**, **AC-13**, **AC-14**
- **Testes de banco real** (junto de cada passo): índice único parcial e corrida (D2), marca condicional em paralelo (D6). Satisfies **AC-4**, **AC-13**

## Rationale (short)

Coleção própria em vez de reaproveitar `Attachment`: o anexo é preso a chamado (`chamadoId` obrigatório, 20 por chamado, 5 MB) e não tem validade nem ciclo de substituição. O disco local em vez de MinIO: os anexos já vivem lá com backup, e o volume é de dezenas de PDFs por ano. A marca por limite em `alertasEnviados` em vez de comparar com "ontem": o job pode falhar um dia inteiro e o aviso sai no dia seguinte, sem perder nem repetir. O raciocínio completo está em [rationale.md](rationale.md).
