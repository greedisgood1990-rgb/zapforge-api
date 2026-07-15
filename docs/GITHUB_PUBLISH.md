# Como publicar no GitHub

## 1. Criar repositório

No GitHub, crie um novo repositório chamado:

```txt
zapforge-api
```

Descrição recomendada:

```txt
Self-hosted open-source messaging gateway with multi-session REST API, Baileys engine, signed webhooks, Docker, Swagger and a clean dashboard.
```

Topics recomendados:

```txt
whatsapp-api, baileys, self-hosted, rest-api, webhooks, nodejs, typescript, docker, automation, open-source
```

## 2. Subir o código

```bash
cd zapforge-api
git init
git add .
git commit -m "feat: launch ZapForge API"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/zapforge-api.git
git push -u origin main
```

## 3. Criar release

Tag sugerida:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Release title:

```txt
ZapForge API v1.2.0 — Controlled connection lifecycle
```

Release notes:

```txt
First public release of ZapForge API.

Highlights:
- Multi-session REST API
- Baileys engine adapter
- QR onboarding endpoint
- Text/media sending
- Signed webhooks
- Docker Compose
- Swagger UI
- Minimal web dashboard
```

## 4. Revisar o README

Mantenha o README orientado a instalação, contratos HTTP, limites conhecidos e procedimentos de validação.

## 5. Checklist antes de publicar

- [ ] `.env` não foi commitado
- [ ] `data/` não foi commitado
- [ ] `README.md` abre corretamente no GitHub
- [ ] Docker build funciona
- [ ] `/docs` abre Swagger UI
- [ ] QR Code aparece no dashboard
- [ ] Primeiro envio foi testado com número próprio
