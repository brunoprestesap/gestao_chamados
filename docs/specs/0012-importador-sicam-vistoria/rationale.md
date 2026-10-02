# 0012. Importador SICAM e vistoria em campo: decision record

## Context

A fatia 1 (spec 0011) carregou os 108 ativos do Tier A uma vez, por um script mongosh gerado na máquina de desenvolvimento, e todos nasceram sem local. Até alguém ir a campo, o filtro por prédio e a sugestão de local no chamado quase não ajudam, e os ativos de maior criticidade legal (elevador, QGBT, SPDA, hidrante) nem existem no Sigma, porque são benfeitorias do imóvel e nunca aparecem no export de bens móveis.

As forças que pesam:

- **Campo sem sinal.** Sala de máquinas e subsolo não têm cobertura. A produção roda em HTTP (sem TLS), o que tira service worker, câmera e `crypto.randomUUID` do navegador. IndexedDB funciona.
- **Vistoria híbrida.** Servidores e a contratada (perfil Técnico, com login próprio) vão a campo, às vezes no mesmo prédio ao mesmo tempo. É preciso saber quem conferiu e não perder nem sobrescrever trabalho em silêncio.
- **O export do SICAM é hostil.** 39 colunas, `;` sem aspas (6,5% das linhas desalinham), cp1252, datas `DD-MMM-AA` em português, decimal com vírgula, situação e conservação em texto livre inútil. Um parse ingênuo acusa alteração em massa sem erro visível.
- **Duas fontes de verdade no mesmo documento.** O SICAM é dono dos dados patrimoniais; o Sigma (pela vistoria) é dono de local, dados técnicos e status. As duas escrevem no mesmo `Ativo`, sem ordem garantida.
- **LGPD.** O CSV traz nome e matrícula do responsável pelo bem. A linha do tempo do ativo é vista pelos quatro perfis.
- **Escala pequena.** Algumas centenas de ativos vistoriáveis, importação mensal ou menos, uma equipe de campo pequena. Nada aqui pede fila, cache ou serviço novo.

## Options considered

### Vistoria: como o trabalho sem sinal chega ao servidor

**A. Fila no IndexedDB, sem service worker, sincronização em lote (escolhida).** A tela é aberta com sinal, baixa um pacote, grava cada conferência numa fila local e sobe em lote com um identificador por operação.

- Pros: funciona hoje em HTTP; uma só escrita para online e offline; idempotente por construção.
- Cons: a tela não reabre do zero sem sinal; a pessoa precisa lembrar de abrir antes de descer.

**B. PWA completa com service worker.** Igual a A, mais o cache da tela, que reabre sem sinal.

- Pros: a experiência offline completa que a proposta imaginava.
- Cons: exige TLS antes, que ainda não existe; atualização de service worker é uma fonte conhecida de tela velha presa no aparelho.

**C. Só online nesta fatia.** Conferência por Server Action, offline numa fatia seguinte.

- Pros: o menor código; nada no aparelho.
- Cons: não atende o "Done when" da linha 24 nem o caso real do subsolo.

### Vistoria: como representar a rodada

**A. Campanha leve com uma conferência por ativo (escolhida).** Entidade `CampanhaVistoria` e um registro por conferência.

- Pros: guarda quem, quando e em qual rodada; um inventário anual futuro cabe no mesmo modelo; o índice único arbitra a disputa.
- Cons: dois modelos novos e uma tela de gestão da campanha.

**B. Sem entidade, só `validadoPor` no ativo.**

- Pros: nada novo no banco.
- Cons: uma segunda rodada não tem onde ficar; a cobertura não distingue o que foi visto agora do que foi validado há um ano.

**C. Sessão por local** (proposta 4.6).

- Pros: rastro por sala.
- Cons: mais passos em campo (abrir, concluir) sem uma pergunta que só ela responda.

### Vistoria: conflito entre conferências

**A. A primeira que chega vence (escolhida)**, com o índice único `{ campanhaId, ativoId }` como árbitro.

- Pros: nada é sobrescrito em silêncio; sem transação.
- Cons: uma primeira conferência errada se corrige pela edição do ativo, não por outra conferência.

**B. A última que chega vence.**

- Pros: mais simples.
- Cons: pode apagar uma conferência certa feita por outra pessoa.

**C. Fila de revisão da gestão.**

- Pros: ninguém perde dado.
- Cons: mais uma tela e trabalho para o Preposto, para um caso raro.

### Importador: onde fazer o parse e por onde subir

