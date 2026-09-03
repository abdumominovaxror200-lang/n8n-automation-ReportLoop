# Google Ads API setup (future integration)

Google Ads remains a workflow stub in this milestone. Do not replace the stub with a live pull
until the account and developer-token gates below are complete.

## Access prerequisites

1. Create or use a Google Ads Manager (MCC) account and open its API Center.
2. Apply for a developer token. Test Account Access can call test accounts only. Basic Access
   supports test and production accounts with a daily operations limit; Standard Access supports
   production accounts with a higher/unlimited daily operations allowance. Google currently lists
   typical reviews as five business days for Basic and ten business days for Standard, but these
   are estimates rather than guarantees.
3. Create OAuth credentials and authorize the scope:
   `https://www.googleapis.com/auth/adwords`.
4. Link the reporting customer to the manager account when manager authentication is used.

## Required request metadata

Every future Google Ads API request needs OAuth authorization and the `developer-token` header.
Requests made through a manager account also need `login-customer-id` (digits only, without
hyphens). Store these values in n8n credentials or protected environment configuration; never
commit them to workflow JSON.

Official references:

- https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- https://developers.google.com/google-ads/api/rest/auth
