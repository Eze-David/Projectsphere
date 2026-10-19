import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);
// Invite emails link back with "type=invite" in the URL; remember that before the client consumes the link.
export const arrivedFromInvite = typeof window !== 'undefined' && /type=invite/.test(window.location.hash);
export const supabase = isConfigured ? createClient(url, key) : null;
