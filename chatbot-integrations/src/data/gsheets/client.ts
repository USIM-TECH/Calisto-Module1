import { google } from 'googleapis'
import type { Logger } from '../../utils/index.js'

type GoogleSheetsClient = ReturnType<typeof google.sheets>
type GoogleOAuth2Client = InstanceType<(typeof google.auth)['OAuth2']>

export interface GSheetsConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  spreadsheetId: string
  redirectUri?: string
}

export type MajorDimension = 'ROWS' | 'COLUMNS'

/**
 * Google Sheets Client.
 * Extracted from Botpress GSheets integration with Botpress SDK dependencies removed.
 * Uses the official googleapis library.
 */
export class GSheetsClient {
  private readonly _sheetsClient: GoogleSheetsClient
  private readonly _spreadsheetId: string
  private readonly _logger: Logger

  constructor(config: GSheetsConfig, logger: Logger) {
    this._logger = logger
    this._spreadsheetId = config.spreadsheetId

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    )
    oauth2Client.setCredentials({ refresh_token: config.refreshToken })

    this._sheetsClient = google.sheets({ version: 'v4', auth: oauth2Client })
  }

  /** Create from an existing OAuth2 client */
  public static fromOAuth2Client(
    oauthClient: GoogleOAuth2Client,
    spreadsheetId: string,
    logger: Logger
  ): GSheetsClient {
    const instance = Object.create(GSheetsClient.prototype) as GSheetsClient
    ;(instance as any)._sheetsClient = google.sheets({ version: 'v4', auth: oauthClient })
    ;(instance as any)._spreadsheetId = spreadsheetId
    ;(instance as any)._logger = logger
    return instance
  }

  // ── Read ──────────────────────────────────────────────────────────

  /** Get values from a spreadsheet range */
  public async getValues(rangeA1: string, majorDimension: MajorDimension = 'ROWS') {
    const response = await this._sheetsClient.spreadsheets.values.get({
      spreadsheetId: this._spreadsheetId,
      range: rangeA1,
      majorDimension,
    })
    return {
      range: response.data.range,
      majorDimension: response.data.majorDimension,
      values: response.data.values ?? [],
    }
  }

  // ── Write ─────────────────────────────────────────────────────────

  /** Update values in a spreadsheet range */
  public async updateValues(rangeA1: string, values: any[][], majorDimension: MajorDimension = 'ROWS') {
    const response = await this._sheetsClient.spreadsheets.values.update({
      spreadsheetId: this._spreadsheetId,
      range: rangeA1,
      valueInputOption: 'USER_ENTERED',
      requestBody: { range: rangeA1, values, majorDimension },
    })
    return {
      updatedRange: response.data.updatedRange,
      updatedRows: response.data.updatedRows,
      updatedColumns: response.data.updatedColumns,
      updatedCells: response.data.updatedCells,
    }
  }

  /** Append values to a spreadsheet range */
  public async appendValues(rangeA1: string, values: any[][], majorDimension: MajorDimension = 'ROWS') {
    const response = await this._sheetsClient.spreadsheets.values.append({
      spreadsheetId: this._spreadsheetId,
      range: rangeA1,
      valueInputOption: 'USER_ENTERED',
      requestBody: { range: rangeA1, values, majorDimension },
    })
    return {
      updatedRange: response.data.updates?.updatedRange,
      updatedRows: response.data.updates?.updatedRows,
      updatedColumns: response.data.updates?.updatedColumns,
      updatedCells: response.data.updates?.updatedCells,
    }
  }

  /** Clear values from a spreadsheet range */
  public async clearValues(rangeA1: string) {
    const response = await this._sheetsClient.spreadsheets.values.clear({
      spreadsheetId: this._spreadsheetId,
      range: rangeA1,
      requestBody: { range: rangeA1 },
    })
    return { clearedRange: response.data.clearedRange }
  }

  // ── Sheet Management ──────────────────────────────────────────────

  /** Create a new sheet in the spreadsheet */
  public async createSheet(sheetTitle: string) {
    const response = await this._sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: this._spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTitle } } }],
      },
    })
    const addedSheet = response.data.replies?.[0]?.addSheet
    return {
      sheetId: addedSheet?.properties?.sheetId ?? 0,
      title: addedSheet?.properties?.title ?? sheetTitle,
    }
  }

  /** Get all sheets in the spreadsheet */
  public async getAllSheets() {
    const meta = await this.getSpreadsheetMetadata()
    return (
      meta.sheets?.map((sheet) => ({
        sheetId: sheet.properties?.sheetId ?? 0,
        title: sheet.properties?.title ?? '',
        hidden: sheet.properties?.hidden ?? false,
        index: sheet.properties?.index ?? 0,
      })) ?? []
    )
  }

  /** Delete a sheet by ID */
  public async deleteSheet(sheetId: number) {
    await this._sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: this._spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId } }],
      },
    })
  }

  /** Rename a sheet */
  public async renameSheet(sheetId: number, newTitle: string) {
    await this._sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: this._spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, title: newTitle },
              fields: 'title',
            },
          },
        ],
      },
    })
  }

  /** Get spreadsheet metadata */
  public async getSpreadsheetMetadata(fields?: string) {
    const response = await this._sheetsClient.spreadsheets.get({
      spreadsheetId: this._spreadsheetId,
      fields,
    })
    return response.data
  }

  /** Insert rows into a sheet */
  public async insertRows(sheetId: number, startIndex: number, numberOfRows: number = 1) {
    await this._sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: this._spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex,
                endIndex: startIndex + numberOfRows,
              },
              inheritFromBefore: startIndex > 0,
            },
          },
        ],
      },
    })
  }

  /** Delete rows from a sheet (1-indexed row numbers) */
  public async deleteRows(sheetId: number, rowIndexes: number[]) {
    const sortedIndexes = [...rowIndexes].sort((a, b) => b - a)
    const requests = sortedIndexes.map((rowIndex) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS' as const,
          startIndex: rowIndex - 1,
          endIndex: rowIndex,
        },
      },
    }))

    await this._sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: this._spreadsheetId,
      requestBody: { requests },
    })
  }

  /** Get sheet ID by name */
  public async getSheetIdByName(sheetName?: string): Promise<{ sheetId: number; sheetTitle: string }> {
    const meta = await this.getSpreadsheetMetadata('sheets.properties')
    const sheets = meta.sheets ?? []

    if (!sheetName) {
      const firstVisible = sheets.find((s) => !s.properties?.hidden)
      if (!firstVisible?.properties) {
        throw new Error('No visible sheets found in spreadsheet')
      }
      return {
        sheetId: firstVisible.properties.sheetId ?? 0,
        sheetTitle: firstVisible.properties.title ?? '',
      }
    }

    const sheet = sheets.find((s) => s.properties?.title === sheetName)
    if (!sheet?.properties) {
      throw new Error(`Sheet "${sheetName}" not found`)
    }
    return {
      sheetId: sheet.properties.sheetId ?? 0,
      sheetTitle: sheet.properties.title ?? '',
    }
  }
}
