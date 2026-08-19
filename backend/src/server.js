// Process entrypoint: binds the port.
//
// The Express app itself lives in app.js and is exported without
// listening, so integration tests can drive it in-process via supertest
// rather than against a running server on a real port.

import app from './app.js';
import { env } from './config/env.js';
import { moduleLogger } from './lib/logger.js';

const log = moduleLogger('server');

app.listen(env.PORT, () => {
  log.info({ port: env.PORT }, 'Raktasetu backend listening');
});

export default app;
