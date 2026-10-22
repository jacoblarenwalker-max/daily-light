// Public client config. Daily Light lives in the household-meals Supabase project (all its tables are dl_*).
// The publishable key is safe in a browser: every read and write is enforced by Row Level Security
// (only the two people in dl_members can see anything). Never put a service_role / secret key here.
export const SUPABASE_URL = 'https://voydoxmxdnjnewxlwzse.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FO-tgfKuBTb19W8GaX1qZw_dtZRRdqY';
// Web Push (VAPID) public key for the dl-push Edge Function. Public by design; the private key stays in Vault.
export const VAPID_PUBLIC_KEY = 'BLKmb_r54k2gTzBpdPmDCtG6nFdzRC3No2LNcVmEEAgZWi4rePvFX3_av4PkLB1m9w-0eqCaBiuEtA1QHbHjVv8';
export const PUSH_FUNCTION = 'dl-push';
