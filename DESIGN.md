# Design

Black and white interface for login and signup. One typeface, three type roles, flat surfaces. Color is not chosen yet. When it is added, it replaces the black fill on the primary action and the selected state. It does not recolor body text, and it does not introduce a gradient.

The Type, Color, Surface, Space, Controls, and States sections cover login and signup. Booking, confirmation, guest appointments, and the agent dashboard share the neutral Inter-based system in the Dashboard section.

## Type

One family: `ui-sans-serif, system-ui, sans-serif`.

Three roles. No fourth size. Weight never goes above 500. Page titles are regular, not bold. Do not bold a label and the value under it.

| Role  | Size | Weight | Line height | Use                                                                                              |
| ----- | ---- | ------ | ----------- | ------------------------------------------------------------------------------------------------ |
| Title | 22px | 400    | 1.25        | Once per screen. The brand name on the public page, or the page name on login and the dashboard. |
| Label | 13px | 500    | 1.3         | Field labels, section names, button text, table headers.                                         |
| Body  | 15px | 400    | 1.45        | Times, dates, help, field values, notes, empty states, errors.                                   |

Quiet text is body type at 55% opacity. It is still black. Placeholder text is body type at 45% opacity.

## Color

| Token  | Value     | Use                                                          |
| ------ | --------- | ------------------------------------------------------------ |
| Ink    | `#000000` | Text, primary fill, control borders, focus outline.          |
| Paper  | `#ffffff` | Page background, secondary button fill, unselected controls. |
| Accent | unset     | Reserved. Do not invent one.                                 |

No purple. No gradients. No gray palette. Do not hardcode a color. Components use Ink, Paper, and Accent. A hex, `rgb`, or named color written on a component is wrong. Dividers are 1px solid black at 20% opacity. Disabled controls stay the same shape at 35% opacity.

## Surface

- No box shadows.
- Square corners on fields, chips, and day cells. Primary and secondary buttons use an 8px corner radius.
- Controls use a 1px solid black border.
- Sections are separated by space and a hairline, not by cards.
- Focus is a 1px solid black outline, offset by 2px. No glow.

## Space

Base unit is 8px.

| Use                                    | Space                |
| -------------------------------------- | -------------------- |
| Label to its control                   | 4px                  |
| Stacked fields                         | 16px                 |
| Related controls in a row (time chips) | 8px                  |
| Between sections                       | 32px                 |
| Page padding                           | 24px top, 16px sides |

Login uses a 420px column, centered.

## Controls

**Primary button.** Black fill, white text, label role, 40px tall, padding 0 16px, 8px corner radius. It hugs its label.

**Secondary button.** White fill, black text, 1px black border, same height, type, and corner radius. Used for cancel and for low-emphasis actions.

**Text field.** 40px tall, 1px black border, 12px horizontal padding, body type. Label sits above the field. No floating labels.

**Choice chip.** Meeting types and time slots. 36px tall, 1px black border, body type, 8px gap. Selected state inverts to black fill and white text. One selection per group.

**Day cell.** 36px square, body type, centered. Selected state inverts. Past days and days with no slots are quiet, not clickable, and not inverted.

One primary action per screen.

## Login `/login`

Chips labeled Realtor and Guest choose the account. The title is "Realtor log in" or "Guest log in". Email, password, primary button "Log in". A failed login is one body sentence under the button: "Email or password is wrong."

## Guest account `/signup`

Title: "Create a guest account". Name, email, phone, password, primary button "Create account". Password is 8 to 200 characters. A text link returns to guest log in.

## Dashboard `/dashboard`

A quiet white workspace. Its tokens are CSS custom properties set on `.shell` in `frontend/src/dashboard.css`, so they reach the agent dashboard, guest appointments, the booking page, and confirmation. Components read the tokens. A raw color, size, or radius written on a dashboard component is wrong.

**Type.** Inter, self-hosted through `@fontsource-variable/inter`, with the system stack as fallback. Body is 14px on a 20px line. Titles use weight 600. Names, labels, and buttons use 500. Everything else uses 400.

