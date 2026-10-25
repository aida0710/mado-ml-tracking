import { containsControlCharacter, MAX_TARGET_PATH_LENGTH } from '@mmt/contracts';
import { z } from 'zod';


export function hasNoControlCharacters(value: string): boolean {
  return !containsControlCharacter(value);
}

/**
 * workerやコンピュータが報告するパス（鍵のファイル、Python、ディレクトリ）。1行で、人が
 * コンピュータ用に打ち込む程度の長さ。
 */
export const reportedPathSchema = z
  .string()
  .min(1)
  .max(MAX_TARGET_PATH_LENGTH)
  .refine(hasNoControlCharacters, 'Control characters are not allowed');
