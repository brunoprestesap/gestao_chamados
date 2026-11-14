# Escopo: Contexto (o que já existia)

Parte do escopo do Sigma. Tabela geral, Deferred e legenda em [index.md](index.md).

## Existing (contexto)

O que esta fatia usa e que já está pronto. Outras áreas prontas (relatório IMR, chamados recorrentes, relatório de breach, feriados) estão descritas no `AGENTS.md` e não são tocadas aqui.

### 1. Autenticação LDAP e perfis · existing

Login por matrícula via LDAP/AD com reserva de senha local, 4 perfis e guards na DAL. code in `auth.ts`, `lib/ldap.ts`, `lib/dal.ts`

### 2. Unidades e usuários · existing

Cadastro de unidades (nome, andar) e usuários; a unidade do usuário vem do departamento do AD no primeiro login e pode estar vazia. code in `app/(dashboard)/unidades/`, `app/(dashboard)/usuarios/`, `models/unit.ts`, `models/user.model.ts`

### 3. Catálogo de serviços · existing

Catálogo em três níveis (tipo, subtipo, serviço) com prioridade padrão por serviço. code in `app/(dashboard)/catalogo/`, `models/ServiceType.ts`, `models/ServiceSubType.ts`, `models/ServiceCatalog.ts`

### 4. Abertura de chamado por formulário · existing

Formulário completo com unidade, local exato, catálogo e urgência. Continua como alternativa ao chat. code in `app/(dashboard)/meus-chamados/_components/NewTicketDialog.tsx`, `app/(dashboard)/meus-chamados/actions.ts`

### 5. Triagem, classificação e atribuição pelo Preposto · existing

Preposto classifica (prioridade final e snapshot de SLA), atribui técnico elegível por especialidade e carga, recusa, reatribui e encerra. code in `app/(dashboard)/gestao/`, `app/api/gestao/chamados/[id]/eligible-technicians/`

### 6. Detalhe do chamado: comentários, histórico, anexos · existing

Página do chamado com linha do tempo de auditoria, comentários, galeria de anexos e cancelamento. code in `app/(dashboard)/meus-chamados/[id]/`, `models/ChamadoComment.ts`, `models/ChamadoHistory.ts`, `models/Attachment.ts`

### 7. SLA, expediente e pausas · existing

Cálculo de prazos por prioridade respeitando expediente e feriados, pausas por aguardando solicitante ou terceiros, monitor de breach. code in `lib/sla-utils.ts`, `lib/sla-monitor.ts`, `lib/expediente-config.ts`, `models/SlaConfig.ts`

### 8. Notificações em tempo real · existing

Socket.IO separado com salas por usuário e gestores, emissão sem bloquear a regra de negócio e reserva no banco. code in `socket-server/`, `lib/realtime-emit.ts`, `shared/socket.ts`
