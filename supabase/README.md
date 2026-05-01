# Automação diária de despesas (auto_fixed_cost)

Essa pasta contém a Edge Function e a migration que substituem o clique manual no botão **"Gerar despesas do período"** do `AttendancePanel`.

## O que faz

Todo dia às **00:10 (BRT)** o Postgres dispara uma chamada HTTP pra Edge Function `generate-daily-expenses`, que gera em `finance_entries` (idempotente via `metadata.auto_key`):

- **Folha diária** por membro ativo (`category = fixed_payroll`)
- **Tráfego Meta Ads** por equipe ativa (`category = marketing_ads`)

Regras de cálculo são idênticas ao botão manual (`src/pages/AttendancePanel.tsx` → `generateExpenses`).

## Arquivos

- `supabase/functions/generate-daily-expenses/index.ts` — Edge Function (Deno)
- `supabase/migrations/20260501_cron_daily_expenses.sql` — agenda o `pg_cron` + cria tabela `daily_expenses_cron_log`

## Deploy (1x)

### 1. Instalar CLI da Supabase (se ainda não tiver)

```bash
npm install -g supabase
supabase login
supabase link --project-ref tmakteqhcumwsqgtuuot
```

### 2. Deploy da Edge Function

```bash
supabase functions deploy generate-daily-expenses --no-verify-jwt=false
```

### 3. Configurar credenciais no Vault (recomendado)

No SQL Editor do Supabase:

```sql
-- Substitua pelos valores reais
SELECT vault.create_secret('https://tmakteqhcumwsqgtuuot.supabase.co', 'project_url');
SELECT vault.create_secret('<SERVICE_ROLE_JWT>', 'service_role_key');
```

> Alternativa sem Vault: rodar `ALTER DATABASE postgres SET "app.settings.project_url" = '...'` + `service_role_key`.

### 4. Aplicar a migration

```bash
supabase db push
```

Ou cole o conteúdo de `supabase/migrations/20260501_cron_daily_expenses.sql` no SQL Editor.

## Testes

### Smoke test manual (sem cron)

```bash
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"yesterday"}' \
  https://tmakteqhcumwsqgtuuot.supabase.co/functions/v1/generate-daily-expenses
```

Response esperado:

```json
{
  "ok": true,
  "result": {
    "range": {"start": "2026-04-30", "end": "2026-04-30"},
    "members_considered": 4,
    "teams_considered": 2,
    "payroll_rows_inserted": 4,
    "ads_rows_inserted": 2,
    "skipped_missing_team": 0,
    "skipped_existing_auto_key": 0
  }
}
```

### Backfill retroativo

```bash
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start":"2026-04-29","end":"2026-05-01"}' \
  https://tmakteqhcumwsqgtuuot.supabase.co/functions/v1/generate-daily-expenses
```

Idempotente: se rodar duas vezes, a segunda retorna `skipped_existing_auto_key > 0` e não duplica nada.

### Auditoria do cron

```sql
SELECT * FROM public.daily_expenses_cron_log ORDER BY id DESC LIMIT 20;
SELECT * FROM net._http_response ORDER BY id DESC LIMIT 20;
```

## Reversão

```sql
-- desliga o agendamento sem apagar código
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generate_daily_expenses';
```

Pra remover por completo: derrube também a Edge Function com `supabase functions delete generate-daily-expenses`.
