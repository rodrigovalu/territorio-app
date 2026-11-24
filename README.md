# Território

App de corrida com disputa de territórios. O mapa é dividido em hexágonos de **40 km²** (≈ 7,85 km de ponta a ponta). Quem somar mais km dentro de um hexágono durante o mês é o dono dele. A disputa recomeça todo dia 1º (fuso de Brasília).

**Plataforma:** Android (Expo SDK 58 / React Native 0.88). O código já é compatível com iOS, mas a configuração de iOS ainda não foi feita.

## Funcionalidades

- Login com Google (nativo) via Supabase Auth
- Aceite dos Termos e da Política de Privacidade (LGPD), com versionamento
- Mapa com os territórios coloridos e transparentes na cor do dono
- Gravação de corrida por GPS com a tela apagada (serviço em primeiro plano, sem permissão de localização em segundo plano)
- Durante a corrida: distância, tempo, **pace médio**, pace atual, progresso do km; contagem regressiva 3-2-1
- **Avisos de voz** a cada 1, 2 ou 5 km (tempo, pace médio e pace do último km), funcionando com a tela apagada
- Pausar, retomar, descartar; fila offline para enviar quando voltar a internet
- **Histórico de todas as corridas** com mapa do percurso, parciais por km, km mais rápido e subida acumulada
- Resumo da semana/mês/total e **recordes pessoais** (km mais rápido, melhor 5/10/21 km, maior distância)
- **24 medalhas** em 4 níveis (bronze, prata, ouro, diamante): primeiro 1/5/10/21/42 km, número de corridas, km acumulados, **acessos na semana (3, 5, 7 dias)**, semanas seguidas, tempo nos 5 e 10 km, subida e territórios — concedidas só pelo servidor, com tela de comemoração
- Mapa com o **nome do dono** em cada território
- **Alertas de território**: notificação quando alguém está a menos de 20% de tomar um território seu, e quando ele é tomado
- Ranking geral do mês e ranking de cada território
- Perfil: nome, cor, sair, **excluir conta e todos os dados**

## Estrutura

```
src/app/                 telas (Expo Router)
  login.tsx, consent.tsx, legal.tsx
  (tabs)/index.tsx       mapa de territórios
  (tabs)/activities.tsx  resumo, recordes e histórico
  (tabs)/run.tsx         gravação da corrida, voz e configurações
  (tabs)/medals.tsx      medalhas e progresso
  (tabs)/profile.tsx     perfil e exclusão de conta
  activity/[id].tsx      detalhe da corrida (mapa, parciais)
  ranking.tsx            ranking do mês
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
