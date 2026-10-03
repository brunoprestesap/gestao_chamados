# Verify: Documentos do ativo e preventiva por categoria · spec 0013 · updated 2026-10-03

_Passos tirados dos critérios de aceite da spec 0013. O `/check verify` roda estes passos; o `/test` trava os que valem manter. Recomendação: rode num banco descartável, com a carga dos tipos (`scripts/carga-tipos-documento.js`) e um Admin, um Preposto, um Técnico e um Solicitante._

## UI / manual

### Documentos

- [x] Admin em `/configuracoes/tipos-documento`: os cinco tipos da carga aparecem; criar `laudo_eletrico` / "Laudo elétrico"; tentar criar de novo a mesma chave ou o mesmo nome (com outra caixa) → recusa em português; renomear muda só o nome; a chave fica só leitura → AC-1
- [x] Desativar "Garantia" → some do Novo documento e das escolhas da categoria; um documento de garantia já cadastrado continua na ficha e no painel → AC-1
- [x] Em `/configuracoes/categorias-ativo`, editar uma categoria: os tipos ativos aparecem como caixas de marcar; uma categoria com valor antigo em texto (gravado direto no banco, ex.: `"Laudo velho"`) mostra o selo "não reconhecido"; salvar de novo remove o valor; chave de tipo desativado continua gravada com o selo "desativado" → AC-2
- [x] Preposto, na ficha de um ativo, Novo documento: PDF de 1 MB com emissão e validade → aparece em Documentos com a situação calculada e o link para baixar → AC-3, AC-8
- [x] Mesmo diálogo: arquivo de 21 MB → a tela recusa antes de enviar com a mensagem de 20 MB; validade anterior à emissão → recusa; arquivo `.pdf` com bytes de executável → recusa com 415 e nada gravado → AC-3, AC-15
- [x] Ficha de ativo `baixado` → sem botão Novo documento; `POST /api/ativos/documentos` com o `ativoId` dele → 400 "Ativo baixado não recebe documento." → AC-3
- [x] Cadastrar um segundo PMOC no mesmo ativo → o primeiro vai para "Substituídos" (bloco recolhido) com a data; a linha do tempo do cadastro mostra "Documento substituído: PMOC" → AC-4, AC-7
- [x] Corrigir o vigente: mudar número e validade → salva; o arquivo não muda; a linha do tempo mostra "Documento corrigido" → AC-5, AC-7
- [x] Excluir o vigente: o diálogo avisa que o anterior não volta e que o tipo pode passar a faltar; motivo vazio desabilita Excluir; com motivo → some da ficha e do painel; a linha do tempo mostra "Documento excluído" com o motivo; `GET` do arquivo dele → 404 → AC-6, AC-7, AC-10
- [x] No painel, Novo documento → "Um local" → AVCB no prédio; a ficha de um ativo numa sala desse prédio mostra o AVCB em "Dos locais acima", com o nome do prédio, sem botões de correção → AC-3, AC-8
- [x] Categoria exige PMOC e AVCB; ativo com PMOC vencido e AVCB herdado do prédio → ficha sem "Faltando"; outro ativo da categoria sem nada → "Faltando: AVCB, PMOC" (se o AVCB estiver no prédio dele, só PMOC) → AC-8, AC-9
- [x] `/ativos/documentos` aba Documentos: ordenados pela validade, sem validade por último, 50 por página; filtros de tipo, situação ("vence em até 30" inclui hoje e o dia 30) e prédio; documento de ativo mostra o código com link para a ficha, documento de local mostra o caminho → AC-9
- [x] Aba Faltando: um par por (ativo, tipo); ordenado pelo prédio e pelo código; ativo baixado não aparece; ativo sem local aparece só com o filtro de prédio vazio → AC-9, AC-14
- [x] Técnico: vê a seção Documentos e o painel, baixa o arquivo, não vê Novo documento, Corrigir nem Excluir; chamar `corrigirDocumentoAction` ou o `POST` como Técnico → recusa no servidor → AC-8, AC-10
- [x] Solicitante: o menu não tem "Documentos"; `/ativos/documentos` manda para `/dashboard`; a ficha não tem a seção; `GET /api/ativos/documentos/<id>/arquivo` → 403 → AC-10

