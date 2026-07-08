# Segurança

## Reportar vulnerabilidades

Abra uma issue privada/security advisory no GitHub ou envie contato direto ao mantenedor.

## Regras do projeto

- Não publique sessões do diretório `data/`.
- Não publique `.env`.
- Rotas protegidas exigem `x-api-key` ou Bearer token.
- Webhooks usam HMAC SHA-256.
- Mensagens devem respeitar consentimento e opt-out.

## Produção

- Use HTTPS.
- Use firewall.
- Gere API key longa.
- Faça backup criptografado do volume `data`.
- Tenha cuidado com logs contendo dados pessoais.
