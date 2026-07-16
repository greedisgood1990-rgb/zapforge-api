# Deploy

## VPS com Docker

```bash
git clone https://github.com/SEU-USUARIO/zapinho-api.git
cd zapinho-api
bash scripts/init-env.sh
nano .env
docker compose up -d --build
```

Ver logs:

```bash
docker logs -f zapinho-api
```

## Nginx reverse proxy

```nginx
server {
    server_name api.seudominio.com;

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

Depois aplique SSL com Certbot ou use Caddy/Traefik.

## Variáveis essenciais

```env
API_KEY=uma-chave-forte
PUBLIC_URL=https://api.seudominio.com
DATA_DIR=./data
SESSION_DIR=./data/sessions
STORE_FILE=./data/store.json
```

## Backup

Faça backup do diretório `data/`.

Ele contém:

- sessões autenticadas;
- store JSON;
- arquivos de mídia se usados no futuro.

## Atualização

```bash
git pull
docker compose up -d --build
```

## Segurança

- Use HTTPS.
- Troque a API key.
- Restrinja firewall.
- Proteja `/docs` em ambiente público, se necessário.
- Monitore webhooks falhando.
- Guarde o volume `data` com cuidado: ele contém credenciais de sessão.
