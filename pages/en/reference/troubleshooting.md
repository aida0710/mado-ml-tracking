---
title: Troubleshooting
description: What to check when the API does not start, SSO login fails, tokens return 401 or 403, notifications do not arrive, or the Mado integration and workers stop.
---

# Troubleshooting

## The API does not start

If a setting is wrong, the API prints only the names of missing or malformed settings and stops. Values are never printed.

```text
Invalid configuration: OIDC_RECHECK_SECONDS
MMT_SESSION_ENCRYPTION_KEY is required when AUTH_MODE=hybrid
```

| Message | Fix |
| --- | --- |
| `MMT_DATABASE_URL is required` | Put the database URL in `.env` |
| `OIDC_ISSUER_URL and OIDC_CLIENT_ID are required when AUTH_MODE=...` | Add the Authentik settings, or use `AUTH_MODE=local` |
| `MMT_SESSION_ENCRYPTION_KEY is required ...`, `... must be base64 of 32 bytes` | Set a value generated with `openssl rand -base64 32` |
| `OIDC issuer requires HTTPS ...` | Use an HTTPS issuer URL |
| `Production URLs require HTTPS` | With `NODE_ENV=production`, make `MMT_PUBLIC_URL` and `MMT_WEB_ORIGIN` HTTPS |
| `Development authentication is forbidden in production` | In production, set `AUTH_MODE` to `local`, `oidc`, or `hybrid` |
| `AUTH_SESSION_IDLE_SECONDS must not exceed AUTH_SESSION_ABSOLUTE_SECONDS` | Make the idle limit no longer than the absolute limit |
| `MMT_GIT_SSH_KEY_PATH and MMT_GIT_KNOWN_HOSTS_PATH must be set together` | Set both or remove both |

The API also refuses to start when `OIDC_ALLOWED_GROUPS` is empty, when `OIDC_ROLE_MAPPING_JSON` contains a role other than `admin` and `user`. Setting only one of `MMT_SMTP_URL` and `MMT_SMTP_FROM` also stops it.

If it stops after an update, check for newly required settings. `MMT_SESSION_ENCRYPTION_KEY` is required from the version with SSO session rechecks, and `OIDC_ALLOWED_GROUPS` from the version with group-based login.

## Cannot sign in with SSO

Users get a 401 without the reason. The reason is in `details.reason` of the audit action `auth.oidc.denied`, and in a one-line JSON on the API's standard error (`{"event":"oidc_login_denied","reason":...}`). A global administrator can open this URL in a signed-in browser:

```text
https://tracking.example.com/api/audit-events?action=auth.oidc.denied
```

| `reason` | Meaning | Fix |
| --- | --- | --- |
| `group_not_allowed` | Not in any group of `OIDC_ALLOWED_GROUPS` | Add the user to a group in Authentik. Also check that the ID token contains `groups` |
| `email_not_verified` | `email` is missing or `email_verified` is not true | Mark the email as verified in Authentik and emit `email_verified` in the scope mapping |
| `user_disabled` | The user is disabled in this application | A global administrator enables the user in **Administration** → **Users** |
| `last_admin` | The sync would leave no active global administrator | Prepare another global administrator first (a local administrator is fine) |
| `privileged_link_required` | A privileged local account has the same email | Not linked automatically. A global administrator checks the local account's permissions |
| `service_account` | Tried to sign in as a Service Account | Service Accounts cannot sign in |

If the audit log has a failed `auth.login` with `details.reason` `invalid_oidc_state`, or standard error shows `oidc_authentication_failed`, the cause is communication with Authentik, too much time since the login screen was opened, or the callback opened in another browser. Start over from the login. If it still fails, check that the Authentik redirect URI exactly matches `<MMT_PUBLIC_URL>/api/auth/callback`.

## Suddenly sent back to the login screen

The SSO session recheck may have ended the session. Check the `reason` of the audit action `auth.oidc.recheck`.

| `reason` | Meaning | Fix |
| --- | --- | --- |
| `group_not_allowed` | Removed from the allowed groups | Check group membership. If UserInfo has no `groups`, everyone gets this |
| `idp_session_revoked` | Authentik refused the tokens (signed out of Authentik, and so on) | Sign in again |
| `reauthentication_required` | The access token expired without a refresh token | Add `offline_access` to `OIDC_SCOPES` and the provider |

