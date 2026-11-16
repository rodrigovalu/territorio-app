# Território

App de corrida com disputa de territórios. O mapa é dividido em hexágonos de **10 km de ponta a ponta** (≈ 65 km²). Quem somar mais km dentro de um hexágono durante o mês é o dono dele. A disputa recomeça todo dia 1º (fuso de Brasília).

**Plataforma:** Android (Expo SDK 58 / React Native 0.88). O código já é compatível com iOS, mas a configuração de iOS ainda não foi feita.

## Funcionalidades

- Login com Google (nativo) via Supabase Auth
- Aceite dos Termos e da Política de Privacidade (LGPD), com versionamento
- Mapa com os territórios coloridos e transparentes na cor do dono
- Gravação de corrida por GPS com a tela apagada (serviço em primeiro plano, sem permissão de localização em segundo plano)
- Pausar, retomar, descartar; fila offline para enviar quando voltar a internet
- Ranking geral do mês e ranking de cada território
- Perfil: nome, cor, histórico, sair, **excluir conta e todos os dados**

## Estrutura

```
src/app/                 telas (Expo Router)
  login.tsx, consent.tsx, legal.tsx
  (tabs)/index.tsx       mapa de territórios
  (tabs)/run.tsx         gravação da corrida
  (tabs)/ranking.tsx     ranking do mês
  (tabs)/profile.tsx     perfil, histórico, exclusão de conta
  territory/[id].tsx     ranking de um território
src/lib/                 auth, supabase (sessão criptografada), api, tracking (GPS)
supabase/
  migrations/            tabelas, RLS e funções SQL
  functions/submit-run   recebe o GPS bruto, valida e grava (antifraude)
  functions/delete-account
  functions/_shared/     grade hexagonal + validação (usadas pelo app E pelo servidor)
tests/                   testes da grade e da validação
docs/                    configuração, segurança, privacidade
```

## Começando

Siga o passo a passo em **[docs/SETUP.md](docs/SETUP.md)**. Em resumo:

1. Criar projeto no Supabase, aplicar a migration e publicar as Edge Functions.
2. Criar as credenciais OAuth no Google Cloud (Web + Android) e ativar o provedor Google no Supabase.
3. Criar a chave do Google Maps (Android).
4. Copiar `.env.example` para `.env` e preencher.
5. `npm install` → `npx eas-cli build --profile development --platform android`.

```bash
npm run typecheck   # TypeScript
npm test            # testes da grade e antifraude
```

Segurança: veja [docs/SEGURANCA.md](docs/SEGURANCA.md).
