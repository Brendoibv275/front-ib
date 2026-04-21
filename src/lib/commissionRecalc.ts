/** Recalcula comissão de serviço a partir do valor bruto e do catálogo (igual ao formulário de lançamentos). */

export type CatalogService = {
  id: string;
  name: string;
  commission_type: string;
  commission_value: number;
};

export function commissionServiceAmountFromGross(
  gross: number,
  service: Pick<CatalogService, 'commission_type' | 'commission_value'>
): number {
  if (service.commission_type === 'percentage') {
    return (Number(gross) * Number(service.commission_value || 0)) / 100;
  }
  return Number(service.commission_value || 0);
}

export function getStoredCommissionParts(md: Record<string, unknown> | undefined | null) {
  const m = md || {};
  return {
    service: Number(m.commission_service_amount) || 0,
    night: Number(m.commission_night_amount) || 0,
    overtime: Number(m.commission_overtime_amount) || 0,
    total: Number(m.commission_total) || 0,
  };
}

export function getSuggestedCommissionFromCatalog(
  entry: { amount: unknown; metadata?: Record<string, unknown> | null },
  serviceById: Record<string, CatalogService>
): {
  total: number;
  serviceAmount: number;
  night: number;
  overtime: number;
  hasService: boolean;
  service: CatalogService | null;
} {
  const md = entry.metadata || {};
  const sid = typeof md.service_id === 'string' ? md.service_id : undefined;
  const service = sid ? serviceById[sid] ?? null : null;
  const gross = Number(entry.amount) || 0;
  const night = Number(md.commission_night_amount) || 0;
  const ot = Number(md.commission_overtime_amount) || 0;
  if (!service) {
    return { total: night + ot, serviceAmount: 0, night, overtime: ot, hasService: false, service: null };
  }
  const svcAmt = commissionServiceAmountFromGross(gross, service);
  return {
    total: Number((svcAmt + night + ot).toFixed(2)),
    serviceAmount: Number(svcAmt.toFixed(2)),
    night,
    overtime: ot,
    hasService: true,
    service,
  };
}

/** Mescla metadados existentes com comissão de serviço calculada pelo catálogo (preserva noturno / hora extra). */
export function mergeCatalogCommissionIntoMetadata(
  entry: { amount: unknown; metadata?: Record<string, unknown> | null },
  service: CatalogService
): Record<string, unknown> {
  const md = { ...(entry.metadata || {}) } as Record<string, unknown>;
  const gross = Number(entry.amount) || 0;
  const svcAmt = commissionServiceAmountFromGross(gross, service);
  const night = Number(md.commission_night_amount) || 0;
  const ot = Number(md.commission_overtime_amount) || 0;
  md.service_id = service.id;
  md.service_name = service.name;
  md.commission_type = service.commission_type;
  md.commission_value = service.commission_value;
  md.commission_service_amount = Number(svcAmt.toFixed(2));
  md.commission_total = Number((svcAmt + night + ot).toFixed(2));
  return md;
}
