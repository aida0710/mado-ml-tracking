import type { ComputeTarget, ExecutionRuntime } from '@mmt/contracts';
import { DomainError } from '../domain/errors.js';

// Docker Hub serves images named without a registry (ubuntu, pytorch/pytorch).
const DOCKER_HUB_REGISTRY = 'registry-1.docker.io';
// Names people write for Docker Hub; requests go to DOCKER_HUB_REGISTRY.
const DOCKER_HUB_ALIASES = new Set(['docker.io', 'index.docker.io', DOCKER_HUB_REGISTRY]);
const MANIFEST_MEDIA_TYPES = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
];
const INDEX_MEDIA_TYPES = new Set(MANIFEST_MEDIA_TYPES.slice(0, 2));
// A registry that does not answer within this time is reported as unavailable.
const REGISTRY_TIMEOUT_MS = 10_000;
// Images are pinned to a digest, so a result never changes; this bounds the memory it takes.
const CACHE_LIMIT = 1000;

export interface ImagePlatform {
  os: string;
  architecture: string;
}

export interface ImagePlatformChecker {
  /** Refuses a docker image that is not built for the target's CPU (no-op when the check is off). */
  assertRunsOn(runtime: ExecutionRuntime, target: Pick<ComputeTarget, 'cpuArch'>): Promise<void>;
}

/** MMT_IMAGE_PLATFORM_CHECK=off: images are not looked up. */
export const NO_IMAGE_PLATFORM_CHECK: ImagePlatformChecker = { assertRunsOn: async () => undefined };

/** MMT_REGISTRY_*: a read-only login that is sent only to its own registry. */
export interface RegistryCredentials {
  registry: string;
  username: string;
  password: string;
}

interface ImageReference {
  registry: string;
  repository: string;
  digest: string;
}

export function parseImageReference(image: string): ImageReference {
  const [name, digest] = image.split('@') as [string, string];
  const withoutTag = name.replace(/:[^/:]+$/, '');
  const [first, ...rest] = withoutTag.split('/');
  const hasRegistry = rest.length > 0 && (first!.includes('.') || first!.includes(':') || first === 'localhost');
  if (hasRegistry) return { registry: normalizeRegistryHost(first!), repository: rest.join('/'), digest };
  const repository = rest.length ? withoutTag : `library/${withoutTag}`;
  return { registry: DOCKER_HUB_REGISTRY, repository, digest };
}

export function normalizeRegistryHost(host: string): string {
  const lowered = host.toLowerCase();
  return DOCKER_HUB_ALIASES.has(lowered) ? DOCKER_HUB_REGISTRY : lowered;
}

function unavailable(): never {
  throw new DomainError({
    status: 503,
    code: 'image_registry_unavailable',
    message: 'cannot check the CPU architecture because the image registry cannot be queried',
  });
}

// `Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="..."`.
function bearerChallenge(header: string | null): Record<string, string> | null {
  if (!header || !/^Bearer\s/i.test(header)) return null;
  const parameters: Record<string, string> = {};
  for (const [, key, value] of header.matchAll(/(\w+)="([^"]*)"/g)) parameters[key!] = value!;
  return parameters.realm ? parameters : null;
}

/**
 * Reads an image's platforms from its registry (Docker Registry HTTP API v2): the platforms of an
 * index, or the os and architecture of a single manifest's config. Registries that ask for a
 * token (Docker Hub, Forgejo, GHCR) get one. The image name, and so the registry, is chosen by
 * project editors, so MMT_REGISTRY_USERNAME/PASSWORD go only to MMT_REGISTRY_HOST.
 */
export class RegistryImagePlatformChecker implements ImagePlatformChecker {
  private readonly cache = new Map<string, ImagePlatform[]>();
  private readonly fetcher: typeof fetch;
  private readonly credentials: RegistryCredentials | null;
  constructor(options: {
    credentials: RegistryCredentials | null;
    fetcher?: typeof fetch;
  }) {
    this.credentials = options.credentials;
    this.fetcher = options.fetcher ?? fetch;
  }

