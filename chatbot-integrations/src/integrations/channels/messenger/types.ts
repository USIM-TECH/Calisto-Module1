import { z } from 'zod'

// ── Incoming Payload Schemas

const baseMessengerMessagingItemSchema = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  timestamp: z.number(),
})

const messengerMessagingItemMessageSchema = baseMessengerMessagingItemSchema.extend({
  message: z.object({
    mid: z.string(),
    text: z.string().optional(),
    quick_reply: z.object({ payload: z.string() }).optional(),
    attachments: z.array(
      z.object({
        type: z.string(),
        payload: z.object({ url: z.string() }),
      })
    ).optional(),
  }),
})

const messengerMessagingItemPostbackSchema = baseMessengerMessagingItemSchema.extend({
  postback: z.object({
    mid: z.string(),
    payload: z.string(),
    title: z.string(),
  }),
})

const messengerMessagingItemSchema = z.union([
  messengerMessagingItemMessageSchema,
  messengerMessagingItemPostbackSchema,
])

const messengerEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  messaging: z.array(messengerMessagingItemSchema),
})

const feedChangeValueSchema = z.object({
  verb: z.string(),
  created_time: z.number(),
  post_id: z.string(),
  message: z.string().optional(),
  from: z.object({ id: z.string(), name: z.string() }).optional(),
  item: z.string(),
  comment_id: z.string().optional(),
  parent_id: z.string().optional(),
})

const feedEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  changes: z.array(z.object({
    field: z.string(),
    value: feedChangeValueSchema,
  })),
})

const eventEntrySchema = z.union([messengerEntrySchema, feedEntrySchema])

export const messengerPayloadSchema = z.object({
  object: z.literal('page'),
  entry: z.array(eventEntrySchema),
})

export type MessengerPayload = z.infer<typeof messengerPayloadSchema>
export type MessengerMessagingItemMessage = z.infer<typeof messengerMessagingItemMessageSchema>
export type MessengerMessagingItemPostback = z.infer<typeof messengerMessagingItemPostbackSchema>
export type MessengerMessagingItem = z.infer<typeof messengerMessagingItemSchema>

// ── Outgoing Message Types

export type MessengerOutMessageAttachment =
  | { type: 'postback'; title: string; payload: string }
  | { type: 'web_url'; title: string; url: string }

export interface CardPayload {
  title: string
  subtitle?: string
  imageUrl?: string
  actions: { action: 'postback' | 'say' | 'url'; label: string; value: string }[]
}

export interface CarouselPayload {
  items: CardPayload[]
}

export interface ChoiceOption {
  label: string
  value: string
}

export interface ChoicePayload {
  text: string
  options: ChoiceOption[]
}
