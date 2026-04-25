-- Migração: Equipes + competência de lançamento + suporte a serviços múltiplos
-- Escopo:
-- 1) Criar tabela teams e vincular membros/lançamentos
-- 2) Criar movement_date para resolver retroativos no dashboard
-- 3) Backfill estrito por membro para Equipe Anderson/Joseph
-- 4) Estrutura para despesas mensais com rateio diário (metadata.is_monthly_prorated)

BEGIN;

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS movement_date DATE;

INSERT INTO public.teams (name)
VALUES ('Equipe Anderson'), ('Equipe Joseph')
ON CONFLICT (name) DO NOTHING;

-- Backfill de competência:
-- despesas retroativas usam due_date; demais usam data de criação.
UPDATE public.finance_entries
SET movement_date = CASE
  WHEN entry_type = 'expense' AND due_date IS NOT NULL THEN due_date
  ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date
END
WHERE movement_date IS NULL;

-- Garantir preenchimento padrão para novos registros
ALTER TABLE public.finance_entries
  ALTER COLUMN movement_date SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);

-- Vincular membros às equipes (regra estrita por nome atual)
WITH base AS (
  SELECT
    tm.id,
    lower(tm.name) AS norm_name
  FROM public.team_members tm
)
UPDATE public.team_members tm
SET team_id = CASE
  WHEN b.norm_name LIKE '%anderson%' THEN (SELECT id FROM public.teams WHERE name = 'Equipe Anderson')
  WHEN b.norm_name LIKE '%joseph%' THEN (SELECT id FROM public.teams WHERE name = 'Equipe Joseph')
  ELSE NULL
END
FROM base b
WHERE tm.id = b.id;

-- Backfill dos lançamentos por vínculo de membro
UPDATE public.finance_entries fe
SET team_id = tm.team_id
FROM public.team_members tm
WHERE fe.team_member_id = tm.id
  AND fe.team_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_finance_entries_movement_date ON public.finance_entries(movement_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_team_id ON public.finance_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);

COMMIT;
