# RsvRoom — Frontend

## 1. General concept

The RsvRoom frontend is one responsive SAPUI5 application for managing employees' office presence and booking desks and meeting rooms.

The same frontend should support several modes:

**Employee Mode** — the ordinary employee application on a laptop, tablet, or phone.

**Administration Mode** — configuration of the company, offices, floors, desks, meeting rooms, and devices.

**Room Display Mode** — a full-screen interface for the display outside a meeting room.

**Desk Display Mode** — an interface for a small display at a workplace.

The frontend should not depend on how the backend is hosted. The first implementation uses a CAP backend through OData V4. Later, the same SAPUI5 frontend could use a compatible OData API hosted directly in SAP S/4HANA.

---

# 2. Company structure

After sign-in, users work within this organizational structure:

**Company → Office → Building → Floor → Resource**

A Resource may have these types:

`DESK` — workplace  
`ROOM` — meeting room  
`PARKING` — parking space  
`OTHER` — another bookable resource

For example:

```text
company.de

Germany
   Hannover
      Building A
         Floor 1
         Floor 2
      Building B

   Hamburg
      Main Office

USA
   New York
      Office Manhattan
```

The company's primary domain is the root object. Geographically distributed offices can be added beneath it.

Users usually see their default office but may switch to another city or office if permitted.

---

# 3. Dashboard

After authentication, users land on the Dashboard.

The top bar contains the company logo, selected office, current date, user profile, and language selector.

The main area shows the current workday:

**Today**

```text
Friday, 11 September

Your workplace:
Desk A-2-034

Office: Hannover
Building A
Floor 2

09:00 ───────────────── 17:00

[Open workplace]
[Change booking]
```

Nearby are upcoming meeting-room bookings and teammates' presence.

For example:

```text
My day

08:00–12:00   Office
12:00–13:00   Lunch
13:00–17:00   Office

14:00–15:00
Room Berlin
Project Meeting
```

RsvRoom therefore serves both as a booking system and as an interface for organizing hybrid work.

---

# 4. Selecting an office

Users can select:

```text
Germany
  → Hannover
      → Building A
          → Floor 2
```

Selecting a floor opens its graphical plan, showing desks, meeting rooms, and other resources.

For example:

```text
┌─────────────────────────────────────┐
│ Room Berlin        Room Hamburg     │
│   FREE                BUSY          │
│                                     │
│ D01  D02  D03      D07  D08  D09   │
│ FREE FREE BUSY     FREE FREE FREE   │
│                                     │
│ D04  D05  D06      D10  D11  D12   │
└─────────────────────────────────────┘
```

Availability depends on both the selected date and time. The frontend distinguishes:

**Available** — can be booked.  
**Reserved** — already occupied.  
**My reservation** — booked by the current user.  
**Unavailable** — technically unavailable.  
**Restricted** — the user lacks permission.

---

# 5. Booking a workplace

The user selects a date and time interval, then clicks an available desk. A detail panel opens on the right:

```text
Desk A-2-034

Hannover
Building A
Floor 2

Friday, 11 September

08:00 – 17:00

Equipment
✓ Monitor
✓ USB-C Dock
✓ Keyboard
✓ Mouse

[Reserve]
```

After **Reserve** is clicked, the frontend sends a request to the OData API. The backend checks availability again because two users may see the same place as free at the same time. Once confirmed, the resource immediately changes to **My reservation**.

---

# 6. Flexible work schedule

The application should have a separate weekly form:

## My Work Week

```text
             Mon   Tue   Wed   Thu   Fri

Office        ●     ●           ●
Home                      ●           ●
Vacation
Business trip
```

For each office day, an employee may select a desk if needed. They can first plan:

```text
Monday       Hannover Office
Tuesday      Hannover Office
Wednesday    Home Office
Thursday     Hannover Office
Friday       Home Office
```

The system can then suggest desks for the chosen days. Later, automatic actions could be added:

**Book my usual desk**

or

**Find desks close to my team**

---

# 7. Booking near colleagues

Showing team presence could become an important RsvRoom feature:

```text
Team Backend Development

Kai       Office     Desk D21
Patrick   Home
Leon      Office     Desk D24
Lara      Office     Desk D26
```

Teammates' desks could also be marked on the floor plan. The user could choose **Find desk near my team**. The frontend would send the available resources to the backend and receive suitable options. This is especially useful for hybrid work, when employees use different desks from day to day.

---

# 8. Meeting rooms

Meeting-room booking resembles workplace booking but has additional properties. Users can specify attendee count and required features:

```text
Capacity: 8

✓ Monitor
✓ Teams
✓ Google Meet
✓ Whiteboard
✓ Video conference
```

The frontend shows only suitable rooms. Opening a room shows its timeline:

```text
08:00      FREE
09:00      Project Alpha
10:00      Project Alpha
11:00      FREE
12:00      FREE
13:00      Management Meeting
14:00      FREE
```

A free interval can be selected directly on the timeline.

---

# 9. Microsoft 365 and Google Workspace

RsvRoom does not have to become a second corporate calendar. Meeting rooms could synchronize with Microsoft 365/Exchange or Google Workspace. The frontend would receive one unified model:

```text
Room
Booking
StartDateTime
EndDateTime
Organizer
Subject
Source
```

