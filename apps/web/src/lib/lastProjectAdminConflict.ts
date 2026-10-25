import { RequestError } from '../api/http';
import { text } from '../i18n/catalog';

/**
 * メンバーとgroupの付与の変更が409を返すのは、Projectの管理者がいなくなるときだけなので、
 * サーバーの文をそのまま出さず、その理由として示す。
 */
export async function explainLastProjectAdminConflict<T>(change: Promise<T>): Promise<T> {
  try {
    return await change;
  } catch (failure) {
    if (failure instanceof RequestError && failure.status === 409)
      throw new Error(text.lastProjectAdminConflict, { cause: failure });
    throw failure;
  }
}
