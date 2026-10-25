import type { TokenSummary } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';

// tokenの見せ方は、所有者がService Accountか人かで決まる。
const tokenSummarySelect = `SELECT t.id,t.name,t.kind,t.project_id,t.scopes,t.expires_at,t.last_used_at,
  t.created_at,CASE WHEN o.kind='service' THEN 'service_account' ELSE 'user' END AS owner_type,
  o.id AS owner_id,o.display_name AS owner_name,t.token_prefix
  FROM api_tokens t JOIN users o ON o.id=t.user_id`;

export interface TokenInsert {
  ownerUserId: string;
  createdByUserId: string;
  projectId: string | null;
  name: string;
  kind: TokenSummary['kind'];
  tokenHash: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
}

export interface TokenOwnership {
  ownerUserId: string;
  ownerKind: 'human' | 'service';
  projectId: string | null;
  scopes: string[];
  expiresAt: string | null;
}

export async function insertToken(
  connection: Connection,
  token: TokenInsert,
): Promise<TokenSummary> {
  const inserted = await first<{ id: string }>(
    connection,
    `INSERT INTO api_tokens(user_id,created_by_user_id,project_id,name,kind,token_hash,token_prefix,scopes,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      token.ownerUserId,
      token.createdByUserId,
      token.projectId,
      token.name,
      token.kind,
      token.tokenHash,
      token.tokenPrefix,
      token.scopes,
      token.expiresAt,
    ],
  );
  return (await findTokenSummary(connection, inserted!.id))!;
}

export async function findTokenSummary(
  connection: Connection,
  tokenId: string,
): Promise<TokenSummary | undefined> {
  return first<TokenSummary>(connection, `${tokenSummarySelect} WHERE t.id=$1`, [tokenId]);
}

/** 利用者が所有する、失効していないtoken。projectIdで1つのProjectに絞る。 */
export async function listOwnedTokens(
  connection: Connection,
  owner: { userId: string; projectId: string | null },
): Promise<TokenSummary[]> {
  return rows<TokenSummary>(
    connection,
    `${tokenSummarySelect} WHERE t.user_id=$1 AND t.revoked_at IS NULL
    AND ($2::uuid IS NULL OR t.project_id=$2) ORDER BY t.created_at DESC,t.id`,
    [owner.userId, owner.projectId],
  );
}

/** そのProjectに限定した、失効していないtokenすべて。所有者は問わない。 */
export async function listProjectTokens(
  connection: Connection,
  projectId: string,
): Promise<TokenSummary[]> {
  return rows<TokenSummary>(
    connection,
    `${tokenSummarySelect} WHERE t.project_id=$1 AND t.revoked_at IS NULL
    ORDER BY t.created_at DESC,t.id`,
    [projectId],
  );
}

export async function findActiveTokenOwnership(
  connection: Connection,
  tokenId: string,
): Promise<TokenOwnership | undefined> {
  return first<TokenOwnership>(
    connection,
    `SELECT t.user_id AS owner_user_id,o.kind AS owner_kind,t.project_id,t.scopes,t.expires_at
    FROM api_tokens t JOIN users o ON o.id=t.user_id WHERE t.id=$1 AND t.revoked_at IS NULL`,
    [tokenId],
  );
}

/** 監査の記録に要るものを返す。別のリクエストが先に失効させていたらundefined。 */
export async function revokeToken(
  connection: Connection,
  tokenId: string,
): Promise<{ name: string; kind: string; scopes: string[] } | undefined> {
  return first(
    connection,
    'UPDATE api_tokens SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING name,kind,scopes',
    [tokenId],
  );
}
