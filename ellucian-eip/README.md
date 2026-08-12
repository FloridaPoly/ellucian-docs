# Ellucian EIP / Maestro workflow — Update Contact Information

`update-contact-information.yaml` is the TEST "Update Contact Information"
workflow with every prod value swapped in, ready to import into prod.

## TEST → PROD changes applied

| Item | TEST | PROD (this file) |
| --- | --- | --- |
| Workflow name | `Update Contact Information - TEST with approvals` | `Update Contact Information` |
| Workflow code | `UPDATE_CONTACT_INFORMATION__TEST_WITH_APPROVALS` | `UPDATE_CONTACT_INFORMATION` |
| `evaluateContactChanges` action | `EVALUATECONTACTCHANGES` v4.0.0 | **v1.0.0** |
| `updateStudentContactInformation` action | `UPDATESTUDENTCONTACTINFORMATION` v32.0.0 | **v2.0.0** (all 4) |
| Approval group | `046f977b…` (Reg), `d51c0ec7…` (SBS) | `b9bc1374…` (all — see note) |

## Bug fixes carried over

- Removed a **duplicate `formId`** key in Form Start (YAML parse error).
- Repointed `evaluateContactChanges` `in:` from a stale form-trigger id
  (`…41e8acc9…`) to the real Form Start (`…d8d3f509…`).

## Prod v2.0.0 contract adjustments (this is what fixed the render crash)

Prod's `UPDATESTUDENTCONTACTINFORMATION` v2.0.0 exposes fewer inputs/outputs
than test's v32.0.0. Referencing the missing ones crashed the designer with
`Cannot read properties of undefined (reading 'children')`. Removed:

- **Outputs** `appliedSummary` / `skippedSummary` — dropped from the four
  "Email update summary" blocks (emails keep the approval decisions/comments
  and static guidance text).
- **Inputs** `sbsOutcomeBoth` / `regOutcomeOnly` / `sbsOutcomeOnly` — collapsed
  to the one input prod v2.0.0 uses, `regOutcomeBoth`, mapped to each path's
  approval outcome (matching your prod build).

## Verify before go-live

1. **SBS approval group** — all four approval tasks currently use
   `b9bc1374…`. Reassign the two **SBS** tasks (`SBS Approval`,
   `SBS Approval (Only)`) to the real prod SBS group.
2. **Apply/skip behavior** — run one test submission per route (Both /
   Registrar only / SBS only / Auto) and confirm the right fields are written
   to Banner, since v2.0.0's outcome contract is narrower than test's.

## Validation

Strict-parses with no duplicate keys; all 23 segments reachable from Form
Start; every `in`/`out`/`node`/`pathId` link resolves and is symmetric; no
variable references an action output prod doesn't expose.
