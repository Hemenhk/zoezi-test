import { buildApp, defaultOptions } from './app';
import { HOST, PORT } from './config';

const app = buildApp({ logger: true, ...defaultOptions });

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
