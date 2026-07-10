export type XlsxCell = string | number | boolean | null | undefined

export async function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: XlsxCell[][],
): Promise<void> {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows.map((row) => row.map((cell) => cell ?? '')),
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}
