# Verify: Importador SICAM e vistoria em campo · spec 0012 · updated 2026-10-02

_Passos tirados dos critérios de aceite da spec 0012. O `/check verify` roda estes passos; o `/test` transforma os que duram em teste. Esta primeira leva cobre o marco "Vistoria, o fio e sem sinal" (V1 e V2)._

## UI / manual

- [ ] Como Preposto, abrir `/ativos/vistoria` sem campanha → ver "Nenhuma campanha aberta" e o formulário; abrir "Vistoria inicial" → a campanha aparece como Aberta → AC-1
- [ ] Com uma campanha aberta, chamar `abrirCampanhaAction` com outro nome → "Já existe uma campanha aberta: Vistoria inicial" → AC-1
- [x] "Encerrar campanha" → confirmação → a página mostra "Última campanha", Encerrada, com a hora; no banco, `encerradaPor` e `encerradaEm` preenchidos; não há botão para reabrir → AC-1
- [x] Como Técnico, abrir `/ativos/vistoria` sem campanha → "Nenhuma campanha aberta", sem formulário → AC-1, permissões
- [x] Abrir `/ativos/vistoria/campo` com sinal → mostra o nome da campanha, "Pacote baixado em <hora>" e "Atualizar pacote"; sem campanha aberta → "Nenhuma campanha aberta" → AC-3
- [x] Na resposta de `GET /api/vistoria/pacote` (DevTools), nenhum `camposPatrimoniais` nem nome de responsável → AC-3
- [x] Escolher prédio e sala → a lista "Esperados em <sala>" mostra os ativos com aquele local; digitar `0011997` acha `11997`; o formulário abre com fabricante, modelo e série atuais → AC-4
- [x] Mudar só o modelo e confirmar → no corpo do POST de sincronização vai só `modelo` (sem fabricante nem série) → AC-4
- [x] Ativo com `camposPatrimoniais.ausenteNoSicamDesde` mostra o selo "Ausente do SICAM" na lista e no formulário → AC-4
- [x] Depois de confirmar com sinal: o item fica "Enviado" e riscado; no banco o ativo tem o local escolhido, o modelo novo, `statusCadastro: validado` e o histórico tem `conferencia` (com o nome da campanha e "Campos alterados: modelo"), `alteracao_localizacao` e `validacao` → AC-5
- [x] Confirmar com a série em branco → a série do ativo continua a mesma → AC-5
- [x] Ficar sem sinal (DevTools offline), conferir dois ativos → "2 pendentes de envio" e cada item "Aguardando envio"; recarregar a página com sinal → a fila continua lá; voltar o sinal → os dois viram "Enviado" sem tocar em nada → AC-6
- [x] Bloquear a rota de sincronização e tocar "Sincronizar" → os itens continuam pendentes; com a sessão expirada (apagar o cookie) → "Entre de novo para enviar." → AC-6
- [x] Conferir de novo, com outra pessoa, um ativo já conferido na campanha → "Já conferido" com "Já conferido por <nome> em <data e hora>" e "Você informou: …"; o ativo não muda → AC-8
- [x] Logado como Técnico com uma conferência pendente, entrar no mesmo navegador como Preposto → a fila do Técnico não aparece nem sobe; voltar como Técnico → a fila continua → AC-15
- [x] Com uma pendente, tocar "Sair" → aviso "1 conferência da vistoria ainda não subiu"; "Sair mesmo assim" → depois do login, o pacote foi baixado de novo (o antigo foi apagado) e a pendente continua → AC-15
- [x] Como Solicitante, abrir `/ativos/vistoria` e `/ativos/vistoria/campo` → redireciona para `/dashboard`; o menu não mostra "Vistoria" → permissões

## Commands

