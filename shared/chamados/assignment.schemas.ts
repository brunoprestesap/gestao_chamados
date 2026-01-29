import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const AssignTicketSchema = z.object({
  ticketId: objectId,
  preferredTechnicianId: objectId.optional(),
});

export type AssignTicketInput = z.infer<typeof AssignTicketSchema>;

export const ReassignTicketSchema = z.object({
  ticketId: objectId,
  preferredTechnicianId: objectId,
  notes: z.string().max(2000).optional(),
});

export type ReassignTicketInput = z.infer<typeof ReassignTicketSchema>;

export const EligibleTechnicianSchema = z.object({
  _id: objectId,
  name: z.string(),
  username: z.string(),
  currentLoad: z.number().int().min(0),
  maxAssignedTickets: z.number().int().min(1),
  isOverloaded: z.boolean(),
});

export type EligibleTechnician = z.infer<typeof EligibleTechnicianSchema>;
