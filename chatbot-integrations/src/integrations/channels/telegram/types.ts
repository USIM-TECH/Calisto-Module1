import { z } from 'zod'

const telegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
})

const telegramChatSchema = z.object({
  id: z.number(),
  type: z.string(),
})

const telegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  text: z.string().optional(),
  from: telegramUserSchema.optional(),
  chat: telegramChatSchema,
  contact: z.object({
    phone_number: z.string(),
    first_name: z.string(),
    last_name: z.string().optional(),
    user_id: z.number().optional(),
  }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
}).passthrough()

const telegramCallbackQuerySchema = z.object({
  id: z.string(),
  from: telegramUserSchema,
  data: z.string().optional(),
  message: telegramMessageSchema.optional(),
}).passthrough()

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  edited_message: telegramMessageSchema.optional(),
  callback_query: telegramCallbackQuerySchema.optional(),
}).passthrough()

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>
export type TelegramMessage = z.infer<typeof telegramMessageSchema>
export type TelegramCallbackQuery = z.infer<typeof telegramCallbackQuerySchema>
