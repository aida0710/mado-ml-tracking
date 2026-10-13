import { fileURLToPath } from 'node:url';
// These are the application services we publish; PostgreSQL and Forgejo keep their upstream images.
export const RELEASE_IMAGES = ['api', 'web', 'preview', 'worker', 'launcher'].map((service) => ({
  service,
  image: `mado-ml-tracking-${service}`,
  dockerfile: `Dockerfile.${service}`,
}));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify({ include: RELEASE_IMAGES })}\n`);
}
