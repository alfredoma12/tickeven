import { requireSupabase } from "./supabase.js";

export async function signInProducer(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpProducer(email, password, username) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) throw error;
  return data;
}

export async function endProducerSession() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
