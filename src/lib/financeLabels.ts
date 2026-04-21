/** Rótulos em português para categorias salvas no banco (snake_case). */
export const FINANCE_CATEGORY_LABELS: Record<string, string> = {
  service_revenue: 'Instalação padrão',
  service_electrical: 'Serviço — Elétrica',
  service_cleaning: 'Serviço — Limpeza',
  service_uninstall: 'Serviço — Desinstalação',
  material_cost: 'Material / insumos',
  logistics_lunch: 'Logística — Almoço',
  logistics_transport: 'Logística — Passagem',
  logistics_fuel: 'Logística — Combustível',
  marketing_ads: 'Tráfego pago (Meta Ads)',
  fixed_payroll: 'Folha de pagamento',
  tax: 'Imposto / taxa',
};

export function getFinanceCategoryLabel(category: string | null | undefined): string {
  if (!category) return '—';
  return FINANCE_CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

/** Valor líquido da entrada (após taxa PagBank etc.), quando existir coluna gerada. */
export function getEntryNetAmount(entry: { amount?: unknown; tax_fee?: unknown; net_amount?: unknown }): number {
  const amount = Number(entry.amount) || 0;
  const tax = Number(entry.tax_fee) || 0;
  if (entry.net_amount != null && entry.net_amount !== '') {
    const n = Number(entry.net_amount);
    if (!Number.isNaN(n)) return n;
  }
  return Math.max(0, amount - tax);
}
