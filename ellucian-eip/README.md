# Ellucian EIP / Maestro workflow — Update Contact Information

`update-contact-information.yaml` is the **prod-ready** version of the
"Update Contact Information" form-trigger workflow, migrated from TEST.

## What was fixed vs. the raw TEST export

1. **Duplicate `formId` key** in the Form Start segment — caused the import
   parse error `duplicated mapping key`. Removed the duplicate line.
2. **Dangling incoming reference** — the `evaluateContactChanges` action's
   `in:` pointed at a stale form-trigger id
   (`form-trigger_41e8acc9-4b6e-42d4-80ab-dc908daa95b9`, which no longer
   exists). This caused the import error *"the outgoing path for block
   form-trigger_d8d3f509… leads to action_34a400d6…, but action_34a400d6…
   does not have an incoming path from …d8d3f509…"*. Repointed `in:` to the
   real Form Start (`form-trigger_d8d3f509-b042-4598-a54c-89cba8b62b41`).
3. **Production identity** — `name`, `code`, and `description` set to the
   prod values (`Update Contact Information` / `UPDATE_CONTACT_INFORMATION`)
   instead of the TEST names.

Everything else (approval views, split routing, action parameters, email
bodies) is byte-for-byte identical to the TEST export.

## Verify these in PROD before/after import (environment-specific values)

These are references that commonly differ between environments. The formId
already matches your prod form, but confirm the rest:

| Item | Value in this file | Check |
| --- | --- | --- |
| Form `formId` | `20f34602-c49a-4256-8f35-f1d291fcc8f7` | ✅ Matches your prod "correct form" export |
| Registrar approval group | `046f977b-f46a-44b0-b264-32d2be7c79da` | ⚠️ Group GUIDs often differ between envs — confirm this group exists in prod, or replace |
| SBS approval group | `d51c0ec7-6cba-492c-a662-e333c82d2989` | ⚠️ Same as above |
| Action `EVALUATECONTACTCHANGES` | v`4.0.0` | ⚠️ Must be published/available in prod |
| Action `UPDATESTUDENTCONTACTINFORMATION` | v`32.0.0` | ⚠️ Must be published/available in prod |
| From address | `noreply@floridapoly.edu` | Confirm sending domain is authorized in prod |

## Note on the `code`

This file uses `code: UPDATE_CONTACT_INFORMATION`, matching the blank
workflow already in prod. If the importer rejects it as a duplicate code,
delete/rename that blank prod workflow first, then re-import.

## Validation

`update-contact-information.yaml` passed a strict check: no duplicate keys,
all 23 segments reachable from the Form Start, and every `in`/`out`/`node`
link resolves and is symmetric (the exact class of error the importer
reported).
