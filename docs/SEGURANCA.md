# Segurança e autorização

## Autenticação

- Login apenas com Google (ID token nativo verificado pelo Supabase Auth). Cadastro por e-mail/senha desativado.
- Sessão salva **criptografada**: chave AES-256 aleatória no Android Keystore (`expo-secure-store`) e o conteúdo cifrado no armazenamento local.
- `android:allowBackup="false"`: tokens não vão para o backup do Google Drive.
- Tokens com 1 h de validade, rotação de refresh token ligada.
- Tráfego HTTP sem TLS bloqueado (`usesCleartextTraffic=false`).

## Autorização (banco de dados)

- **RLS ligado em todas as tabelas.**
- `profiles`: qualquer usuário logado lê nome/cor/foto; cada um só altera **o próprio** `display_name` e `color` (permissão por coluna). Nome e cor validados por `CHECK`.
- `runs` / `run_cells`: cada usuário lê **só as próprias** corridas. O app **não pode** inserir, alterar ou apagar corridas.
- `cell_month_totals`: sem acesso direto. Leitura só pelas funções `get_territories`, `get_cell_ranking` e `get_leaderboard`, que devolvem nome, cor e km — nunca trajetos ou horários.
- `apply_run` (grava corrida e soma km) só pode ser executada pela `service_role`, ou seja, pela Edge Function.
- Usuário anônimo (sem login) não acessa nada.
- Todas as funções `security definer` usam `search_path = ''`.

## Antifraude (Edge Function `submit-run`)

O servidor ignora qualquer distância informada pelo app e recalcula tudo a partir dos pontos de GPS brutos:

- Pontos com precisão pior que 35 m são descartados.
- Trechos acima de 25 km/h não contam; se passarem de 20% do percurso, a corrida é recusada (veículo).
- Perdas de sinal acima de 60 s não contam (evita "linha reta").
- Horários precisam ser crescentes, não podem estar no futuro, e a corrida deve ser enviada em até 72 h.
- Limites: 8 h e 100 km por corrida, 10 corridas por dia, 3 MB por envio.
- `clientRunId` único por usuário: reenviar a mesma corrida não soma km duas vezes.
- No aparelho, localizações marcadas como simuladas (apps de "GPS falso") são ignoradas.

## Permissões Android

Só as necessárias: localização precisa/aproximada, serviço em primeiro plano (tipo localização) e notificações. `ACCESS_BACKGROUND_LOCATION` é explicitamente removida: a gravação usa serviço em primeiro plano iniciado pelo usuário, com notificação visível.

## Privacidade (LGPD)

- Termos e política exibidos e aceitos antes do uso (versão registrada com data).
- Aviso explícito antes do pedido de permissão de localização.
- Exclusão de conta no app apaga tudo em cascata (`on delete cascade`) e revoga o acesso ao Google.
- Trajetos visíveis apenas ao dono.

## Segredos

- No app só existem valores públicos: URL do Supabase, chave `anon` e Web Client ID do Google.
- `service_role` fica apenas nas Edge Functions.
- A chave do Google Maps deve ser restrita ao pacote + SHA-1 do app.
- `.env`, keystores e `google-services.json` estão no `.gitignore`.