## Authentik unreachable (503 `oidc_unavailable`)

The API server cannot reach Authentik, so the SSO session's permissions cannot be checked. The session is kept; once Authentik is back, the same session continues. Check that the API server can connect to the issuer URL.

If Authentik will be down for a long time, switch to `AUTH_MODE=hybrid` and sign in with the local administrator.

While Authentik is unreachable, signing out also returns 503 for SSO sessions whose last check is older than `OIDC_RECHECK_SECONDS`. Even if you cannot sign out, the session cannot be used for any operation. Wait until Authentik is back or the session expires.

## Stuck on the password change screen

The initial administrator, and accounts whose password an administrator reset, cannot use other screens until the password is changed (403 `password_change_required`). Change to a password of 12 to 1024 bytes that differs from the current one.

If the administrator's password is lost, run `npm run bootstrap-admin -w @mmt/api` in a terminal on the API server to reset it.

## "Too many attempts" {#attempt-limit-reached}

The login attempt limit was exceeded (429 `rate_limited`). Wait for the `Retry-After` seconds in the response, then try again. The limits are under "Passwords" in [Authentication and local accounts](/en/admin/auth).

## API tokens return 401 or 403

| Response | Cause | Fix |
| --- | --- | --- |
| 401 `invalid_token` | The token is invalid, revoked, or expired, or the owning user or Service Account is disabled | Issue a new token. Check the Service Account's status |
| 401 `identity_sync_required` | An SSO user has not signed in from a browser for 7 days | Sign in once in a browser; the same token works again. Use a Service Account token for long-running work |
| 403 `scope_required` | The token lacks a scope | Issue a token with the needed scopes |
| 403 `project_forbidden` | The owner's Project role is insufficient, or the Project differs from the token's | Check the role, and whether the owner left a group |
| 403 `session_required` | A browser-only operation (changing your own password, your own settings on a computer, purging a Project, and so on) | Use the screen |
| 403 `job_token_forbidden` | Not allowed for Job tokens | Check what running code may do ([API tokens and Service Accounts](/en/admin/tokens)) |
| 401 `basic_auth_unsupported` | Basic authentication on the native API | Use a Bearer token. Basic authentication works only on the MLflow-compatible API |

Check a token's scopes and Project with:

```sh
curl -sS -H "Authorization: Bearer $MMT_API_TOKEN" "$MMT_API_URL/api/auth/token"
```

## Browser actions return 403 `invalid_origin`

The URL you opened differs from the allowed origins. To use LAN or VPN IP addresses, set `MMT_ALLOW_PRIVATE_ORIGINS=true`; to use a DNS name, set `MMT_WEB_ORIGIN` and `MMT_PUBLIC_URL` to that URL. Then restart the API.

## Cannot change Project permissions (409)

If the screen says the change would leave the Project without an Admin, you are removing the last Admin. Grant Admin to another member, or to a group someone has signed in with, first. An Admin grant to a group nobody has signed in with yet does not count (the **Authentik group** list marks it **No one has signed in yet**). If disabling or demoting a global administrator returns 409 `last_active_admin`, prepare another global administrator first.

## "This project is archived" appears

A Project Admin or a global administrator archived the Project (404 `project_archived`). Its data remains. To use it again, ask a global administrator to restore it from **Administration** → **Projects** with **Include archived projects** selected ([Projects](/en/admin/projects)).

## Notifications do not arrive

1. Check that the channel's **Delivery settings** under **Notifications** in **Project settings** shows **Configured**. If not, the variable is missing from the API server's `.env`, or the API was not restarted.
2. Use **Send test** to check that sending works right now.
3. Check the status and failure reason in **Recent delivery history**. What to check for each reason is under "Delivery and failures" in [Notifications and operations alerts](/en/admin/notifications).
4. Check that the rule is enabled and its events and conditions match. **Worker stopped** and **Plugin delivery backlog** do not reach rules with Run kind or experiment conditions.

## Mado integration unreachable or deliveries stalled {#plugin-unreachable-or-deliveries-stalled}