  async assertRunsOn(
    runtime: ExecutionRuntime,
    target: Pick<ComputeTarget, 'cpuArch'>,
  ): Promise<void> {
    if (runtime.kind !== 'docker') return;
    const platforms = await this.platformsOf(runtime.image);
    if (!platforms.some((platform) => platform.os === 'linux' && platform.architecture === target.cpuArch))
      throw new DomainError({
        status: 422,
        code: 'image_platform_mismatch',
        message: `the image is not built for ${target.cpuArch} (${platforms.map((platform) => `${platform.os}/${platform.architecture}`).join(', ') || 'unknown'})`,
        details: { cpuArch: target.cpuArch, platforms: platforms.map((platform) => `${platform.os}/${platform.architecture}`) },
      });
  }

  async platformsOf(image: string): Promise<ImagePlatform[]> {
    const cached = this.cache.get(image);
    if (cached) return cached;
    const reference = parseImageReference(image);
    const manifest = (await this.getJson(reference, `manifests/${reference.digest}`)) as {
      mediaType?: string;
      manifests?: { platform?: ImagePlatform }[];
      config?: { digest?: string };
    };
    let platforms: ImagePlatform[];
    if (manifest.manifests && (!manifest.mediaType || INDEX_MEDIA_TYPES.has(manifest.mediaType)))
      platforms = manifest.manifests.flatMap((entry) => (entry.platform ? [entry.platform] : []));
    else if (manifest.config?.digest) {
      const config = (await this.getJson(reference, `blobs/${manifest.config.digest}`)) as Partial<ImagePlatform>;
      platforms = config.os && config.architecture ? [{ os: config.os, architecture: config.architecture }] : [];
    } else platforms = [];
    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(image, platforms);
    return platforms;
  }

  private async getJson(reference: ImageReference, path: string): Promise<unknown> {
    const url = `https://${reference.registry}/v2/${reference.repository}/${path}`;
    const headers: Record<string, string> = { Accept: MANIFEST_MEDIA_TYPES.join(', ') };
    let response = await this.request(url, headers);
    if (response.status === 401) {
      const authorization = await this.authorize(response, reference);
      if (authorization) response = await this.request(url, { ...headers, Authorization: authorization });
    }
    if (!response.ok) unavailable();
    try {
      return await response.json();
    } catch {
      unavailable();
    }
  }

  /** The login for this registry, or null for every other one (they are asked anonymously). */
  private basicFor(reference: ImageReference): string | null {
    if (!this.credentials || this.credentials.registry !== reference.registry) return null;
    const { username, password } = this.credentials;
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  // Basic for registries that ask for it; otherwise the token service the challenge names.
  private async authorize(response: Response, reference: ImageReference): Promise<string | null> {
    const challenge = response.headers.get('www-authenticate');
    const basic = this.basicFor(reference);
    if (challenge && /^Basic\s/i.test(challenge)) return basic;
    const bearer = bearerChallenge(challenge);
    if (!bearer) return null;
    let tokenUrl: URL;
    try {
      tokenUrl = new URL(bearer.realm!);
    } catch {
      unavailable();
    }
    // Registries are read over https only; a token service must not downgrade that.
    if (tokenUrl.protocol !== 'https:') unavailable();
    if (bearer.service) tokenUrl.searchParams.set('service', bearer.service);
    tokenUrl.searchParams.set('scope', bearer.scope ?? `repository:${reference.repository}:pull`);
    const tokenResponse = await this.request(tokenUrl.toString(), basic ? { Authorization: basic } : {});
    if (!tokenResponse.ok) unavailable();
    const issued = (await tokenResponse.json().catch(() => ({}))) as {
      token?: string;
      access_token?: string;
    };
    const token = issued.token ?? issued.access_token;
    return token ? `Bearer ${token}` : null;
  }

  private async request(url: string, headers: Record<string, string>): Promise<Response> {
    try {
      return await this.fetcher(url, { headers, signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
    } catch {
      unavailable();
    }
  }
}
