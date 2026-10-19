// Edge Function "invite": add someone to a project and email them an invitation.
//
// 1. Runs invite_member() *as the signed-in user*, so the usual rules apply (only owners and project managers can
//    invite, only owners can invite an owner, etc.).
// 2. If the person has no account yet, Supabase Auth emails them an "Invite user" link. Clicking it signs them in
//    and the app asks for their name and a password. Their project access (with the chosen role) is already waiting.
// 3. If they already have an account, they get access straight away (no email needed — the project appears for them).
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → name it "invite" → paste this file.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ROLES: Record<string, string> = {
  owner: 'Owner',
  project_manager: 'Project Manager',
  quantity_surveyor: 'Quantity Surveyor',
  architect: 'Architect',
  structural_engineer: 'Structural Engineer',
  mechanical_engineer: 'Mechanical Engineer',
  electrical_engineer: 'Electrical Engineer',
  site_engineer: 'Site Engineer',
  subcontractor: 'Subcontractor',
  mason: 'Mason',
  client: 'Client',
};

// Where the email link may send people back to (must also be in Supabase Auth → URL Configuration → Redirect URLs).
const ALLOWED_ORIGINS = ['https://projectsphere.site', 'https://www.projectsphere.site', 'http://localhost:5173'];
const DEFAULT_ORIGIN = 'https://projectsphere.site';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  // Acts as the person sending the invite, so row-level security and invite_member()'s checks apply.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });

  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return reply({ error: 'Please sign in again.' }, 401);

  let body: { projectId?: string; email?: string; role?: string; origin?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? 'site_engineer');
  if (!body.projectId || !email) return reply({ error: 'Project and email are required' }, 400);

  const { data: result, error } = await asUser.rpc('invite_member', { pid: body.projectId, invite_email: email, invite_role: role });
  if (error) return reply({ error: error.message }, 400);
  if (result !== 'invited') return reply({ result }); // already had an account: access granted, nothing to email

  const [{ data: project }, { data: inviter }] = await Promise.all([
    asUser.from('projects').select('name').eq('id', body.projectId).single(),
    asUser.from('profiles').select('full_name, email').eq('id', user.id).single(),
  ]);
  const origin = ALLOWED_ORIGINS.includes(String(body.origin)) ? String(body.origin) : DEFAULT_ORIGIN;

  // Only the service role can send Auth invite emails; it's used for nothing else here.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: origin,
    data: {
      invited_by: inviter?.full_name || inviter?.email || 'A teammate',
      project_name: project?.name ?? 'a project',
      role_label: ROLES[role] ?? role,
    },
  });

  // The invite itself is saved either way; if the email couldn't be sent the person can still sign up themselves.
  if (mailError) return reply({ result: 'invited', emailSent: false, emailError: mailError.message });
  return reply({ result: 'invited', emailSent: true });
});
