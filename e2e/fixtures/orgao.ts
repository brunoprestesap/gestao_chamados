import mongoose from 'mongoose';

import { ORGAO_1_ID } from '../../shared/orgaos/orgao.constants';

/**
 * O órgão 1 como `ObjectId`, para as gravações diretas no banco do E2E (spec
 * 0025, AC-16). O driver não passa pelo plugin do Mongoose: sem o `orgaoId`
 * explícito, o documento fica invisível para o app em `estrito`.
 */
export const ORGAO_1 = new mongoose.Types.ObjectId(ORGAO_1_ID);
