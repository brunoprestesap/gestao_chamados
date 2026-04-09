# Anexos / Upload de Fotos

Prioridade: 4 | Complexidade: Alta | Dependências: Volume Docker para storage

## Objetivo

Implementar upload real de arquivos (fotos, PDFs) nos chamados, com galeria visual na página de detalhe. Essencial para manutenção predial — técnico fotografa o problema/solução.

## Contexto do Projeto

- **Campo existente**: `executions[].evidencePhotos` (String[]) no model Chamado — hoje armazena URLs mas não há upload real
- **history.constants.ts**: já define action `'anexo'` sem implementação
- **NewTicketDialog**: `app/(dashboard)/meus-chamados/_components/NewTicketDialog.tsx`
- **RegisterExecutionDialog**: `app/(dashboard)/chamados-atribuidos/_components/RegisterExecutionDialog.tsx`
- **Página de detalhe**: `app/(dashboard)/meus-chamados/[id]/page.tsx`
- **Deploy Docker**: `docker-compose.yml` na raiz — precisa de volume mount para uploads
- **Design system**: shadcn/ui, Tailwind v4, rounded-2xl, indigo/blue palette

## Tarefas

### Infraestrutura de Storage

1. Crie diretório `public/uploads/chamados/` (será criado em runtime)
2. Adicione ao `.gitignore`: `public/uploads/`
3. Em `docker-compose.yml`, adicione volume no serviço next-app:
   ```yaml
   volumes:
     - ./uploads:/app/public/uploads
   ```

### API de Upload

4. Crie `app/api/upload/route.ts`:
   - POST: recebe `FormData` com campos `file` (File) e `chamadoId` (string)
   - requireSession() para autenticação
   - **Validações**:
     - Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
     - Tamanho máximo: 5MB por arquivo
     - Valide MIME type pelo conteúdo (magic bytes dos primeiros bytes), não apenas pelo header Content-Type
     - Verifique que o chamado existe e o user tem acesso (solicitante, técnico atribuído, Admin, Preposto)
   - Sanitize filename: remova caracteres especiais, adicione timestamp (`{timestamp}-{sanitized}`)
   - Crie diretório se não existir: `public/uploads/chamados/{chamadoId}/`
   - Salve arquivo em disco via `fs.writeFile`
   - Retorne `{ ok: true, data: { url, filename, originalName, mimeType, size } }`

### Model de Attachment

5. Crie `models/Attachment.ts`:
   - `chamadoId` (ObjectId, ref: Chamado, required)
   - `userId` (ObjectId, ref: User, required)
   - `filename` (String, required) — nome sanitizado no disco
   - `originalName` (String, required) — nome original do arquivo
   - `mimeType` (String, required)
   - `size` (Number, required) — bytes
   - `url` (String, required) — path relativo `/uploads/chamados/...`
   - `context` (enum: `'abertura'` | `'execucao'` | `'comentario'` | `'geral'`, default: `'geral'`)
   - Timestamps: true
   - Indexes: `{ chamadoId: 1, createdAt: 1 }`
   - Limite: máximo 20 attachments por chamado (validar na API)

### Schema Zod

6. Crie `shared/chamados/attachment.schemas.ts`:
   - `AttachmentSchema`: tipagem do attachment retornado
   - `AttachmentListItemSchema`: para listagem
   - Exporte types

### Server Action

7. Crie `addAttachmentAction` em `app/(dashboard)/meus-chamados/actions.ts`:
   - Após upload via API /api/upload, salve o Attachment no MongoDB
   - Crie entrada no ChamadoHistory com action `'anexo'`
   - emitToRoom: evento `'ticket:attachment_added'`
   - revalidatePath

### API de Listagem

8. Crie `app/api/chamados/[id]/attachments/route.ts`:
   - GET: lista attachments do chamado (com controle de acesso)
   - Populate userId com name

### Componente FileUpload

9. Crie `components/ui/file-upload.tsx`:
   - Client component reutilizável
   - Props: `chamadoId`, `context`, `onUploadComplete`, `maxFiles`, `accept`
   - Drag-and-drop zone com visual de drop hover
   - Input file hidden com trigger por clique na zona
   - Preview: thumbnail para imagens, ícone de arquivo para PDFs
   - Progress bar durante upload (fetch com upload tracking ou estado simples)
   - Lista de arquivos selecionados com botão de remover (antes do upload)
   - Upload individual por arquivo via POST para `/api/upload`
   - Mensagens de erro inline (arquivo muito grande, tipo não permitido)
   - Design: border dashed, rounded-2xl, cores do projeto

### Componente AttachmentGallery

10. Crie `app/(dashboard)/meus-chamados/[id]/_components/AttachmentGallery.tsx`:
    - Client component
    - Fetch attachments via GET `/api/chamados/[id]/attachments`
    - Grid responsivo de thumbnails (imagens) e cards (PDFs)
    - Imagens: thumbnail com aspect-ratio, clique abre lightbox (dialog fullscreen com navegação)
    - PDFs: card com ícone, nome e tamanho, clique abre em nova aba
    - Metadata: quem enviou, quando, contexto (abertura/execução/etc.)
    - Botão "Adicionar arquivo" que abre o FileUpload

### Integração nos Dialogs

11. No `NewTicketDialog`: adicione FileUpload no final do formulário, context='abertura'
12. No `RegisterExecutionDialog`: substitua o campo de texto `evidencePhotos` pelo FileUpload, context='execucao'

### Integração na Página de Detalhe

13. Em `app/(dashboard)/meus-chamados/[id]/page.tsx`:
    - Renderize `AttachmentGallery` como seção dedicada
    - Permita upload adicional se chamado não estiver encerrado/cancelado

### Socket.IO

14. Em `shared/socket.ts`, adicione `'ticket:attachment_added'`

## Regras

- Valide MIME type pelo conteúdo (magic bytes), não apenas pelo header — segurança contra upload malicioso
- Sanitize filenames rigorosamente (remover ../, caracteres especiais, null bytes)
- Não sirva uploads via rota dinâmica — use `public/` para servir via Next.js static
- Limite total: 20 arquivos por chamado, 5MB por arquivo
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse em validações, nunca throw
- Rode `npm run lint` ao final
