# exp-presidential-ambassadors — Discovery Meeting Guide

**Purpose:** everything you need to walk out of one staff meeting able to write
`docs/solution-design.md` the way `exp-athlete-compliance` has it — requirements
table, options evaluated, chosen architecture, open questions with defaults
already chosen, and a who-can-see-what privacy matrix.

**Working assumption about the program:** a Presidential Ambassador corps is
*selective, small, and high-stakes*. Students are appointed rather than hired,
they represent the University in front of trustees, donors, legislators and the
President's own guests, and the Office of the President decides who stands in
which room. That makes this a **curated assignment, confirmation and briefing
system**, not a shift marketplace. Nearly every design choice below follows from
that. Confirm the assumption in the first five minutes — if it is wrong, most of
Section D changes.

**How to use this:** Section 1 is the short list. If the meeting runs out of
time, those five answers are the ones that change the architecture; everything
else has a workable default already written down and can be settled over email.

---

## 1. The five questions that change the build

Ask these first. Each one is a fork, not a detail.

### 1.1 Who decides which ambassador covers which event?

- **Why it matters:** this is the core loop of the entire app. Curated
  assignment means the primary screen is a staff-side slate builder — pick the
  event, pick the people, send invitations, chase confirmations. Open signup
  means the primary screen is a student-side list of open slots with a claim
  button, and the hard problems become race conditions, waitlists and drop
  cutoffs. The two are different applications wearing the same name.
- **Recommended default:** **staff-curated with ambassador confirmation.** The
  coordinator builds a slate for an event and invites named ambassadors; each
  invitation is `pending → confirmed | declined` with a response deadline; the
  coordinator sees coverage against the required headcount and fills gaps.
  Open self-signup exists only as an optional per-event flag for the low-stakes
  events (tabling, a student panel), off by default.
- **Follow-up if curated:** does the President's office want to see a
  *suggested* slate — ranked by who is free, who is under their commitment
  count, and who has not been used recently — or do they want an empty grid and
  full control? (Recommend: suggestions shown, never auto-assigned.)

### 1.2 Where do the events themselves come from?

- **Why it matters:** if a Board of Trustees meeting, a donor dinner and
  commencement already exist on somebody's calendar or in an events system,
  this app should read them and never become a second place to type them. If it
  authors them, v1 roughly doubles: event CRUD, recurrence, room/location,
  duplicate handling, and an ownership argument with the events team.
- **Ask literally:** "Walk me through what happens today between 'the President
  is hosting a donor dinner on the 14th' and 'four ambassadors are standing at
  the door.' Which system does each step live in?"
- **Candidates to name explicitly:** the President's Office Outlook/M365
  calendar, University Advancement's event system, 25Live or EMS for room
  bookings, Presence (already in use at FP for student life), a shared
  SharePoint list, or a spreadsheet.
- **Recommended default:** **this app owns the ambassador-facing event record
  and treats upstream systems as optional inputs.** v1 lets a coordinator create
  an event in the app in under a minute, and we add an M365 calendar read later
  as an import convenience — not a dependency. Rationale: the fields we need
  (required headcount, roles, attire, arrival time, briefing) do not exist
  upstream, so we would be enriching an imported stub anyway.

### 1.3 Is there confidential guest, donor or trustee information in the app?

- **Why it matters:** this is the question with the longest tail. A student
  scheduling app is a FERPA problem. Add donor names, giving capacity, prospect
  ratings, trustee notes or "pair this ambassador with this prospect" and it
  becomes an Advancement-confidential system too — different classification,
  different access rules, different audit expectations, and a conversation with
  Advancement before a line is written.
- **Ask:** "Does an ambassador ever need to know *who* they are meeting before
  they arrive — by name?" and separately "does the coordinator need to record
  why a particular ambassador was chosen for a particular guest?"