| Token        | Size | Use                                                         |
| ------------ | ---- | ----------------------------------------------------------- |
| `--text-2xl` | 24px | Page title, once per page                                   |
| `--text-xl`  | 18px | Panel title                                                 |
| `--text-lg`  | 16px | Reserved step in the scale                                  |
| `--text-md`  | 14px | Body, rows, buttons, fields, day and month titles           |
| `--text-sm`  | 13px | Secondary row lines, day dates and counts, labels, errors   |
| `--text-xs`  | 12px | Badges, filter counts, weekday headers, panel section names |

**Color.** Zinc neutrals on white.

| Token                    | Value     | Use                                              |
| ------------------------ | --------- | ------------------------------------------------ |
| `--color-bg`             | `#ffffff` | Page, rows, panel, menus, the selected segment   |
| `--color-bg-subtle`      | `#fafafa` | Row hover and focus                              |
| `--color-bg-muted`       | `#f4f4f5` | Current nav link, segmented track, control hover |
| `--color-border`         | `#e7e7e9` | Hairlines and list borders                       |
| `--color-border-strong`  | `#d4d4d8` | Button and field borders, the ring on today      |
| `--color-text`           | `#18181b` | Primary text                                     |
| `--color-text-secondary` | `#52525b` | Descriptions and secondary lines                 |
| `--color-text-tertiary`  | `#71717a` | Metadata, counts, icons                          |
| `--color-primary`        | `#18181b` | Primary button, selected day, the "Next" marker  |
| `--color-focus`          | `#18181b` | Focus outline                                    |
| `--color-danger`         | `#b42318` | Destructive actions and errors                   |

Status color appears only as the dot inside a neutral badge: `--status-confirmed` `#16a34a`, `--status-pending` `#d97706`, and `--status-cancelled` `#a1a1aa`. Cards, row fills, and text stay neutral.

**Surface.** Borders are 1px. Corners are 6px on controls and day cells (`--radius-md`), 8px on lists, cards, menus, and the segmented track (`--radius-lg`), and fully round on badges and markers. Two shadows exist: `--shadow-raised` lifts the selected segment, and `--shadow-overlay` sits under the account menu and the appointment panel. Focus is a 2px outline in `--color-focus`, offset 2px. Disabled controls drop to 50% opacity. A busy button keeps focus and uses `aria-disabled`.

**Space.** Steps of 4, 8, 12, 16, 24, 32, 48, and 64px (`--space-1` to `--space-8`). Controls are 36px tall. Compact controls, such as nav links, segments, and icon buttons, are 32px.

**Shell.** A sticky 56px top bar with a hairline holds the brand mark and name on the left and the account menu on the right. The account button shows initials, the role, and the name. Its menu shows the email and "Log out", and it supports arrow keys and Escape. The agent dashboard adds a 224px sidebar listing Schedule, Hours, and Meetings with 16px Lucide icons. The current page gets the muted fill and full-strength text. Booking, confirmation, and `/guest` use `.shell.is-solo`: the same top bar and content column, with no sidebar. A visitor who is not logged in sees "Log in" in place of the account menu. Content is centered, up to 1100px wide, with 32px padding. Each page opens with a page header: the title and one line of description in secondary text. Below 768px the agent sidebar becomes one scrolling row under the top bar, and side padding drops to 16px.

**Schedule `/dashboard`.** The toolbar holds the filter (Upcoming, All, and Cancelled, each with a count), a Refresh button, and the List and Calendar toggle. Calendar is the default view. The filter and view live in the URL, for example `?filter=all&view=list`.

- Upcoming shows confirmed appointments that have not ended. All shows everything the API returns, which starts at today. Cancelled shows cancelled appointments.
- The list groups appointments by day, today first. Each day has a header, with "Today" or "Tomorrow" before the date and a count, over one bordered list. Within a day, confirmed appointments come first, then cancelled ones, each by start time.
- Each row is a button with five parts: the time range; the guest name over the property, taken from the guest's "Which property?" note or "No property listed"; the meeting type over its location and duration; the status badge; and a chevron. The next confirmed appointment carries a "Next" marker, which reads "Now" while it runs. Ended appointments are dimmed. Cancelled appointments show the start time struck through.
- The calendar is a month grid beside the selected day's agenda, and the two stack when space is narrow. Days with appointments show up to three dots. Today has a ring, and the selected day is filled. Days before today and past the booking window are disabled. The calendar opens on the first day with appointments. Arrow keys, Home, End, Page Up, and Page Down move the selection.
- Empty states name what is missing and offer the next step where one exists: "No upcoming appointments.", "No appointments yet.", "No cancelled appointments.", and "Nothing scheduled for {date}."
- Loading shows skeleton rows. A failed first load shows "Couldn’t load appointments." with "Try again". A failed refresh keeps the current list and shows an alert above it.

