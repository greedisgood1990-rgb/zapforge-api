# Exemplos cURL — ZapForge API 1.1

Defina variáveis:

```bash
export ZAPFORGE_URL=http://localhost:2785
export ZAPFORGE_KEY=change-this-super-secret-key
export ZAPFORGE_SESSION=default
```

## Criar sessão

```bash
curl -X POST "$ZAPFORGE_URL/v1/sessions" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"id":"default"}'
```

## QR Code

```bash
curl "$ZAPFORGE_URL/v1/sessions/$ZAPFORGE_SESSION/qr" \
  -H "x-api-key: $ZAPFORGE_KEY"
```

## Capabilities

```bash
curl "$ZAPFORGE_URL/v1/sessions/$ZAPFORGE_SESSION/capabilities" \
  -H "x-api-key: $ZAPFORGE_KEY"
```

## Enviar texto

```bash
curl -X POST "$ZAPFORGE_URL/v1/messages/text" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"sessionId":"default","to":"5599999999999","body":"Olá da ZapForge API"}'
```

## Mencionar todos no grupo

```bash
curl -X POST "$ZAPFORGE_URL/v1/messages/group-mention" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"sessionId":"default","groupId":"120363000000000000@g.us","body":"Atenção!","mentionAll":true}'
```

## Botões

```bash
curl -X POST "$ZAPFORGE_URL/v1/messages/buttons" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sessionId":"default",
    "to":"5599999999999",
    "body":"Escolha:",
    "buttons":[
      {"type":"reply","id":"yes","text":"Sim"},
      {"type":"reply","id":"no","text":"Não"}
    ]
  }'
```

## Lista

```bash
curl -X POST "$ZAPFORGE_URL/v1/messages/list" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sessionId":"default",
    "to":"5599999999999",
    "body":"Escolha um plano:",
    "buttonText":"Ver planos",
    "sections":[{"title":"Planos","rows":[{"id":"basic","title":"Básico"},{"id":"pro","title":"Pro"}]}]
  }'
```

## Enquete

```bash
curl -X POST "$ZAPFORGE_URL/v1/messages/poll" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"sessionId":"default","to":"120363000000000000@g.us","question":"Melhor horário?","options":["09:00","14:00","18:00"]}'
```

## Criar grupo

```bash
curl -X POST "$ZAPFORGE_URL/v1/sessions/default/groups" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"subject":"Clientes VIP","participants":["5511999999999"]}'
```

## Adicionar participante

```bash
curl -X POST "$ZAPFORGE_URL/v1/sessions/default/groups/120363000000000000@g.us/participants" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"participants":["5511888888888"],"action":"add"}'
```

## Promover administrador

```bash
curl -X POST "$ZAPFORGE_URL/v1/sessions/default/groups/120363000000000000@g.us/admins" \
  -H "x-api-key: $ZAPFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"participants":["5511888888888"],"action":"promote"}'
```