### Preventiva

- [x] Preposto em `/gestao/recurring`, Novo agendamento, escopo "Por categoria de ativo": escolher uma categoria com subtipo e periodicidade → o tipo de serviço, o subtipo e "a cada N dias" vêm preenchidos e continuam editáveis; prioridade vem BAIXA; local é opcional → AC-16
- [x] Salvar sem categoria → mensagem "Selecione a categoria de ativo" → AC-16
- [x] Editar o modelo: o escopo aparece travado; a lista mostra o selo do escopo, a categoria e o local (ou "todos os locais") → AC-16
- [x] Rodar o cron (passo de comando abaixo) com a categoria tendo 3 ativos Tier A em operação, 1 inoperante e 1 Tier B → 3 chamados `validado` na fila da gestão, prontos para atribuir, cada um com prazo de SLA, título `<título> · <código>`, local exato igual ao caminho do local do ativo e a unidade do modelo; aparecem na ficha de cada ativo → AC-17, AC-18, AC-19, AC-25
- [x] O sino de Admin e Preposto mostra um aviso só, "Preventiva <nome>: 3 gerados, 0 pulados", que leva a `/gestao/recurring`; a lista mostra "Último lote: 3 gerados, 0 pulados" → AC-21
- [x] Deixar uma preventiva `em atendimento`, voltar o `nextRunAt` para o passado e rodar de novo → aquele ativo é pulado ("1 pulados") → AC-20
- [x] Desativar a categoria e rodar → o modelo fica Inativo, o lote diz "pausado, categoria desativada" e o sino mostra "Preventiva <nome> pausada: categoria desativada" → AC-23
- [x] Um modelo "Chamado único" continua gerando um chamado `aberto` com aviso de novo chamado, como antes → AC-24

## Commands

- [x] `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/documentos-vencimento` com um documento a 20 dias de vencer → `{ avaliados: 1, avisados: 1, erros: 0 }`; cada Admin e Preposto ativo recebe "PMOC do MNT-xxxx vence em 20 dias"; no banco `alertasEnviados` fica `['30','60','90']` → AC-11, AC-12
- [x] Rodar o mesmo comando de novo → `avisados: 0`, nenhuma notificação nova → AC-13
- [x] Sem o header, ou com `CRON_SECRET` vazio → 401 → AC-11
- [x] Documento de local vencido → aviso "AVCB do <prédio> venceu em DD/MM/AAAA", que no sino leva a `/ativos/documentos?predio=<id>`; com SMTP configurado, chega e-mail com o mesmo título no assunto → AC-12
- [x] Mudar a validade desse documento para daqui a 100 dias pela correção → `alertasEnviados` volta a `[]` → AC-5
- [x] Ativo baixado com documento vencido → o job não avisa → AC-14
- [x] `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/recurring-tickets` → os `details` trazem `LOTE: <nome> → N gerados, M pulados, ...` → AC-17, AC-21
- [x] Duas chamadas simultâneas do comando acima com o modelo vencido → um lote só (contar chamados por `originTemplateId`) → AC-22
- [x] Modelo com `nextRunAt` três períodos no passado → um lote só e `nextRunAt` novo no futuro → AC-22
- [x] Na VPS, depois do deploy: `docker exec severino-cron-1 crontab -l` mostra a linha `0 11 * * * ... documentos-vencimento` junto das outras três → AC-11
- [x] Na VPS: `curl -s -o /dev/null -w '%{http_code}'` com um PDF de 15 MB para `/api/ativos/documentos` passa pelo nginx (sem 413 do nginx); um de 22 MB recebe 413 do nginx → AC-15
- [x] `MONGO_TEST_URI=mongodb://127.0.0.1:27018/severino_test npx vitest run lib/ativos/documentos lib/chamados/__tests__/preventiva-categoria.db.test.ts` → todos passam (corrida de gravação, job em paralelo, reserva do lote) → AC-4, AC-13, AC-22

