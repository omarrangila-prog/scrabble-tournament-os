-- Two staff accounts could not sign in at all.
--
-- `desk@blufys.pk` and `results@blufys.pk` returned "Database error querying schema" — a 500,
-- not a refusal — while the director accounts signed in normally. They were created by
-- inserting into `auth.users` directly rather than through the Auth admin API, and the direct
-- insert left the token columns NULL where the API writes an empty string.
--
-- GoTrue scans those columns into Go strings, which cannot hold NULL, so the row fails to
-- read and the whole sign-in fails before any password is checked. The account looks broken
-- with no way to tell from the outside that it is the row and not the credentials — the desk
-- volunteer just cannot get in, on the morning of an event.
--
-- Nothing here touches a password, an email address or a session. It writes the empty string
-- that the Auth API would itself have written, and only where the value is missing.

update auth.users
set confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    email_change               = coalesce(email_change, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change_token_current is null
   or email_change is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;
