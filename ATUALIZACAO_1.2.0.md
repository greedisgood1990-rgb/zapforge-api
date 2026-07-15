# Atualização 1.2.0

## Diagnóstico

A versão 1.1.0 possuía três limitações principais no fluxo de conexão:

1. Não havia endpoint para `requestPairingCode`.
2. O ciclo de conexão não impedia inicializações paralelas nem diferenciava sessão registrada de sessão ainda não vinculada ao decidir reconectar.
3. O envio de botões dependia exclusivamente do relay native-flow e não oferecia fallback nem informação sobre o modo efetivamente usado.

Também havia uma porta fixa comum (`2785`) em toda a configuração e documentação.

## Alterações executadas

- Endpoint `POST /v1/sessions/:id/pairing-code`.
- Normalização e validação do telefone.
- Serialização das solicitações de pairing.
- Reutilização de código ainda válido.
- Cooldown, janela de tentativas e lockout configuráveis.
- Header `Retry-After` nas respostas HTTP 429.
- Inicialização de socket idempotente.
- Geração de socket identificada por versão local para ignorar eventos obsoletos.
- Reconexão exponencial com jitter para sessões registradas.
- Bloqueio de reconexão automática em sessões ainda não registradas.
- Limpeza de credenciais após logout terminal.
- Fallback textual para botões quando o native-flow falha.
- Validação de limite de botões e IDs de resposta duplicados.
- Retorno `deliveryMode` e `warnings` nas mensagens interativas.
- Inicializador de `.env` com porta livre aleatória no intervalo `9000–9999`.
- Porta padrão alterada para `9467`.
- Console web atualizado para pairing code e diagnóstico de fallback.
- Documentação de conexão e mensagens interativas adicionada.

## Limites da validação

O build e os testes estáticos validam a estrutura do código, mas QR Code, pairing code e botões precisam de um número real conectado e acesso aos servidores do WhatsApp. A compatibilidade dos botões depende da versão atual do protocolo WhatsApp Web e deve ser verificada em ambiente de teste após atualizações do Baileys.
