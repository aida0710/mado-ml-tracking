import { z } from 'zod';

// The screens run under a Content-Security-Policy without 'unsafe-eval' (deploy/nginx.conf). Zod
// otherwise probes `new Function` when it builds an object schema, to compile a faster parser, and
// the browser reports that probe as a violation even though Zod falls back. Parsing without the
// compiled parser is fast enough for the responses the screens check. Zod reads this setting when
// a schema is built, so main.tsx imports this module before anything that defines schemas.
z.config({ jitless: true });
