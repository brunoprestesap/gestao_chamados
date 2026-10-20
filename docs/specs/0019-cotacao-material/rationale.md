# 0019. Cotação e fornecimento de material: raciocínio

## Context

> ⚠️ Premise note: o funcional cobre duas coisas que se separam bem: o fluxo do material e o IMR do contrato (indicadores 3 e 4). Este documento trata só do fluxo; o IMR vai para spec própria, porque o indicador 3 mede tempo de atendimento de chamado, não material, e mexe no `imr-service`. Outro ponto: o contrato vence em 28/02/2027, cerca de 4,5 meses depois desta spec. Um fluxo de 57 regras construído de uma vez não chegaria a ser usado. Por isso a construção vem em fatias que funcionam sozinhas.

Hoje o material é pedido por e-mail e planilha. No Sigma existe só uma cotação simples (`Cotacao`): três status, um valor estimado, descrição livre, ligada a uma pausa do chamado. Só o Preposto envia e só o Admin aprova. Não há itens, origem de preço, orçamentos, competência por valor, empenho nem trilha própria.

O levantamento do funcional mostrou forças que pesam no desenho:

- O preço pactuado do Anexo V está, em mediana, 105% acima da estimativa da própria Administração. Preço pactuado não é preço seguro, e a conferência contra o SINAPI precisa existir mesmo onde a pesquisa é dispensada.
- O empenho de material (estimativa de R$ 12.000 por ano) é 28 vezes menor que o Anexo V inteiro. O saldo é a restrição que de fato limita a operação.
- A competência para aprovar é nominal, por valor e com vigência, e não decorre do perfil de acesso. Os 4 perfis do Sigma não carregam essa informação.
- A trilha tem valor de prova (glosa, fiscalização), então precisa ser só de inclusão e legível por terceiro.
- O MongoDB de produção roda sem replica set: não há transação entre documentos.
- A cotação atual já alimenta o custo por ativo (spec 0018), que aparece na ficha, no IMR e no relatório por contrato, e não pode quebrar.

## Options considered

### Option 1: evoluir o `Cotacao` atual

Ampliar a mesma coleção: itens, orçamentos, os 10 status no lugar dos 3, campos de competência e empenho.

**Pros**:

- Uma só coleção e um só cartão de cotação.
- O custo da spec 0018 continua lendo um único modelo.

**Cons**:

- O enum de status e o cálculo de custo mudam juntos, e os registros antigos (sem itens, com status `aprovada`) precisam de migração ou de um ramo de legado em todo lugar que lê.
- O índice único atual (`enviada` por chamado) e o vínculo obrigatório com `PauseLog` não servem ao fluxo novo, que tem rascunho e devolução.

### Option 2: modelo novo ao lado do antigo (estrangulamento)

Coleção `CotacaoMaterial` nova, com o fluxo completo. A antiga para de receber envios e termina o que está em andamento.

**Pros**:

- Nenhum dado migrado e nenhum risco para o custo e os relatórios que já existem.
- O modelo novo nasce com a forma certa (itens, trilha separada, índice por `emTramite`).
- Reverter a fatia 1 reabre o fluxo antigo sem perda.

**Cons**:

- Duas formas de cotação convivem até as antigas acabarem.
- O custo passa a ler dois modelos.

### Option 3: os dois fluxos em paralelo por tempo indeterminado

O fluxo antigo continua para serviço de terceiros e o novo só para material.

**Pros**:

- Não força a mudança de hábito de uma vez.

**Cons**:

- O motivo de pausa usado hoje (`falta_peca_aprovacao_cliente`) é de material: os dois fluxos disputariam o mesmo caso, e o controle por empenho teria uma porta lateral.

## Rationale

A opção 2 vence por causa do prazo e do custo da 0018. Com 4,5 meses de contrato, migrar dados e manter um ramo de legado em cada leitura (opção 1) gasta o tempo que a fatia 1 precisa. A opção 3 deixa uma porta lateral que derruba justamente o controle que motiva a spec: material sem lastro no empenho.

Outras escolhas que o desenho fixa, e por quê:

