import { z } from 'zod'


const WhatsAppContactSchema = z.object({
  wa_id: z.string(),
  profile: z.object({ name: z.string() }),
})

const WhatsAppBaseMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  context: z
    .object({
      forwarded: z.boolean().optional(),
      frequently_forwarded: z.boolean().optional(),
      from: z.string().optional(),
      id: z.string().optional(),
    })
    .optional(),
  referral: z
    .object({
      source_url: z.string().optional(),
      source_id: z.string().optional(),
    })
    .optional(),
  errors: z
    .array(z.object({
      code: z.number(),
      title: z.string(),
      message: z.string(),
      error_data: z.object({ details: z.string() }),
    }))
    .optional(),
})

const WhatsAppMessageInteractiveSchema = z.union([
  z.object({
    type: z.literal('button_reply'),
    button_reply: z.object({ id: z.string(), title: z.string() }),
  }),
  z.object({
    type: z.literal('list_reply'),
    list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }),
  }),
])

const WhatsAppMessageSchema = z.union([
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('text'),
    text: z.object({ body: z.string() }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('image'),
    image: z.object({
      caption: z.string().optional(),
      sha256: z.string(),
      id: z.string(),
      mime_type: z.string(),
    }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('button'),
    button: z.object({ payload: z.string(), text: z.string() }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('location'),
    location: z.object({
      address: z.string().optional(),
      latitude: z.number(),
      longitude: z.number(),
      name: z.string().optional(),
      url: z.string().optional(),
    }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('document'),
    document: z.object({
      caption: z.string().optional(),
      filename: z.string(),
      sha256: z.string(),
      mime_type: z.string(),
      id: z.string(),
    }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('audio'),
    audio: z.object({ id: z.string(), mime_type: z.string() }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('video'),
    video: z.object({
      caption: z.string().optional(),
      sha256: z.string(),
      id: z.string(),
      mime_type: z.string(),
    }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('interactive'),
    interactive: WhatsAppMessageInteractiveSchema,
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('sticker'),
    sticker: z.object({
      mime_type: z.string(),
      sha256: z.string(),
      id: z.string(),
      animated: z.boolean(),
    }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.literal('reaction'),
    reaction: z.object({
      message_id: z.string(),
      emoji: z.string().optional(),
    }),
  }),
  WhatsAppBaseMessageSchema.extend({
    type: z.union([
      z.literal('order'),
      z.literal('system'),
      z.literal('unknown'),
      z.literal('unsupported'),
      z.literal('contacts'),
    ]),
  }),
])

const WhatsAppStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string(),
  recipient_id: z.string(),
  errors: z
    .array(z.object({
      code: z.number(),
      title: z.string(),
      message: z.string(),
      error_data: z.object({ details: z.string() }).optional(),
    }))
    .optional(),
})

const WhatsAppMessageValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contacts: z.array(WhatsAppContactSchema).optional(),
  messages: z.array(WhatsAppMessageSchema).optional(),
  statuses: z.array(WhatsAppStatusSchema).optional(),
})

export const WhatsAppPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: WhatsAppMessageValueSchema.passthrough(),
        })
      ),
    })
  ),
})

export type WhatsAppPayload = z.infer<typeof WhatsAppPayloadSchema>
export type WhatsAppMessage = z.infer<typeof WhatsAppMessageSchema>
export type WhatsAppMessageValue = z.infer<typeof WhatsAppMessageValueSchema>
export type WhatsAppStatus = z.infer<typeof WhatsAppStatusSchema>
