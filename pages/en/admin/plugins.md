---
title: Mado integration
description: Configure the built-in Mado integration and see the storage capacity that Mado measures.
---

# Mado integration

Mado is built into mado ML Tracking and updated with the application. New Projects start unconfigured and disabled. The application works without Mado settings and makes no Mado requests until you configure it and choose an operation.

When enabled, **Integrations** shows the storage capacity that Mado measures. The integration uses only two things from Mado: the access token's own information and the capacity metrics. It does not search or import datasets and does not send Run records (both were removed because Mado removed DataLineage).

## Configure a Project

1. Set `MMT_PLUGIN_SECRET_KEY` on the API server. Generate a dedicated key with `openssl rand -base64 32`, save it in the private `.env`, and retain it across restarts. Use a value different from the other encryption keys (`MMT_SESSION_ENCRYPTION_KEY`, `MMT_STORAGE_SECRET_KEY`, `MMT_HOOK_SECRET_KEY`), and back it up with the DB ([Environment variables](/en/reference/environment#mado-plugin)).
2. In Mado **Settings → Access → Access Tokens**, issue an access token that allows Capacity **Read** and the connections whose capacity you want to see.
3. A global administrator opens **Integrations** in the Project, clicks **Mado connection settings**, enters **Mado API URL**, **Mado Web URL**, and **Access token**, and clicks **Save**. **Mado API URL** is the address the API server calls; **Mado Web URL** is only shown in the settings. Saving a new connection leaves it disabled.
4. Click **Check connection**. The check gets what the access token allows (allowed operations and expiration) from Mado and shows it, then reads the capacity metrics if Capacity Read is allowed.
5. Click **Enable integration**, then click **Check connection** again. With a token that allows Capacity Read, Storage metrics shows the capacity per connection, bucket, and prefix.

The displayed permissions are the values saved by the last check. After changing the token's permissions in Mado, click **Check connection** to update them.

Mado must provide `/api/mado/access-token`, which returns the calling token's own permissions, and `/api/mado/metrics/capacity`. With a Mado that lacks `/api/mado/access-token`, the check stops with "this Mado cannot report the permissions of its access token (/api/mado/access-token); update Mado". See its `docs/model-tracking-api.md`. Both Mado v0.5.3 and earlier, and v0.6.0 and later, are supported.

| Operation | Permission |
| --- | --- |
| Save connection settings and the access token, enable/disable | Global administrator |
| Check, read capacity | Project admin |

The access token is encrypted with AES-256-GCM. Responses contain only whether it is configured. Leaving the field blank preserves the saved token. If the encryption key is lost, restore it or enter the access token again.

Replacing the access token or changing the connection settings advances the revision and discards the result of the last check. Capacity is not read while the integration is disabled. The check works while disabled.

## Datasets imported and Runs sent by earlier versions

Up to v0.5.4, the integration imported fixed dataset versions from Mado and sent Run records to Mado.

- Imported dataset versions remain and can be used as Run inputs. The dataset page shows the values of the external reference (the connection, the version's identifier in Mado, and its namespace, name, and version). It does not link to Mado.
- **Mado API URL** and **Mado Web URL** cannot be changed for a connection that dataset versions refer to. For another Mado instance, create a separately named connection with **Add Mado connection**.
- Sent Run records remain in the DB but are not shown. Records that were not yet sent are not sent.
- **OpenLineage URL**, **Run namespace**, and **Storage system identifier** are removed from the connection settings during the update. **Mado API URL**, **Mado Web URL**, the access token, and the enabled state are kept.
