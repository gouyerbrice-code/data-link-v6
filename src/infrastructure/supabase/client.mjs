// P1 Supabase adapter boundary.
// No module outside infrastructure should create its own Supabase client.
//
// [PROPOSITION V6] The concrete Supabase SDK is intentionally not added to
// P1 yet because no development Supabase URL/key is available in the
// construction environment. The adapter contract is defined now; the concrete
// client is activated when the target development environment is provisioned.

export function createSupabaseAdapter({ client }) {
  if (!client) {
    throw new Error("Supabase client is required by the adapter");
  }

  return Object.freeze({
    client,
  });
}