**A. Rota POST multipart, parse e diferença no servidor (escolhida).**

- Pros: regra de parse num lugar só, testável; limite de tamanho só nesta rota.
- Cons: o arquivo inteiro (com dado pessoal) passa pelo servidor.

**B. Server Action com limite maior.**

- Pros: segue o padrão de actions.
- Cons: o `bodySizeLimit` é global e passaria a valer 10 MB para todas as actions.

**C. Parse no navegador, envio só das linhas filtradas.**

- Pros: menos tráfego e menos dado pessoal trafegando.
- Cons: a regra de parse vive no cliente e o servidor ainda precisa revalidar tudo.

### Importador: o que a aplicação pode escrever

**A. Só `camposPatrimoniais` no ativo existente, mais a criação dos novos (escolhida).**

- Pros: importar e vistoriar convivem em qualquer ordem; o dado do SICAM fica atual.
- Cons: muda a regra da 0011 ("importação só cria"), que precisa ser lida junto com esta.

**B. Só cria (regra da 0011), alterações só aparecem na revisão.**

- Pros: zero risco para ativo existente.
- Cons: responsável e garantia ficam velhos para sempre.

**C. Patrimoniais e descrição.**

- Pros: descrição acompanha o SICAM.
- Cons: a descrição pode ter sido melhorada em campo; o SICAM a sobrescreveria.

## Rationale

**Vistoria.** O caso que define a feature é o subsolo sem sinal num servidor sem HTTPS. A fila sem service worker é a única opção que resolve isso hoje; a B espera o TLS, e a C não resolve. Gravar sempre na fila, até com sinal, elimina a classe de bug em que o caminho online e o offline divergem. Com uma equipe pequena e um índice único do Mongo disponível, "a primeira que chega" dá um árbitro sem transação e sem tela extra; o custo (corrigir pela ficha) é aceitável porque a ficha já edita e grava histórico. A campanha leve custa dois modelos e paga isso na primeira vez que alguém perguntar "o que foi visto nesta rodada".

**Idempotência e o cadastro em campo.** Sinal fraco significa resposta perdida e reenvio. O `clientOpId` com índice único torna o reenvio inofensivo. No cadastro, gravar a conferência antes do ativo, com o `_id` do ativo já reservado, faz a retomada achar o ativo que falta pelo mesmo `_id`, sem criar um segundo. O `MNT-` consumido numa queda vira buraco, como já é aceito na 0011.

**Importador.** A proposta mediu o risco principal: um parse errado acusa alteração em massa sem erro visível. Duas etapas com a diferença guardada põem o Admin entre o arquivo e o banco. Escrever só em `camposPatrimoniais` é o contrato que deixa as duas partes independentes. O enxugamento depois de aplicar troca o detalhe de uma importação antiga por menos dado pessoal parado, e o `AtivoHistory` registra quais campos mudaram em cada ativo (sem os valores, porque a linha do tempo é vista por todos os perfis; o valor atual continua no bloco patrimonial, visível só à gestão).

**Correção feita ao escrever.** Na conversa, a opção de LGPD dizia que "o antes e depois de cada ativo já fica no `AtivoHistory`". Ao escrever, ficou claro que isso exporia nome e matrícula na linha do tempo, que os quatro perfis veem. O histórico grava só os nomes dos campos que mudaram.

**Ajustes da revisão cruzada (02/10/2026).** Uma leitura independente achou lacunas que mudaram o desenho em três pontos:

- O cadastro em campo deixou de reservar o `_id` do ativo antes da conferência. O ativo passa a ser criado primeiro, com `origemOpId` único, e a retomada o encontra por esse campo, sem gastar outro `MNT-`.
- A conferência ganhou `efeitoAplicadoEm`, para que uma queda entre gravar a conferência e escrever no ativo seja completada no reenvio, em vez de responder "aceita" sem ter gravado o local. O "desfazer apagando" saiu.
- A aplicação da importação perdeu o estado `aplicando` e o "Retomar" com prazo. Escritas condicionais por item tornam repetir Aplicar seguro, e a trava de uma pendente por vez passou para um campo `emAberto` com índice único parcial, porque um índice em `status` com dois valores deixava conviver uma `pendente` e uma `aplicando`.

Também ficaram decididos: só os campos mudados vão na conferência (pacote velho não sobrescreve), validação por operação no lote, sumidos desmarcados por padrão e com aviso acima de 20%, sumido só para quem já veio do SICAM, normalizadores compartilhados com a carga, e escrita sempre por caminho no `Ativo`.
