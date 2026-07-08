# Exemplos cURL

## Criar sessão

```bash
curl -X POST http://localhost:2785/v1/sessions \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{"id":"default"}'
```

## QR Code

```bash
curl http://localhost:2785/v1/sessions/default/qr \
  -H "x-api-key: change-this-super-secret-key"
```

## Enviar texto

```bash
curl -X POST http://localhost:2785/v1/messages/text \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{"sessionId":"default","to":"5599999999999","body":"Olá da ZapForge API"}'
```

## Enviar imagem por URL

```bash
curl -X POST http://localhost:2785/v1/messages/media \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{"sessionId":"default","to":"5599999999999","type":"image","url":"https://picsum.photos/600/400","caption":"Imagem de teste"}'
```

## Cadastrar webhook

```bash
curl -X POST http://localhost:2785/v1/webhooks \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{"url":"https://webhook.site/seu-id","events":["message.received","message.sent","session.updated"]}'
```