- [x] `MONGO_TEST_URI=mongodb://127.0.0.1:27017/severino_test npx vitest run lib/vistoria` → 16 testes passam (uma campanha aberta, reenvio, queda, corrida, encerrada, recusas, lote misto) → AC-1, AC-5, AC-7, AC-8, AC-9, AC-10, AC-6
- [x] `npx vitest run lib/vistoria-offline app/api/vistoria` → fila por usuário, ordem e lotes de 50, 401, rede caída, e 401/403/409/400 das rotas → AC-3, AC-6, AC-15, permissões
- [x] `npx npm@11.19.0 ci --dry-run --ignore-scripts --os=linux --cpu=x64 --libc=musl` → passa (o lock manteve as cópias do `@emnapi`) → configuração

## Value sourcing

- [x] `autorId` vem da sessão: mandar no corpo um `autorId` de outra pessoa não muda nada; a conferência fica com o usuário logado → conferência `autorId`
- [x] `papelAutor`: conferir como Técnico grava `contratada`; como Preposto, `servidor` → conferência `papelAutor`
- [x] `conferidoEm`: adiantar o relógio do aparelho um dia → no banco `conferidoEm` igual a `recebidoEm` → conferência `conferidoEm`, AC-9
- [x] `ausenteNoSicam` no pacote: só `true` quando existe `camposPatrimoniais.ausenteNoSicamDesde`, e a data não vai → pacote `ausenteNoSicam`
- [x] `conferidos[].autorNome`: o nome no pacote é o `User.name` de quem conferiu → pacote `autorNome`
- [x] Quantidade no aviso ao sair conta só as pendentes do usuário atual → aviso ao sair, AC-15

## Última verificação

`/check verify` em 02/10/2026, marco V1 e V2: todos os passos marcados rodaram e passaram. Dois ficaram sem marcar: o estado "nunca houve campanha" (o banco local já tinha campanhas, então não deu para ver a tela vazia da gestão nesta rodada) e a chamada direta de `abrirCampanhaAction` com campanha aberta (a mensagem exata está provada pelo teste de banco do comando 1, não pela action).

## Acceptance-criteria coverage

- AC-1: campanha (UI 1 a 4, comando 1) · AC-3: pacote (UI 5 e 6, comando 2) · AC-4: código, formulário, selo (UI 7 a 9) · AC-5: efeito no ativo (UI 10 e 11, comando 1) · AC-6: fila e sincronização (UI 12 e 13, comandos 1 e 2) · AC-7: reenvio (comando 1) · AC-8: primeira que chega (UI 14, comando 1) · AC-9: encerrada e relógio (comando 1, value sourcing) · AC-10: recusas (comando 1) · AC-15: fila por usuário e saída (UI 15 e 16, comando 2) · permissões (UI 4 e 17, comando 2)
- Ainda sem passos (próximos marcos): AC-2, AC-11 a AC-14, AC-16 a AC-27

## Marco "Vistoria, cadastro em campo e cobertura" (V3 e V4) · 02/10/2026

### UI / manual

