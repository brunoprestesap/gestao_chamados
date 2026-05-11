import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

const TEMPLATE_SCOPES = ['global', 'personal'] as const;

const TicketTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    scope: { type: String, enum: TEMPLATE_SCOPES, required: true },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Campos do template (todos opcionais)
    titulo: { type: String, trim: true },
    descricao: { type: String, trim: true, maxlength: 2000 },
    tipoServico: { type: String, trim: true },
    naturezaAtendimento: { type: String, trim: true },
    grauUrgencia: { type: String, trim: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit' },
    subtypeId: { type: Schema.Types.ObjectId, ref: 'ServiceSubType' },
    catalogServiceId: { type: Schema.Types.ObjectId, ref: 'ServiceCatalog' },

    isActive: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

TicketTemplateSchema.index({ scope: 1, isActive: 1 });
TicketTemplateSchema.index({ createdByUserId: 1, isActive: 1 });

export type TicketTemplate = InferSchemaType<typeof TicketTemplateSchema>;

export type TicketTemplateDoc = TicketTemplate & { _id: Types.ObjectId };

if (mongoose.models.TicketTemplate) {
  delete mongoose.models.TicketTemplate;
}

export const TicketTemplateModel: Model<TicketTemplate> = mongoose.model<TicketTemplate>(
  'TicketTemplate',
  TicketTemplateSchema,
);
