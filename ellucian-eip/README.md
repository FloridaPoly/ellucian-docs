# Ellucian EIP / Maestro workflow — Update Contact Information

`update-contact-information.yaml` is the **prod-ready** version of the
"Update Contact Information" form-trigger workflow, migrated from TEST.

## What was fixed vs. the raw TEST export

1. **Duplicate `formId` key** in the Form Start segment — caused the import
   parse error `duplicated mapping key`. Removed the duplicate line.
2. **Dangling incoming reference** — the `evaluateContactChanges` action's
   `in:` pointed at a stale form-trigger id (`…41e8acc9…`). Repointed to the
   real Form Start (`…d8d3f509…`). This was the "does not have an incoming
   path" import error.
3. **Production identity** — `name`/`code`/`description` set to the prod values.
4. **Action extension versions** aligned to PROD (extensions are versioned
   independently per environment, so TEST's numbers don't exist in PROD):
   - `EVALUATECONTACTCHANGES`: `4.0.0` (TEST) → **`1.0.0`** (PROD)
   - `UPDATESTUDENTCONTACTINFORMATION`: `32.0.0` (TEST) → **`2.0.0`** (PROD, on all 4 update actions)
5. **Approval group** repointed to the PROD group GUID (see caveat below).

## ⚠️ Approval group assignees — ACTION REQUIRED before go-live

The TEST group GUIDs don't exist in PROD. Only one PROD group GUID was
available (`b9bc1374-d9f9-4708-93b3-070c9b719e9b`), so all four approval tasks
temporarily point at it:

| Approval task | Current assignee | To do |
| --- | --- | --- |
| Registrar Approval (Both path) | `b9bc1374…` | Verify this is the PROD **Registrar** group |
| Registrar Approval (Only path) | `b9bc1374…` | Verify this is the PROD **Registrar** group |
| SBS Approval (Both path) | `b9bc1374…` | ❗ PLACEHOLDER — reassign to the PROD **SBS** group |
| SBS Approval (Only path) | `b9bc1374…` | ❗ PLACEHOLDER — reassign to the PROD **SBS** group |

**Reassign both SBS tasks to the real PROD SBS group** (in the designer, or
provide the GUID to swap in). Otherwise SBS address approvals route to the
Registrar group.

## ⚠️ One unverified action-input contract

Your PROD skeleton only exercised the "Both → Registrar" path, so it confirms
`UPDATESTUDENTCONTACTINFORMATION` v2.0.0 accepts most inputs but does **not**
evidence these three (used by the Registrar-only / SBS partial-apply paths):
`regOutcomeOnly`, `sbsOutcomeBoth`, `sbsOutcomeOnly`.

They are siblings of the confirmed `regOutcomeBoth`, so they almost certainly
exist in v2.0.0. If the import rejects one as an unknown input parameter,
PROD's v2.0.0 has a narrower contract than TEST's v32.0.0 and those mappings
need reconciling.

## Confirmed matching PROD ✅

- Form `formId` `20f34602-c49a-4256-8f35-f1d291fcc8f7`.
- Every `evaluateContactChanges` output this workflow reads (`routeCode`,
  `preferredNameChanged`, `legalNameChanged`, `phoneChanged`, `emailChanged`,
  `mailingChanged`, `billingChanged`, `preferredWithinYear`) exists in PROD
  v1.0.0.

## Note on the workflow `code`

Uses `code: UPDATE_CONTACT_INFORMATION`, matching the existing PROD workflow.
If the importer rejects it as a duplicate code, delete/rename that PROD
workflow first, then re-import.

## Note on segment IDs

This file keeps its own segment IDs (e.g. `action_34a400d6…`), which differ
from the PROD skeleton's (`action_f816960c…`). That is fine and intentional:
an imported workflow uses the IDs contained in the file, and every internal
process-variable reference (`__action_34a400d6…_routeCode`, etc.) is
self-consistent. They do **not** need to match the skeleton's IDs.

## Validation

Passes a strict check: no duplicate keys, all 23 segments reachable from Form
Start, and every `in`/`out`/`node`/`pathId` link resolves and is symmetric.
