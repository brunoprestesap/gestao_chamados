export const PRIORITIES = ['Baixa', 'Normal', 'Alta', 'Emergencial'] as const;

// AAAA-999
export const SERVICE_CODE_REGEX = /^[A-Z]{4}-\d{3}$/;

export const SERVICE_CODE_ERROR = 'Padrão inválido. Use AAAA-999 (ex.: ELET-001)';
