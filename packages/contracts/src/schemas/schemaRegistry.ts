import { z } from 'zod';

/**
 * OpenAPIが名前付きのコンポーネントとして公開する応答のスキーマ。idは契約の型名（`Run`、
 * `ModelVersion`）なので、`#/components/schemas/<id>`はpackages/contractsの同じ名前の
 * TypeScriptの型を指す。
 */
export const contractSchemaRegistry = z.registry<{ id?: string; description?: string }>();

export function namedContractSchema<T extends z.ZodType>(id: string, schema: T): T {
  contractSchemaRegistry.add(schema, { id });
  return schema;
}

/** 型だけでは意味が分からないフィールド。説明はOpenAPIに載る。 */
export function describedField<T extends z.ZodType>(schema: T, description: string): T {
  contractSchemaRegistry.add(schema, { description });
  return schema;
}
