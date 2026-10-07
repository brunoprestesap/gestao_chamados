# Verify: Aviso de chamado duplicado · spec 0017 · updated 2026-10-07 · verificado em 2026-10-07

_Passos tirados dos critérios de aceite da spec 0017. O `/check verify` roda estes passos; o `/test` trava os que valem para sempre._

## UI / manual

Preparação sugerida: dois solicitantes da mesma unidade (A e B), um de outra unidade (C), um técnico e um Preposto. Um serviço de ar condicionado no catálogo e um ativo Tier A dele com código conhecido.

### Busca e cartão

- [x] A abre pelo chat "o ar da sala 205 norte pinga" e confirma. B, na mesma unidade, relata "ar condicionado da sala 205 vazando" → o cartão de B mostra "Parece que já existe um chamado para isso" com uma linha "#número · serviço · sala 205 norte · status · aberto hoje" e o botão "Acompanhar este" → AC-2, AC-6, AC-7
- [x] Na mesma linha, confira que não aparece nome, matrícula, unidade, descrição, prioridade nem técnico do chamado de A (inspecione também o payload do quadro `cartao` na aba Rede) → AC-6
- [x] B relata o mesmo serviço na mesma unidade, mas "sala 101", contra o chamado de A na "sala 305" → cartão sem aviso → AC-2, AC-3
- [x] C (outra unidade) cita o código do ativo do chamado de A no relato → o aviso aparece pelo ramo do equipamento, com o local vazio (`localExato: null`) → AC-1, AC-6
- [x] Cartão em modo manual (sem IA ou serviço não reconhecido) com o código do ativo digitado → aviso aparece; sem código → sem aviso → AC-1, AC-3
- [x] Ativo sugerido pela regra com 3 candidatos → sem aviso pelo ramo do equipamento; com 1 candidato → aviso aparece → AC-1
- [x] Crie 4 chamados parecidos, um deles com o mesmo ativo → o do ativo vem primeiro e só 3 aparecem → AC-4
- [x] A relata de novo o mesmo problema → o item diz "Você já abriu este chamado" e tem "Ver meu chamado", que só navega (o rascunho continua na lateral) → AC-5, AC-7
- [x] O Preposto relata pelo chat algo parecido → o item tem "Ver chamado", sem "Acompanhar este" → AC-5, AC-7
- [x] Um turno do chat só com o código no relato, sem a proposta pronta, não grava cartão novo nem muda os parecidos → AC-5a, AC-8
- [x] Com o cartão de B na tela, conclua o chamado de A e mande mais uma mensagem que deixe a proposta pronta → o cartão é regravado sem o aviso → AC-8
- [x] Leitor de tela: o bloco é anunciado como região com o título "Parece que já existe um chamado para isso"; num cartão substituído o bloco fica esmaecido e sem ação → AC-7

### Acompanhar

- [x] B toca "Acompanhar este" → vai para `/conversas/<id do chamado de A>`, o rascunho some da lateral e aparece a seção "Acompanhando" com "#número · serviço", o local e o status → AC-9, AC-15
- [x] A vista de B mostra número, serviço, local, equipamento, status, data de abertura, "desde quando acompanha" e os marcos de status; não mostra autor, técnico, comentário, relato, anexo, avaliação nem prioridade, e não tem caixa de comentário → AC-14
- [x] Clique duplo em "Acompanhar este" → um registro só em `chamadointeressados` → AC-11
- [x] Conclua o chamado de A com o cartão de B aberto e toque "Acompanhar este" → aparece "Esse chamado já foi concluído ou encerrado. Se o problema continua, abra o seu.", nada é gravado, o rascunho fica e o cartão segue confirmável → AC-10
- [x] Em duas abas, confirme o cartão numa e toque "Acompanhar este" na outra ao mesmo tempo → nunca termina com chamado novo e interesse ativo juntos (o interesse fica com `saiuEm` e a tela mostra a frase de confirmação em andamento) → AC-9
- [x] Um terceiro usuário sem interesse abre `/conversas/<id do chamado de A>` → mesma página 404 de um id inexistente → AC-14
- [x] B toca "Deixar de acompanhar" → volta para `/conversas`, o item some da lateral, e reabrir a URL dá 404 → AC-16

### Abrir mesmo assim e gestão

- [x] B confirma o cartão com o aviso → o chamado novo nasce com `avisoDuplicado.chamadoIds` igual aos ids do cartão; repetir a confirmação (clique duplo) não regrava → AC-12
- [x] O Preposto abre o chamado novo na gestão → vê "Possível duplicado de #N" com link; o solicitante (`/api/meus-chamados`) e o técnico (`/api/chamados-atribuidos`) não recebem o campo → AC-13
- [x] Apague (no banco de teste) o chamado de A → a linha some do detalhe da gestão → AC-13

### Fim e visibilidade

