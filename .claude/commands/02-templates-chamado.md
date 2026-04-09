# Templates de Chamado

Prioridade: 2 | Complexidade: Baixa | Dependências: Nenhuma

## Objetivo

Permitir que solicitantes usem templates pré-preenchidos ao criar chamados, reduzindo retrabalho em solicitações repetitivas.

## Contexto do Projeto

- **NewTicketDialog**: `app/(dashboard)/meus-chamados/_components/NewTicketDialog.tsx` — formulário de criação
- **NewTicketFormSchema**: `shared/chamados/new-ticket.schemas.ts` — validação Zod do form
- **React Hook Form** com Zod resolver — usa `reset()` para preencher campos
- **createTicketAction**: `app/(dashboard)/meus-chamados/actions.ts` — Server Action de criação
- **Roles**: Admin e Preposto criam templates globais; qualquer role cria templates pessoais
- **Design system**: shadcn/ui (New York), Tailwind v4, rounded-2xl, indigo/blue palette

## Tarefas

### Model e Schema

1. Crie `models/TicketTemplate.ts`:
   - `name` (String, required) — nome descritivo do template
   - `scope` (enum: `'global'` | `'personal'`)
   - `createdByUserId` (ObjectId, ref: User, required)
   - Campos do template (todos opcionais): `titulo`, `descricao`, `tipoServico`, `naturezaAtendimento`, `grauUrgencia`, `unitId` (ref Unit), `subtypeId` (ref ServiceSubType), `catalogServiceId` (ref ServiceCatalog)
   - `isActive` (Boolean, default: true)
   - `usageCount` (Number, default: 0) — para ordenar por mais usados
   - Indexes: `{ scope: 1, isActive: 1 }`, `{ createdByUserId: 1, isActive: 1 }`
   - Timestamps: true

2. Crie `shared/chamados/ticket-template.schemas.ts`:
   - `CreateTemplateSchema`: name (min 3, max 100), scope, campos opcionais do chamado
   - `TemplateListItemSchema`: para tipagem do retorno da listagem
   - Exporte os types inferred

### Server Actions

3. Crie `app/(dashboard)/meus-chamados/template-actions.ts` com:
   - `createTemplateAction(data)`: qualquer role cria `personal`; apenas Admin/Preposto criam `global`. Segue pattern padrão (requireSession → dbConnect → safeParse → MongoDB → return {ok})
   - `listTemplatesAction()`: retorna templates globais ativos + pessoais do usuário logado, ordenados por `usageCount` desc, limit 50
   - `deleteTemplateAction(templateId)`: soft delete (isActive=false). Dono do template ou Admin podem deletar
   - `incrementTemplateUsageAction(templateId)`: incrementa usageCount atomicamente

### UI — Seletor de Template

4. No `NewTicketDialog`, adicione no topo do formulário (antes dos campos):
   - Combobox/Select: "Usar template..." com busca por nome
   - Carregue templates via `listTemplatesAction()` no mount do dialog
   - Ao selecionar um template, preencha o form via `form.reset({ ...templateValues })` mantendo campos não preenchidos pelo template
   - Incremente usageCount ao selecionar
   - Separe templates globais e pessoais com headers no dropdown

### UI — Salvar como Template

5. No footer do `NewTicketDialog`, adicione botão secundário "Salvar como template":
   - Abre mini dialog/popover pedindo: nome do template e scope (global se Admin/Preposto, senão sempre personal)
   - Salva os valores atuais do form como novo template via `createTemplateAction`
   - Exiba toast de sucesso (Sonner)

### Gestão de Templates

6. Crie seção na página `app/(dashboard)/meus-chamados/page.tsx` ou dropdown no NewTicketDialog:
   - Lista de "Meus templates" com opção de deletar
   - Admin/Preposto veem também templates globais com opção de gerenciar

## Regras

- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse em validações, nunca throw
- Return pattern: `{ ok: true, data }` ou `{ ok: false, error: '...' }`
- Rode `npm run lint` ao final
