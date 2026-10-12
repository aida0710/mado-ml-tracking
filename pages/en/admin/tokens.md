---
title: API tokens and Service Accounts
description: Personal API tokens, Service Accounts that belong to no person, scopes, expiry and revocation, and the Job tokens issued for each Job.
---

# API tokens and Service Accounts

The SDK, MLflow, workers, and CI authenticate to the API with API tokens. There are three kinds.

| Kind | Owner | Where it is issued | Good for |
| --- | --- | --- | --- |
| Personal API token | The signed-in user | **My API tokens** in **Account** or **Project settings**, or **Connect from SDK or MLflow 3** | Recording Runs from your own PC or notebook |
| Service Account token | A Service Account (not tied to a person) | **Service accounts** in **Project settings** | Long-running workers, automation, CI |
| Job token | The creator of the Run | Workers receive one automatically for each Job | Recording to the Run from the running code. Nobody issues these by hand |

The token value is shown only once, when it is issued. The database keeps only a hash and the first 12 characters, and no list shows the value.

## Scopes

Scopes decide what a token can do. Scopes beyond the owner's Project role cannot be selected.

| Scope | Allows | Role the owner needs |
| --- | --- | --- |
| `read` | Reading | Viewer |
| `runs:write` | Creating and recording Runs | Editor |
| `registry:write` | Registering models and datasets | Editor |
| `artifacts:write` | Saving Artifacts | Editor |
| `jobs:write` | Starting and canceling Jobs | Editor |
| `worker:execute` | Running Jobs as a worker | Admin |
| `admin` | Managing the Project. Includes every other scope | Admin |

Besides the scopes, every token request checks the owner's current effective role. If the owner is removed from the Project or loses a role, the affected operations return 403 even without revoking the token.

## Expiry

Choose 7, 30, 90 (default), or 365 days, **Never expires**, **Custom duration**, or **Choose from calendar**. A custom duration accepts minutes, hours, or days, including fractional values and durations longer than 365 days. The calendar selects a date and time in the browser's timezone, shown below the field. These options apply to personal and service account tokens.

In the API, `expiresAt: null` means no expiry. Any future timestamp is accepted without a lifetime cap. Omitting the field uses `MMT_TOKEN_DEFAULT_LIFETIME_DAYS` (365 days by default). The legacy `MMT_TOKEN_MAX_LIFETIME_DAYS` setting supplies the default only when the new setting is absent. Past or invalid timestamps return 422 `invalid_expiry`.

An expired token returns 401. Issue a new token and replace the old one before it expires.

## Issue a personal API token

1. Open **Account** from the user menu and click **Issue API token** at the top right of **My API tokens**. Choose the Project and click **Next**. You can also issue a token from the same button in **Project settings**.
2. Enter a name, choose the purpose and expiry, and click **Save**. Choosing a purpose checks the scopes it needs. Changing a scope's checkbox moves the purpose to **Choose scopes manually**.

| Field | Example |
| --- | --- |
| **Name** | `laptop-notebook` (a name that says where it is used) |
| **Purpose** | **Record from SDK or MLflow 3** to record Runs (the default: `read`, `runs:write`, `registry:write`, `artifacts:write`) |
| **Expires at** | **90 days** |

The purposes on offer are below. A purpose that needs a scope above the owner's role is not shown.

| Purpose | Scopes |
| --- | --- |
| **Record from SDK or MLflow 3** | `read`, `runs:write`, `registry:write`, `artifacts:write` |
| **Submit jobs from the command line** | `read`, `jobs:write` |
| **Run jobs as a worker** (Service Accounts only) | `read`, `worker:execute`, `artifacts:write` |
| **Read only** | `read` |
| **Choose scopes manually** | The checked ones |

Besides recording, a token for **Record from SDK or MLflow 3** can delete dataset versions that nothing uses, and a Project admin's token can delete Artifacts as well (on the same conditions as on the screen).

3. Click **Copy token** and store the token somewhere safe. It is never shown again after you close the dialog.

Tokens issued on the screen are limited to that Project. **Issue API token for this project** in **Connect from SDK or MLflow 3**, on **Project settings** or under **Record with SDK** on the experiment page, opens the same dialog.

The **Configuration example** in the dialog holds the environment variables for the Python SDK and MLflow 3 together, without the token. Copy it with **Copy example** and paste it into a terminal; it asks for `API token:`, where you paste the token you copied.

In a terminal, type the token into an environment variable instead of writing it in command arguments or files. The example works in both bash and zsh (the macOS default):

```sh
export MMT_API_URL=https://tracking.example.com
printf 'API token: '; read -r -s MMT_API_TOKEN; echo
export MMT_API_TOKEN
```

Check that the token works with the following command. It prints the token's scopes and Project.

```sh
curl -sS -H "Authorization: Bearer $MMT_API_TOKEN" "$MMT_API_URL/api/auth/token"
```

