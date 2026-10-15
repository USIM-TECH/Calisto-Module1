import type { PrismaClient, ResponseMode } from '@prisma/client'

const SETTINGS_ID = 'webchat'

/** Reads and writes the single-row webchat settings (website has no ChannelAccount). */
export class WebchatSettingsStore {
  constructor(private readonly prisma: PrismaClient) {}

  /** No row yet means the admin never changed it, so the default is `payload`. */
  public async getResponseMode(): Promise<ResponseMode> {
    const row = await this.prisma.webchatSettings.findUnique({ where: { id: SETTINGS_ID } })
    return row?.responseMode ?? 'payload'
  }

  public async setResponseMode(responseMode: ResponseMode): Promise<ResponseMode> {
    const row = await this.prisma.webchatSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, responseMode },
      update: { responseMode },
    })
    return row.responseMode
  }
}