- [x] Como Preposto, em `/ativos/vistoria` com campanha aberta → cada prédio mostra "N de M" e o percentual com a barra; à parte, o bloco "vistoriáveis sem local" → AC-2
- [x] Conferir em campo um ativo sem local numa sala → a cobertura do prédio sobe 1 e o "sem local" desce 1 → AC-2
- [x] Mudar para `baixado` um ativo já conferido → ele sai do total e dos conferidos do prédio; o percentual nunca passa de 100% → AC-2
- [ ] Encerrar a campanha → a página continua mostrando a cobertura da última encerrada; como Técnico sem nenhuma campanha → "Nenhuma campanha aberta" → AC-2
- [x] Em campo, digitar um tombo que não está no pacote → aviso com "Cadastrar aqui"; o formulário abre como Patrimoniado com o tombo preenchido, Tier A marcado → AC-11
- [x] Digitar um código `MNT-` que não está no pacote → explica que pode estar baixado ou fora dos tiers, sem "Cadastrar aqui" → AC-11
- [x] "Cadastrar sem tombo" com sinal → o item aparece na sala riscado com o `MNT-####` definitivo e o painel mostra "Etiquete como MNT-####" → AC-11, AC-12
- [x] Sem sinal (DevTools offline), "Cadastrar sem tombo" → o item aparece com `PROV-` mais 6 caracteres e "Aguardando envio"; ao voltar o sinal, o código troca pelo `MNT-` e aparece "Etiquete como" → AC-12
- [x] Ler de novo o mesmo código (o `PROV-` ou o `MNT-`) → abre o item da fila, não oferece outro cadastro → AC-11
- [x] No banco, o ativo novo tem `statusCadastro: validado`, `validadoPor` de quem cadastrou, `status: em_operacao`, a criticidade padrão da categoria, `origemOpId`, o histórico `cadastro` ("Cadastro em campo: <campanha>") e a conferência com `cadastradoEmCampo: true`; nenhum `PROV-` no banco → AC-11, AC-12
- [x] Desativar a categoria depois de baixar o pacote e cadastrar com ela → "Recusado: Categoria inexistente ou desativada." → AC-11
- [x] Cadastrar como patrimoniado um tombo que o servidor já tem (fora do pacote do aparelho) → "Enviado" com "O ativo <código> já existia; registrado como conferência"; nenhum ativo novo → AC-13
- [x] Como Preposto com sinal, "Criar local abaixo de <local>" → o novo local aparece na lista e já fica escolhido, sem atualizar o pacote → AC-14
- [x] Sem sinal, o botão some e aparece a orientação de escolher o local mais próximo; como Técnico, o botão nunca aparece → AC-14
- [x] Ficha de um ativo conferido → "Última vistoria: <campanha>: <nome> (Servidor ou Contratada), <hora do aparelho>", para os quatro perfis → permissões
- [ ] Em HTTPS ou localhost, o botão "Câmera" aparece na tela de campo e a leitura cai no mesmo caminho do código digitado; em HTTP ele não aparece → AC-4

### Commands

- [x] `MONGO_TEST_URI=mongodb://127.0.0.1:27017/severino_test npx vitest run lib/vistoria` → 24 testes passam (inclui cadastro interno, reenvio sem gastar MNT, queda depois de criar o ativo, tombo existente vira conferência, recusas do cadastro e cobertura) → AC-2, AC-7, AC-11, AC-12, AC-13
- [x] `npx vitest run "app/(dashboard)/ativos/ler"` → a leitura de etiqueta continua passando com a câmera no gancho compartilhado → AC-4

### Value sourcing

- [x] Cobertura, total por prédio: ativo Tier C ou `baixado` dentro do prédio não conta; ativo num local desativado abaixo do prédio conta → cobertura total
- [x] Cobertura, conferidos: conferência de ativo que mudou de prédio conta só no prédio novo, se ele estiver lá hoje → cobertura conferidos
- [ ] Cobertura, qual campanha: com uma aberta mostra a aberta; sem ela, a de maior `encerradaEm` → cobertura campanha
- [x] Cadastro, `codigo`: tombo `0042` grava `42`; interno usa o próximo `MNT-` do contador → cadastro `codigo`
- [x] Cadastro, `criticidade`: igual à `criticidadePadrao` da categoria escolhida → cadastro `criticidade`
- [x] Código provisório: só no aparelho; o corpo do POST de sincronização não leva `PROV-` → código provisório
- [ ] Ficha, última conferência: com duas campanhas, mostra a de `conferidoEm` mais recente, com o nome de quem conferiu e o papel → ficha última conferência

### Coverage

- AC-2: UI 1 a 4, comando 1 · AC-11: UI 5, 6, 7, 9, 10, 11 · AC-12: UI 7, 8, 10 · AC-13: UI 12, comando 1 · AC-14: UI 13, 14 · AC-4 (câmera): UI 16 · permissões (ficha): UI 15
- Ainda sem passos: AC-16 (operação) e AC-17 a AC-27 (importador)

