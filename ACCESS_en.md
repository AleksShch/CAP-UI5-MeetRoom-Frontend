# Users, sign-in, and permissions

Passwordless profile selection is enabled by default: choose a user and click **Continue / Weiter**. Neither a password nor a setup token is required. Each profile displays its role beside the name. This is a demo mode: any visitor can choose any active profile, including an administrator.

## Profiles and switching

| Profile | Role |
| --- | --- |
| Anna Example | Administrator (`ADMIN`) |
| Max Example | Key user (`KEY_USER`) |
| Ola Example | User (`USER`) |

Open <http://localhost:4004/>, choose a profile, and continue. To switch profiles, click the name in the top bar. The dialog lets you select another user or sign out. Switching updates your bookings, weekly plan, and available sections. If the new role cannot access the current page, the application returns to the home page. The session survives a page refresh.

Only active users can sign in. A user created in **People / Mitarbeiter** or Administration appears in the profile list immediately. No password is requested during creation.

When migrating an older database, missing demo roles are assigned once. Later restarts preserve administrator-assigned roles and existing records. Initialization state is stored in the internal `AuthSettings` table, which is not exposed through OData.

## Roles

| Capability | User `USER` | Key user `KEY_USER` | Administrator `ADMIN` |
| --- | --- | --- | --- |
| View availability, plans, and teammates | Yes | Yes | Yes |
| Create, edit, and cancel own bookings | Yes | Yes | Yes |
| Create or edit bookings on someone else's behalf | No | No | No |
| Delete other people's bookings | No | Within own company | Yes |
| Edit own weekly plan | Yes | Yes | Yes |
| Create users | No | `USER` in own company only | Any role |
| Edit user roles, details, and active status | No | No | Yes |
| Administration, reference data, floor editor, and displays | No | No | Yes |

Key users have a separate **People / Mitarbeiter** section (`/users`) with an Add user button. In **My bookings / Meine Buchungen**, **All bookings / Alle Buchungen** shows the bookings they may delete. Deleting another person's booking requires confirmation; editing and cancellation remain available only to its owner.

Administrators change roles under **Administration → People → Edit → Role**. The last active administrator cannot be deleted, disabled, or demoted. A role change takes effect on the next request; the interface refreshes its data every 30 seconds or when Refresh is clicked.

The server derives permissions from `Users.role`. A client-supplied `role` does not change the selected profile's permissions. Checks also apply to direct OData requests, including batch requests and navigation properties. Free profile selection makes it possible to demonstrate these limits as different users.

## API

- `GET /auth/status` returns `{ "mode": "profile", "setupRequired": false }`.
- `GET /auth/profiles` returns active users with ID, name, email, company, and role.
- `POST /auth/login` accepts `{ "userID": "UUID of the selected user" }` and sets a session cookie.
- `GET /auth/session` returns the selected user without secrets.
- `POST /auth/logout` ends the current session.
- `GET /odata/v4/booking/currentUser()` returns the selected user and role.

Keep the cookie from `/auth/login` for subsequent requests. A session lasts 12 hours; switching profiles revokes the old token in that browser. The server stores a token hash, and the cookie has `HttpOnly` and `SameSite=Strict`. A data request without a selected profile returns `401`; an action forbidden to the selected role returns `403`.

## Optional password mode

The previously implemented email-and-password sign-in can be enabled with `RSVROOM_AUTH_MODE=password`; restart the server afterward. In Docker, add this variable to the service's `environment` and run `docker compose up -d`. Otherwise, profile selection remains enabled.

Password mode hides the profile list. If no account has a password yet, obtain the initial token with `docker compose exec rsvroom npm run setup-token` (or `npm run setup-token` locally). On the setup screen, enter an existing email address, the token, and a password of 12–256 characters. The demo data includes `anna@example.com`. The token is deleted after successful setup.

Administrators can set passwords for existing users in Administration. Passwords are stored as salted scrypt hashes, and `passwordHash` is excluded from OData. Changing your own password requires the current password and revokes all sessions for the account. Password forms are hidden in profile mode; `setup-token` reports that no token is needed.

## Displays

A display using a link with a device token receives only its assigned resource, location, and future confirmed bookings through `displaySnapshot`. The token grants no user permissions. A link without a token uses the selected profile.
