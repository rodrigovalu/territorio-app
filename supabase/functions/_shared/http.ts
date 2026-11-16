// Utilitários das Edge Functions (Deno)
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Valida o JWT enviado pelo app e devolve o usuário (ou null). */
export async function getUser(req: Request, admin: SupabaseClient): Promise<User | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** Lê o corpo com limite de tamanho (protege contra payloads gigantes). */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new Error('payload grande demais');
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error('payload grande demais');
  return JSON.parse(new TextDecoder().decode(buf));
}
