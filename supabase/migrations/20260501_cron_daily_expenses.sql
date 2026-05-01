-- Agenda pg_cron pra disparar a Edge Function todo dia às 00:10 BRT (03:10 UTC),
-- gerando as despesas automáticas de D-1 (ontem).
--
-- Pré-requisitos (executar uma vez no SQL Editor do Supabase, se ainda não estiverem):
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- Esse arquivo é idempotente: remove o job antes de recriar.
-- Também cria a tabela de logs pra auditoria.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.daily_expenses_cron_log (
  id           BIGSERIAL PRIMARY KEY,
  request_id   BIGINT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note         TEXT
);

-- Remove agendamento anterior se existir (idempotente)
DO $$
DECLARE
  existing_jobid BIGINT;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'generate_daily_expenses';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;
END
$$;

-- Agendamento: todo dia 03:10 UTC = 00:10 America/Sao_Paulo
-- Usa settings guardadas em vault pra não expor service_role no código:
--   SELECT vault.create_secret('https://<PROJECT>.supabase.co', 'project_url');
--   SELECT vault.create_secret('<SERVICE_ROLE_JWT>', 'service_role_key');
--
-- Se o projeto não usa Vault, fallback: substitua pelas settings fixas abaixo.

SELECT cron.schedule(
  'generate_daily_expenses',
  '10 3 * * *',
  $cron$
  DO $inner$
  DECLARE
    v_url  text;
    v_key  text;
    v_rid  bigint;
  BEGIN
    -- Tenta Vault; se falhar, cai no settings runtime do Postgres.
    BEGIN
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    EXCEPTION WHEN OTHERS THEN
      v_url := current_setting('app.settings.project_url', true);
      v_key := current_setting('app.settings.service_role_key', true);
    END;

    IF v_url IS NULL OR v_key IS NULL THEN
      INSERT INTO public.daily_expenses_cron_log (note)
      VALUES ('FAILED: project_url or service_role_key not configured (use vault or app.settings)');
      RETURN;
    END IF;

    SELECT net.http_post(
      url := v_url || '/functions/v1/generate-daily-expenses',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('mode', 'yesterday')
    ) INTO v_rid;

    INSERT INTO public.daily_expenses_cron_log (request_id, note)
    VALUES (v_rid, 'scheduled call for yesterday');
  END
  $inner$;
  $cron$
);
