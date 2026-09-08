export const CALCULATION_CODES = Object.freeze({
  SECTION: 'SECTION',
  SUMMARY: 'SUMMARY',
  SPACER: 'SPACER',
  INDIRECTS_TOTAL: 'INDIRECTS_TOTAL',
  DIRECTS_TOTAL: 'DIRECTS_TOTAL',
  SUPPORT_LOGISTICS: 'SUPPORT_LOGISTICS',
  EQUIPMENT_CONSUMABLES_TOTAL: 'EQUIPMENT_CONSUMABLES_TOTAL',
  LABOUR_TOTAL: 'LABOUR_TOTAL',
  DCSM_TOTAL: 'DCSM_TOTAL',
  LEAD_VENT_BRACKET: 'LEAD_VENT_BRACKET',
  LEAD_VENT_TOTAL: 'LEAD_VENT_TOTAL',
  VENT_TECH_BRACKET: 'VENT_TECH_BRACKET',
  VENT_TECH_TOTAL: 'VENT_TECH_TOTAL',
  LOGISTICS_BRACKET: 'LOGISTICS_BRACKET',
  LOGISTICS_TOTAL: 'LOGISTICS_TOTAL',
  VENT_EQUIPMENT_BRACKET: 'VENT_EQUIPMENT_BRACKET',
  VENT_EQUIPMENT_TOTAL: 'VENT_EQUIPMENT_TOTAL',
  VENT_CONSUMABLES_BRACKET: 'VENT_CONSUMABLES_BRACKET',
  VENT_CONSUMABLES_TOTAL: 'VENT_CONSUMABLES_TOTAL',
  VENT_LABOUR_LOGISTICS: 'VENT_LABOUR_LOGISTICS',
  VENT_EQUIPMENT_CONSUMABLES: 'VENT_EQUIPMENT_CONSUMABLES',
  VENT_TOTAL: 'VENT_TOTAL',
  PROJECT_TOTALS: 'PROJECT_TOTALS',
  DCSM_TOTAL_HOURS: 'DCSM_TOTAL_HOURS',
  VENT_TOTAL_HOURS: 'VENT_TOTAL_HOURS',
  PROJECT_TOTAL_HOURS: 'PROJECT_TOTAL_HOURS',
  DCSM_COST_TOTAL: 'DCSM_COST_TOTAL',
  VENT_COST_TOTAL: 'VENT_COST_TOTAL',
  PROJECT_COST_TOTAL: 'PROJECT_COST_TOTAL',
});

export const normalizeCalculationLabel = (value = '') =>
  String(value).replace(/[\[\]]/g, '').toLowerCase().trim();

const LABEL_CODES = new Map([
  ['indirects total', CALCULATION_CODES.INDIRECTS_TOTAL],
  ['directs total', CALCULATION_CODES.DIRECTS_TOTAL],
  ['support and logistics', CALCULATION_CODES.SUPPORT_LOGISTICS],
  ['total equipment | consumables cost', CALCULATION_CODES.EQUIPMENT_CONSUMABLES_TOTAL],
  ['total labour | logistics cost', CALCULATION_CODES.LABOUR_TOTAL],
  ['dcsm est total', CALCULATION_CODES.DCSM_TOTAL],
  ['lead ventilation tech', CALCULATION_CODES.LEAD_VENT_BRACKET],
  ['lead ventilation tech total', CALCULATION_CODES.LEAD_VENT_TOTAL],
  ['ventilation tech', CALCULATION_CODES.VENT_TECH_BRACKET],
  ['ventilation tech total', CALCULATION_CODES.VENT_TECH_TOTAL],
  ['logistics / shipping', CALCULATION_CODES.LOGISTICS_BRACKET],
  ['logistics/shipping', CALCULATION_CODES.LOGISTICS_BRACKET],
  ['logistic / shipping', CALCULATION_CODES.LOGISTICS_BRACKET],
  ['logistic/shipping', CALCULATION_CODES.LOGISTICS_BRACKET],
  ['logistic / shipping total', CALCULATION_CODES.LOGISTICS_TOTAL],
  ['logistics / shipping total', CALCULATION_CODES.LOGISTICS_TOTAL],
  ['logistic/shipping total', CALCULATION_CODES.LOGISTICS_TOTAL],
  ['logistics/shipping total', CALCULATION_CODES.LOGISTICS_TOTAL],
  ['ventilation equipment total cost', CALCULATION_CODES.VENT_EQUIPMENT_TOTAL],
  ['ventilation consumables', CALCULATION_CODES.VENT_CONSUMABLES_BRACKET],
  ['consumables | securement total cost', CALCULATION_CODES.VENT_CONSUMABLES_TOTAL],
  ['ventilation total labour | logistics cost', CALCULATION_CODES.VENT_LABOUR_LOGISTICS],
  ['ventilation total equipment | consumable costs', CALCULATION_CODES.VENT_EQUIPMENT_CONSUMABLES],
  ['ventilation total cost', CALCULATION_CODES.VENT_TOTAL],
  ['total cost for ventilation', CALCULATION_CODES.VENT_TOTAL],
  ['project totals', CALCULATION_CODES.PROJECT_TOTALS],
  ['dcsm est total hours', CALCULATION_CODES.DCSM_TOTAL_HOURS],
  ['total ventilation labour hours', CALCULATION_CODES.VENT_TOTAL_HOURS],
  ['total project labour hours', CALCULATION_CODES.PROJECT_TOTAL_HOURS],
  ['total cost for dcsm', CALCULATION_CODES.DCSM_COST_TOTAL],
  ['total costs for dcsm', CALCULATION_CODES.DCSM_COST_TOTAL],
  ['total costs for ventilation', CALCULATION_CODES.VENT_COST_TOTAL],
  ['total project cost', CALCULATION_CODES.PROJECT_COST_TOTAL],
]);

export function inferCalculationCode(value = '', { section = false, summary = false } = {}) {
  if (summary) return CALCULATION_CODES.SUMMARY;
  const text = String(value);
  if (text === '__SPACER__') return CALCULATION_CODES.SPACER;
  if (text.startsWith('__SECTION__:')) return CALCULATION_CODES.SECTION;
  const normalized = normalizeCalculationLabel(text);
  const code = LABEL_CODES.get(normalized);
  if (code) return code;
  if (section) return LABEL_CODES.get(normalized) || CALCULATION_CODES.SECTION;
  if (normalized.startsWith('ventilation equipment')) return CALCULATION_CODES.VENT_EQUIPMENT_BRACKET;
  return null;
}

export function calculationCodeFor(record, options) {
  return record?.calculation_code || inferCalculationCode(record?.description || record?.title, options);
}

export function hasCalculationCode(record, code, options) {
  return calculationCodeFor(record, options) === code;
}
