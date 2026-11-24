/**
 * Configuração pública do app. Estes valores NÃO são segredos: a URL e a chave publicável do
 * Supabase e o Web Client ID do Google ficam dentro de qualquer app publicado. A segurança está
 * nas regras RLS do banco e na validação das Edge Functions.
 * Podem ser sobrescritos por variáveis de ambiente (EXPO_PUBLIC_*), por exemplo num projeto de testes.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://bkuvpcdlggyxufesdjpr.supabase.co',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_-wIOBAJjZXgr1Xwsc6B97A_dS-Sy-jK',
  googleWebClientId:
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '410499543573-gcodrh6cva0om8pl3fbso5i18lfgvkf7.apps.googleusercontent.com',
};

/** Versão vigente dos termos — precisa bater com accept_terms() no banco. */
export const TERMS_VERSION = '2026-11-24';
