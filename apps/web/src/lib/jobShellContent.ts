import { MAX_JOB_SHELL_BYTES } from '@mmt/contracts';
import { LocalizedError } from './localizedError';
import { text } from '../i18n/catalog';
import { siteComputersTextTemplates } from '../i18n/siteComputers';

const BYTES_PER_MIB = 1024 ** 2;

/**
 * APIが保存する形のjob shell。スクリプトそのもので、空でなく、UTF-8でMAX_JOB_SHELL_BYTES以下。
 * 書いたとおりに保存するので、空白は決して削らない。
 */
export function parseJobShellContent(content: string): string {
  if (!content.trim()) throw new Error(text.jobShellRequired);
  if (new TextEncoder().encode(content).length > MAX_JOB_SHELL_BYTES)
    throw new LocalizedError(() => siteComputersTextTemplates.jobShellTooLarge(MAX_JOB_SHELL_BYTES / BYTES_PER_MIB));
  return content;
}
