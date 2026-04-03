import { supabase } from './supabase.js';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

export async function signUp(email: string, password: string, displayName: string): Promise<{ user: AuthUser; token: string }> {
  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) throw new Error(authError.message);

  // Create instructor profile
  const { error: profileError } = await supabase
    .from('instructor_profiles')
    .insert({ id: authData.user.id, display_name: displayName });

  if (profileError) {
    // Rollback: delete the auth user
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(profileError.message);
  }

  // Sign in to get a session token
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) throw new Error(signInError.message);

  const user: AuthUser = { id: authData.user.id, email, display_name: displayName };
  return { user, token: signInData.session.access_token };
}

export async function signIn(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Invalid email or password');

  // Get display name from profile
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('display_name')
    .eq('id', data.user.id)
    .single();

  const user: AuthUser = {
    id: data.user.id,
    email: data.user.email!,
    display_name: profile?.display_name || email.split('@')[0],
  };

  return { user, token: data.session.access_token };
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}
