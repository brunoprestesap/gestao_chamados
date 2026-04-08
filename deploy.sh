#!/usr/bin/env bash
# ============================================================
# deploy.sh — Setup inicial do Sigma em Ubuntu Server 24.04
# Uso: curl/scp este script para a VPS e execute:
#   chmod +x deploy.sh && sudo ./deploy.sh
# ============================================================

set -euo pipefail

APP_DIR="/opt/severino"
REPO_URL="https://github.com/brunoprestesap/gestao_chamados.git"

echo "=== Sigma — Deploy em Ubuntu Server 24.04 ==="

# -----------------------------------------------
# 1. Atualizar sistema e instalar dependências
# -----------------------------------------------
echo "[1/6] Atualizando sistema..."
apt-get update -y && apt-get upgrade -y

echo "[1/6] Instalando dependências..."
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  git \
  ufw

# -----------------------------------------------
# 2. Instalar Docker Engine + Docker Compose
# -----------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "[2/6] Instalando Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
else
  echo "[2/6] Docker já instalado, pulando..."
fi

# -----------------------------------------------
# 3. Configurar firewall
# -----------------------------------------------
echo "[3/6] Configurando firewall (UFW)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# -----------------------------------------------
# 4. Clonar / atualizar repositório
# -----------------------------------------------
echo "[4/6] Preparando diretório do projeto..."
if [ -z "$REPO_URL" ]; then
  echo "  REPO_URL não definido no script."
  echo "  Copie o projeto manualmente para $APP_DIR e execute novamente."
  mkdir -p "$APP_DIR"
else
  if [ -d "$APP_DIR/.git" ]; then
    echo "  Atualizando repositório existente..."
    cd "$APP_DIR" && git pull
  else
    echo "  Clonando repositório..."
    git clone "$REPO_URL" "$APP_DIR"
  fi
fi

cd "$APP_DIR"

# -----------------------------------------------
# 5. Configurar variáveis de ambiente
# -----------------------------------------------
echo "[5/6] Verificando .env..."
if [ ! -f .env ]; then
  echo "  Criando .env a partir de .env.example..."
  cp .env.example .env

  # Gerar secrets automaticamente
  AUTH_SECRET=$(openssl rand -base64 32)
  SOCKET_SECRET=$(openssl rand -base64 32)

  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" .env
  sed -i "s|^SOCKET_INTERNAL_SECRET=.*|SOCKET_INTERNAL_SECRET=$SOCKET_SECRET|" .env

  echo ""
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  echo "  ║  IMPORTANTE: Edite /opt/sigma/.env antes de continuar!   ║"
  echo "  ║  Configure NEXT_PUBLIC_SOCKET_URL e SOCKET_CORS_ORIGIN      ║"
  echo "  ║  com o IP ou domínio real da VPS.                           ║"
  echo "  ╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Secrets gerados automaticamente."
  echo "  Depois de editar o .env, execute:"
  echo "    cd $APP_DIR && docker compose up -d --build"
  exit 0
else
  echo "  .env já existe, mantendo configuração atual."
fi

# -----------------------------------------------
# 6. Build e iniciar serviços
# -----------------------------------------------
echo "[6/6] Construindo e iniciando containers..."
docker compose up -d --build

echo ""
echo "=== Deploy concluído! ==="
echo ""
echo "Serviços:"
echo "  App:     http://$(hostname -I | awk '{print $1}')"
echo "  Logs:    docker compose -f $APP_DIR/docker-compose.yml logs -f"
echo "  Parar:   docker compose -f $APP_DIR/docker-compose.yml down"
echo "  Rebuild: docker compose -f $APP_DIR/docker-compose.yml up -d --build"
