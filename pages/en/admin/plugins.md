---
title: Mado integration
description: Configure the built-in Mado integration, import fixed dataset versions, send Run lineage, and migrate existing connections.
---

# Mado integration

Mado is built into mado ML Tracking and updated with the application. New Projects start unconfigured and disabled. The application works without Mado settings and makes no Mado requests until you configure it and choose an operation.

## Configure a Project

1. Set `MMT_PLUGIN_SECRET_KEY` on the API server. Generate a dedicated key with `openssl rand -base64 32`, save it in the private `.env`, and retain it across restarts. Use a separate key from storage credentials, and back it up with the DB.
2. In Mado Service Accounts, issue separate `lineage:read`, `lineage:write`, and optional `metrics:read` keys. Limit read access to the search namespaces and write access to the job and input/output namespaces. Capacity metrics apply to the entire storage system.
3. A global administrator opens the Project's Integrations page and saves the API URL, Web URL, OpenLineage URL, namespaces, job namespace, StorageSystem identifier, and keys. The URLs can point to separate entry points. Saving a new connection leaves it disabled.
4. Check the connection, then enable it. Checking reads the catalog and optional capacity metrics, even while disabled. It can use a read key before the write key is configured and never sends a fabricated Run. Verify the write key with a controlled real Run.

Mado must provide `/api/mado/lineage/catalog`, `datasets/:id`, and `versions/:id`. See its `docs/model-tracking-api.md`. Tracking uses authenticated Mado APIs, never the Registry directly.

| Operation | Permission |
| --- | --- |
| Save connection settings and keys, enable/disable, complete migration | Global administrator |
| Check, search, import, read capacity, retry delivery | Project admin |
| Open an imported version in Mado | Project read access |

Keys are encrypted with AES-256-GCM. Responses contain only whether each key is configured. Leaving a key field blank preserves the saved value; the capacity key can be explicitly removed. If the encryption key is lost, restore it or re-enter every saved connection key.

## Datasets and Runs

Importing sends a fixed version ID. The API fetches that version from Mado again and validates its identity, namespace, URI and digest. Concurrent imports return the same immutable DatasetVersion. Existing versions and external references are retained.

Enabled connections provide “Import from Mado” and “View in Mado” actions. The latter verifies the connection referenced by the selected version and opens `/lineage?mode=versions&versionId=…&node=…`. Mado applies the person's own login and permissions.

Run state changes and delivery records are saved in one transaction. The exact OpenLineage body, hash, destination and configuration revision are pinned. Retries use the same body. Imported identities are retained for their original connection; local output names include the Project ID.

Disabling stops new imports, deliveries and delivery records. An already claimed request can finish. Re-enabling resumes existing pending records and does not backfill Runs from the disabled period. Imported versions and delivery history remain.

API/Web/OpenLineage destinations cannot be changed once a connection has version references or delivery history. Create a separately named connection for another Mado instance. Key and namespace changes advance the revision and discard stale search/check results.

A response or DB update can be lost after successful delivery. The operator-supplied Mado Registry must treat an identical retried event as the same Run and versions. A duplicate acknowledgment from the Mado entry point does not verify the actual Registry's database behavior.

## Migrate a legacy bridge

Migration 059 preserves connection UUIDs, enabled flags, external references, pending records and event IDs. Only a connection whose saved manifest ID is `mado` is classified for migration. Delivery and imports remain stopped while migration is pending. Other legacy plugins are retained for renaming or disabling. Multiple connections are not merged.

1. Back up the DB and the bridge's `PLUGIN_LEDGER_DIRECTORY`. Let in-flight bridge requests finish before updating Tracking.
2. Save the actual Mado settings and keys on the existing connection. The bridge's old base URL is not the Mado API URL. Saving settings does not resume delivery.
3. Check the connection and import legacy ledger hashes with the command below. Only matching event IDs and exact body hashes are marked delivered. A mismatch, unknown event or active delivery rejects its whole batch.
4. After verifying the destination and receipt import, choose “Complete migration”. This retains the existing enabled flag, so disable the connection first if you want to keep it paused during verification. To verify delivery, complete migration, enable the connection, then execute a controlled real Run and check START/COMPLETE and its inputs and outputs. Runs created while disabled are not sent, and enabling later does not backfill them.
5. Stop the bridge after confirming the built-in connection works, and revoke its bridge key. `MMT_MADO_PLUGIN_TOKEN` and the bridge's `MMT_PLUGIN_TOKEN` are no longer needed.

```sh
# MMT_API_TOKEN: a global administrator's admin-scope token, stored only in the private file.
# MMT_API_URL: Tracking API origin, for example http://127.0.0.1:4182.
node --env-file=/path/to/private.env node_modules/tsx/dist/cli.mjs \
  scripts/import_plugin_receipts.ts <project-id> <plugin-id> /path/to/legacy/ledger
```

The script reads only digests from `<event-id>.json`, sends batches of at most 1000, and leaves the ledger unchanged. Completed batches remain saved if a later batch fails. Preserve the original settings used to construct legacy payloads, including the producer and property order, so their hashes match.

A matching receipt can recover a delivery whose 60-second lease has expired. A delivery with an active lease returns 409.
