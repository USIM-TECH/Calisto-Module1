import { z } from 'zod'

/** Instagram recipient - either a user ID or a comment ID */
export type InstagramRecipientId = { id: string } | { comment_id: string }

// ── Incoming Payload Schemas ───────────────────────────────────────────

const instagramEntryBaseSchema = z.object({
  id: z.string(),
  time: z.number(),
})

const instagramMessagingItemBaseSchema = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  timestamp: z.number(),
})

const instagramMessagingItemAttachmentTypeSchema = z.enum([
  'audio', 'file', 'image', 'share', 'story_mention', 'video', 'ig_reel', 'reel',
])

const instagramMessagingItemMessageSchema = instagramMessagingItemBaseSchema.extend({
  message: z.object({
    mid: z.string(),
    attachments: z.array(
      z.object({
        type: instagramMessagingItemAttachmentTypeSchema,
        payload: z.object({ url: z.string() }),
      })
    ).optional(),
    is_echo: z.boolean().optional(),
    quick_reply: z.object({ payload: z.string() }).optional(),
    text: z.string().optional(),
  }),
})

const instagramMessagingItemPostbackSchema = instagramMessagingItemBaseSchema.extend({
  postback: z.object({
    mid: z.string(),
    title: z.string(),
    payload: z.string(),
  }),
})

const instagramMessagingItemOtherSchema = instagramMessagingItemBaseSchema

const instagramMessagingItemSchema = z.union([
  instagramMessagingItemMessageSchema,
  instagramMessagingItemPostbackSchema,
  instagramMessagingItemOtherSchema,
])

const instagramMessagingEntrySchema = instagramEntryBaseSchema.extend({
  messaging: z.array(instagramMessagingItemSchema),
})

const instagramCommentEntrySchema = instagramEntryBaseSchema.extend({
  field: z.literal('comments'),
  value: z.object({
    id: z.string(),
    from: z.object({ id: z.string(), username: z.string() }),
    text: z.string(),
    media: z.object({ id: z.string(), media_product_type: z.string() }),
  }),
})

const instagramLegacyCommentEntrySchema = instagramEntryBaseSchema.extend({
  changes: z.array(
    z.object({
      field: z.literal('comments'),
      value: z.object({
        from: z.object({ id: z.string(), username: z.string() }),
        id: z.string(),
        text: z.string(),
        media: z.object({ id: z.string(), media_product_type: z.string() }),
      }),
    })
  ),
})

const instagramEntrySchema = z.union([
  instagramMessagingEntrySchema,
  instagramCommentEntrySchema,
  instagramLegacyCommentEntrySchema,
])

export const instagramPayloadSchema = z.object({
  object: z.literal('instagram'),
  entry: z.array(instagramEntrySchema),
})

export type InstagramPayload = z.infer<typeof instagramPayloadSchema>
export type InstagramMessaging = z.infer<typeof instagramMessagingEntrySchema>['messaging']
export type InstagramMessagingItemMessage = z.infer<typeof instagramMessagingItemMessageSchema>
export type InstagramMessagingItemPostback = z.infer<typeof instagramMessagingItemPostbackSchema>
export type InstagramMessagingItem = z.infer<typeof instagramMessagingItemSchema>
export type InstagramCommentEntry = z.infer<typeof instagramCommentEntrySchema>
export type InstagramComment = z.infer<typeof instagramCommentEntrySchema>['value']
export type InstagramLegacyCommentEntry = z.infer<typeof instagramLegacyCommentEntrySchema>
export type InstagramLegacyComment = z.infer<typeof instagramLegacyCommentEntrySchema>['changes'][number]['value']

// ── Outgoing Message Types ─────────────────────────────────────────────

export type InstagramActionBase = { title: string }

export type InstagramActionPostback = {
  type: 'postback'
  title: string
  payload: string
} & InstagramActionBase

export type InstagramActionUrl = {
  type: 'web_url'
  url: string
} & InstagramActionBase

export type InstagramAction = InstagramActionPostback | InstagramActionUrl

export type TextMessageWithQuickReplies = {
  text: string
  quick_replies?: { content_type: string; title: string; payload: string }[]
}

export type GenericTemplateElement = {
  title: string
  image_url?: string
  subtitle?: string
  default_action?: InstagramAction
  buttons: InstagramAction[]
}

export type GenericTemplateMessage = {
  attachment: {
    type: 'template'
    payload: { template_type: 'generic'; elements: GenericTemplateElement[] }
  }
}

// Card/Carousel types for outgoing messages
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
