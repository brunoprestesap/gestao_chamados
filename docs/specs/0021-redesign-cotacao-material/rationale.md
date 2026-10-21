# 0021. Repaginação das telas da cotação de material: justificativa

## Context

A cotação de material (spec 0019) entrou em produção com cinco fatias e regras pesadas: máquina de estados com 10 situações, quatro papéis por designação, saldo de empenho, 29 controles. As telas acompanharam a regra, não o uso, e o mapeamento das telas atuais achou estes problemas:

- O detalhe é uma página única e longa, e os botões de ação ficam no fim, longe dos impedimentos.
- A fila não tem busca, filtro nem paginação: corta em 200 linhas e mede a idade por `updatedAt`, que muda com qualquer escrita.
- No editor da contratada, cada orçamento repete a lista inteira de itens; com 50 itens e 10 orçamentos, a rolagem fica enorme.
- O cadastro perde a aba ao recarregar, e três ações que não se desfazem (revogar, desativar, inativar) rodam num clique só.
- Há jargão na tela ("RN-36", "caminho 1"), rótulos que não combinam entre si e controles nativos misturados com os do shadcn.

O canvas de 21/10/2026 redesenha as 11 telas sobre o visual do Sigma.

Forças que pesam:

- **As regras de `lib/material` estão verificadas e testadas.** Mexer nelas por causa de tela é risco sem ganho.
- **A abordagem do projeto é Tracer Bullet, e o `main` dispara deploy real.** Isso pede entrega em fatias pequenas.
- **Faltam dados.** A tela nova precisa do tempo na etapa, das contagens da fila e do saldo depois da aprovação, que hoje não existem prontos. A trilha (`CotacaoMaterialEvento`) já tem `para` e `em`, com índice por cotação.
- **A conta dos impedimentos está presa ao servidor.** `lib/material/controles.ts` é pura, mas leva `server-only`; a lista ao vivo do editor precisa dela no navegador.
- **O técnico usa o celular.**

## Options considered

### Option 1: Repaginar no lugar, por fatias, com peças compartilhadas

Reescrever os componentes dentro das rotas atuais, uma tela por PR, sobre peças comuns criadas na primeira fatia, com três leituras novas no servidor e nenhuma mudança de modelo.

**Pros**:

- Cada PR é pequeno, revisável e reversível.
- A regra não é tocada.
- A fila, a tela mais usada, melhora primeiro.

**Cons**:

- Por algumas semanas, parte do módulo fica nova e parte antiga.
- As peças compartilhadas precisam acertar na primeira fatia, ou serão refeitas.

### Option 2: Telas novas atrás de um interruptor, troca de uma vez

Construir as 11 telas numa rota paralela (ou atrás de uma flag) e virar tudo junto quando estiver pronto.

**Pros**:

- O usuário nunca vê o módulo misturado.
- Dá para comparar as duas versões lado a lado.

**Cons**:

- Duas versões para manter durante semanas.
- Um PR final enorme.
- A flag e a rota paralela viram código morto a remover.
- A fila demora a melhorar.

### Option 3: Ajustes pontuais no visual atual

Corrigir os problemas listados (paginação, confirmação, rótulos, abas no endereço) sem redesenhar o layout.

**Pros**:

- O menor esforço e o menor risco.

**Cons**:

- O problema central não muda: a ação no fim da página, o editor em rolagem e o técnico sem a próxima ação no cartão.
- O canvas fica sem uso.

## Rationale

A opção 1 casa com as duas forças mais duras:

- O `main` faz deploy real e o projeto entrega em Tracer Bullet, então fatias pequenas que vão para produção sozinhas são o caminho mais seguro.
- As regras testadas de `lib/material` ficam intocadas, porque o trabalho é só de apresentação e leitura.

A opção 2 compra uniformidade visual ao custo de manter duas versões e de um PR final grande, o que essa equipe não precisa. A opção 3 resolve os sintomas, mas deixa o motivo do redesign (onde está a ação, como se monta a cotação) sem resposta.

Dentro da opção 1, o engenheiro escolheu estas soluções:

- O tempo na etapa é derivado da trilha, e não de um campo novo. O volume é pequeno e o índice existe, então não vale mudar o modelo e a máquina de estados.
- A busca e a paginação rodam no servidor, por `searchParams`, como já faz o `?aba=`.
- As funções puras de `controles.ts` vão para `shared/`, para a lista "Pronta para enviar?" ser ao vivo sem segunda fonte de regra.
- As confirmações não pedem motivo, para não sair do escopo de apresentação.
- O botão primário fica com o gradiente do Sigma, para o módulo não destoar do resto.
