import { z } from 'zod';
import { RUN_NOTE_MAX_LENGTH } from '@mmt/contracts';

// MLflowのset-tagの検証と同じくUTF-16のコード単位で数え、どちらの経路でも同じメモを
// 受け付けるようにする。
export const runNoteUpdateSchema = z.strictObject({
  content: z.string().max(RUN_NOTE_MAX_LENGTH),
});

/** 空の説明は、空文字列を保存せずにtagを消す。 */
export function storedRunNote(content: string): string | null {
  return content === '' ? null : content;
}