- **Competência por designação, não por perfil.** A RN-08 exige limite por pessoa, com vigência e ato. Um registro só de inclusão guarda o histórico de limites e serve de prova. Perfil novo não resolveria o limite e mexeria em proxy, guards e menu. As faixas ficam numa lista própria para o fracionamento ter limites estáveis.
- **Aprovar e autorizar num ato só.** O diagrama do funcional vai de "em aprovação" a "autorizada" sem etapa intermediária. Dois atos criariam uma situação vazia e um segundo lugar para conferir o saldo.
- **Saldo por update condicional.** Sem transação, a única forma segura de impedir saldo negativo numa corrida é a condição dentro do próprio update do empenho, com compensação se a gravação seguinte falhar. É o mesmo padrão de compensação que `submitCotacaoAction` já usa.
- **O fiscal escolhe a base quando há duas.** A contratada sempre teria motivo para escolher o preço maior, e a pendência 1 é decisão da Administração. Regra fixa de "vale o menor" anteciparia uma decisão que o gestor ainda não tomou.
- **Alteração depois da autorização volta para a análise, passando por `devolvida`.** O funcional manda direto para a aprovação, mas mudar item ou quantidade muda a pertinência técnica, que é exatamente o que o fiscal confere. Reaproveitar `devolvida` evita uma regra de edição nova dentro de `em_analise`.
- **Reserva no empenho, além do contador.** Sem transação, um processo que cai entre comprometer o saldo e gravar a cotação deixaria saldo preso sem dono. A reserva identificada pela cotação torna o passo idempotente e permite a conciliação diária liberar o que ficou órfão.
- **Faixa imutável.** Pela RN-07 o limite decorre do ato de delegação. Uma faixa editável mudaria a competência de todos os designados sem ato novo; o custo é designar de novo quando a portaria mudar.
- **Revisão cruzada.** A versão final incorpora a revisão de outro modelo: trava de edição do rascunho, pausa e retomada, reserva e conciliação, preço congelado no envio, execução só por quantidade, ganchos no ciclo do chamado, visibilidade, unicidade de designação, `ImportacaoMaterial`, hooks de só inclusão e validações de upload. A simplificação dos caminhos 1 e 2 (antigo AC-43) saiu para o Follow-up.
- **O custo conta a partir de "executada".** O material já foi aplicado; o ateste é ato administrativo e pode levar até 10 dias.
- **SINAPI e Anexo V por CSV importado.** A VPS está na rede interna e o layout da Caixa muda; importar à mão com revisão é mais robusto que buscar sozinho, e o CSV evita dependência nova (o projeto já quebrou deploy por lock no Alpine).
- **Arquivos fora do `Attachment`.** O solicitante vê os anexos do chamado; orçamento e NF não podem chegar a ele, e o limite de 5 MB é curto para um PDF de orçamento digitalizado.
- **Socket.IO nos avisos.** Foi escolha explícita do engenheiro, contra a recomendação de usar só `Notification` (como em `documento:vencimento`). O custo é um evento a mais nas três listas que andam juntas (`shared/socket.ts`, `ALLOWED_EVENTS`, `RealtimeProvider`); o ganho é a fila do fiscal e do aprovador se atualizar sem recarregar.

### Revisão de 15/10, depois da Fatia 1

Duas rodadas de revisão em outro modelo (`docs/reviews/2026-10-15-main-cotacao-material.md` e `-r2.md`) acharam casos que o desenho original deixava abertos. As regras acrescentadas fecham cada um no ponto da causa, sem mudar a decisão (modelo novo ao lado do antigo, saldo sem transação):

- **Reserva por empenho.** Sem transação, a trava contra reserva duplicada só vale dentro de um empenho. Duas aprovações da mesma cotação em empenhos diferentes reservavam as duas, e a compensação de quem perdia procurava a reserva em qualquer empenho e desfazia a de quem ganhou. Passar o `empenhoId` em `liberar` e `ajustar` elimina o erro pela assinatura, em vez de por convenção. A conciliação ganhou a contrapartida: reserva fora do empenho gravado na cotação é sobra e é liberada.
- **Nova tentativa do cancelamento.** O gancho que cancela a cotação quando o chamado é cancelado ou recusado roda uma vez, depois de o chamado já ter mudado, e a conciliação pula cotação autorizada. Uma falha ali prendia o saldo para sempre. A rodada diária refaz o cancelamento pelo mesmo `transicionar`, então a trilha e a liberação seguem o caminho auditado. As duas rodadas do cron são independentes, porque a conciliação é a rede de segurança e não pode depender de um passo novo.
- **Ids únicos no rascunho.** A trava dos itens do diagnóstico compara por id; id repetido fazia a regra olhar só a última entrada. Recusar a repetição no schema e de novo na regra fecha a brecha para quem chama sem passar pelo schema.
- **Orçamentos ausentes não apagam, e cada orçamento tem o próprio arquivo.** O AC-4 pede 3 orçamentos reais; arquivo repetido ou removido depois de salvar contava como orçamento sem documento.
- **Pausa sem dono e registro aberto.** O vínculo da pausa com a cotação exigia a situação `enviada`, e o fiscal podia assumir nesse meio tempo; e a pausa ficava aberta quando o chamado saía da pausa por cancelamento. Os dois afetam a conta do tempo pausado.

### Revisão de 19/10, depois da Fatia 2

A revisão em outro modelo (`docs/reviews/2026-10-19-feat-material-fatia-2-ateste-pdf.md`) aprovou com ressalvas. As escolhas, feitas pelo engenheiro:

