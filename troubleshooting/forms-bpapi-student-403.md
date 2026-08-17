# Ellucian Forms: BPAPI-backed dropdowns return 403 for students

**Status:** Root cause identified. Blocked pending Ellucian support.
**Environment:** SaaSProduction
**Date:** 2026-08-17

> Placeholders `<tenant-id>` and `<admin-api-host>` are left unfilled in case this
> repo is public. Both are visible in the Ethos Integration UI — the tenant ID in
> the page header, the host on the Banner Business Process API application overview.

## Symptom

A student-facing Ellucian Form uses delivered Banner Business Process APIs
(`nation-codes`, `state-province-codes`) as data sources to populate dropdowns.

- Staff/admin accounts: dropdowns populate correctly
- Student accounts: dropdowns are empty

## Root cause

Forms invokes BPAPI data sources using the **signed-in user's OAuth token**.
BPAPIs are HTTP/JSON wrappers over Banner administrative pages and authorize
against the **caller's Banner security object** (`nation-codes` → `STVNATN`,
`state-province-codes` → `STVSTAT`).

Staff hold Banner accounts carrying those objects, so their calls succeed.
Students have no Banner Principal User ID at all, so their calls are rejected.

Forms exposes no UI to select a different security scheme or supply an API key.

## Evidence

Forms request payload for the data source call:

```
dataSourceId:    e6f2121d-8b96-4bcb-b1a4-dbdac6a166b2
dataSourceKey:   banner_get_nation-codes_1.0.0
resourceName:    nation-codes
acceptHeader:    application/vnd.hedtech.integration.v1.0.0+json
apiKey:          ""
securityScheme:  "EllucianOAuthUserToken"
queryParameters: [{name: "limit", value: 500, in: "query", ...}]
```

Forms API registry entry for the same resource:

```json
{
  "apiName": "nation-codes",
  "description": "API for STVNATN administrative page",
  "resourceName": "nation-codes",
  "apiMethod": "get",
  "apiSource": "banner",
  "apiType": "bus-poc",
  "apiVersion": "1.0.0",
  "securitySchemes": [
    "BasicAuth",
    "EllucianOAuthUserToken",
    "EthosIntegrationBearer"
  ]
}
```

The resource advertises three schemes. Two of them (`BasicAuth`,
`EthosIntegrationBearer`) resolve to an **application** identity and would work
for students. Forms uses the third, which resolves to the **end user's** Banner
identity, and provides no override.

This matches the documented limitation for BPAPIs invoked with user tokens
(`docs/Experience Platform/Ellucian Experience/06-add-content-using-the-experience-sdk.html`,
"Invoke BPAPIs through the Ethos proxy service using OAuth tokens"):

> A user without permission to access the Banner Admin UI who attempts to view an
> extension which uses the `authenticatedEthosFetch` wrapper to view a BPAPI
> resource will get a 403/unauthorized browser error.

## Configuration verified correct (do not re-check)

**Banner Business Process API application**
- Authentication Type: Basic Authentication
- Base URI: `https://<admin-api-host>:8119/BannerAdminBPAPI/api`
- Base QAPI URI: `https://<admin-api-host>:8119/BannerAdminBPAPI/qapi`
- Owned Resources: 1473, including `nation-codes` (v1.0.0, v1, GET)
- API Keys: 1

**Experience Application**
- Credentials (3): Banner Business Process API → `BPAPI_USER`,
  Banner Integration API → `INTEGRATIONAPI_USER`,
  Banner Student API → `STUDENTAPI_USER`
- Owned Resources: 0 (correct — it consumes, it is not authoritative)

**Ellucian Forms Platform component**
- Credentials (2): Banner Integration API, Banner Student API.
  **No credential for Banner Business Process API** — see open question 2.
- Owned Resources: 0 (correct)
- Request Routing: `nation-codes` → Banner Business Process API (default)

## Ruled out

