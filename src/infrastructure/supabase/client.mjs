import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdapter({ url, secretKey }) {
  if (!url) {
    throw new Error("Supabase URL is required");
  }

  if (!secretKey) {
    throw new Error("Supabase secret key is required");
  }

  const client = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return Object.freeze({
    client,

    async getUser(accessToken) {
      if (!accessToken) {
        throw new Error("Access token is required");
      }

      const { data, error } = await client.auth.getUser(accessToken);

      if (error) {
        throw error;
      }

      return data.user;
    },

    async checkConnection() {
      const { error } = await client
        .from("v6_tenants")
        .select("id")
        .limit(1);

      if (error) {
        throw error;
      }

      return true;
    },
  });
}
