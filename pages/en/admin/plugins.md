---
title: Plugins (connecting to mado S3 Data Catalog)
description: Set up the single, site-wide connection to mado S3 Data Catalog and see the storage capacity it measures.
---

# Plugins (connecting to mado S3 Data Catalog)

"Plugins" is the page for connections to other services. The only one today is the connection to mado S3 Data Catalog. There is one connection for the whole site, shared by every project. It starts out not connected; experiment tracking works without it, and nothing is sent to mado S3 Data Catalog.

Once connected, you can:

- open the `s3://` locations of datasets and models in mado S3 Data Catalog (anyone who can read the project)
- change a mado S3 Data Catalog page URL to an `s3://` URI and storage connection when registering (anyone who can edit the project)
- see, on this page, the storage capacity that mado S3 Data Catalog measures (global administrators)

A **storage connection** is one of the S3 endpoints registered in mado S3 Data Catalog (on-premises S3, AWS, and so on). Once connected, registering an `s3://` location asks which storage connection holds it.

Only global administrators can open this page. mado S3 Data Catalog v0.6.0 or later is required.

## Connect

1. Set `MMT_PLUGIN_SECRET_KEY` on the API server. Create a dedicated key with `openssl rand -base64 32` and save it in `.env`. Use a different value from the other encryption keys (`MMT_SESSION_ENCRYPTION_KEY`, `MMT_STORAGE_SECRET_KEY`, `MMT_HOOK_SECRET_KEY`) and keep it safe together with the database. Do not regenerate it on every restart ([Environment variables](/en/reference/environment#mado-plugin)).
2. In mado S3 Data Catalog, under **Settings → Access → Access Tokens**, issue an access token that allows Capacity **read** and the storage connections (connections in mado S3 Data Catalog) to use.
3. Open [Global settings] from the user menu or from the bottom of the project sidebar, then open [Plugins] under "Administration" in the sidebar (`/settings/plugins`).
4. Press [Connect to mado S3 Data Catalog], enter "URL" and "Access token", and press [Connect]. "URL" is the URL you open mado S3 Data Catalog at in a browser (for example `https://catalog.example.test`).

Pressing [Connect] checks the connection and saves it only if the check passes. The page then shows "Connected", the access token name, allowed operations, access token expiry, available storage connections, when the connection was last checked, and "Storage capacity" per connection, bucket and prefix.

## Check, change or remove the connection

| Button | What it does |
| --- | --- |
| [Check connection] | Checks again with the stored access token and re-reads the allowed operations and expiry. Press it after you change the token's permissions or expiry in mado S3 Data Catalog |
| [Change connection] | Replaces the URL or the access token. Leave the access token blank to keep using the stored one. Enter it when you change the URL |
| [Disconnect] | Deletes the stored access token. To use the connection again, enter an access token and connect |

If you see "This access token cannot read capacity.", allow Capacity read for the access token in mado S3 Data Catalog, then press [Check connection].

The access token is stored encrypted and is never returned to the page or the API. If `MMT_PLUGIN_SECRET_KEY` is lost, the stored token cannot be decrypted; restore the key, or enter the access token again with [Change connection].

If the connection fails, see [Troubleshooting](/en/reference/troubleshooting#plugin-unreachable-or-deliveries-stalled).

## Choose a storage connection when registering

On a connected site, registering an `s3://` URI requires choosing a storage connection. Registration is refused without one.

- **Web**: enter an `s3://` URI when creating a dataset version or a model version, and the "Storage connection" field appears.
- **Python SDK**: pass `data_catalog_storage_connection_id` to `register_dataset` or `register_model`. Look the ID up in `storageConnections` of `client.data_catalog(project_id)`. SDKs up to v0.5.4 do not have this argument and cannot register `s3://` URIs on a connected site; update the SDK.
- **API**: set `dataCatalogStorageConnectionId` in the body. Look the ID up with `GET /api/projects/:p/data-catalog`.

You can choose the storage connections allowed for the access token. After adding a storage connection in mado S3 Data Catalog, allow it for the token and press [Check connection].

A storage connection only decides where the link goes. Which S3 a compute target reads is still decided by the environment variables on the target. `file://` and `https://` URIs, versions created from a folder, and versions created by job outputs or MLflow have no storage connection.

## Open S3 locations in mado S3 Data Catalog

Versions registered with a storage connection show [Open in mado S3 Data Catalog] next to the URI. It opens the page of that folder or file in mado S3 Data Catalog in a new tab. Whether you can see the contents depends on your sign-in and permissions in mado S3 Data Catalog.

Versions without a storage connection (registered before connecting, job outputs, and so on) do not show the link. It also disappears when the connection is removed or the storage connection is no longer allowed for the access token.

A URI that ends with `/` opens as a folder; any other URI opens as a file.

## Change a mado S3 Data Catalog URL to an S3 URI

Paste a mado S3 Data Catalog page URL ("Copy Web URL" in the menu of a folder or file) into "URI" when creating a dataset version, or into "Weights URI" when creating a model version, and the matching `s3://` URI appears below the field. Press [Change to S3 URI] to replace the value of the field and choose the storage connection.

## After updating from an earlier version

Up to v0.5.4, each project had its own connection, datasets were imported from mado S3 Data Catalog, and run records were sent to it.

- Per-project connections are not carried over. Their stored access tokens are deleted by the update, so a global administrator connects again on [Plugins].
- Imported dataset versions remain and can still be used as run inputs. The dataset page shows the values of their external reference. New imports are not possible.
- Run records that were sent remain in the database but are not shown.
