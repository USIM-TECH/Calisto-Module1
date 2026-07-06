import * as XLSX from 'xlsx'

export type XlsxCell = string | number | boolean | null | undefined

export function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: XlsxCell[][],
): void {
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows.map((row) => row.map((cell) => cell ?? '')),
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}
