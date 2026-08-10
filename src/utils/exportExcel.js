import * as XLSX from 'xlsx'

export function exportInvoicesToExcel (rows, filename = '发票登记.xlsx') {
  const data = rows.map((row, index) => ({
    序号: index + 1,
    发票号码: row.invoiceNo ?? '',
    金额: row.amount ?? '',
    发票日期: row.invoiceDate ?? '',
    扫描时间: row.scannedAt ?? '',
    原始扫码串: row.raw ?? ''
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '登记记录')
  XLSX.writeFile(workbook, filename)
}