- [x] O técnico registra a execução do chamado de A → B recebe no sino "O chamado #N que você acompanha foi concluído", com link para a vista → AC-17
- [x] Recusa pelo solicitante (`refuseServiceAction`) ou reabertura pela gestão, e nova conclusão → B recebe um segundo aviso; avaliação e encerramento depois do concluído não avisam de novo → AC-17, AC-18
- [x] Cancelamento pelo solicitante e recusa na triagem geram os textos de "cancelado" e "recusado" → AC-17
- [x] Com o chamado de A concluído e avisado há 6 dias, o item aparece na lateral de B; há 8 dias, não aparece → AC-15
- [x] O Preposto vê no detalhe da gestão "N usuários relataram o mesmo problema: nomes"; o técnico atribuído vê só a contagem no `PainelChamado`; A não vê nada sobre interessados → AC-19
- [x] Nenhuma entrada nova em `ChamadoHistory` por acompanhar ou sair → AC-19

## Commands

- [x] `npm run typecheck` → sem erro
- [x] `npm run lint` → sem erro
- [x] `npm test` → tudo passa
- [x] Com a busca falhando (mock de `ChamadoModel.find` rejeitando), o cartão sai com `duplicados: null` e uma linha `[assistente]` com `operacao: 'buscarDuplicados'`, sem número, local nem texto → AC-20
- [x] Em todo o fluxo, `generateLlmObject`/`streamLlmObject` não são chamados pela busca, pelo acompanhar nem pelo aviso de fim; `PROMPT_VERSION` igual → AC-21
- [x] Teste de banco (`MONGO_TEST_URI`): índice único `{ chamadoId, userId }` e o `avisadoFimEm` condicional com duas chamadas simultâneas de `notificarFimAosInteressados` geram uma notificação só → AC-11, AC-17

## Value sourcing

- [x] `proprio`: mude o usuário da conversa e confira que o item vira `proprio: true` só para o dono do chamado parecido
- [x] `jaTemAcesso`: com o técnico atribuído do chamado parecido relatando pelo chat, o item vem `jaTemAcesso: true`
- [x] `localExato` nulo: item de outra pessoa e de outra unidade vem sem local; da mesma unidade, com local
- [x] `rotuloServico`: chamado parecido sem serviço (aberto pelo chat sem IA) mostra "A definir na triagem"
- [x] `ativoCodigo`: chamado parecido com ativo mostra o código do ativo; sem ativo, nada
- [x] "aberto há N dias": mude o fuso do navegador perto da meia-noite e confira que a contagem segue os dias de calendário de quem lê
- [x] `avisoDuplicado.chamadoIds`: altere o payload no navegador antes de confirmar; o chamado nasce com os ids do cartão guardado no banco
- [x] marcos: uma entrada de histórico sem mudança de status (comentário, vínculo de ativo) não aparece como marco
- [x] janela de 7 dias: `avisadoFimEm` em 6 e 8 dias atrás decide se o item aparece na lateral

## Local escondido (revisão de 2026-10-07)

- [x] C (outra unidade) acompanha o chamado de A pelo código do equipamento (item com `localExato: null`) → a vista de C não mostra a linha do local e o item de "Acompanhando" vem sem texto de apoio → AC-6, AC-14, AC-15
- [x] B (mesma unidade de A) acompanha o mesmo chamado → vê o local na vista e na lateral → AC-14, AC-15
- [x] C deixa de acompanhar e volta por um cartão novo cujo item mostra o local (mesma unidade) → `localVisivel` é regravado como `true` e o local aparece → AC-9
- [x] Com o interesse ativo, um segundo clique em "Acompanhar este" vindo de outro cartão não muda `localVisivel` → AC-9
- [x] Interesse gravado antes do campo (sem `localVisivel` no documento) → a vista e a lateral não mostram o local → AC-14, AC-15
- [x] Value sourcing: `localVisivel` sai de `item.localExato !== null` do cartão atual lido do banco; altere o payload no navegador e confira que o valor gravado segue o cartão do banco → AC-9

## Acceptance-criteria coverage

- AC-1, AC-3: Busca e cartão (código em outra unidade, modo manual, 1 contra 3 candidatos)
- AC-2: Busca e cartão (sala 205 contra 101/305)
- AC-4: 4 parecidos
- AC-5: item próprio e Preposto
- AC-5a, AC-8: turno só com código e cartão regravado
- AC-6: payload sem dado pessoal, local nulo de outra unidade
- AC-7: texto, botões, leitor de tela e cartão substituído
- AC-9, AC-10, AC-11: Acompanhar (caminho feliz, corrida com o fim, clique duplo, corrida com a confirmação)
- AC-12, AC-13: Abrir mesmo assim e gestão
- AC-14, AC-16: vista, 404 e deixar de acompanhar
- AC-15: lateral e janela de 7 dias
- AC-17, AC-18: aviso de fim e reaberturas
- AC-19: contagem e nomes, sem `ChamadoHistory`
- AC-20, AC-21: Commands