### Última verificação deste marco

`/check verify` em 02/10/2026, marco V3 e V4: todos os passos marcados rodaram e passaram, com o app de pé e o banco de desenvolvimento conferido. Ficaram sem marcar:

- A cobertura com campanha encerrada e o Técnico sem nenhuma campanha (UI 4) e "qual campanha" na origem dos valores: o banco local só tem a campanha aberta "Vistoria inicial", e encerrar é sem volta.
- A câmera (UI 16): o botão aparece em localhost e some em HTTP pelo IP, mas a leitura em si precisa de uma câmera, que esta máquina não tem.
- A ficha com duas campanhas (origem dos valores): só existe uma campanha no banco local.

Dados de teste que ficaram no banco de desenvolvimento: os ativos `MNT-0031` e `99887766` (este com a descrição "VERIF CHECK 0012 SERVIDOR"), o local "Verif armário 0012" e as conferências deles na "Vistoria inicial".

## Marco "Importador" (I1 a I4) · 02/10/2026

_Passos dos critérios AC-17 a AC-27. Use um CSV fictício em cp1252 (o export real tem nome e matrícula). `e2e/importador-sicam.spec.ts` já roda o fio feliz e a barreira do Preposto._

### UI / manual

- [x] Como Admin, `/ativos` mostra "Importar SICAM"; `/ativos/importar` mostra o envio e a lista de importações → AC-17, AC-25
- [x] Enviar um CSV sem a coluna `Nome Setor` → "O arquivo não parece um export do SICAM: falta a coluna Nome Setor" → AC-17
- [x] Enviar um arquivo de 11 MB → "Arquivo maior que 10 MB" (a tela recusa antes; a rota devolve 413) → AC-17
- [x] Enviar um CSV com uma linha cuja descrição tem `;` e outra com campos a menos → a revisão mostra "Linhas reparadas 2", e a descrição aparece inteira, com o `;` → AC-18
- [x] Linha com `Data Tombo` `31-FEV-20` e `Valor Histórico` `abc` → "Valores ilegíveis 2", e a linha entra assim mesmo → AC-18
- [x] Linha de picape com "AR CONDICIONADO" na descrição não vira novo; "SUPORTE PARA SPLIT" também não; bebedouro vira novo Tier B → AC-19
- [x] A revisão mostra as nove contagens; novos e alterados começam marcados, sumidos desmarcados; "Marcar todos" marca e desmarca o grupo → AC-22
- [x] Novo de forno elétrico sem a categoria `copa_coccao` cadastrada chega desmarcado com "Categoria copa_coccao não cadastrada"; escolher outra categoria marca a linha → AC-22
- [x] Alterado mostra cada campo que mudou com o valor riscado de antes e o de depois; o ausente que voltou mostra "Retornou" → AC-20, AC-22
- [x] Com mais de 20% dos patrimoniados fora do arquivo, aparece "Muitos sumidos: o arquivo pode estar incompleto", e Aplicar com um sumido marcado pede "Conferi, aplicar" → AC-22
- [x] Aplicar → a tela vira "Resultado da importação", com aplicados e não aplicados por grupo e o motivo de cada pulo → AC-23, AC-24, AC-25
- [x] O novo aparece em `/ativos` sem local, `Importado`, com a criticidade padrão da categoria; a ficha mostra o histórico "Cadastro, Importação SICAM" → AC-23
- [x] Ativo alterado com local, fabricante e status editados antes: depois de aplicar, só os campos do bloco Patrimônio mudaram; o histórico diz "Dados do SICAM atualizados" com os nomes dos campos, sem nome de pessoa → AC-23
- [x] Ficha do sumido marcado: "Ausente do SICAM desde <data>" para Admin e Preposto; Técnico e Solicitante não veem o bloco → AC-26
- [x] Com uma pendente aberta, enviar outro arquivo → "Existe uma importação pendente de <data>, enviada por <nome>"; "Descartar a pendente e continuar" abre a nova, e a anterior aparece como Descartada na lista → AC-21
- [x] Clicar Aplicar em duas abas ao mesmo tempo → cada novo existe uma vez em `/ativos` e cada ativo tem um histórico só da importação → AC-24
- [x] Depois de aplicar e de descartar, no banco, os itens da importação não têm `descricao`, `camposAlterados`, `dados` nem `local`, e `emAberto` sumiu → AC-25
- [x] Como Preposto, Técnico e Solicitante, abrir `/ativos/importar` → vai para `/dashboard` → AC-27

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/ativos app/api/ativos "app/(dashboard)/ativos/importar" __tests__/proxy.test.ts` → tudo verde, inclusive os 15 de banco real de `importacao.db.test.ts` → AC-17 a AC-25, AC-27
- [x] `npx playwright test e2e/importador-sicam.spec.ts` → 2 passed → AC-17, AC-20, AC-22, AC-23, AC-26, AC-27

### Value sourcing

- [x] Texto do arquivo: enviar um CSV salvo em UTF-8 → acentos saem errados (prova que a leitura é cp1252); o mesmo salvo em cp1252 → corretos → AC-17
- [x] Colunas e mapeamento: trocar a ordem das colunas no cabeçalho → mesmo resultado → AC-17
- [x] Campos esperados: o número vem do cabeçalho; um cabeçalho com uma coluna extra no fim não marca toda linha como reparada → AC-18
- [x] Tier e categoria sugerida: mudar a descrição de "SPLIT" para "PICAPE COM AR CONDICIONADO" tira o item dos novos → AC-19
- [x] Bloqueio: cadastrar a categoria `copa_coccao` depois do upload e recarregar a revisão → o aviso some e a categoria já vem escolhida → AC-22
- [x] Grupo: ativo `interno` (`MNT-`) e patrimoniado cadastrado em campo sem `importadoEm` nunca aparecem como sumidos → AC-20
- [x] Continuam ausentes: um ativo já marcado que segue fora do arquivo soma em "Continuam ausentes" e não vira item → AC-20
- [ ] Aviso de muitos sumidos: base são só os patrimoniados com `importadoEm`; um patrimoniado sem ela não muda o percentual → AC-22
- [x] Local do sumido: ativo com local mostra o caminho; sem local, "sem local" → AC-22
- [x] Nome de quem subiu a pendente: o aviso do segundo upload traz o `name` do Admin que enviou a primeira → AC-21
- [x] Categoria e criticidade do novo: escolher outra categoria na revisão → o ativo nasce com ela e com a criticidade padrão dela → AC-23
- [x] Valores de antes: mudar um campo do ativo pelo banco entre a revisão e o Aplicar → o item é pulado com "O ativo mudou depois da revisão" → AC-24
- [x] `importadoEm` e `ausenteNoSicamDesde`: ficam com a hora do clique em Aplicar → AC-23
- [x] Autor do histórico: o Admin da sessão, `actorType: 'usuario'` → AC-23

### Acceptance-criteria coverage (importador)

- AC-17: envio, cabeçalho, 10 MB, cp1252 · AC-18: reparo, filtro, duplicados, datas e números · AC-19: classificação · AC-20: grupos e casos de borda · AC-21: pendente existente · AC-22: revisão, padrões, bloqueio, muitos sumidos · AC-23: aplicação por caminho · AC-24: repetição e corrida · AC-25: enxugamento e lista · AC-26: aviso na ficha · AC-27: permissões
- Ainda sem passos: AC-16 (operação)

### Última verificação deste marco

`/check verify` em 02/10/2026, marco do importador: todos os passos marcados rodaram e passaram com o app de pé (`npm run dev`), um roteiro Playwright e consultas ao banco de desenvolvimento (43 de 43 comportamentos). Notas:

- Origem do texto do arquivo: o mesmo CSV salvo em UTF-8 é recusado logo no cabeçalho ("falta a coluna Número Tombo"), porque `Número` lido como cp1252 vira outro texto. Em cp1252, a lotação `SEÇÃO FICTÍCIA` chega igual à do banco e não aparece como alterada. Isso prova a leitura em cp1252, só que de um jeito diferente do previsto no passo.
- Ficou sem marcar a base do aviso de muitos sumidos (patrimoniado sem `importadoEm` não muda o percentual). O aviso apareceu ("11 sumidos de 17 vistos"), mas a tela não mostra o percentual, então não deu para ver a base mudar. O teste de banco cobre a regra.
- O console teve um aviso de hydration no campo de arquivo (`style="caret-color: transparent"` a mais). O código não tem `caret-color`, e o aviso não se repete abrindo a página sozinha. Parece vir da ferramenta de teste mexendo no DOM antes da hidratação.

Dados de teste que ficaram no banco de desenvolvimento: os ativos `990201` a `990218` e `990301` (descrições "SPLIT VERIF"), as categorias `climatizacao` (Climatização) e `copa_refrigeracao` (Copa refrigeração (verif)), e as importações `SICAM-VERIF.CSV`, `reordenado.csv`, `segundo.csv` e `descartar.csv`.

## Marco "Operação" (V6) · em produção, depois do deploy

_AC-16 é operacional: não tem código novo, é conferido no banco de produção. Criticidade escolhida pelo Admin em 02/10/2026: elevador crítica, SPDA alta, copa (refrigeração e cocção) baixa._

### UI / manual (em produção)

- [x] Como Admin, em `/configuracoes/categorias-ativo`, criar: chave `elevador`, nome "Elevador", criticidade Crítica; chave `spda`, nome "SPDA (para-raios)", criticidade Alta; chave `copa_refrigeracao`, nome "Copa: refrigeração", criticidade Baixa; chave `copa_coccao`, nome "Copa: cocção", criticidade Baixa → AC-16
- [x] Como Preposto ou Admin, abrir a campanha "Vistoria inicial" em `/ativos/vistoria` (se ainda não existir) → AC-16
- [x] Em campo, pelo celular, "Cadastrar sem tombo" em cada elevador (categoria Elevador), QGBT (categoria Transformador, `energia_transformador`), SPDA (categoria SPDA) e hidrante (categoria Combate a incêndio), cada um na sala ou área técnica onde está; etiquetar com o `MNT-####` que a tela mostra → AC-16

