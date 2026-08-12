import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Deletes all user data and (with a service key) the auth user itself.
// The caller must be authenticated and can only delete their own account.
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // Verify the caller via their access token
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Missing access token' }, { status: 401 });

  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await req.json().catch(() => ({}));
  if (userId !== userData.user.id) {
    return NextResponse.json({ error: 'Forbidden: can only delete your own account' }, { status: 403 });
  }

  // Delete user data (messages cascade from chats via FK)
  await userClient.from('chats').delete().eq('user_id', userId);
  await userClient.from('quick_topics').delete().eq('user_id', userId);
  await userClient.from('memories').delete().eq('user_id', userId);
  await userClient.from('profiles').delete().eq('id', userId);

  // Deleting the auth user requires the service role key
  if (!serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'Data deleted, but SUPABASE_SERVICE_KEY is not configured - auth user remains' },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
