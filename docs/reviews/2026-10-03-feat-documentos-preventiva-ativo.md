# Revisão, feat/documentos-preventiva-ativo, 2026-10-03

**Revisado por**: Sonnet 5.5 (autor em outro modelo)
**Escopo**: cerca de 82 arquivos, branch contra main (nada commitado ainda: alterações no working tree mais arquivos novos)
**Veredito**: Changes requested (Mudanças pedidas)

## Resumo

A mudança tem duas partes. Na primeira, o Sigma guarda laudos e certificados presos a um ativo ou a um local, com upload de até 20 MB, substituição do vigente, correção, exclusão, painel e aviso diário de vencimento. Na segunda, um modelo recorrente passa a gerar um chamado já validado e com SLA para cada ativo Tier A de uma categoria. O código é cuidadoso: as escritas condicionais, as datas em Belém e as proteções contra caminho inválido estão bem pensadas. O ponto que precisa mudar antes do merge é o cabeçalho de cache do download, que deixa um arquivo acessível depois de a permissão ou o documento mudarem.

## Major

### 🟠 Download com cache de 5 minutos fura a regra de acesso e a exclusão, `app/api/ativos/documentos/[id]/arquivo/route.ts:58`

**Problem**: a resposta sai com `Cache-Control: private, max-age=300`. O navegador serve o arquivo do cache por 5 minutos sem falar com o servidor, então nem a checagem de papel (linha 27) nem a checagem de `excluido` (linha 38) rodam nesse período. Foi o que o verify viu: em um navegador compartilhado, um Solicitante recebeu 200 do cache depois que um Técnico baixou o mesmo arquivo, e um documento excluído continuou baixável por 5 minutos.
**Why it matters**: o AC-10 diz que o Solicitante não acessa o laudo, e a exclusão com motivo existe para tirar um documento de circulação (por exemplo um arquivo enviado por engano). Em estação compartilhada, que é comum em órgão público, as duas garantias falham em silêncio. O ganho do cache é pequeno, pois são arquivos baixados de vez em quando.
**Suggested fix**: trocar por `private, no-store` (ou `private, no-cache`, que obriga a revalidar a cada abertura). Acrescentar um teste na rota que confira o cabeçalho.

## Minor

### 🟡 A mensagem "Selecione a categoria de ativo" só aparece depois dos outros campos, `shared/chamados/recurring-ticket.schemas.ts:94`

**Problem**: os `refine` de `categoriaAtivoId` e `finalPriority` ficam num `.refine` sobre o objeto. O Zod só roda refinamento de objeto quando todos os campos do objeto já passaram, então a pessoa corrige nome, título e demais campos e só então descobre que faltava a categoria.
**Why it matters**: erro tardio e confuso no formulário, e o AC-16 espera o aviso junto com os outros.
**Suggested fix**: mover essas duas regras para um `superRefine` no objeto, que reporta todos os problemas de uma vez, ou usar a forma que roda mesmo com campos inválidos.

### 🟡 Mesmo padrão do bug do AC-16 segue em `ClassificarChamadoDialog`, `app/(dashboard)/gestao/_components/ClassificarChamadoDialog.tsx:405`

**Problem**: os Selects de subtipo (linha 405) e de serviço do catálogo (linha 430) usam `onValueChange={field.onChange}` direto. O Radix chama `onValueChange('')` quando o valor chega antes das opções, e isso limpa o campo. O `RecurringTicketDialog` já ganhou a guarda `v && ...` (linha 1113) por causa desse bug. Dentro do diff, `escolherCategoria` (RecurringTicketDialog.tsx:540) e o Select de prioridade (linha 606) também não têm a guarda; ali as opções vêm prontas do servidor, então o risco é baixo.
**Why it matters**: o arquivo não faz parte desta mudança, mas é o mesmo defeito já visto uma vez; vale um item de acompanhamento.
**Suggested fix**: aplicar a mesma guarda nos Selects do `ClassificarChamadoDialog` em outra tarefa, e proteger `escolherCategoria` contra string vazia.

### 🟡 Caminhos de desfazer sem teste, `lib/ativos/documentos/gravar.ts:137` e `lib/ativos/documentos/alerta-job.ts:148`

**Problem**: nenhum teste cobre a falha do `create` depois de marcar o anterior (volta a vigente e apaga o arquivo), a falha do histórico (`gravarHistoricoOuDesfazer` no cadastro, na correção e na exclusão), a falha do `insertMany` do job (o `$pull` da marca) nem o 409 quando outra requisição já substituiu o anterior. As funções puras `casaFiltroSituacao` e `paginar` do painel só são exercidas pelo teste de banco, que roda apenas com `MONGO_TEST_URI`.
**Why it matters**: é justamente a lógica de ramificação e de recuperação, a parte mais frágil sem transação.
**Suggested fix**: acrescentar testes unitários com mocks dos modelos para esses ramos e um teste direto de `casaFiltroSituacao` (incluindo `vence_hoje` em `ate_30`).

### 🟡 O aviso de vencimento pode se perder sem nova tentativa, `lib/ativos/documentos/alerta-job.ts:115`