- **A NF pendente nunca some para a contratada.** A janela de 90 dias do AC-15 foi pensada para cotação encerrada; a `atestada` sem NF ainda espera um ato da contratada. Sumir depois de 90 dias tornaria a pendência inalcançável justo quando está mais atrasada. A exceção é estreita (só `atestada` sem `notaFiscal`), então o resto da regra continua igual.
- **Datas do recebimento sim, selo de atraso não.** A contratada precisa saber quando o recebimento aconteceu para emitir a NF, mas o atraso é do próprio TRF1 e o nome do gestor não serve a ela. O serializador é o único portão de visibilidade (AC-15), então a escolha fica escrita para não abrir de novo em silêncio. Alternativas descartadas: mostrar também os nomes, ou mostrar tudo.
- **O Admin sem designação gera o PDF.** Contra a recomendação (limitar a fiscal, gestor e aprovador), o engenheiro manteve: o Admin é quem costuma montar o processo no SEI, o PDF só contém o que ele já lê, e cada emissão grava o autor, então a trilha continua dizendo quem emitiu. É a única ação do Admin sem designação; nenhuma outra transição se abre para ele.
- **NF única, com confirmação, aviso e limite de data.** A troca da NF ficou de fora para não abrir exceção ao ato único da trilha de prova; o erro de digitação passa a ser evitado antes, pela confirmação no diálogo e pela data entre o dia da autorização e hoje. O aviso aos gestores existe porque registrar a NF não muda a situação, e sem ele o lado TRF1 só descobriria abrindo a cotação.
- **Revisão cruzada das escolhas.** Uma leitura em outro modelo achou três buracos que as escolhas acima abriam, e o engenheiro aceitou as correções. O piso da data saiu de `executadoEm` para `autorizadoEm`: a nota do fornecedor nasce na compra, antes da aplicação, e com NF única uma nota correta ficaria impossível de registrar. Uma tentativa recusada deixava um arquivo órfão sem como remover, e depois de 10 o upload travava para sempre; daí a remoção do arquivo de NF ainda não ligado. E a exceção do PDF para o Admin pedia o `papel` na emissão, senão a trilha não mostraria que quem emitiu não tinha designação. O resto (predicado único da NF pendente, abas da contratada, autor fora da trilha dela, forma do aviso da NF, ordem 403 antes de 404) fecha decisões que sobrariam para quem construísse.
- **Correções sem escolha (fatia 2).** A data impossível passa a ser recusada no schema (a regra "nenhuma função lança" vale também aqui), o PDF de rascunho responde 404 em vez de um 403 enganoso, e o selo lê os rótulos de `mensagens.ts`, a fonte única de texto da área.

### Decisões de 19/10, antes da Fatia 3

O `/develop` parou a fatia 3 porque quatro valores não tinham fonte na spec. O engenheiro escolheu as quatro recomendações:

- **Layout próprio e fixo nos dois CSV.** Opção descartada: ler a planilha da Caixa como ela vem. Ela poupa a renomeação mensal, mas a Caixa muda o layout com frequência (a própria escolha do CSV já partia disso); cada mudança quebraria o importador no dia do mês em que o fiscal precisa do preço. Com colunas nossas, a conversão é o único ponto que muda, e ela é manual de qualquer jeito. O cabeçalho procurado nas 20 primeiras linhas e as colunas a mais ignoradas toleram as sobras da conversão sem afrouxar a regra do AC-25.
- **Anomalia contra o mês mais recente, recalculada.** Opção descartada: congelar a marca na importação do Anexo V. É mais estável, mas envelhece: o Anexo V é importado poucas vezes no contrato e o SINAPI todo mês, então a lista ficaria presa a um mês antigo, enquanto a advertência do AC-28 já compara com o mês mais recente. As duas regras falariam de meses diferentes sobre o mesmo item. A marca manual cobre o caso de manter um item na lista de vez (o item 74, pendência 2).
- **`ambas` derivada pelo servidor.** Opção descartada: o responsável técnico escolhe a origem. A RN-51 diz que a escolha da base nunca é implícita e é do lado TRF1; se a contratada marcasse a origem, bastaria não marcar `ambas` para o fiscal nunca ver a segunda base. É o mesmo raciocínio do AC-26 para o preço: o que a tabela já diz não vem da entrada. Derivar de novo no envio segue a regra já existente de copiar o SINAPI de novo naquele momento.
- **Anexo V do contrato vigente do tipo de serviço.** Opção descartada: oferecer o Anexo V de qualquer contrato. É mais simples, mas um chamado de ar condicionado poderia usar o preço pactuado no contrato predial, que não vale para ele. O cadastro de contratos (spec 0016) já recusa sobreposição por tipo de serviço, então a regra devolve no máximo um contrato, sem campo novo na cotação.
- **Revisão cruzada das quatro escolhas.** Uma leitura em outro modelo achou 12 pontos, e o engenheiro aceitou as correções recomendadas. A principal: sem transação, gravar a versão nova item a item e tirar `vigente` da anterior podia deixar um número com dois vigentes, ou nenhum, depois de uma queda. Um ponteiro por contrato (`AnexoVVigencia`) e um marcador por mês (`SinapiReferencia`) fazem a aplicação virar a chave numa única escrita, no fim, e a mesma importação pode ser aplicada de novo sem estrago. Isso também deixou o mês SINAPI imutável, porque trocar um mês inteiro seria apagar e inserir sem transação. As demais fecham decisões que sobrariam para quem construísse: formato e momento da escolha da base e da conferência, a cópia do Anexo V refeita no envio (igual ao SINAPI), as ações de marcar anomalia e corrigir código, a busca, o painel e a entrada da classificação, que passou a ser a escolha, e não a origem.
