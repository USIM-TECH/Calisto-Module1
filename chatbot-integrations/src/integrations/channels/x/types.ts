import { z } from 'zod'

const directMessageEventSchema = z.object({
  type: z.literal('message_create'),
  id: z.string(),
  created_timestamp: z.string(),
  message_create: z.object({
    sender_id: z.string(),
    target: z.object({
      recipient_id: z.string(),
    }),
    message_data: z.object({
      text: z.string().optional(),
    }).passthrough(),
  }),
})

export const xWebhookPayloadSchema = z.object({
  for_user_id: z.string().optional(),
  users: z.record(z.string(), z.object({
    id: z.string(),
    name: z.string().optional(),
    screen_name: z.string().optional(),
  })).optional(),
  direct_message_events: z.array(directMessageEventSchema).optional(),
}).passthrough()

export type XWebhookPayload = z.infer<typeof xWebhookPayloadSchema>
export type XDirectMessageEvent = z.infer<typeof directMessageEventSchema>