**Problem**: a marca é gravada antes de enviar. Se o processo cair entre a marca e o `insertMany`, ou se não houver gestor ativo (linha 137 simplesmente pula), o limite fica marcado e nunca mais avisa. O envio de e-mail também é aguardado documento por documento, e o `curl` do cron corta em 60 s, o mesmo `maxDuration` da rota.
**Why it matters**: o desenho é "no máximo uma vez", que evita repetição e foi uma escolha consciente, mas a perda é invisível e um SMTP lento num dia com muitos documentos pode estourar o tempo.
**Suggested fix**: se não houver gestor, não gravar a marca e contar como erro no relatório. Registrar no relatório quando o tempo estiver acabando, ou enviar os e-mails sem bloquear o laço seguinte.

### 🟡 Janela de queda na substituição deixa o tipo sem vigente, `lib/ativos/documentos/gravar.ts:127`

**Problem**: o anterior vira `substituido` (linha 127) antes de o novo ser criado (linha 147). Se o processo morrer entre os dois passos, o alvo fica sem vigente e com um arquivo órfão no disco, e nada reconcilia isso depois.
**Why it matters**: o Mongo de produção é standalone, então é um limite conhecido e o código documenta o risco. Ainda assim o efeito é um documento válido sumindo do painel e dos avisos.
**Suggested fix**: aceitável para o merge. Sugerir uma checagem simples no painel "Faltando" ou um script de reconciliação, e anotar o risco no `verify.md`.

### 🟡 O download lê o arquivo inteiro em memória, `app/api/ativos/documentos/[id]/arquivo/route.ts:47`

**Problem**: `fs.readFile` carrega até 20 MB por requisição e o copia para um `Uint8Array`.
**Why it matters**: poucas pessoas usam, então o impacto é pequeno, mas vários downloads em paralelo de laudos grandes pesam no processo único do Next.
**Suggested fix**: servir por stream (`fs.createReadStream` convertido para `ReadableStream`) e manter o `Content-Length` pelo `stat`.

## Nits

- ⚪ `app/api/ativos/documentos/route.ts:40`, sem `content-length` (corpo em pedaços) o corte cedo não age; em produção o nginx (21M) cobre, só vale saber.
- ⚪ `lib/ativos/documentos/painel.ts:93`, o painel carrega todos os documentos vigentes e os ativos em memória; aceito para um parque de centenas, como o comentário diz.
- ⚪ `lib/chamados/preventiva-categoria.ts:99`, o fallback final de `proximaRodada` quase nunca roda; o "dois dias à frente" visto no verify é a regra de pular fim de semana, correta. Um comentário ou um teste do caso deixa claro.
- ⚪ `lib/ativos/documentos/ficha.ts:121`, a lista de `substituidos` não tem limite; um tipo trocado muitas vezes cresce sem teto.
- ⚪ `app/(dashboard)/ativos/documentos/_components/NovoDocumentoDialog.tsx:178`, cadastrar um novo vigente substitui o anterior sem pedir confirmação; o texto do diálogo avisa e o toast confirma, mas um aviso explícito antes de enviar seria mais seguro.
- ⚪ `app/api/cron/documentos-vencimento/route.ts:12`, a comparação do segredo usa `!==` (não é tempo constante), igual às outras rotas de cron do projeto.

## Strengths

- A substituição marca o anterior pelo `_id` lido com condição, desfaz a marca se o novo não entra e o índice único parcial fecha a corrida; o histórico do ativo usa `gravarHistoricoOuDesfazer` como manda o AGENTS.md.
- O job de vencimento grava a marca por atualização condicional (`$nin`) e só quem gravou envia, então rodar em paralelo não repete aviso; o teste de banco cobre o caso em paralelo.
- As datas são tratadas como `YYYY-MM-DD` em Belém e a diferença de dias sai das duas strings, evitando o erro clássico de um dia.
- O download e o upload têm defesa em camadas: tipo pelos bytes iniciais, caminho montado só do `_id` e de um nome gravado pelo servidor, `nosniff`, `Content-Disposition` com nome ASCII mais `filename*`.
- A reserva atômica do modelo recorrente (`findOneAndUpdate` sobre o `nextRunAt` lido) impede lote duplicado, o snapshot de SLA sai só de `montarSnapshotSla`, e o ramo `template` do job ficou intacto.
- O refator do upload de chamados para `lib/uploads/arquivo.ts` troca testes que reimplementavam as funções por testes das funções reais.
- A exclusão do `api/ativos/documentos` do matcher do `proxy.ts` e o `client_max_body_size 21M` só nesse caminho do nginx resolvem o corte em 10 MB sem abrir o limite do resto do site.

## Test coverage

Há boa cobertura de rotas (upload, download, cron), actions, schemas, situação, e-mail, notificações e do ramo do lote de preventiva, mais um teste de banco com os cenários principais dos ACs (substituição, índice único, job em paralelo, herança do Faltando). Os testes de banco só rodam com `MONGO_TEST_URI`. Falta cobertura direta dos caminhos de desfazer (falha do create, do histórico e do `insertMany`), do 409 de substituição concorrente, de `casaFiltroSituacao` e do cabeçalho de cache do download.