- **Recommended default:** **minimum viable guest data, no Advancement records.**
  The event record carries a free-text briefing and an optional guest list of
  names and affiliations entered by staff. We do not integrate with, mirror, or
  import from any Advancement/CRM prospect data, and the app stores no giving
  history, capacity rating or prospect note. If the pairing rationale must be
  recorded, it is a staff-only field on the assignment, never visible to the
  ambassador, and it is audited.
- **Consequence to state out loud:** if they *do* want donor pairing driven by
  Advancement data, that is a second phase with its own approval, not a v1
  feature.

### 1.4 Is service compensated, and is there a required commitment?

- **Why it matters:** three very different systems hide here.
  - *Pure volunteer / honor:* lightest build. Hours are recorded for
    recognition only.
  - *Scholarship- or stipend-linked with a required minimum* (e.g. "eight
    events per semester to retain the appointment"): the reporting side becomes
    the point of the app — commitment progress per ambassador, per term, with a
    defensible record when someone is not renewed.
  - *Hourly paid student employment:* now we are adjacent to payroll. Weekly
    hour caps, Federal Work Study award balances, the F-1 twenty-hour term
    limit for international students, supervisor approval of time, and an export
    to whatever payroll actually is.
- **Recommended default:** **assume scholarship/commitment-linked, and refuse to
  be the payroll system of record.** The app records attendance and computes
  commitment progress and cumulative service hours, and can export a timesheet
  reconciliation report. Official time entry stays in the existing payroll
  system. This keeps us out of wage-and-hour compliance while still giving the
  President's office the number it actually asks for.
- **Follow-up if paid:** which system is the payroll system of record, and does
  anyone need a hard block when an ambassador would exceed a weekly cap?

### 1.5 How much should Banner drive the schedule?

- **Why it matters:** this decides whether the app is a plain database with a
  nice front end, or a Banner-integrated extension in the house pattern with a
  nightly sync, a regulated data classification and Ethos permissions to
  request. It is worth the integration only if it removes real work.
- **What the integration buys, concretely:**
  - **Class-conflict detection.** Already proven at FP: a single permissioned
    call, `/api/students/{bannerId}/class-schedules`, returns every registered
    section with meeting days, begin/end times, building and room. See
    `exp-athlete-compliance/microservice/src/lib/ethos/bannerApi.js`. The app
    can refuse to invite an ambassador to a Tuesday 10am event when they are in
    ISC 1010, without anyone maintaining an availability grid by hand.
  - **Appointment eligibility.** Cumulative GPA against the program minimum,
    active enrollment, academic standing, holds. Same BP-API calls the
    athletics app already makes in production.
  - **Roll-off planning.** Expected graduation term, so the roster shows who
    ages out and how many appointments to recruit for.
  - **Identity.** Name, preferred name, pronouns, email, class standing, major
    and hometown resolved from the person record instead of retyped — and major
    and hometown are exactly the fields used to match an ambassador to a guest.
- **Recommended default:** **yes, read-only Banner, nightly cached.** Class
  schedules, GPA, enrollment, expected graduation. No Banner writes at all —
  unlike athletics there is no Banner module that models this domain, so the
  app's own PostgreSQL is the permanent system of record, not an interim one.
- **Follow-up:** is the GPA minimum a *hard block* on assignment, a warning to
  the coordinator, or purely a roster report? (Recommend: warning at assignment,
  hard rule only on appointment renewal, since a coordinator overriding once for
  a good reason is normal and a block would just get worked around.)

---

## 2. Program shape and governance

| Question | Why it matters | Default if they have no strong view |
|---|---|---|
| Which office owns the program — President's Office, Advancement, Government Relations, or shared? | Sets the business owner in `exp-template.lock.json`, who approves the roster, and whose roles gate the staff view. | Office of the President is business owner; Advancement is a stakeholder with a read-only event view. |
| Who is the day-to-day coordinator, and who is the approver above them? | Two distinct roles. The coordinator builds slates; the approver signs off on high-profile events. | Two roles: `AMBASSADOR_COORDINATOR` (full manage) and `AMBASSADOR_ADMIN` (manage + program config + roster appointment). Approval is a per-event flag, off by default, used for trustee/donor events. |
| Does anyone outside the owning office need visibility — Events, Marketing, Athletics, a dean? | Read-only stakeholder view is cheap now, awkward to retrofit. | A read-only `AMBASSADOR_VIEWER` role that sees event coverage and confirmed headcount, but no student academic data and no guest briefing. |
| Is there a faculty/staff advisor per cohort? | Affects notifications and the roster tree. | No; single coordinator. |
| Does the program have a formal name and a documented handbook? | The handbook is the fastest path to the rules table — grab it. | Ask for the PDF. |

**Ask for:** the program handbook, the current roster, and the appointment
letter template. Those three documents answer half of Section 3 without
discussion.

---

## 3. Roster and appointment lifecycle

| Question | Why it matters | Default |
|---|---|---|
| How does a student become an ambassador — application, nomination, interview, invitation? | Determines whether the app needs an application intake at all, which is a whole subsystem. | **Out of scope for v1.** Selection happens however it happens today; the app starts at "appointed." Revisit only if they explicitly want intake. |
| What is the term of appointment — one year, one semester, until graduation? Is it renewed? | Drives the cohort/term model and the renewal report. | Academic-year appointment with annual renewal; roster carries `appointed_on`, `term_ends`, `status`. |
| What statuses does an ambassador move through? | Needed before the schema. Getting this wrong means a migration later. | `applicant` (unused in v1) → `active` → `inactive` (leave of absence, study abroad, medical) → `alumni` (graduated) → `removed` (with a staff-only reason). Inactive ambassadors are never invited but keep their history. |
| Is there a rank or tier — senior ambassador, team lead, first-year? | If yes it is an assignment constraint ("every trustee event needs one senior"). | A `tier` field (`lead`, `senior`, `member`) used as a soft constraint the slate builder surfaces. |
| What must be true before a student can serve at all — training, GPA, background check, confidentiality agreement, photo release? | This is the eligibility rules table, and it is the single most valuable artifact from the meeting. | Get the exact list. Model each as a dated requirement with expiry, the way `athlete_compliance` does — boolean flags cannot express "training completed, valid one year." |
| Is there a dress-code or uniform issuance to track — blazer, polo, name badge? | Small, and they will ask for it. Cheap if modelled as an inventory field, expensive as an afterthought. | Track sizes and issued items as roster fields, not a full inventory system. |
| How many ambassadors, and how many do you expect in two years? | Sizing, and it decides whether pagination and bulk tools matter at all. | Expect 20–40. Design for hundreds, optimize for dozens. |

**The single most important table to fill in during the meeting:**

| Requirement | Hard block on serving? | Expires? | Who verifies | Source |
|---|---|---|---|---|
| Confidentiality agreement signed | ? | ? | ? | manual |
| Protocol/etiquette training | ? | ? | ? | manual |
| Photo/media release | ? | ? | ? | manual |
| Minimum cumulative GPA | ? | recheck each term | automatic | Banner |
| Active enrollment | ? | recheck each term | automatic | Banner |
| Background check (if required for minors/donor events) | ? | ? | ? | manual |

---

## 4. Event taxonomy — the highest-value part of the meeting

Do not accept "we have events." Enumerate them on the whiteboard, and for each
one capture the attributes below. The list of event types *is* the requirements
document, and it will expose fields nobody thought to mention.

**Prompt:** "Name every kind of thing an ambassador gets asked to do, from the
most formal to the most routine."

Likely for a Presidential Ambassador corps at a Florida public university:

- Board of Trustees meetings
- Donor and Foundation cultivation dinners, scholarship luncheons
- The annual gala or signature fundraising event
- Legislative visits and days in Tallahassee (off-campus, travel, multi-day)
- Groundbreakings, ribbon cuttings, building dedications
- Commencement and honors convocation
- Presidential VIP campus tours and guest escort
- Industry partner and corporate visits
- Panels, student speaker roles, testimonials at events
- President's box or hosting duty at athletic events
- New student convocation, admitted-student receptions
- Media and photo shoots

**For each type, capture:**

| Attribute | Why |
|---|---|
| Typical headcount needed | The coverage math the coordinator lives in. |
| Named roles within the event (greeter, escort, speaker, check-in, tour lead) | Headcount alone cannot express "two escorts and one speaker." Decides whether assignments carry a role. |
| Attire (business formal, business casual, Poly polo, commencement regalia) | Ambassadors will get this wrong without it on the invitation. |
| Arrival time relative to start, and expected end | Real duration, which is what hours and conflict checks need. |
| Typical lead time — is this booked six weeks out or Thursday for Friday? | Decides how aggressive notification and confirmation deadlines must be, and whether a rush path is needed. |
| Is a briefing packet required? | Section 5. |
| Confidentiality level | Section 1.3. |
| Approval required before the slate is final? | Section 2. |
| On-campus, off-campus, or travel? | Section 10. |
| Recurring or one-off? | Recurrence is the difference between a pleasant tool and a data-entry chore for weekly duties. |

**Recommended default event model:** one `events` table with a `type` reference,
a required-headcount-per-role breakdown, an attire code, arrival and end times,
a briefing body, a confidentiality flag, a location (free text plus optional
building/room), and an `approval_required` flag. Recurrence in v1 is a
"duplicate this event" action rather than a true recurrence engine — cheaper,
and it matches how a small number of high-touch events actually get scheduled.

---

## 5. Briefing, protocol and preparation

This is what makes a Presidential Ambassador app different from a shift app,
and it is easy to under-scope.

| Question | Why it matters | Default |
|---|---|---|
| What does an ambassador need to know before a high-profile event? | If the answer is "we email them a Word doc," the app should carry that content so it is attached to the assignment and cannot be lost. | Each event carries a briefing: attire, arrival, point of contact and phone, what they will be doing, talking points, and a guest list. Delivered with the confirmed invitation and visible on the ambassador's own page until the event ends. |
| Are there talking points or messaging guidance per event? | Marketing may need to review these. | Free-text/rich-text briefing field, staff-authored. |
| Do ambassadors need guest names and bios in advance? | Ties directly to 1.3. | Names and affiliations only, staff-entered, visible only to confirmed assignees, and only from N days out. |
| Is there a debrief after the event — notes, who they met, follow-up? | Advancement often wants this. It is also a nice-to-have that can slip. | A post-event note field on the assignment, optional, staff-visible. Not in v1 unless they push. |
| Is there a check-in contact and a day-of escalation path? | Practical, and it belongs on the phone screen at 7am. | Point-of-contact name and phone on every event, prominent on mobile. |

---

## 6. Availability, class conflicts and blackouts

| Question | Why it matters | Default |
|---|---|---|
| Do ambassadors submit availability, or do you work around their class schedule? | With the Banner class-schedule call proven, a hand-maintained availability grid may be unnecessary work for everyone. | **Class schedule from Banner, plus ambassador-declared exceptions.** Nobody re-types their class times. Ambassadors add blackout dates and standing unavailability (a job, an athletic practice, a lab). |
| How stale can the class schedule be? | Add/drop week is the risk. | Nightly sync, and the UI stamps the sync time — the athletics app does exactly this and it is the right call. Offer an on-demand refresh for one student. |
| Do evening and weekend events make class conflicts mostly irrelevant? | If most events are 6pm Saturday, the conflict feature matters less than expected and effort should go elsewhere. | Ask. Build the conflict check regardless — it is cheap once the data is synced — but do not lead the demo with it if it rarely fires. |
| What about exam weeks, breaks, holidays? | Coordinators will want a "do not schedule" calendar. | An academic-calendar blackout list, staff-maintained, that warns rather than blocks. |
| Athletes, band, Greek life, other commitments the app cannot see? | The conflict check will always be incomplete, and pretending otherwise is worse than admitting it. | Ambassador-declared standing unavailability covers this. Frame the conflict check as "catches class conflicts," never "guarantees they are free." |

---

## 7. Invitation, confirmation and coverage

| Question | Why it matters | Default |
|---|---|---|
| How does an ambassador find out they are wanted, and how do they respond? | The confirmation loop is the app's daily heartbeat. | Invitation with a response deadline; ambassador confirms or declines with an optional reason, from the card or the page. |
| What happens when they decline or go silent? | Coverage risk is the coordinator's real anxiety. | Coverage indicator per event (confirmed vs required, per role), overdue invitations surfaced at the top of the coordinator's card, and a one-click "invite a replacement" that filters to free, eligible, under-committed ambassadors. |
| Can an ambassador drop after confirming? Is there a cutoff? | Trustee dinners are not shifts; a late drop is a real problem. | Yes, with a required reason, and drops inside a configurable window (default 48 hours) notify the coordinator immediately and are recorded on the ambassador's reliability record. |
| Can ambassadors swap with each other directly? | Common request, and a source of complexity and mis-staffing on curated events. | **No direct swaps in v1.** Curated assignment means the coordinator owns who is in the room. An ambassador drops; the coordinator refills. |
| Do you want a standby or alternate list? | Cheap insurance for high-profile events. | An `alternate` assignment status on any event. |
| Is there a cap — no more than N events per week per ambassador? | Protects students and their grades, and the President's office will care. | A soft weekly cap that warns the coordinator at assignment time. |

---

## 8. Attendance, reliability and recognition

| Question | Why it matters | Default |
|---|---|---|
| How is attendance recorded — self check-in, coordinator marks the roster, or nothing? | Determines whether hours are trustworthy enough to report or gate a scholarship. | **Coordinator marks attendance** per assignment (`attended`, `no-show`, `excused`), with a bulk "mark all attended" for the common case. Self check-in is a phase-two convenience, not a v1 requirement, because a coordinator is physically present at these events anyway. |
| Do you need hours, or just event counts? | Both are easy, but the commitment rule depends on which one counts. | Compute both from arrival and end times; let the program config choose which the commitment is measured in. |
| What is the consequence of a no-show? | If there is a policy, the app should make it visible and defensible. | Reliability summary per ambassador (confirmed, attended, no-showed, late drops) on the roster, staff-visible. No automatic penalties — the app informs a human decision. |
| Is service recognized — cords, a certificate, a letter, a reception? | Drives a year-end export. | A per-ambassador service summary export, per term and cumulative. |
| Does anyone need a signed record for a scholarship or a résumé? | Turns a report into a document. | Printable per-ambassador service record. Low cost, high goodwill. |

---

## 9. Reporting

Ask: "At the end of a semester, what does the President or your director ask
you for, and how long does it take you to produce it today?" Then build those
reports and nothing else.

Expected list:

- Coverage and confirmed roster for a single upcoming event — the daily need
- Commitment progress by ambassador for the current term
- Service hours and event counts per ambassador, per term and cumulative
- Reliability: no-shows and late drops
- Events served by type — how much of the corps' effort went to Advancement vs
  Government Relations vs Admissions
- Who is graduating and how many appointments to recruit
- A printable day-of roster with names, roles, arrival times and phone numbers

**Default:** every report is a page view with a CSV export, and every export is
audited with the actor, scope and row count — the athletics app's precedent, and
the right one for a system holding student and guest data.

---

## 10. Off-campus events and travel

| Question | Default |
|---|---|
| Do ambassadors travel — Tallahassee, donor events out of town, conferences? | Assume yes for a presidential corps. |
| Does travel need transportation, lodging, per diem, or a travel authorization? | **Out of scope.** The app records that an event is off-campus, its address, departure and return times, and a travel note. Actual travel authorization stays in the existing process. Say this explicitly so it does not creep. |
| Do you need emergency contact information available to the staff lead on a trip? | Yes — and the athletics app already establishes the pattern and the privacy handling. Include emergency contact on the roster, visible to staff, on the day-of roster for off-campus events only. |
| Any waiver or release specific to travel? | Model as another dated requirement in the Section 3 table. |

---

## 11. Access, privacy and confidentiality

Two-sided, and worth stating plainly in the meeting: the app holds **student
records** (FERPA) and potentially **guest and donor information**
(institutionally confidential). Write the matrix down; a privacy boundary
implied by code is one nobody can check.

Draft to bring and have them correct:

| | Ambassador | Coordinator | Program admin | Stakeholder viewer |
|---|---|---|---|---|
| Own schedule and assignments | yes | yes | yes | no |
| Other ambassadors' assignments for a shared event | names and roles | yes | yes | names only |
| Full roster with contact information | no | yes | yes | no |
| GPA / academic standing | own only | band only | exact | no |
| Class schedule | own only | conflict result only | yes | no |
| Emergency contacts | own only | yes | yes | no |
| Event briefing and talking points | if confirmed | yes | yes | no |
| Guest names and affiliations | if confirmed, from N days out | yes | yes | no |
| Staff-only assignment rationale | **no** | yes | yes | no |
| Reliability record (no-shows, drops) | own only | yes | yes | no |
| Removal reason | no | yes | yes | no |
| CSV export | no | yes | yes | no |

Questions to settle against it:

- Should coordinators see exact GPA, or only whether the minimum is met?
  (Recommend: the minimum-met indicator, with exact value to program admin only.
  A coordinator staffing a dinner does not need the number.)
- Can an ambassador see who else is assigned to their event? (Recommend: yes,
  names and roles — they need to find each other in the lobby.)
- Who may see a removal reason, and is it ever shown to the student?
- Does anything here need Advancement's or the General Counsel's sign-off before
  build? (If guest data is in scope, assume yes.)
- Are reads audited as well as writes? (Recommend: yes. "Who looked at this
  roster" is as much a privacy question as "who changed it.")

---

## 12. Scale, seasonality and platform

| Question | Why | Default |
|---|---|---|
| Events per month, and the peak? | Sizing and whether bulk tools matter. | Assume 5–20 normally, with commencement and gala spikes. |
| What is the busiest week of the year? | Pilot timing. | Ask. |
| Will ambassadors use this on a phone? | It decides the whole UI approach. Assume yes — a student checking their assignment at 7am before a 7:30 arrival is the defining use case. | Mobile-first for the ambassador view; the coordinator's slate builder is desktop-first. |
| Do ambassadors want their assignments on their Outlook calendar? | A frequent, satisfying request. | An `.ics` feed or per-event calendar attachment, phase two. Confirm demand before promising it. |
| Email, text, or Experience notification? | Students do not read email; a trustee dinner cannot be missed. | Email for invitations and briefings; the Experience card for the live state. Investigate SMS for day-of reminders only if they say email is not landing. |

---

## 13. Timeline, pilot and success

- **When do you need this working, and what event is the deadline?** A concrete
  event ("the November Board meeting") is worth more than a date, and it defines
  the pilot.
- **What would make this obviously better than today?** Write down their exact
  words. It becomes the success criterion, and it is what you demo.
- **How much time do you spend today on scheduling, per week?** The number that
  justifies the project.
- **Who pilots it — the coordinator alone, or the whole corps at once?**
  (Recommend: coordinator-only for one event cycle, then the full corps.)
- **What is explicitly not wanted?** Get the non-goals in writing; they are the
  best defence against scope creep.

---

## 14. Explicit non-goals to propose

Offer these as out-of-scope in v1 and see which they fight for. Whatever they
fight for is a real requirement you nearly missed.

- Application and selection intake for new ambassadors
- Public or prospective-family-facing booking of anything (Experience requires
  a login; anything public is a different app)
- Payroll or official time entry
- Travel authorization, reimbursement or per diem
- Room and facility booking
- Any mirror of Advancement prospect, capacity or giving data
- Uniform and asset inventory management
- Direct ambassador-to-ambassador shift swapping
- A true recurrence engine

---

## 15. Questions for people who are not in this meeting

Note these as follow-ups so the solution design can record dependencies.

**Banner / integration team**
- Confirm the Ethos application has `API_CLASS_SCHEDULES` (verified present on
  the FP tenant 2026-08-13 for the athletics app — confirm it covers this
  app's credentials too).
- Confirm read access to GPA/academic-standing, holds, and expected graduation
  for a non-athletics use case.
- Is there any Banner attribute or student-activity code identifying
  Presidential Ambassadors today? If so, the roster can seed from it rather
  than being typed, exactly as `SGRSPRT` seeds the athletics roster.

**University Advancement**
- Whether any guest/donor information may live in this app at all, and who
  approves that.

**Events / Facilities**
- Whether an authoritative event calendar exists that we should read rather
  than duplicate.

**HR / student employment** (only if Section 1.4 turns out to be paid)
- Payroll system of record, hour caps, and international-student limits.

**Marketing / Communications**
- Whether event talking points need review before ambassadors see them.

---

## 16. What is already decided — do not spend meeting time on it

State these as given so the conversation stays on the domain.

| Decision | Value |
|---|---|
| Repository | `FloridaPoly/exp-presidential-ambassadors`, stamped from `exp-template`, lineage recorded in `exp-template.lock.json` |
| Archetype | `full-workspace` — cards plus a role-gated multi-view page |
| Capabilities | `azure-functions-jwt-api`, `platform-tier-database`, `secured-ethos-data` |
| Data classification | `regulated` |
| Front end | React + `@ellucian/react-design-system/core`, Material Symbols for icons, Florida Poly palette and New Science from the shared brand utility |
| Accessibility | WCAG 2.2 AA, axe-core in CI, the accessibility release checklist is a gate — not negotiable and not a phase two |
| Back end | Azure Functions (Node), app-owned PostgreSQL with numbered migrations, Ethos read-only |
| Identity | Experience JWT verified server-side; every scope decision enforced in the API, never in the browser |
| Audit | Every write and every export/read of a roster recorded with actor, scope and count |
| Banner writes | none |
| Design output of the meeting | `docs/solution-design.md` in the athletics app's shape |

**Cards to propose (two, matching the athletics precedent):**

1. **My Ambassador Duties** (every ambassador) — next confirmed assignment with
   date, arrival time, location, attire; any invitation awaiting a response,
   prominently; commitment progress for the term.
2. **Ambassador Coverage** (coordinator and admin) — the next events with
   confirmed-versus-required counts, anything under-covered or with overdue
   invitations surfaced first, link to the page.

**Page views to propose:** upcoming events, event detail with the slate builder,
roster, ambassador detail, my-service record, reports, and a program-config
admin view.

---

## 17. Homework to request before you leave the room

Ask for these by name. They are worth more than another hour of discussion.

1. The program handbook or ambassador agreement.
2. The current roster — names, class standing, majors, appointment dates.
3. However the schedule is kept today: the actual spreadsheet, calendar export,
   or sign-up sheet. The real artifact, not a description of it.
4. A list of every event type, with typical headcount, attire and lead time.
5. The eligibility and training requirements table from Section 3, filled in.
6. One real briefing document from a recent high-profile event.
7. Any report they currently produce by hand.
8. The names of the people who should hold each role, so the Experience role
   mapping can be requested.
9. The calendar of known events for the next two terms — the pilot depends on it.

---

## 18. Bring this to the meeting

Open `exp-athlete-compliance` in Experience on a laptop. It anchors
expectations faster than any description: they see the house look, the card,
the role-gated page, the roster table, and the export. Then ask which parts of
it they recognise as their own problem. Much of the discovery answers itself
when the person can point at a screen.
