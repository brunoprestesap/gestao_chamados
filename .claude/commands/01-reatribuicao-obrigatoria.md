# Reatribuição com Justificativa Obrigatória

Prioridade: 1 (quick win) | Complexidade: Baixa | Dependências: Nenhuma

## Objetivo

Tornar a justificativa de reatribuição de chamados obrigatória, com histórico visível no dialog.

## Contexto do Projeto

- **ReassignTicketSchema**: `shared/chamados/assignment.schemas.ts` — campo `notes` é opcional hoje
- **reassignTicketAction**: `app/(dashboard)/gestao/actions.ts` (~linha 535) — já salva notes e cria ChamadoHistory
- **ReatribuirChamadoDialog**: `app/(dashboard)/gestao/_components/ReatribuirChamadoDialog.tsx`
- **ChamadoHistory**: registra action `reatribuicao_tecnico` com campo `observacoes`
- **Pattern de Server Action**: requireSession → dbConnect → Zod safeParse → MongoDB → ChamadoHistory.create → emitToRoom → revalidatePath → return {ok}

## Tarefas

1. Em `shared/chamados/assignment.schemas.ts`, altere o campo `notes` no **ReassignTicketSchema**:
   - De: `z.string().max(2000).optional()`
   - Para: `z.string().min(10, 'Justificativa deve ter no mínimo 10 caracteres').max(2000)`
   - Remova `.optional()` — o campo passa a ser obrigatório

2. Em `ReatribuirChamadoDialog.tsx`:
   - Marque o campo de notas como obrigatório (asterisco visual `*`, atributo `required`)
   - Adicione placeholder: `"Informe o motivo da reatribuição (mínimo 10 caracteres)"`
   - Mostre contador de caracteres (ex: `12 / 2000`)
   - Desabilite o botão de submit se notes < 10 caracteres

3. Na mesma dialog, adicione seção **"Histórico de atribuições"** abaixo do select de técnico:
   - Busque do ChamadoHistory as actions `atribuicao_tecnico` e `reatribuicao_tecnico` para o chamado
   - Exiba: quem atribuiu → para quem → quando → justificativa
   - Use layout de timeline compacto (reutilize padrão visual do HistoryTimeline)

4. Ajuste mensagens de erro no frontend para exibir feedback claro quando validação Zod falhar no campo notes

## Regras

- Não altere a lógica interna do `reassignTicketAction` — ele já salva notes corretamente
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse em validações, nunca throw
- Design: shadcn/ui, rounded-2xl, indigo/blue palette
- Rode `npm run lint` ao final para garantir zero erros
