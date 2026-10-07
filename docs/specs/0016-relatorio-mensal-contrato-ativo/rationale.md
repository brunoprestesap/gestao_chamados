# 0016. Relatório mensal por contrato com dimensão de ativo: o registro da decisão

## Context

A proposta de ativos (spec 0011, `proposta.md`) ligava `Chamado → Ativo → Contrato → Custo` e deixou para a fatia 5 um "relatório mensal por contrato com dimensão de ativo". As fatias anteriores entregaram o ativo, o vínculo do chamado e, na 0014, os indicadores por ativo (MTBF, MTTR, reincidência) na aba Ativos do IMR, todos informativos. O elo "Contrato" nunca foi construído: o Sigma não sabe qual contrato atende cada chamado, e o mais próximo disso é o `tipoServico` (Manutenção Predial, Ar-Condicionado, Elevador).

O público é o Admin, que acompanha a empresa contratada e alimenta o processo administrativo (SEI) todo mês. O que vai para o processo precisa identificar o contrato (número, empresa, CNPJ, processo), o período, e ser um arquivo que se anexa; e, como o mesmo mês pode ser emitido de novo depois de um chamado ser vinculado tarde, precisa haver como provar qual versão foi anexada.

Os números já existem num lugar (a aba Ativos do IMR) e o escopo pede que batam com ela. O IMR tem duas bases diferentes: o Resumo Geral conta chamados encerrados por `closedAt`; a aba Ativos conta corretivos por `createdAt`, incluindo os ainda abertos. Um relatório que reinventa a conta, mesmo bem intencionado, vai divergir em algum mês e tirar a confiança do fiscal nos dois.

O volume é pequeno: três tipos de serviço, um contrato por tipo de cada vez, dezenas a centenas de chamados por mês, centenas de ativos Tier A e B. Não há storage de arquivos gerados no servidor além do usado pelos documentos do ativo, e a imagem de produção roda Node 24 Alpine, sensível a dependências com binário.

## Options considered

### Option 1: Contrato cadastrado, pertencimento derivado, relatório na leitura e PDF no servidor com registro de emissão

Coleção `Contrato` com vigência e tipos cobertos; o chamado pertence ao contrato pelo tipo e pela data, sem campo novo. O relatório é calculado a cada leitura reaproveitando `calcularFiltro` da 0014, mostrado numa tela e montado em PDF por `@react-pdf/renderer` numa rota de API, que grava uma emissão com o hash do arquivo.

**Pros**:

- Paridade com a aba Ativos por construção, porque a conta é a mesma função.
- Nenhuma migração de chamado; vale para o histórico assim que o contrato é cadastrado.
- O PDF tem layout fixo e igual para todos, e o código de emissão no rodapé liga o arquivo anexado ao registro.

**Cons**:

- Uma dependência nova e um segundo layout para manter junto da tela.
- O relatório de um mês passado pode mudar entre duas emissões; só o hash registra o que foi anexado.

### Option 2: Contrato igual ao tipo de serviço

Sem coleção nova: escolher o contrato é escolher o tipo de serviço, e o relatório é a aba Ativos do IMR recortada por mês.

**Pros**:

- O menor código possível; quase tudo já existe.

**Cons**:

- O documento sai sem número, empresa, CNPJ e vigência, que é o que o processo exige.
- Troca de empresa no meio do ano não tem como ser representada.

### Option 3: `contratoId` gravado em cada chamado

O chamado recebe o contrato na abertura, e uma migração preenche os antigos.

**Pros**:

- Exato mesmo se dois contratos cobrirem o mesmo serviço ao mesmo tempo.

**Cons**:

- Toca em todas as aberturas (formulário, chat, preventiva) e exige migração e reparo quando o contrato é cadastrado ou corrigido depois.
- Resolve um caso (sobreposição) que o Admin decidiu proibir.

### Option 4: Página de impressão no navegador em vez de PDF no servidor

A mesma tela com CSS de impressão; o navegador salva em PDF.

**Pros**:

- Nenhuma dependência nova; um layout só.

**Cons**:

- O resultado varia por navegador e configuração de impressão, e o Sigma não sabe que um PDF foi gerado, então não há registro nem código de emissão.

## Rationale

O Admin escolheu o cadastro simples e o PDF no servidor, e as duas escolhas se reforçam. O processo pede identificação do contrato, o que descarta a Option 2; a proibição de sobreposição (AC-3) faz o pertencimento por tipo e data ser exato, o que tira o único ganho da Option 3 sem o custo de mexer em todas as aberturas. O PDF gerado no servidor é o que permite o registro de emissão: só o servidor sabe quais bytes saíram, então só ele pode guardar o hash e imprimir um código que aponta para esse registro.

A paridade com o IMR foi tratada como requisito de construção, não de teste: o topo chama `calcularFiltro` com a janela da 0014, e o teste de banco só confirma o que o código já garante. Pelo mesmo motivo a base do mês é o `createdAt` e os limites de dia são os do IMR, mesmo com a diferença conhecida de três horas no último dia, e a reincidência olha antes da vigência. Corrigir o fuso só aqui faria o relatório divergir da aba Ativos; se for corrigido, deve ser nos dois lugares por outra spec.

`@react-pdf/renderer` ganhou de pdfmake, pdfkit e Chromium headless porque é JavaScript puro (não quebra a imagem Alpine como um navegador embutido), escreve o documento em JSX como o resto do projeto, roda em Node com `renderToBuffer`, suporta React 19 desde a v4.1 e resolve cabeçalho repetido e "página X de Y" com `fixed` e `render`. O runner up foi pdfmake, mais forte em tabela, mas com um estilo de código (documento em JSON) que ninguém mais usa no projeto. O registro leve de emissão, sem guardar o arquivo, foi preferido a guardar o PDF porque prova a versão anexada sem exigir storage e retenção de arquivos.

### Ferramentas de agente encontradas (07/10/2026)

Busca no registro de skills para `@react-pdf/renderer`: `molefrog/skills@react-pdf` (geração de PDF com `@react-pdf/renderer`), `vercel-labs/json-render@react-pdf` (para `@json-render/react-pdf`, outro pacote) e `trailofbits/skills-curated@react-pdf`. Nenhum servidor MCP público relevante.
