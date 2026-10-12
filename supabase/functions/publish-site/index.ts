// Owner-only: asks GitHub to rebuild the public website now.
// Call it from the Scientist Profile app with the signed-in user's session. Anyone who is not the site owner gets 403.
// Secret needed: GITHUB_DISPATCH_TOKEN (a fine-grained token limited to the website repo, "Contents: read and write").
import { createClient } from 'npm:@supabase/supabase-js@2';

const REPO = 'SharanStudio/sharan-website';
const cors = {
  'Access-Control-Allow-Origin': '*', // access is controlled by the bearer token, not by cookies
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return reply(401, { error: 'Sign in first.' });

  // Act as the caller, so the database decides who the owner is.
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: who, error: authErr } = await user.auth.getUser();
  if (authErr || !who?.user) return reply(401, { error: 'Your session has expired. Sign in again.' });
  const { data: isOwner, error: ownerErr } = await user.rpc('is_site_owner');
  if (ownerErr) return reply(500, { error: 'Could not check ownership.' });
  if (isOwner !== true) return reply(403, { error: 'Only the site owner can update the website.' });

  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
  if (!token) return reply(500, { error: 'The rebuild key is not set up yet.' });

  const gh = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'scientist-profile-publish',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'content-updated' }),
  });
  if (gh.status !== 204) return reply(502, { error: `GitHub refused the request (HTTP ${gh.status}).` });
  return reply(200, { ok: true });
});
