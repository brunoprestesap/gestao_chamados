import { z } from 'zod';

import {
  ServiceCreateSchema,
  ServiceListQuerySchema,
  ServiceUpdateSchema,
} from './service.schemas';

export type ServiceCreateInput = z.infer<typeof ServiceCreateSchema>;
export type ServiceUpdateInput = z.infer<typeof ServiceUpdateSchema>;
export type ServiceListQuery = z.infer<typeof ServiceListQuerySchema>;
