-- triggers in the private schema must run for the anon role
alter function private.dl_members_check() security definer;
alter function private.dl_valid_tz(text) security definer;
alter function private.dl_touch() security definer;
