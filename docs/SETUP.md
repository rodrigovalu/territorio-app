# Configuração passo a passo

Tempo estimado: 1 a 2 horas na primeira vez. Contas necessárias: Supabase (grátis), Google Cloud (grátis), Expo/EAS (grátis), Google Play Console (US$ 25, uma única vez, só para publicar).

---

## 1. Supabase (backend) — ✅ já configurado

Projeto **territorio** (`bkuvpcdlggyxufesdjpr`, região São Paulo):

- URL: `https://bkuvpcdlggyxufesdjpr.supabase.co` (já em `.env.example`)
- As duas migrations de `supabase/migrations/` já foram aplicadas (tabelas, RLS, funções, 24 medalhas).
- As Edge Functions `submit-run` e `delete-account` já estão publicadas.

Falta apenas, no painel do Supabase:

1. **Authentication → Sign In / Providers**: desative "Email" (o app usa só Google).
2. **Authentication → Providers → Google**: configure conforme o passo 2.4 abaixo.

Para alterações futuras pela CLI:

```bash
npm i -g supabase
supabase login
supabase link --project-ref bkuvpcdlggyxufesdjpr
supabase db push                       # novas migrations
supabase functions deploy submit-run   # após mudar a validação
```

> Os avisos do *Security Advisor* sobre funções `SECURITY DEFINER` executáveis por usuários logados e sobre `cell_month_totals` sem policy são intencionais: são as RPCs do app (que só devolvem dados agregados ou do próprio usuário) e uma tabela sem acesso direto.

## 2. Google Cloud: login com Google

No [Google Cloud Console](https://console.cloud.google.com), crie um projeto e:

1. **Tela de consentimento OAuth** → tipo "Externo". Preencha nome do app, e-mail de suporte, link da política de privacidade. Escopos: `email`, `profile`, `openid`.
2. **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**. Este é o **Web Client ID** (vai no `.env` e no Supabase). Copie também o *Client Secret*.
3. **Credenciais → Criar ID do cliente OAuth → Android**:
   - Nome do pacote: o mesmo de `ANDROID_PACKAGE` (padrão `br.com.territorio.app`).
   - SHA-1: rode `npx eas-cli credentials -p android` depois do primeiro build e copie o SHA-1 do keystore. Crie **um cliente Android para cada SHA-1** (build de desenvolvimento/preview e o da Play Store, que aparece em Play Console → Integridade do app → Assinatura do app).
4. No Supabase, em **Authentication → Providers → Google**: ative, cole em *Client IDs* o Web Client ID **primeiro** e depois os Android Client IDs, separados por vírgula; cole o *Client Secret* do cliente Web. Deixe **"Skip nonce checks" desligado**.

## 3. Google Maps (Android)

1. No mesmo projeto do Google Cloud, ative **Maps SDK for Android**.
2. Crie uma **chave de API** e restrinja: *Aplicativos Android* → pacote + SHA-1 (os mesmos do passo 2.3); *Restrições de API* → apenas Maps SDK for Android.
3. Coloque em `GOOGLE_MAPS_ANDROID_API_KEY`.

## 4. Variáveis de ambiente

```bash
cp .env.example .env   # preencha
```

Para builds na nuvem, cadastre as mesmas variáveis no EAS (não suba o `.env` para o GitHub):

```bash
npx eas-cli login
npx eas-cli init                 # gera o EAS_PROJECT_ID
npx eas-cli env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value ... --visibility plaintext
# repita para EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
# GOOGLE_MAPS_ANDROID_API_KEY (visibility: sensitive), ANDROID_PACKAGE, EAS_PROJECT_ID
# e para os ambientes preview e production
```

## 5. Rodar no celular

O app usa módulos nativos (mapa, login Google, GPS), então **não funciona no Expo Go**. Gere um build de desenvolvimento:

```bash
npm install
npx eas-cli build --profile development --platform android
```

Instale o APK no celular (link que o EAS mostra) e rode `npx expo start` no computador.

Para testar sem o servidor de desenvolvimento: `--profile preview` gera um APK independente.

## 6. Publicar no Google Play

1. `npx eas-cli build --profile production --platform android` (gera `.aab`).
2. Na Play Console, crie o app e envie o `.aab` (ou `npx eas-cli submit -p android`).
3. Preencha obrigatoriamente:
   - **Política de privacidade:** publique o texto de `docs/PRIVACIDADE.md` numa página web (pode ser no GitHub Pages ou no site da sua organização) e informe o link.
   - **Exclusão de conta:** informe que é feita em *Perfil → Excluir minha conta* e um link web com as instruções (exigência do Play).
   - **Segurança dos dados:** coleta de *Localização precisa* (funcionalidade do app, não compartilhada), *Nome*, *E-mail*, *Foto* (gerenciamento de conta). Criptografia em trânsito: sim. Usuário pode pedir exclusão: sim.
   - **Serviço em primeiro plano (localização):** declare o uso "rastreamento de atividade física iniciado pelo usuário" e envie um vídeo curto mostrando a notificação durante a corrida.
4. Adicione o SHA-1 da *Assinatura do app pelo Google Play* como novo cliente OAuth Android (passo 2.3) e na restrição da chave do Maps — senão o login e o mapa falham na versão da loja.

## Ajustes do jogo

- Tamanho dos territórios: `HEX_CORNER_TO_CORNER_KM` em `supabase/functions/_shared/hexgrid.ts`. **Defina antes de lançar**; mudar depois embaralha todos os territórios.
- Regras antifraude (velocidade máxima, precisão do GPS, limite por corrida): `RULES` em `supabase/functions/_shared/validateRun.ts`. Depois de mudar, publique de novo a função `submit-run`.
