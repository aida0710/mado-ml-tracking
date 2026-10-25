import { z } from 'zod';
import { contractSchemaRegistry } from '@mmt/contracts/schemas';

export type JsonSchema = Record<string, unknown>;

const COMPONENT_REF_PREFIX = '#/components/schemas/';
const LOCAL_DEF_REF_PREFIX = '#/$defs/';
// zodはregistryのidが無いまま取り出した定義に、変換ごとに`__schema0`、`__schema1`、...と
// 名前を付けるので、同じ名前でも変換が違えば別のスキーマを指す。
const UNNAMED_DEFINITION = /^__schema\d+$/;
const UNNAMED_COMPONENT_PREFIX = 'Inline';
// zodはこれらのformatも長い正規表現で書き出すが、formatだけで意味が伝わる。
const SELF_DESCRIBING_FORMATS = new Set(['uuid', 'date-time', 'email']);

/**
 * zodのスキーマをOpenAPI 3.1（JSON Schema 2020-12）に変換し、共有する定義を
 * `components.schemas`として集める。idを付けて登録した契約のスキーマは、その名前のcomponentへの
 * `$ref`になる。zodがidなしで取り出す定義（z.json()のような再帰的な値）は中身で共有し、同じ
 * 定義にはcomponentを1つだけ割り当てる。
 */
export class JsonSchemaComponents {
  private readonly schemas = new Map<string, JsonSchema>();
  private readonly namesByContent = new Map<string, string>();
  private unnamedCount = 0;

  convert(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
    const converted = z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      metadata: contractSchemaRegistry,
      io,
      // transform（カンマ区切りのクエリのリスト）にはJSON Schemaの出力が無いので、入力の形を残す。
      unrepresentable: 'any',
    }) as JsonSchema;
    const {
      $schema: _dialect,
      $defs: definitions = {},
      ...root
    } = withoutFormatPatterns(converted) as JsonSchema;
    const renames = this.addDefinitions(definitions as Record<string, JsonSchema>);
    return rewriteRefs(root, renames) as JsonSchema;
  }

  /** 生成するドキュメントが経路の順序に左右されないよう、componentを名前順に並べる。 */
  components(): Record<string, JsonSchema> {
    return Object.fromEntries(
      [...this.schemas].sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  private addDefinitions(definitions: Record<string, JsonSchema>): Map<string, string> {
    const renames = new Map<string, string>();
    for (const name of Object.keys(definitions))
      if (!UNNAMED_DEFINITION.test(name)) renames.set(name, name);
    for (const [name, definition] of Object.entries(definitions)) {
      if (!UNNAMED_DEFINITION.test(name)) continue;
      const content = contentKey(definition, name, renames);
      let component = this.namesByContent.get(content);
      if (!component) {
        component = `${UNNAMED_COMPONENT_PREFIX}${++this.unnamedCount}`;
        this.namesByContent.set(content, component);
      }
      renames.set(name, component);
    }
    for (const [name, definition] of Object.entries(definitions)) {
      const component = renames.get(name)!;
      const rewritten = rewriteRefs(definition, renames) as JsonSchema;
      const existing = this.schemas.get(component);
      if (existing && JSON.stringify(existing) !== JSON.stringify(rewritten))
        throw new Error(`OpenAPI component ${component} has two different definitions`);
      this.schemas.set(component, rewritten);
      // 名前付きのcomponentの中身が後の名前の無い定義と一致すれば、それにも使い回す。
      const content = contentKey(definition, name, renames);
      if (!this.namesByContent.has(content)) this.namesByContent.set(content, component);
    }
    return renames;
  }
}

function withoutFormatPatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFormatPatterns);
  if (!value || typeof value !== 'object') return value;
  const node = value as JsonSchema;
  const dropPattern = typeof node.format === 'string' && SELF_DESCRIBING_FORMATS.has(node.format);
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !(dropPattern && key === 'pattern'))
      .map(([key, item]) => [key, withoutFormatPatterns(item)]),
  );
}

// 自分への参照は''にし、1つの再帰的な形が名前にかかわらず1つのキーを持つようにする。
function contentKey(definition: JsonSchema, name: string, renames: Map<string, string>): string {
  return JSON.stringify(rewriteRefs(definition, new Map([...renames, [name, '']]), false));
}

function rewriteRefs(value: unknown, renames: Map<string, string>, strict = true): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteRefs(item, renames, strict));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === '$ref' && typeof item === 'string' && item.startsWith(LOCAL_DEF_REF_PREFIX)) {
        const target = renames.get(item.slice(LOCAL_DEF_REF_PREFIX.length));
        if (target !== undefined) return [key, `${COMPONENT_REF_PREFIX}${target}`];
        if (strict) throw new Error(`Unresolved JSON Schema reference ${item}`);
        return [key, item];
      }
      return [key, rewriteRefs(item, renames, strict)];
    }),
  );
}