### Commands

- [x] Na VPS: `sudo docker exec -i severino-mongodb-1 mongosh manutencao --quiet < ~/conferir-ac16.js` (depois de copiar `scripts/conferir-ac16.js` com `scp`) → termina com "AC-16: tudo certo." e lista os MNT com local e "conferido" → AC-16

### Última verificação deste marco

`/check verify` em 02/10/2026, em produção: "AC-16: tudo certo." A conferência rodou só lendo, pelo `scripts/conferir-ac16.js`, através de um túnel SSH até o Mongo da VPS (o `sudo docker exec` pede senha e o prompt `!` não tinha terminal). Resultado:

- Categorias: `elevador` (Crítica), `spda` (Alta), `copa_refrigeracao` (Baixa) e `copa_coccao` (Baixa), todas ativas.
- Campanha aberta como "Vistoria Inicial" (com I maiúsculo; o script passou a aceitar o nome sem diferenciar maiúsculas, PR #40).
- `MNT-0001` elevador, `MNT-0002` QGBT, `MNT-0003` SPDA e `MNT-0004` hidrante: `validado`, Tier A, com local e conferidos na campanha; nenhum `PROV-` no banco; 4 conferências.

Pendências que não travam o AC: os quatro estão com local "Sede" (o prédio), e vale conferir de novo cada um na sala ou área técnica; a descrição do `MNT-0004` tem um erro de digitação ("Hidratante 2ª andar").
