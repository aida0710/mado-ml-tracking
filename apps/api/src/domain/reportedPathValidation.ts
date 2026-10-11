import { MAX_TARGET_PATH_LENGTH } from '@mmt/contracts';
import { z } from 'zod';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function hasNoControlCharacters(value: string): boolean {
  return !CONTROL_CHARACTERS.test(value);
}

/**
 * A path a worker or a computer reports (a key file, a Python, a directory): one line, as long as
 * a person would type for a computer.
 */
export const reportedPathSchema = z
  .string()
  .min(1)
  .max(MAX_TARGET_PATH_LENGTH)
  .refine(hasNoControlCharacters, 'Control characters are not allowed');
