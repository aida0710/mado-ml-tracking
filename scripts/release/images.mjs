import { fileURLToPath } from 'node:url';
// 公開するのはこのアプリケーションのサービス。PostgreSQLとForgejoは上流のイメージのまま使う。
export const RELEASE_IMAGES = ['api', 'web', 'preview', 'worker', 'launcher'].map((service) => ({
  service,
  image: `mado-ml-tracking-${service}`,
  dockerfile: `Dockerfile.${service}`,
}));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify({ include: RELEASE_IMAGES })}\n`);
}
