import { requireSupabase } from "./supabase.js";

export async function signInAccount(email, password, expectedRole) {
  const client = requireSupabase();
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (authError) throw authError;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, status, full_name, rut, phone")
    .eq("id", authData.user.id)
    .single();

  if (profileError) {
    await client.auth.signOut();
    throw profileError;
  }
  if (profile.role !== expectedRole) {
    await client.auth.signOut();
    throw new Error("Esta cuenta no tiene acceso a esta sección.");
  }
  if (profile.status !== "approved") {
    await client.auth.signOut();
    if (profile.status === "rejected") {
      throw new Error("La solicitud de acceso fue rechazada. Contacta al administrador.");
    }
    throw new Error("Tu cuenta está pendiente de aprobación del administrador.");
  }

  return { ...authData, profile };
}

export async function signUpAccount({ email, password, fullName, rut, phone, role }) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        account_type: role,
        full_name: fullName.trim(),
        rut: rut.trim(),
        phone: phone.trim(),
      },
    },
  });
  if (error) throw error;

  if (data.session) {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
  }
  return data;
}

export async function endProducerSession() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
