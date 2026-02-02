/**
 * PM2 ecosystem: Next.js na porta 3000 e socket-server na 3001.
 *
 * Build antes de subir:
 *   - Next:  npm run build  (na raiz)
 *   - Socket:  cd socket-server && npm run build
 *
 * Em desenvolvimento pode usar:
 *   - next dev  (Next)
 *   - cd socket-server && npx tsx src/index.ts  (Socket)
 *
 * Produção:
 *   pm2 start ecosystem.config.cjs
 */

module.exports = {
  apps: [
    {
      name: 'next-app',
      cwd: __dirname,
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
    {
      name: 'socket-server',
      cwd: __dirname + '/socket-server',
      script: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
