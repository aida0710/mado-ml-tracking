---
title: Mado integration
description: Configure the built-in Mado integration, import fixed dataset versions, send Run lineage, and migrate existing connections.
---

# Mado integration

Mado is built into mado ML Tracking and updated with the application. New Projects start unconfigured and disabled. The application works without Mado settings and makes no Mado requests until you configure it and choose an operation.

## Configure a Project

1. Set `MMT_PLUGIN_SECRET_KEY` on the API server. Generate a dedicated key with `openssl rand -base64 32`, save it in the private `.env`, and retain it across restarts. Use a value different from the other encryption keys (`MMT_SESSION_ENCRYPTION_KEY`, `MMT_STORAGE_SECRET_KEY`, `MMT_HOOK_SECRET_KEY`), and back it up with the DB ([Environment variables](/en/reference/environment#mado-plugin)).
2. In Mado **Settings → Access → Access Tokens**, issue an access token that allows DataLineage **Read** and **Send** (the **ML Tracking integration** preset selects them). Allow the namespaces of the datasets to import and the namespace that run records are sent to (`mado-model-tracking` by default). To show capacity metrics, also allow Capacity **Read** and its connections.
3. A global administrator opens **Integrations** in the Project, clicks **Mado connection settings**, enters **Mado API URL**, **Mado Web URL**, **OpenLineage URL**, **Run namespace**, **Storage system identifier**, and **Access token**, and clicks **Save**. You do not enter a list of namespaces. The URLs can point to separate entry points; with **OpenLineage URL** left blank, events go to the Mado API URL. Saving a new connection leaves it disabled.
4. Click **Check connection**. The check gets what the access token allows (allowed operations, allowed namespaces, and expiration) from Mado and shows it, then reads the allowed namespaces and, if Capacity Read is allowed, capacity metrics. A token that cannot read or send, or that does not allow the **Run namespace**, is rejected here with the reason. The check works while disabled and never sends a fabricated Run. Then click **Enable integration** and verify sending with a controlled real Run.

Searches and imports use what Mado reports for the token at that time. Adding or removing the token's namespaces in Mado does not require saving the connection again; click **Check connection** to update the displayed values.

Mado must provide `/api/mado/access-token`, which returns the calling token's own permissions, and `/api/mado/lineage/catalog`, `datasets/:id`, and `versions/:id`. With a Mado that lacks `/api/mado/access-token`, the check stops with "This Mado cannot report the access token’s permissions (/api/mado/access-token). Update Mado". See its `docs/model-tracking-api.md`. Tracking uses authenticated Mado APIs, never the Registry directly.

| Operation | Permission |
| --- | --- |
| Save connection settings and the access token, enable/disable, complete migration | Global administrator |
| Check, search, import, read capacity, retry delivery | Project admin |
| Open an imported version in Mado | Project read access |

The access token is encrypted with AES-256-GCM. Responses contain only whether it is configured. Leaving the field blank preserves the saved token. If the encryption key is lost, restore it or enter the access token again.

Connections saved by earlier versions with separate read, write, and capacity keys show as not configured after the update. The three keys cannot be merged into one, so enter an access token and click **Check connection**.

## Datasets and Runs

Importing sends a fixed version ID. The API fetches that version from Mado again and validates its identity, namespace, URI and digest. Concurrent imports return the same immutable DatasetVersion. Existing versions and external references are retained.

Only while a connection is enabled, the dataset pages show **Import from Mado** (to Project admins) and **View in Mado**. The latter verifies the connection referenced by the selected version and opens `/lineage?mode=versions&versionId=…&node=…`. Mado applies the person's own login and permissions.

Run state changes and delivery records are saved in one transaction. The exact OpenLineage body, hash, destination and configuration revision are pinned. Retries use the same body. Imported identities are retained for their original connection; local output names include the Project ID.

Disabling stops new imports, deliveries and delivery records. An already claimed request can finish. Re-enabling resumes existing pending records and does not backfill Runs from the disabled period. Imported versions and delivery history remain.

API/Web/OpenLineage destinations cannot be changed once a connection has version references or delivery history. For another Mado instance, create a separately named connection with **Add Mado connection**. Replacing the access token or changing the connection settings advances the revision and discards stale search/check results.

A response or DB update can be lost after successful delivery. The operator-supplied Mado Registry must treat an identical retried event as the same Run and versions. A duplicate acknowledgment from the Mado entry point does not verify the actual Registry's database behavior.

## Migrate a legacy bridge {#migrate-a-legacy-bridge}

Migration 059 preserves connection UUIDs, enabled flags, external references, pending records and event IDs. Only a connection whose saved manifest ID is `mado` is classified for migration. Delivery and imports remain stopped while migration is pending. Other legacy plugins are retained for renaming or disabling. Multiple connections are not merged.

1. Back up the DB and the bridge's `PLUGIN_LEDGER_DIRECTORY`. Let in-flight bridge requests finish before updating Tracking.
2. Save the actual Mado settings and an access token issued by that Mado on the existing connection. The bridge's old base URL is not the Mado API URL. Saving settings does not resume delivery.
3. Check the connection and import legacy ledger hashes with the command below. Only matching event IDs and exact body hashes are marked delivered. A mismatch, unknown event or active delivery rejects its whole batch.
4. After verifying the destination and receipt import, click **Complete migration**. This retains the existing enabled flag, so disable the connection first if you want to keep it paused during verification. To verify delivery, complete migration, enable the connection, then execute a controlled real Run and check START/COMPLETE and its inputs and outputs. Runs created while disabled are not sent, and enabling later does not backfill them.
5. Stop the bridge after confirming the built-in connection works, and revoke its bridge key. `MMT_MADO_PLUGIN_TOKEN` and the bridge's `MMT_PLUGIN_TOKEN` are no longer needed.

```sh
# MMT_API_TOKEN: a global administrator's admin-scope token, not limited to a Project, whose owner is an Admin of the Project. Store it only in the private file.
# MMT_API_URL: Tracking API origin, for example http://127.0.0.1:4182.
node --env-file=/path/to/private.env node_modules/tsx/dist/cli.mjs \
  scripts/import_plugin_receipts.ts <project-id> <plugin-id> /path/to/legacy/ledger
```

Tokens you can issue on the screen are limited to a Project, so the script gets 403 (`admin_required`) with them. Issue a token that is not limited to a Project through the API, from the developer tools console of a browser signed in as a global administrator (tokens can be issued only from a signed-in session). The `token` is shown only once: save it as `MMT_API_TOKEN` in the private file, and revoke it when the import is done.

```js
const response = await fetch('/api/tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'import plugin receipts',
    kind: 'personal',
    scopes: ['admin'],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
});
const { token, item } = await response.json();
console.log(item.id, token);
// Revoke it after the import:
// await fetch(`/api/tokens/${item.id}`, { method: 'DELETE' });
```

The script reads only digests from `<event-id>.json`, sends batches of at most 1000, and leaves the ledger unchanged. Completed batches remain saved if a later batch fails. Preserve the original settings used to construct legacy payloads, including the producer and property order, so their hashes match.

A matching receipt can recover a delivery whose 60-second lease has expired. A delivery with an active lease returns 409.