Possible sources:

```text
RSVROOM
MICROSOFT
GOOGLE
SAP
```

Users would not need to know where a meeting was originally created. For example, a room booked through Outlook should appear occupied in RsvRoom.

---

# 10. My Bookings

A separate screen shows a user's own bookings:

```text
MY BOOKINGS

Today
Desk A-2-034
08:00–17:00

Room Berlin
14:00–15:00

Tomorrow
Desk A-2-041
08:00–17:00
```

From here, the user can open, change, or cancel a booking. Recurring bookings could provide:

**Edit this booking**  
**Edit this and future bookings**  
**Cancel this booking**

---

# 11. Room Display

A meeting room may have an ordinary monitor or a small touch display with an Android Stick. The Android Stick runs Chrome/WebView in kiosk mode and opens a special URL, for example:

```text
/display/room/4711
```

The screen continuously shows the room's status:

```text
BERLIN

AVAILABLE

until 14:00


Next meeting

14:00 – 15:00
Project Meeting


[Book now]
```

During a meeting:

```text
BERLIN

IN USE

14:00 – 15:00
Project Meeting

35 min remaining


Next available
15:00
```

The Room Display interface is deliberately much simpler than the ordinary application.

---

# 12. Quick booking from a display

On a touch display, the user could tap **Book now** and select:

```text
15 min
30 min
45 min
60 min
```

Corporate authentication, a QR code, NFC, or another identification method could follow. The first version may omit booking from a display altogether and use it only to show room status.

---

# 13. Desk Display

A similar interface can run on a desk display:

```text
DESK 2-034

Reserved

Alexander
08:00 – 17:00
```

or:

```text
DESK 2-034

AVAILABLE

[Reserve]
```

If a desk has a full-size monitor, an Android Stick could use HDMI 1 while the employee's laptop uses USB-C or HDMI 2. When the desk is unused, the monitor shows RsvRoom. On arrival, the employee switches the monitor input and uses it as a normal second screen. The same monitor can thus serve as both a workplace information display and a working monitor.

---

# 14. Check-in

Check-in could be added later. For example, a desk booked from 08:00 would require the user to confirm presence by 08:30. This could happen through the application, a desk QR code, NFC, or Desk Display. Without check-in, the backend would release the desk automatically. The frontend would show:

```text
Your desk reservation starts at 08:00

Please check in before 08:30

[Check in]
```

---

# 15. Administration

Administrators have an additional **Administration** section for managing:

```text
Company
Offices
Buildings
Floors
Rooms
Desks
Devices
Users
Teams
Booking Rules
Integrations
```

An administrator could upload an SVG plan for a floor and place resources on it:

```text
Desk 001 → X:420 Y:180
Desk 002 → X:480 Y:180
Room 01  → X:740 Y:250
```

The frontend would use those coordinates to render an interactive plan. Resource locations could then change without code changes.

---

# 16. Device Management

Every screen outside a meeting room or at a desk is registered as a Device:

```text
Device
ROOM-HANNOVER-A-201

Type
ROOM_DISPLAY

Resource
Room Berlin

Status
ONLINE

Last connection
15:41
```

The device receives its own technical token and does not need a regular user login. Administrators can see which displays are online or offline and which resource each one serves.

---

# 17. SAPUI5 Frontend

The frontend is best implemented as a **SAPUI5 Freestyle Application**. Fiori Elements fits administration tables well, but interactive floor maps, timelines, desk booking, and display mode need more interface freedom. The main application should therefore use Freestyle SAPUI5.

The frontend uses a Router with separate routes:

```text
/
 /dashboard
 /office/:officeId
 /floor/:floorId
 /desk/:deskId
 /room/:roomId
 /bookings
 /schedule
 /admin
 /display/room/:roomId
 /display/desk/:deskId
```

---

# 18. Connecting to CAP

The frontend never works with the database directly. The architecture is:

```text
SAPUI5
   │
   │ OData V4
   ▼
CAP Service
   │
   ├── Companies
   ├── Offices
   ├── Buildings
   ├── Floors
   ├── Resources
   ├── Desks
   ├── Rooms
   ├── Bookings
   ├── WorkSchedules
   ├── Users
   └── Devices
   │
   ▼
Database
```

Opening a floor could request:

```http
GET /odata/v4/booking/Floors(100)/Resources
```

Booking sends:

```http
POST /odata/v4/booking/Bookings
```

CAP performs business checks before saving a booking.

---

# 19. Responsive Design

One SAPUI5 application should adapt to different screen sizes. Desktop favors a large floor plan and side panel. Tablets may use a Split View. Smartphones initially show a resource list or simplified plan, with details on a separate page. Room Display and Desk Display use separate layouts optimized for continuous full-screen operation.

---

# 20. Typical user journey

**Login → Dashboard → choose day → choose Office → Building → Floor → see available desks → choose Desk → Reserve → booking appears in My Bookings → check in on the planned day.**

For a meeting room:

**Calendar / Rooms → choose time → find an available room → Reserve → booking synchronizes with the corporate calendar → the display outside the room shows the meeting automatically.**

RsvRoom thus becomes one frontend for four related tasks: **hybrid work scheduling, hot-desk booking, meeting-room booking, and management of physical displays for office resources.**
