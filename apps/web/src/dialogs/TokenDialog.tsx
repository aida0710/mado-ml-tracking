import { useId, useState } from 'react';
import type { Project, ProjectRole, ServiceAccount, TokenScope, TokenSummary } from '@mmt/contracts';
import { administrationApi } from '../api/administration';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { TokenPurposeFields } from '../components/TokenPurposeFields';
import { TokenExpiryFields } from '../components/TokenExpiryFields';
import { IssuedTokenDialog } from './IssuedTokenDialog';
import { useMutation } from '../hooks/useMutation';
import { scopesAllowedForRole } from '../lib/tokenScopes';
import { DEFAULT_TOKEN_EXPIRY_SELECTION, resolveTokenExpiryTimestamp } from '../lib/tokenExpiry';
import {
  initialTokenScopeChoice,
  purposesForOwner,
  type TokenOwnerKind,
  type TokenScopeChoice,
} from '../lib/tokenPurposes';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { serviceAccountsTextTemplates } from '../i18n/serviceAccounts';

type IssuedToken = { token: string; item: TokenSummary };
export type TokenRequest = { name: string; scopes: TokenScope[]; expiresAt: string | null };

/** A Service Account that receives the token, and how to issue a token to it. */
export interface ServiceAccountTokenOwner {
  serviceAccount: ServiceAccount;
  issue: (request: TokenRequest) => Promise<IssuedToken>;
}

/**
 * Issues a token for the signed-in user, or for a Service Account when `owner` is set, and then
 * shows it once. Every button that issues a token opens this dialog: one chooses what the token is
 * for and the scopes follow (`initialScopes` lets a guide choose for them). The scopes on offer
 * stop at the owner's Project role, as the API does.
 */
export function TokenDialog({
  project,
  owner,
  initialScopes,
  onClose,
  onCreated,
}: {
  project: Project;
  owner?: ServiceAccountTokenOwner;
  initialScopes?: readonly TokenScope[];
  onClose: () => void;
  onCreated: () => void;
}) {
  useLocale();
  const serviceAccount = owner?.serviceAccount;
  const [token, setToken] = useState<string | null>(null);
  const title = serviceAccount
    ? serviceAccountsTextTemplates.serviceAccountTokenTitle(serviceAccount.name)
    : text.newToken;
  if (token)
    return (
      <IssuedTokenDialog title={title} projectId={project.id} token={token} onClose={onClose} />
    );
  const ownerRole: ProjectRole = serviceAccount ? (serviceAccount.role ?? 'viewer') : project.role;
  return (
    <TokenIssueForm
      title={title}
      owner={{ role: ownerRole, isServiceAccount: Boolean(serviceAccount) }}
      initialScopes={initialScopes}
      issue={(request) =>
        owner
          ? owner.issue(request)
          : administrationApi.createToken({ ...request, kind: 'personal', projectId: project.id })
      }
      onClose={onClose}
      onIssued={(issued) => {
        setToken(issued.token);
        onCreated();
      }}
    />
  );
}

function TokenIssueForm({
  title,
  owner,
  initialScopes,
  issue,
  onClose,
  onIssued,
}: {
  title: string;
  owner: TokenOwnerKind;
  initialScopes?: readonly TokenScope[];
  issue: (request: TokenRequest) => Promise<IssuedToken>;
  onClose: () => void;
  onIssued: (issued: IssuedToken) => void;
}) {
  useLocale();
  const nameId = useId();
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState(DEFAULT_TOKEN_EXPIRY_SELECTION);
  const [scopeChoice, setScopeChoice] = useState<TokenScopeChoice>(() =>
    initialTokenScopeChoice({ owner, initialScopes }),
  );
  const mutation = useMutation();
  async function submit() {
    if (!scopeChoice.scopes.length) throw new Error(text.tokenPurposeRequired);
    const expiresAt = resolveTokenExpiryTimestamp(expiry);
    if (expiresAt === undefined)
      throw new Error(expiry.option === 'calendar' ? text.tokenExpiryDateInvalid : text.tokenExpiryInvalid);
    return issue({
      name: name.trim(),
      scopes: scopeChoice.scopes,
      expiresAt,
    });
  }
  return (
    <Dialog title={title} onClose={onClose} busy={mutation.pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutation.run(submit).then((issued) => {
            if (issued) onIssued(issued);
          });
        }}
      >
        <fieldset disabled={mutation.pending}>
          <div className="form-fields">
            <div className="field">
              <label htmlFor={nameId}>
                {text.name}
                <span className="required" aria-hidden="true">
                  {' '}
                  *
                </span>
              </label>
              <input
                id={nameId}
                value={name}
                required
                aria-describedby={`${nameId}-hint`}
                onChange={(event) => setName(event.target.value)}
              />
              <p id={`${nameId}-hint`} className="field-hint">
                {text.tokenNameHint}
              </p>
            </div>
            <TokenPurposeFields
              purposes={purposesForOwner(owner)}
              allowedScopes={scopesAllowedForRole(owner.role)}
              value={scopeChoice}
              onChange={setScopeChoice}
            />
            <TokenExpiryFields value={expiry} onChange={setExpiry} />
          </div>
        </fieldset>
        <ErrorNotice message={mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending}>
            {mutation.pending ? text.loading : text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
