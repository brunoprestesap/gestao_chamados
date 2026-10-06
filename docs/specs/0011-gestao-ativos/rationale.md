# 0011. Gestão de ativos, fatia 1: rationale

## Context

O Sigma registra que serviço foi pedido, mas não em qual equipamento. Sem isso não se conta quantas vezes um equipamento quebrou, a preventiva não se prende a nada real e a decisão de trocar ou consertar fica no achismo. A proposta completa está em `proposta.md` (escrita como "0009", número anterior ao livre; `0009` já era a spec de revisão das decisões da IA), com a análise do export do SICAM em `analise-sicam.md`.

Forças que moldaram esta fatia:

- **O SICAM não dá local físico.** Traz lotação e setor (quem responde pelo bem), não prédio, andar e sala. `Unit` no Sigma também é organizacional e plana. Os 108 ativos do Tier A entram sem local.
- **O SICAM não cobre o parque predial crítico** (elevador, QGBT, SPDA, hidrante). Cadastro manual com código interno é caminho obrigatório desde o início.
- **Não há importador ainda.** O CSV já limpo pelo `extrair.py` existe e é bom o bastante para uma carga única.
- **A produção roda em HTTP.** O navegador só libera a câmera em contexto seguro.
- **O CSV traz dado pessoal** (nome e matrícula do responsável pelo termo).
- **O Mongo da VPS roda sem conjunto de réplicas**, então não há transação para mudanças em cascata.
- A imagem Docker do Next é standalone, sem scripts; operações de dado em produção seguem o padrão mongosh (`scripts/seed.js`).

## Options considered

### Option 1: Só um campo de texto "equipamento" no chamado

Acrescentar `equipamento` livre ao chamado, sem entidade nova.

**Pros**: quase sem código; nenhuma tela nova.
**Cons**: não agrupa (o mesmo split vira cinco textos diferentes), não lê etiqueta, não serve de base para preventiva nem indicador. Adia o problema.

### Option 2: Módulo de ativos nativo, enxuto, com carga única do Tier A (escolhida)

Entidades próprias (`Localizacao`, `CategoriaAtivo`, `Ativo`, `AtivoHistory`), CRUD de gestão, leitura de etiqueta e vínculo no chamado, com os 108 ativos carregados por um script gerado do CSV limpo.

**Pros**: o modelo alvo da proposta inteira já nasce certo; dado real desde o primeiro dia; cada fatia seguinte só acrescenta.
**Cons**: mais telas e modelos agora; o gerador de carga é descartável.

### Option 3: Começar pelo importador completo do SICAM

Construir já o importador com diferença e revisão (Fatia 2 da proposta) e só então o resto.

**Pros**: resolve a entrada de dados de vez; sem código descartável.
**Cons**: atrasa o fio inteiro pela parte mais arriscada (parse sem aspas, cp1252, regras de categoria) antes de provar que alguém usa o vínculo com o chamado. Contraria a abordagem Tracer Bullet do projeto.

## Rationale

A Option 2 é a única que entrega o fio de ponta a ponta com dado real sem pagar o importador antes da hora. A Option 1 não resolve o problema da contagem por equipamento, e a Option 3 inverte a ordem do Tracer Bullet.

Escolhas dentro da Option 2, e o que perdeu:

- **Localização com raiz no prédio, `unitId` opcional na sala**, em vez de ancorar em `Unit`: `Unit` é vara e secretaria, não prédio; casa de máquinas e subsolo não pertencem a nenhuma vara. A própria proposta separa os eixos físico e organizacional.
- **`localizacaoId` opcional até validar**, em vez de um nó "A localizar": o dado importado não tem local, e um nó falso distorceria as contagens por local. A regra "validado exige local" preserva o objetivo.
- **Subtipo da categoria opcional, vinculado pelo Admin**, em vez de mapa fixo no script: o catálogo de produção pode não ter os subtipos esperados, e nada desta fatia depende do vínculo.
- **Contador atômico para `MNT-####`**, em vez de maior existente + 1 com nova tentativa: sem laço de retry e sem corrida. Custo: uma coleção nova e pequena.
- **Status do ativo só manual**: com vínculo ainda opcional e às vezes errado, mudar o status sozinho espalharia erro para o equipamento errado.
- **Correção do vínculo até o encerramento**, não só antes da atribuição: quem descobre o equipamento errado costuma ser o técnico, em campo.
- **Server Actions e leitura no servidor**, não API routes como o `/catalogo`: segue o padrão de escrita do `AGENTS.md`; API só para o que o cliente consulta enquanto o usuário digita ou lê a etiqueta.
- **Polyfill `barcode-detector`**, em vez de `@zxing/browser` com fallback manual: uma API só, nativa no Chrome Android e WebAssembly no iOS. Segundo lugar: `@zxing/browser`, maduro mas com manutenção lenta e dois caminhos de código. Esse espaço muda rápido; vale conferir a versão atual ao instalar.
- **Campo digitável junto da câmera**: funciona hoje em HTTP, com leitor USB e com etiqueta danificada.
- **Carga por script mongosh gerado fora do git**: segue a operação já usada em produção, mantém o dado pessoal fora do GitHub e deixa o mapeamento em TypeScript testável no Vitest. Segundo lugar: botão de upload para o Admin, que é meio importador e sairia antes da hora.
- **Parse próprio do CSV limpo** (separador `;`, aspas no padrão RFC 4180) em `lib/ativos/carga.ts`, sem biblioteca: o arquivo é um só e conhecido, e a Fatia 2 vai precisar de outro parser para o CSV bruto do SICAM de qualquer jeito.
- **Recálculo da subárvore do `caminho` a partir do banco**, sem transação: árvores de centenas de nós, recálculo idempotente que conserta falha parcial ao rodar de novo.
- **Criticidade inicial das 9 categorias** definida nesta spec (incêndio, gerador e transformador críticos; nobreak e bomba altos): é ponto de partida para o Admin ajustar, não regra contratual.
- **Seletor do formulário limitado a Tier A e B**: C (TI) e D (veículos) são outro contrato e outro fiscal.

### Ajustes depois da revisão (2026-10-01)

A revisão por outro modelo (`docs/reviews/2026-10-01-feat-gestao-ativos-fatia-1.md`) levou a quatro mudanças de contrato, já construídas e testadas:

- **Chave da categoria imutável (AC-3).** A carga do Tier A acha as categorias pela `chave`. Se o Admin trocasse a chave de uma das 9, uma nova carga tentaria criar outra categoria com o mesmo `nome` e falharia no índice único. A chave passa a ser identificador, como o `codigo` do ativo; os outros campos continuam editáveis.
- **Botão de chamado também some para Tier C/D (AC-15).** A versão anterior escondia só para `baixado`, mas o seletor recusa Tier C/D: o botão levava a um aviso de "não pode receber chamado". Agora a ficha usa as mesmas regras do seletor e explica o motivo.
- **Linha do tempo limitada a 100 registros (AC-13).** Igual aos chamados (até 50), para a ficha não crescer sem limite. Hoje são poucos registros por ativo, então o limite raramente aparece.
- **`prepareZXingModule` no lugar de `setZXingModuleOverrides`.** As duas existem no `barcode-detector` 3.2.2; a segunda está obsoleta na documentação do pacote. A decisão (servir o `.wasm` do próprio app) não muda.

Também entraram duas regras de implementação que não mudam o que a pessoa vê: o histórico que falha desfaz a escrita (antes, a mudança podia ficar sem registro) e a ordem numérica da lista é feita em memória, para a consulta voltar a usar os índices.
