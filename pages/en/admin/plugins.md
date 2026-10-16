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
| Save connection settings and the access token, enable/disable | Global administrator |
| Check, search, import, read capacity, retry delivery | Project admin |
| Open an imported version in Mado | Project read access |

The access token is encrypted with AES-256-GCM. Responses contain only whether it is configured. Leaving the field blank preserves the saved token. If the encryption key is lost, restore it or enter the access token again.


## Datasets and Runs

Importing sends a fixed version ID. The API fetches that version from Mado again and validates its identity, namespace, URI and digest. Concurrent imports return the same immutable DatasetVersion. Existing versions and external references are retained.

Only while a connection is enabled, the dataset pages show **Import from Mado** (to Project admins) and **View in Mado**. The latter verifies the connection referenced by the selected version and opens `/lineage?mode=versions&versionId=…&node=…`. Mado applies the person's own login and permissions.

Run state changes and delivery records are saved in one transaction. The exact OpenLineage body, hash, destination and configuration revision are pinned. Retries use the same body. Imported identities are retained for their original connection; local output names include the Project ID.

Disabling stops new imports, deliveries and delivery records. An already claimed request can finish. Re-enabling resumes existing pending records and does not backfill Runs from the disabled period. Imported versions and delivery history remain.

API/Web/OpenLineage destinations cannot be changed once a connection has version references or delivery history. For another Mado instance, create a separately named connection with **Add Mado connection**. Replacing the access token or changing the connection settings advances the revision and discards stale search/check results.

A response or DB update can be lost after successful delivery. The operator-supplied Mado Registry must treat an identical retried event as the same Run and versions. A duplicate acknowledgment from the Mado entry point does not verify the actual Registry's database behavior.
