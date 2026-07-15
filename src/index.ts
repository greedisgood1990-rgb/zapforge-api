import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrors } from './plugins/errors.js';
import { JsonStore } from './storage/jsonStore.js';
import { GatewayEventBus } from './core/eventBus.js';
import { WebhookService } from './core/webhookService.js';
import { SessionManager } from './core/sessionManager.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { messageRoutes } from './routes/messages.js';
import { groupRoutes } from './routes/groups.js';
import { webhookRoutes } from './routes/webhooks.js';
import { compatRoutes } from './routes/compat.js';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: config.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
  }
});

await app.register(cors, {
  origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((origin: string) => origin.trim())
});
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: config.RATE_LIMIT_WINDOW });
await app.register(swagger, {
  openapi: {
    info: {
      title: 'ZapForge API',
      description: 'Self-hosted messaging gateway with REST API, multi-session support and signed webhooks.',
      version: '1.2.0'
    },
    servers: [{ url: config.PUBLIC_URL }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        BearerAuth: { type: 'http', scheme: 'bearer' }
      }
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }]
  }
});
await app.register(swaggerUi, { routePrefix: '/docs' });
await app.register(fastifyStatic, {
  root: path.resolve('public'),
  prefix: '/'
});

await registerAuth(app, config);
await registerErrors(app);

const store = new JsonStore(config.STORE_FILE);
await store.init();

const bus = new GatewayEventBus();
const sessionManager = new SessionManager(store, bus, config);
const webhookService = new WebhookService(store, bus, config);

await webhookService.init();
await sessionManager.init();

await app.register(healthRoutes);
await app.register(async (scope) => sessionRoutes(scope, sessionManager));
await app.register(async (scope) => messageRoutes(scope, sessionManager));
await app.register(async (scope) => groupRoutes(scope, sessionManager));
await app.register(async (scope) => webhookRoutes(scope, webhookService));
await app.register(async (scope) => compatRoutes(scope, sessionManager));

app.get('/', async (_request, reply) => reply.redirect('/dashboard.html'));

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.HOST, port: config.PORT });
app.log.info(`ZapForge API running on ${config.PUBLIC_URL}`);