Check the state of the Mado integration under **Integrations** in the Project. Only global administrators can fix its connection settings and keys ([Mado integration](/en/admin/plugins)).

| Symptom | Fix |
| --- | --- |
| "The API server needs MMT_PLUGIN_SECRET_KEY to save and use integration keys.", or `plugin_secret_key_unavailable` | Set `MMT_PLUGIN_SECRET_KEY` in the API server's `.env` and restart the API ([Environment variables](/en/reference/environment#mado-plugin)) |
| "Configure the Mado access token.", or `plugin_token_unavailable` or `plugin_secret_decryption_failed` | If **Access token** shows **Not configured**, enter it in **Mado connection settings** and click **Save**. Connections saved by earlier versions with separate keys also show **Not configured**; enter an access token for them too. If it shows **Configured**, check that `MMT_PLUGIN_SECRET_KEY` has the value it had when the token was saved. If that value cannot be restored, enter the access token again and save |
| **Check connection** fails with "Allow DataLineage Read and Send on the Mado access token" (`plugin_token_scope_missing`) or "Allow the Run namespace on the Mado access token" (`plugin_job_namespace_not_allowed`) | In Mado **Settings → Access → Access Tokens**, allow DataLineage Read and Send and the **Run namespace** on that token, then click **Check connection** again |
| **Check connection** fails with "This Mado cannot report the access token’s permissions (/api/mado/access-token). Update Mado" (`plugin_mado_access_token_unsupported`) | Update Mado to a version that reports the access token's own permissions |
| **Check connection** fails with "Could not communicate with the integration" (`plugin_request_failed`) | Check that the API server can reach **Mado API URL**, and that the access token is valid (not disabled or expired). If Capacity Read is allowed, check that capacity metrics can be read too: the check also reads them |
| Operations alert **Plugin delivery backlog** | Check **Last error** in **Event delivery status** under **Integrations**, fix Mado or the connection settings (**OpenLineage URL**, the access token), then click **Resend event** |

## The worker does not take Jobs or shows as offline

Run on the worker host:

```sh
mado-tracking-worker status --worker-id gpu-host-1
mado-tracking-worker doctor --worker-id gpu-host-1
journalctl --user -u mado-tracking-worker@gpu-host-1 -f
```

- If `doctor` reports a token scope error, check that the Service Account token has `read`, `worker:execute`, and `artifacts:write`.
- If the token returns 401, check whether it expired or the Service Account is disabled. Replace the token with `mado-tracking-worker install --token-file`.
- A Compute target's connection check is done by the worker chosen in **Worker for this connection** under **Add computer** or **Check again**. Checks that name no worker are done only by workers whose `MMT_WORKER_TARGET_IDS` includes that target.
- If a worker is not offered in **Worker for this connection**, check that it is online and up to date (`mado-tracking-worker upgrade`) ([Compute targets](/en/compute/targets#step-1-connection)).

See [Worker](/en/compute/worker) for details.

## A computer is missing from the targets, or Jobs cannot be created (`target_not_available`)

- The target list shows only the computers you can use. Check **Available to me** under **Computers** in **Global settings**.
- You cannot use other people's Private computers, and neither can global administrators. Ask the owner to make it Public, or add your own computer.
- Automation rules, hooks, and Sweeps are checked with their owners. If you moved a rule to a Service Account, check that the computer's owner created that Service Account.
- If a queued Job failed with `submit_failed`, the computer may have become Private after the Job was created.
- Opening a site's job shell, keys, or own settings returns 403 `target_not_available` for the same reason: you cannot use that computer.

See [Computers and visibility](/en/compute/computers).

## Post-processing of a finished Run is missing

If post-processing after a Run ends (such as registering output models) fails, this line appears on the API's standard error. The Run's end and the GPU release are final. It is not retried automatically, so check whether the Run's registration or automation records are missing.

```json
{"event":"run_completion_handler_failed","handler":"<handler name>","runId":"<Run ID>","message":"<error>"}
```

## Artifacts on a storage backend return 503

Changing `MMT_STORAGE_SECRET_KEY` makes the secrets of S3 backends added on the screen undecryptable, and `storage_backend_unavailable` appears in the log at startup. Enter each S3 backend's secret again in **Administration** → **Storage** ([Storage](/en/data/storage)).
