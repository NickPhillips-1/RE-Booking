# Design

Black and white interface for the public booking page and the agent dashboard. One typeface, three type roles, flat surfaces. Color is not chosen yet. When it is added, it replaces the black fill on the primary action and the selected state. It does not recolor body text, and it does not introduce a gradient.

## Type

One family: `ui-sans-serif, system-ui, sans-serif`.

Three roles. No fourth size. Weight never goes above 500. Page titles are regular, not bold. Do not bold a label and the value under it.

| Role | Size | Weight | Line height | Use |
| --- | --- | --- | --- | --- |
| Title | 22px | 400 | 1.25 | Once per screen. The brand name on the public page, or the page name on login and the dashboard. |
| Label | 13px | 500 | 1.3 | Field labels, section names, button text, table headers. |
| Body | 15px | 400 | 1.45 | Times, dates, help, field values, notes, empty states, errors. |

Quiet text is body type at 55% opacity. It is still black. Placeholder text is body type at 45% opacity.

## Color

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#000000` | Text, primary fill, control borders, focus outline. |
| Paper | `#ffffff` | Page background, secondary button fill, unselected controls. |
| Accent | unset | Reserved. Do not invent one. |

No purple. No gradients. No gray palette. Dividers are 1px solid black at 20% opacity. Disabled controls stay the same shape at 35% opacity.

## Surface

- No box shadows.
- No rounded corners. Radius is 0.
- Controls use a 1px solid black border.
- Sections are separated by space and a hairline, not by cards.
- Focus is a 1px solid black outline, offset by 2px. No glow.

## Space

Base unit is 8px.

| Use | Space |
| --- | --- |
| Label to its control | 4px |
| Stacked fields | 16px |
| Related controls in a row (time chips) | 8px |
| Between sections | 32px |
| Page padding | 24px top, 16px sides |

Public booking column is 420px wide, centered. Login uses the same column. The dashboard is 640px wide, still a single column.

## Controls

**Primary button.** Black fill, white text, label role, 40px tall, padding 0 16px. Full width only for the booking submit. Everywhere else it hugs its label.

**Secondary button.** White fill, black text, 1px black border, same height and type. Used for cancel and for low-emphasis actions.

**Text field.** 40px tall, 1px black border, 12px horizontal padding, body type. Label sits above the field. No floating labels.

**Choice chip.** Meeting types and time slots. 36px tall, 1px black border, body type, 8px gap. Selected state inverts to black fill and white text. One selection per group.

**Day cell.** 36px square, body type, centered. Selected state inverts. Past days and days with no slots are quiet, not clickable, and not inverted.

**Table.** Label role in the header, body role in the cells. Header and rows are separated by the hairline. No zebra striping, no row shadow.

One primary action per screen.

## Public page `/book/:slug`

Top to bottom, inside the 420px column:

1. Brand name, title role.
2. Meeting types as choice chips. Seeded examples: Consultation, 30 min; Showing, 60 min. Duration is body type under the chip row, written once for the selected type.
3. Month. Weekday initials are quiet body type. Days are day cells. Moving between months is body text, "Previous" and "Next", not icons.
4. Open times as choice chips. The line "Times in {timezone}" sits above them in body type and stays visible. Example: "Times in America/New_York".
5. Form, in order: name, email, phone, note. The note label is "Which property?".
6. Primary button, "Book".

Past days and days with no slots cannot be selected. If the agent has no weekly hours, the page shows one body sentence and no chips: "No open times yet."

## Confirmation `/book/confirmed`

Title: "Booked". Body: the meeting type, the time with timezone, and the guest name. Then a text link, body type, underlined: "Cancel this booking". No success illustration.

## Login `/login`

Title: "Log in". Email, password, primary button "Log in". A failed login is one body sentence under the button: "Email or password is wrong."

## Dashboard `/dashboard`

Title: "Schedule". Three sections, hairline between them.

**Bookings.** Section label "Today", then a table: time, guest, meeting type. Later days follow the same table under a body date line. Each row has a secondary "Cancel" button. Empty: "No bookings today."

**Weekly hours.** Section label "Hours". Seven rows. Weekday is label role, hours are body role, for example "9:00–5:00" or "Closed". Editing replaces the row in place. If every day is closed, body text above the public-link line: "The public page stays empty until hours are set."

**Meeting types.** Section label "Meetings". Each type is one row: name and duration in body type, active or inactive as quiet body text. Secondary button "Add type".

## States

| State | Treatment |
| --- | --- |
| Selected | Black fill, white text. |
| Disabled or past | 35% opacity, not clickable. |
| Error | Body sentence under the control that failed. "That time was just taken." No colored banner. |
| Empty | One body sentence. No illustration. |
| Focus | 1px black outline, 2px offset. |

## Later

The first color, when chosen, is allowed on the primary button fill and the selected chip or day. Borders, type, and paper stay black and white. Shadows and gradients stay out.
