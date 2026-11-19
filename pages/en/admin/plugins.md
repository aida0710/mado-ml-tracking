---
title: Plugins (connecting to mado S3 Data Catalog)
description: Set up the single, site-wide connection to mado S3 Data Catalog and see the storage capacity it measures.
---

# Plugins (connecting to mado S3 Data Catalog)

"Plugins" is the page for connections to other services. The only one today is the connection to mado S3 Data Catalog. There is one connection for the whole site, shared by every project. It starts out not connected; experiment tracking works without it, and nothing is sent to mado S3 Data Catalog.

Once connected, this page shows the storage capacity that mado S3 Data Catalog measures. Only global administrators can open the page.

## Connect

1. Set `MMT_PLUGIN_SECRET_KEY` on the API server. Create a dedicated key with `openssl rand -base64 32` and save it in `.env`. Use a different value from the other encryption keys (`MMT_SESSION_ENCRYPTION_KEY`, `MMT_STORAGE_SECRET_KEY`, `MMT_HOOK_SECRET_KEY`) and keep it safe together with the database. Do not regenerate it on every restart ([Environment variables](/en/reference/environment#mado-plugin)).
2. In mado S3 Data Catalog, under **Settings → Access → Access Tokens**, issue an access token that allows Capacity **read** and the connections whose capacity you want to see.
3. Open [Global settings] from the user menu or from the bottom of the project sidebar, then open [Plugins] under "Administration" in the sidebar (`/settings/plugins`).
4. Press [Connect to mado S3 Data Catalog], enter "URL" and "Access token", and press [Connect]. "URL" is the URL you open mado S3 Data Catalog at in a browser (for example `https://catalog.example.test`).

Pressing [Connect] checks the connection and saves it only if the check passes. The page then shows "Connected", the access token name, allowed operations, access token expiry, when the connection was last checked, and "Storage capacity" per connection, bucket and prefix.

## Check, change or remove the connection

| Button | What it does |
| --- | --- |
| [Check connection] | Checks again with the stored access token and re-reads the allowed operations and expiry. Press it after you change the token's permissions or expiry in mado S3 Data Catalog |
| [Change connection] | Replaces the URL or the access token. Leave the access token blank to keep using the stored one. Enter it when you change the URL |
| [Disconnect] | Deletes the stored access token. To use the connection again, enter an access token and connect |

If you see "This access token cannot read capacity.", allow Capacity read for the access token in mado S3 Data Catalog, then press [Check connection].

The access token is stored encrypted and is never returned to the page or the API. If `MMT_PLUGIN_SECRET_KEY` is lost, the stored token cannot be decrypted; restore the key, or enter the access token again with [Change connection].

If the connection fails, see [Troubleshooting](/en/reference/troubleshooting#plugin-unreachable-or-deliveries-stalled).

## After updating from an earlier version

Up to v0.5.4, each project had its own connection, datasets were imported from mado S3 Data Catalog, and run records were sent to it.

- Per-project connections are not carried over. Their stored access tokens are deleted by the update, so a global administrator connects again on [Plugins].
- Imported dataset versions remain and can still be used as run inputs. The dataset page shows the values of their external reference. New imports are not possible.
- Run records that were sent remain in the database but are not shown.
