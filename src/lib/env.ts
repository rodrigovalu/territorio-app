function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}. Veja .env.example`);
  }
  return value;
}

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  googleWebClientId: required('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
};

/** Versão vigente dos termos — precisa bater com accept_terms() no banco. */
export const TERMS_VERSION = '2026-11';
