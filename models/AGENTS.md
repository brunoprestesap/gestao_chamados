# models: schemas Mongoose

Um arquivo por coleção, com schema manual (sem Prisma) e os índices declarados no próprio schema. A lista de modelos e o papel de cada um estão no `AGENTS.md` da raiz.

## Arquivos principais

| Arquivo                    | O que tem de especial                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Chamado.ts`               | O maior schema e o de mais índices, inclusive o único parcial de `conversaId` e o parcial de `iaSituacao` |
| `LlmCall.ts`               | Expira em 365 dias; regras de TTL em `lib/llm/AGENTS.md`                                                  |
| `unit.ts`, `user.model.ts` | Nomes de arquivo fora do padrão (minúsculo, e `.model` no usuário); os outros seguem `NomeDoModelo.ts`    |

## Convenções

- Um modelo novo apaga o registro antigo antes de registrar, como o `Chamado.ts` faz: `if (mongoose.models.X) { delete mongoose.models.X; }` e depois `mongoose.model('X', XSchema)`. É o padrão de 14 dos 23 modelos.
- Índice que precisa conviver com valores ausentes é parcial: `Chamado.conversaId` é único com `partialFilterExpression: { conversaId: { $type: 'objectId' } }`, para vários chamados sem conversa coexistirem.
- Os índices vêm de `Schema.index(...)` no schema. Teste que precisa do índice único ou do TTL chama `createIndexes()` de propósito (ver `tests/mongo-test-env.ts`).

## Gotchas

- Nove modelos mais antigos reaproveitam o que já está registrado (`mongoose.models.X || mongoose.model(...)`): `Attachment`, `ChamadoComment`, `Cotacao`, `PauseLog`, `ServiceCatalog`, `ServiceSubType`, `ServiceType`, `Unit` e `User`. No `next dev`, uma mudança no schema deles não vale até reiniciar o servidor, porque o modelo antigo continua registrado.
- O Mongoose não altera índice que já existe na coleção. Mudar TTL ou opção de um índice existente pede ajuste manual no MongoDB (o caso do `LlmCall` está em `lib/llm/AGENTS.md`).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
