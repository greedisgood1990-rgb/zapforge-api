# Deploy por SSH

Este pacote é completo. O ZIP pode ser enviado diretamente do computador local para o servidor.

## 1. Enviar do computador

O arquivo estará em:

```txt
/home/renato-gomes/Downloads/zapforge-api-v1.2.0-completo.zip
```

Envie para o servidor:

```bash
scp /home/renato-gomes/Downloads/zapforge-api-v1.2.0-completo.zip root@IP_DO_SERVIDOR:/root/
```

## 2. Acessar o servidor

```bash
ssh root@IP_DO_SERVIDOR
```

## Nova instalação com Docker

```bash
apt update
apt install -y unzip git docker.io docker-compose-plugin

mkdir -p /opt/zapforge-api
cd /opt/zapforge-api
unzip -o /root/zapforge-api-v1.2.0-completo.zip -d /tmp/zapforge-release
cp -a /tmp/zapforge-release/zapforge-api/. /opt/zapforge-api/

cp .env.example .env
nano .env

docker compose up -d --build
```

Confira:

```bash
curl http://127.0.0.1:9467/health
docker compose logs -f --tail=100
```

## Atualizar instalação existente com Docker

O procedimento abaixo preserva `.env` e `data/` e cria backup antes de atualizar.

```bash
cd /opt/zapforge-api

BACKUP="/root/zapforge-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP" .env data 2>/dev/null || true

docker compose down
rm -rf /tmp/zapforge-release
mkdir -p /tmp/zapforge-release
unzip -o /root/zapforge-api-v1.2.0-completo.zip -d /tmp/zapforge-release

cp -a /tmp/zapforge-release/zapforge-api/. /opt/zapforge-api/

docker compose up -d --build
curl http://127.0.0.1:9467/health
```

O comando `cp -a` não apaga `data/`. O `.env` existente não é substituído porque o pacote contém apenas `.env.example`.

Adicione ao `.env` existente, caso ainda não estejam presentes:

```env
GROUP_MENTION_MAX_PARTICIPANTS=1024
GROUP_PARTICIPANT_BATCH_MAX=100
```

## Instalação sem Docker

Requisitos: Node.js 20 ou 22, npm e Git.

```bash
apt update
apt install -y unzip git ca-certificates

mkdir -p /opt/zapforge-api
rm -rf /tmp/zapforge-release
mkdir -p /tmp/zapforge-release
unzip -o /root/zapforge-api-v1.2.0-completo.zip -d /tmp/zapforge-release
cp -a /tmp/zapforge-release/zapforge-api/. /opt/zapforge-api/

cd /opt/zapforge-api
[ -f .env ] || cp .env.example .env
npm install --no-audit --no-fund
npm run build
npm start
```

Com PM2:

```bash
npm install -g pm2
pm2 start dist/index.js --name zapforge-api
pm2 save
pm2 startup
```

## Nginx básico

```nginx
server {
    listen 80;
    server_name api.seudominio.com;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:9467;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use HTTPS em produção.
