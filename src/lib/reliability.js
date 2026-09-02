const randomValue = () => {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || Math.floor(Math.random() * 0xffffffff);
};

export function createStableId(prefix = 'id') {
  const uuid = globalThis.crypto?.randomUUID?.();
  const value = uuid || `${Date.now().toString(36)}_${randomValue().toString(36)}`;
  return prefix ? `${prefix}_${value}` : value;
}

let lastNumericId = 0;

// Project task schemas use numeric IDs. The monotonic guard guarantees uniqueness
// for rapid inserts while keeping the value within Number.MAX_SAFE_INTEGER.
export function createNumericId() {
  const candidate = (Date.now() * 1000) + (randomValue() % 1000);
  lastNumericId = Math.max(candidate, lastNumericId + 1);
  return lastNumericId;
}

export function createEstimateNumber(date = new Date()) {
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = (randomValue() % 100000).toString().padStart(5, '0');
  return `EST-${day}-${suffix}`;
}

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.message
    || error?.data?.message
    || error?.message
    || fallback;
}

export function validateEstimateData(clientInfo = {}, sections = []) {
  if (!String(clientInfo.client_name || '').trim()) return 'Enter a client name before saving.';
  if (!String(clientInfo.project_name || '').trim()) return 'Enter a project name before saving.';

  const taxRate = Number(clientInfo.tax_rate || 0);
  const discount = Number(clientInfo.discount || 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return 'Tax rate must be between 0 and 100.';
  if (!Number.isFinite(discount) || discount < 0) return 'Discount cannot be negative.';
  if (clientInfo.start_date && clientInfo.end_date && clientInfo.end_date < clientInfo.start_date) {
    return 'End date cannot be earlier than start date.';
  }

  const invalidItem = sections
    .flatMap(section => section.items || [])
    .find(item => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      return !String(item.description || '').trim()
        || !Number.isFinite(quantity)
        || quantity < 0
        || !Number.isFinite(unitPrice)
        || unitPrice < 0;
    });
  return invalidItem ? 'Each line item needs a description and non-negative quantity and price.' : null;
}
