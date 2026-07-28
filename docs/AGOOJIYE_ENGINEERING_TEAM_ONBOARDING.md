# AGOOJIYE engineering team onboarding

This document describes the controlled preparation of the electric-vehicle
engineering team. It contains no personal contact details, passwords, setup
tokens, or NDA links.

## Source and reconciliation

- Source workbook: `Electric Vehicle Team .xlsx`
- Source digest:
  `e660821463628fa00f087144b928e0ed7863d0a8444c7d4baa8b297519a2114b`
- Communication source: Google document
  `1bBVpJhJZ1cerxQcBwL_VYfXwYZk8v98N`
- Raw workbook rows: 35
- Unique people: 34
- Duplicate merged: Judicael GBAGUIDI, workbook rows 6 and 36

The application-owned source of truth is
`server/lib/agoojye/engineeringTeam.ts`. It contains no personal delivery
address, phone number or NDA URL. Those private fields are read from the
digest-verified workbook only during the controlled production operation and
are exposed only to authorized administrators.

## Organization

| Workstream | Members | Scope |
| --- | ---: | --- |
| CAD & mécanique | 7 | Chassis, body, seat supports and mechanical integration |
| Électricité, simulation & PCB | 8 | Battery, BMS, HV/LV wiring, simulations and PCB |
| Firmware & systèmes embarqués | 4 | CAN, monitoring, alerts, audio and embedded control |
| Logiciel embarqué & interface | 12 | Driver interface, offline mode, synchronization and UI |
| Intégration, essais & sécurité | 3 | Integration, test evidence, fault handling and safety |

The three people whose source row has no squad are assigned to the integration
workstream with the visible state `Rôle à confirmer`. This is an onboarding
classification, not a claim about their final technical position.

## Prepared corporate addresses

The provisioner prepares these AGOOJIYE-owned identities:

```text
gismano@agoojiye.com
hadodile@agoojiye.com
donald@agoojiye.com
judicael@agoojiye.com
isaac@agoojiye.com
fried@agoojiye.com
serge@agoojiye.com
peace@agoojiye.com
bosco@agoojiye.com
fourier@agoojiye.com
geoffroy@agoojiye.com
auriol@agoojiye.com
prince@agoojiye.com
vincent@agoojiye.com
aldo@agoojiye.com
evodie@agoojiye.com
sunday@agoojiye.com
leonce@agoojiye.com
marc-aurel@agoojiye.com
melaine@agoojiye.com
console@agoojiye.com
josaphat@agoojiye.com
fleurette@agoojiye.com
david.agbeci@agoojiye.com
theophore@agoojiye.com
alexis@agoojiye.com
angelo@agoojiye.com
mohamed@agoojiye.com
jordy@agoojiye.com
horus@agoojiye.com
david.tchegnimonhan@agoojiye.com
delor@agoojiye.com
ange@agoojiye.com
gilles@agoojiye.com
```

## Safe execution

The default command is a read-only preview:

```bash
npm run provision:agoojye:engineering-team -- \
  --workbook=/run/secrets/agoojye/electric-vehicle-team.xlsx
```

The production write requires an explicit no-email acknowledgement:

```bash
npm run provision:agoojye:engineering-team -- \
  --workbook=/run/secrets/agoojye/electric-vehicle-team.xlsx \
  --apply \
  --confirm-no-email
```

The apply command:

1. creates or reconciles the 34 platform identities;
2. creates the tenant memberships and engineering profiles;
3. creates and verifies the 34 docker-mailserver mailboxes;
4. sets a 2 GB mailbox quota;
5. registers the addresses in the AGOOJIYE email tables;
6. creates the five workstreams, project memberships and channels;
7. creates the prototype and launch tasks, documents and work sessions;
8. writes initial mailbox credentials to a private `0600` handoff file;
9. creates no setup link and sends no email, push, SMS or WhatsApp message.

Production handoff material is stored under
`AGOOJIYE_SECURE_HANDOFF_DIR`, which defaults to
`/home/vital/secure/agoojye` in production. The directory must not be mounted
inside a public web root or committed to Git.

## Activation after owner authorization

No activation token is generated during account preparation because tokens are
short lived. After explicit owner authorization, the delivery operation must:

1. generate a fresh, single-use setup link for each approved recipient;
2. deliver only to the reconciled personal address;
3. skip Fried BOCOVO and Prince ATCHIN until a personal address is provided;
4. record the exact delivery result without storing a raw token in the database;
5. keep WhatsApp copy separate and visible for owner review.

When the recipient opens the setup link, the password they choose is applied to
both the AGOOJIYE platform account and the AGOOJIYE-owned webmail. Webmail is
available at `https://mail.agoojiye.com/`.

## Admin review queue

Before sending invitations, administrators must resolve or consciously accept:

- 2 missing personal email addresses;
- 3 inferred technical assignments;
- 7 NDA entries marked `not_recorded`;
- any corporate-address collision reported by the dry run.

The `/admin/people` screen displays these states, mailbox readiness and the
explicit `Non envoyée` invitation status.
