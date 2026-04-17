-- Extensão das tabelas do projeto Ilha Breeze / Ilha Ar para Gestão Financeira Completa
-- Execute este script no painel do Supabase (SQL Editor)

-- 1. Tabela para Cadastrar Técnicos e Ajudantes (Equipe)
CREATE TABLE IF NOT EXISTS team_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    role          TEXT NOT NULL, -- 'technician' ou 'helper'
    fixed_cost    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela Opcional para Mapear Serviços Extras (Tabela de Preços e Comissões)
CREATE TABLE IF NOT EXISTS service_catalog (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL UNIQUE, -- ex: 'Elétrica', 'Limpeza', 'Desinstalação'
    base_price        NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    commission_type   TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' ou 'fixed'
    commission_value  NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela para Definir as Metas Operacionais do Negócio (System Settings)
CREATE TABLE IF NOT EXISTS operational_targets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_date           DATE UNIQUE NOT NULL,
    daily_ads_budget      NUMERIC(10, 2) NOT NULL DEFAULT 100.00, -- Custo de Tráfego por dia (Meta Ads)
    daily_profit_target   NUMERIC(10, 2) NOT NULL DEFAULT 500.00, -- Meta de R$500 ou R$600
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Expansão da tabela finance_entries (se já existe, podemos alterá-la. Aqui garantimos a estrutura completa requerida)
-- Caso você já tenha rodado o schema anterior, não precisa dar DROP. Estou apenas recriando ou alterando.

-- Verifica e adiciona novas colunas na finance_entries existente:
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS tax_fee NUMERIC(10,2) DEFAULT 0.00; -- Taxa do PagBank por exemplo
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10,2) GENERATED ALWAYS AS (amount - COALESCE(tax_fee, 0)) STORED;

-- Padronização da coluna `category` (apenas para documentação, mas na aplicação controlaremos isso):
-- categories income: 'service_revenue'
-- categories expense: 'material_cost', 'logistics_lunch', 'logistics_transport', 'logistics_fuel', 'fixed_payroll', 'marketing_ads', 'tax'

-- 5. Função Trigger de Atualização (Caso não exista)
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Aplicação dos Triggers nas Novas Tabelas
DROP TRIGGER IF EXISTS team_members_updated_at ON team_members;
CREATE TRIGGER team_members_updated_at
    BEFORE UPDATE ON team_members
    FOR EACH ROW EXECUTE PROCEDURE trg_set_updated_at();

DROP TRIGGER IF EXISTS service_catalog_updated_at ON service_catalog;
CREATE TRIGGER service_catalog_updated_at
    BEFORE UPDATE ON service_catalog
    FOR EACH ROW EXECUTE PROCEDURE trg_set_updated_at();

DROP TRIGGER IF EXISTS operational_targets_updated_at ON operational_targets;
CREATE TRIGGER operational_targets_updated_at
    BEFORE UPDATE ON operational_targets
    FOR EACH ROW EXECUTE PROCEDURE trg_set_updated_at();

-- 7. Dados Iniciais de Exemplo (Seed) para Equipe e Serviços (Ajudando a configurar o básico)
INSERT INTO team_members (name, role, fixed_cost)
VALUES 
    ('Joseph', 'technician', 4000.00),
    ('Anderson', 'technician', 4000.00),
    ('Ajudante 1', 'helper', 1700.00),
    ('Ajudante 2', 'helper', 1700.00)
ON CONFLICT DO NOTHING;

INSERT INTO service_catalog (name, base_price, commission_type, commission_value)
VALUES 
    ('Instalação Padrão', 0.00, 'fixed', 0.00),
    ('Elétrica', 200.00, 'percentage', 0.00), -- Comissionamento precisa ser ajustado a gosto
    ('Limpeza', 150.00, 'percentage', 0.00)
ON CONFLICT (name) DO NOTHING;