**Appointment panel.** Opening a row shows a 440px modal panel on the right, full screen below 768px. The top shows the status badge, the guest name, and the meeting type with its duration. Three sections follow: When (date, time, time zone), Where (property, meeting location), and Guest (email and phone as links). A confirmed appointment has one action, "Cancel appointment". It asks for confirmation, reads "Cancelling…" while it runs, and shows any error inside the panel. Escape, the close button, and a click on the backdrop close the panel, and focus returns to the row.

**Status badge.** A neutral pill with a colored dot and a label: Confirmed, Pending, or Cancelled. The API currently returns confirmed and cancelled.

**Hours `/dashboard/hours`.** The description reads "The weekly times visitors can book. Times in {timezone}." Seven rows sit in one bordered list, Monday first, each with the weekday and its hours, for example "9:00 AM–5:00 PM" or "Closed". Editing replaces the row in place. If every day is closed, the page says "The public page stays empty until hours are set."

**Meetings `/dashboard/meetings`.** The description reads "The meeting types visitors choose from on your public page." Each type is one row with its name and duration, and "Active" or "Inactive" as quiet text. "Add type" adds another row.

**Booking `/book/:slug`.** The top bar shows the realtor's brand and links back to this page. The page title is the agent's name. The description is "Realtor" or "Realtor · {brand}" when the names differ. A logged-in guest sees "Your appointments". A realtor sees whose page it is and a link to the dashboard.

Meeting types use the segmented control. Duration, location, and buffers sit under it as one secondary line. Wide screens put the month calendar in a 320px card beside the time chips and form; the two stack when space is narrow. The calendar uses the dashboard day cells: today has a ring, the selected day is filled, and days that cannot be booked are dimmed. It does not show appointment dots. Previous and next month are icon buttons. The time zone is a select. Open times are chips: 36px tall, 6px corners, a hairline border, and a filled selected state. Name, email, and phone from a guest account are read-only. "Which property?" is a dropdown of the realtor's listings. "Book" is the dashboard primary button and hugs its label. Errors sit under the control that failed, including "That time was just taken." If the agent has no weekly hours, the page says "No open times yet."

**Confirmation `/book/:slug/confirmed`.** The same shell and brand. The title is "Booked" or "Cancelled". A bordered summary lists the meeting, time and zone, guest, and property. A confirmed booking cancels with the danger button after a confirm step. After cancel, "Book another time" returns to the booking page. A logged-in guest sees that the appointment is on their account. A visitor without an account sees that this page's link is how they cancel.

**Appointments `/guest`.** The same shell. The brand reads "Appointments" and links to `/guest`. The account menu uses the guest's name and role. The page matches the schedule list: Upcoming, All, and Cancelled with counts, plus Refresh. The filter lives in the URL. Rows use the realtor's brand in place of a guest name, then the property, meeting type, and status. Opening a row shows the appointment panel: When, Where, and Realtor, with "Book again". A confirmed appointment cancels from the panel after a confirm step. A public list of realtor pages supplies the header and empty-state action. One realtor reads "Book a demo"; more than one reads "Book with {brand}". Guests do not need a prior appointment or the slug.

**Motion.** Hover and selection changes fade over 120ms. The account menu pops in over 120ms, and the panel slides in over 200ms. A reduced-motion setting turns all of it off.

## States

These states apply to login and signup.

| State            | Treatment                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Selected         | Black fill, white text.                                                                     |
| Disabled or past | 35% opacity, not clickable.                                                                 |
| Error            | Body sentence under the control that failed. "That time was just taken." No colored banner. |
| Empty            | One body sentence. No illustration.                                                         |
| Focus            | 1px black outline, 2px offset.                                                              |

## Later

The first color, when chosen, is allowed on the primary button fill and the selected chip or day. Borders, type, and paper stay black and white. Shadows and gradients stay out.
