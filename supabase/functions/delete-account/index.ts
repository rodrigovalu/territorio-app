/**
 * POST /functions/v1/delete-account
 * Body: { confirm: "EXCLUIR" }
 *
 * Exclui a conta e TODOS os dados do usuário (LGPD art. 18 / exigência do Google Play).
 * As tabelas têm "on delete cascade" a partir de auth.users.
 */
import { adminClient, getUser, json, readJson } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405);
  const admin = adminClient();
  const user = await getUser(req, admin);
  if (!user) return json({ error: 'não autenticado' }, 401);

  let body: { confirm?: unknown };
  try {
    body = (await readJson(req, 1024)) as typeof body;
  } catch {
    return json({ error: 'corpo inválido' }, 400);
  }
  if (body.confirm !== 'EXCLUIR') return json({ error: 'confirmação ausente' }, 400);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('deleteUser', error);
    return json({ error: 'não foi possível excluir a conta' }, 500);
  }
  return json({ deleted: true });
});
