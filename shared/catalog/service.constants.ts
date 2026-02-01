export const PRIORITIES = ['Baixa', 'Normal', 'Alta', 'Emergencial'] as const;

// AAAA-NNNN (4 letras do subtipo + 4 dígitos). Aceita também AAAA-NNN (legado) para não quebrar serviços existentes.
export const SERVICE_CODE_REGEX = /^[A-Z]{4}-\d{3,4}$/;

export const SERVICE_CODE_ERROR = 'Padrão inválido. Use AAAA-NNNN (ex.: ELET-0001)';
