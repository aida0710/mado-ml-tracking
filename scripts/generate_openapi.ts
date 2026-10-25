// nativeの経路の一覧からdocs/openapi.jsonを書き出す: npm run openapi:generate
import { writeFile } from 'node:fs/promises';
import {
  buildOpenApiDocument,
  formatOpenApiDocument,
} from '../apps/api/src/http/openapi/buildOpenApiDocument.js';

const OUTPUT = new URL('../docs/openapi.json', import.meta.url);

await writeFile(OUTPUT, formatOpenApiDocument(buildOpenApiDocument()));
console.log(`Wrote ${OUTPUT.pathname}`);