## Pendente depois do deploy

O engenheiro aceitou em 03/10/2026 fechar a verificação sem os dois passos da VPS (crontab do container `cron` e limite de 21M do nginx em `/api/ativos/documentos`). A parte da tela e da rota do AC-15 foi provada localmente. Recomendo rodar os dois passos logo depois do primeiro deploy e marcá-los aqui.

Feito em 03/10/2026, depois do deploy de `d1be57f`: o crontab mostra a linha das 11:00 UTC; 15 MB passa pelo nginx (401 do Next, sem sessão) e 22 MB recebe 413 do nginx. O nginx só pegou o limite novo depois de `docker compose up -d --force-recreate nginx`, porque o deploy não recria esse container.

## Value sourcing

- [x] `cadastradoPorId` do documento é o usuário da sessão (conferir no banco depois de cadastrar como Preposto) → Value sourcing
- [x] Os tipos aceitos no cadastro são só os ativos: desativar AVCB e tentar cadastrar AVCB pelo `POST` → 400 → Value sourcing
- [ ] Dias restantes usam o dia de Belém: com validade de amanhã, abrir a ficha às 22:00 de Belém (01:00 UTC do dia seguinte) → "Vence em 1 dia", não "Vence hoje" → Value sourcing
- [x] Herança sobe pelo `parentId`: mover a sala do ativo para outro prédio e reabrir a ficha → o AVCB herdado passa a ser o do novo prédio → Value sourcing
- [x] Tipos exigidos filtrados pelos ativos: desativar PMOC → some de "Faltando" na ficha e no painel → Value sourcing
- [x] Prédio do ativo é o ancestral `predio` mais próximo: ativo numa área técnica dentro de um andar → o filtro de prédio do painel acha o documento dele → Value sourcing
- [x] Rótulo do alvo: documento de ativo mostra o código e a descrição; de local, o caminho → Value sourcing
- [x] Destinatários do aviso: um Admin inativo não recebe notificação de vencimento nem de lote → Value sourcing
- [x] Nome do tipo no título vem do `TipoDocumento`, inclusive inativo: renomear o tipo antes de rodar o job → o título usa o nome novo → Value sourcing
- [x] Preventiva: subtipo e intervalo sugeridos vêm da categoria; trocar o subtipo da categoria e reabrir o diálogo → a nova sugestão aparece → Value sourcing
- [x] Preventiva: `unitId` do chamado é o do modelo, mesmo com o local do ativo tendo outra unidade → Value sourcing
- [x] Preventiva: `attendanceNature` segue a natureza do modelo (modelo "Urgente" → `URGENTE`) → Value sourcing
- [x] Preventiva: `classifiedByUserId` vazio e histórico com `actorType: 'sistema'` → Value sourcing

## Acceptance-criteria coverage

- AC-1 tipos e carga · AC-2 exigência na categoria · AC-3 cadastro e recusas · AC-4 substituição e corrida · AC-5 correção limpa marcas · AC-6 exclusão · AC-7 histórico · AC-8 seção na ficha · AC-9 painel e Faltando · AC-10 permissões · AC-11 job diário · AC-12 aviso e e-mail · AC-13 sem repetição · AC-14 baixado · AC-15 tamanho no nginx e na rota
- AC-16 escopo na tela · AC-17 elegíveis e recorte · AC-18 campos do chamado · AC-19 validado com SLA ou aberto sem SLA · AC-20 pulados · AC-21 lote e aviso · AC-22 reserva e atraso · AC-23 erros e pausa · AC-24 regressão do chamado único · AC-25 ficha e fila da gestão
