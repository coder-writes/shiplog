// Server-only storage for per-user connector keys (encrypted, service role only).
import { decryptConnectionKey, encryptConnectionKey } from "./connectionKeyCrypto.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveConnectionKeyForUser(userId: string, connectorId: string, connectionAPIKey: string) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: await encryptConnectionKey(connectionAPIKey),
      reconnect_required: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionForUser(userId: string, connectorId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("app_user_connections")
    .select("connection_key_ciphertext, reconnect_required")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { key: await decryptConnectionKey(data.connection_key_ciphertext), reconnectRequired: data.reconnect_required };
}

export async function getConnectionKeyForUser(userId: string, connectorId: string) {
  return (await getConnectionForUser(userId, connectorId))?.key ?? null;
}

export async function markReconnectRequired(userId: string, connectorId: string) {
  const db = await admin();
  await db.from("app_user_connections").update({ reconnect_required: true }).eq("user_id", userId).eq("connector_id", connectorId);
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").delete().eq("user_id", userId).eq("connector_id", connectorId);
  if (error) throw error;
}