| Hypothesis | Why it's wrong |
|---|---|
| Missing `API_NATION_CODES` security object | Doesn't exist. The delivered security-object table (271 `API_*` objects, `docs/Banner Ethos API Administration/Banner Ethos API - Installation/`) covers Ethos Data Model resources only. BPAPIs inherit the admin page's object instead. |
| Assign security objects to students | Students have no Banner Principal User ID. Not possible, and not desirable — it would mean thousands of Oracle accounts with admin-page privileges. |
| Add `nation-codes` to Banner Student API owned resources | Wrong deployment, and the docs forbid it: *"Do not add an owned resource to an application that accesses data for that resource through proxy API requests."* Would also create a multiple-owner routing conflict with the working path. |
| Add BPAPI to the Forms platform component's Application Access tab | Wrong direction — that tab is inbound. Forms owns no resources, so the entry is a no-op. |
| BPAPI application misconfigured | Verified correct (above). Resource versions render, which per the docs proves Ethos can reach the deployment. |
| Set the API key in the Forms data source | Forms exposes no API key field. |
| Front the BPAPI with a Data Connect serverless API | Technically viable — a User-token pipeline is authorized by Experience permissions (Experience Setup → Permissions → DATA-CONNECT → APIs → *pipeline* → Execute) rather than Banner security, so students would pass. Rejected as disproportionate: building middleware to proxy a delivered validation-table API, and dependent on Data Connect Designer access. Keep as a fallback only. |

## Open questions for Ellucian

1. How does an institution configure a Forms data source to use
   `EthosIntegrationBearer` or `BasicAuth` instead of `EllucianOAuthUserToken`?
2. `Banner Business Process API` is selectable as a Source application when adding
   credentials to an **Application**, but does **not** appear in that dropdown on the
   **Ellucian Forms Platform** platform component. Is that expected?

Question 2 is the higher-value ask. If a BPAPI credential could be added to the
Forms platform component, Forms would likely fall through to `BasicAuth` and the
issue resolves with no new components.

## Interim workaround

Hardcode the option lists in the form. `STVNATN` and `STVSTAT` are static
validation tables that change rarely. Unblocks students immediately at the cost of
drifting from Banner. Only worth it if the form is time-sensitive.

## Verifying the application-identity path

To confirm the proxy user can read the data (no database access required):

```bash
# 1. Exchange an Experience Application API key for an access token (expires in 5 min)
curl -X POST 'https://integrate.elluciancloud.com/auth' \
  -H 'Authorization: Bearer <API_KEY>' \
  -H 'Cache-Control: no-cache'

# 2. Call the resource with application identity
curl 'https://integrate.elluciancloud.com/api/nation-codes?limit=500' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Accept: application/vnd.hedtech.integration.v1.0.0+json'
```

- `200` + data → application identity works; only Forms' scheme choice is at fault
- `403` → `BPAPI_USER` lacks `STVNATN` (grant via GSASECR; `BAN_DEFAULT_Q` suffices, GET-only)
- `401` → API key problem, most likely IP restrictions

The GUI equivalent of the privilege check is GSASECR → Users → `BPAPI_USER` →
Modify → User/Class Privilege Maintenance, plus the User Classes button (access is
often granted via a class rather than object-by-object).

## Reference

- `docs/Experience Platform/Ellucian Experience/06-add-content-using-the-experience-sdk.html` — BPAPI + user token limitation
- `docs/Ethos Integration/Ethos Integration/04-connect-applications-to-ethos-integration.html` — proxy credentials, owned resources, request routing
- `docs/Banner Ethos API Administration/Banner Ethos API - Installation/01-install-banner-ethos-api.html` — security objects and classes
- `docs/Data Connect/Data Connect Integration Designer - Use/09-develop-serverless-apis.html` — serverless API auth types
- `docs/Banner Student/Student Survey for California Regulatory/student-survey-for-california-regulatory.html` — delivered student-facing Forms + Intelligent Processes reference implementation

**Note:** the standalone **Forms** book is not synced into this repo.
`_docs-tooling/filters.config.json` currently pulls Banner Student and Degree Works
only. Adding Forms would help with future issues in this area.