### SSO users' tokens stop after 7 days

Tokens of users who sign in with SSO stop with 401 `identity_sync_required` when 7 days (`OIDC_TOKEN_SYNC_MAX_AGE_SECONDS`) have passed since the last browser login. This is how removal from an Authentik group is noticed. Signing in once in a browser makes the same tokens work again ([Authentik (SSO)](/en/admin/sso)).

## Service Accounts

A Service Account is an account that belongs to one Project and to no person. Its tokens keep working when the person who issued them leaves the Project, and the 7-day limit for SSO users does not apply.

![The Service Accounts and Project token list sections](/images/en/admin-service-accounts.png)

### Create a Service Account

A Project Admin does this in the browser (API tokens cannot create Service Accounts).

1. Click **Create service account** under **Service accounts** in **Project settings**.
2. Enter the following and save.

| Field | Example |
| --- | --- |
| **Name** | `gpu-host-1-worker` (unique in the Project, up to 200 characters) |
| **Description** | `Worker on GPU server 1` |
| **Role** | `Admin` for a worker or an automation owner, `Viewer` for read-only CI |

3. Click **Issue API token** on the new row, choose a name, purpose, and expiry, and save. For a Service Account with the Admin role, the purpose starts at **Run jobs as a worker**. Note the token that is shown.

![Issuing a token for a Service Account](/images/en/admin-token-dialog.png)

Only scopes up to the Service Account's role can be chosen. `worker:execute` can be issued only to Service Accounts with the Admin role.

Typical scopes by use:

| Use | Role | Scopes |
| --- | --- | --- |
| Worker | Admin | `read`, `worker:execute`, `artifacts:write`; add `registry:write` to register output models and datasets |
| Owner of automation rules and promotion policies | Admin | No token needed (ownership is only transferred) |
| Recording Runs from CI | Editor | `read`, `runs:write`, `artifacts:write` |

See [Worker](/en/compute/worker) for installing a worker, and [Automation](/en/models/automation) for transferring automation rule ownership to a Service Account.

### Stop or change

- Stop temporarily: click **Disable** on the row. All tokens of the Service Account return 401 from the next request. **Enable** makes the same tokens work again.
- Change the role: choose a new role with **Change**. After lowering the role, operations above the new role return 403.
- Stop one token: revoke it in **Project tokens** below.

Service Accounts also appear in **Administration** → **Users** as **Service account**, but they cannot sign in and cannot be made global administrators.

## Revoke a token

- Your own tokens: click **Revoke** under **My API tokens** in **Project settings**, or under the same heading on the **Account** page.
- Project tokens: in **Project tokens**, a Project Admin sees the tokens of every user and Service Account limited to the Project, and can revoke them with **Revoke**. The list shows the owner, the first 12 characters, scopes, expiry, and last use (updated every 5 minutes).

A revoked token returns 401 from the next request and cannot be restored. Issuing and revoking are recorded in the audit log as `token.create` and `token.revoke`.

While a Project is archived, tokens limited to it (including those of Service Accounts) return 401 until it is restored. When a Project is deleted permanently, its tokens are revoked and its Service Accounts are disabled ([Create and manage Projects](/en/admin/projects)).

### Legacy tokens

Tokens marked **Legacy** in the list are service tokens owned by a person. They stop when the owner leaves the Project, so replace them with Service Account tokens. Legacy tokens of the running Playground are to be replaced by their expiry (2026-10-15).

## Job tokens

For each Job, the worker receives a token valid only for that Job (starting with `mmtj_`) and passes it to the running code as `MMT_API_TOKEN` and `MLFLOW_TRACKING_TOKEN`. The worker's own token is never passed to the code. Nobody issues or manages Job tokens by hand.

- Permissions follow the Run creator's current effective role. The scopes are `read`, `runs:write`, `artifacts:write`, and `registry:write`.
- The token can write only to the target Run (metrics, params, tags, logs, input datasets, Artifacts), model and dataset versions whose source is that Run, the Run's Logged Models, and the creation of the output Model. Writing to other Runs in the Project, issuing tokens, Project settings, and automation rules return 403 `job_token_forbidden`.
- It can read anything in the same Project, for example to fetch an upstream Run's Artifacts.
- When the Job ends (finished, failed, or canceled), the token returns 401.

See [Worker](/en/compute/worker) for using it from the running code.

## MLflow Basic authentication

For tools that only accept a username and password, the MLflow-compatible API (`/api/mlflow/...`) also accepts Basic authentication. Put the API token in the password; the username may be empty. Local account passwords are not accepted.

```sh
export MLFLOW_TRACKING_USERNAME=token
printf 'API token: '; read -r -s MLFLOW_TRACKING_PASSWORD; echo
export MLFLOW_TRACKING_PASSWORD
```

Basic authentication to the native API returns 401 `basic_auth_unsupported`. See [Recording from MLflow 3](/en/tracking/mlflow) for the MLflow connection.
