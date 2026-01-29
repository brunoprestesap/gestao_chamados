This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# gestao_chamados

---

## Verificação — Avaliação de Chamados

Cenários manuais para validar o fluxo de avaliação:

### 1. Encerrar chamado sem avaliação → UI mostra "Pendente" e permite avaliar somente ao criador

1. Preposto/Admin encerra um chamado (status Concluído → Encerrado).
2. O criador do chamado acessa **Meus Chamados** ou o **detalhe** do chamado.
3. **Esperado:**
   - Card "Avaliação": texto **"Pendente"** e botão **"Avaliar"** (nunca "Avaliado").
   - Na lista, badge **"Avaliar"** no card (não "Avaliado").
4. Usuário que **não** é o criador não vê o card de avaliação no detalhe; somente o criador pode avaliar.

### 2. Após enviar avaliação → UI muda para "Avaliado" e bloqueia nova avaliação

1. O criador abre o modal **"Avaliar Atendimento"**, escolhe rating 1–5 (e opcionalmente comentário) e clica em **"Enviar Avaliação"**.
2. **Esperado:**
   - Modal fecha; lista/detalhe atualizam.
   - Card "Avaliação": **"Avaliado"** com "· X/5" (X = rating).
   - Na lista, badge **"Avaliado"** no card.
   - Botão **"Avaliar"** some; não é possível avaliar de novo.
