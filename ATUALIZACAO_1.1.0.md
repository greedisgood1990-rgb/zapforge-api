# Registro da atualização 1.1.0

## Implementado

- Gerenciamento de grupos.
- Criação, leitura e atualização de nome/descrição.
- Configuração de envio somente por administradores.
- Bloqueio de edição de informações do grupo.
- Mensagens temporárias quando suportadas.
- Controle de quem pode adicionar membros.
- Aprovação de solicitações de entrada.
- Adição e remoção de participantes.
- Promoção e rebaixamento de administradores.
- Consulta, renovação e aceitação de convites.
- Saída de grupos.
- Menção de todos ou de participantes selecionados.
- Botões de resposta, URL, ligação e cópia.
- Listas interativas e enquetes.
- Webhooks de interação e atualização de grupos.
- Endpoint de capabilities.
- Validação segura de IDs e caminhos de sessão.
- Baileys atualizado para `^6.7.23`.
- Docker corrigido para instalar dependências Git do Baileys.
- Swagger, Postman, README e documentação atualizados.

## Arquivos principais alterados

- `src/adapters/base.ts`
- `src/adapters/baileys/BaileysEngine.ts`
- `src/core/types.ts`
- `src/core/sessionManager.ts`
- `src/config.ts`
- `src/routes/messages.ts`
- `src/routes/groups.ts`
- `src/routes/sessions.ts`
- `src/utils/message.ts`
- `src/utils/sessionId.ts`
- `src/index.ts`
- `src/routes/health.ts`
- `public/dashboard.html`
- `package.json`
- `Dockerfile`
- `.env.example`
- `README.md`
- `openapi.yaml`
- `postman_collection.json`
- `docs/*`

## Rotas novas

- `GET /v1/sessions/:id/capabilities`
- `POST /v1/messages/group-mention`
- `POST /v1/messages/buttons`
- `POST /v1/messages/list`
- `POST /v1/messages/poll`
- `POST /v1/sessions/:sessionId/groups`
- `PATCH /v1/sessions/:sessionId/groups/:groupId`
- `POST /v1/sessions/:sessionId/groups/:groupId/participants`
- `POST /v1/sessions/:sessionId/groups/:groupId/admins`
- `GET /v1/sessions/:sessionId/groups/:groupId/join-requests`
- `POST /v1/sessions/:sessionId/groups/:groupId/join-requests`
- `GET /v1/sessions/:sessionId/groups/:groupId/invite`
- `POST /v1/sessions/:sessionId/groups/:groupId/invite/reset`
- `POST /v1/sessions/:sessionId/groups/invite/accept`
- `POST /v1/sessions/:sessionId/groups/:groupId/leave`

## Validação executada

- Sintaxe TypeScript validada em todos os arquivos.
- `npm run build` concluído com TypeScript estrito e tipos reais de Fastify/Baileys.
- Inicialização HTTP testada com sucesso.
- `GET /health` retornou a versão `1.1.0`.
- Swagger gerado em runtime com 27 caminhos e todas as rotas críticas presentes.
- JSON e OpenAPI validados antes da geração do ZIP.

## Limitações conhecidas

- Botões e listas native-flow são experimentais no provider Baileys e podem variar após atualizações do WhatsApp Web.
- A instalação precisa de acesso à internet para baixar dependências npm e Git.
- O teste real de conexão, QR Code e envio exige um número de WhatsApp conectado no servidor.
- Banco PostgreSQL, Redis, filas persistentes e provider Meta Cloud API continuam no roadmap.
