import * as XLSX from 'xlsx'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function buildWorkbook (rows) {
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
  return workbook
}

function toExcelBlob (workbook) {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], { type: XLSX_MIME })
}

function downloadBlob (blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/**
 * 直接调用浏览器系统分享；不支持时再回退本地下载。
 * @returns {Promise<'shared' | 'downloaded'>}
 */
async function shareOrDownload (blob, filename) {
  const file = new File([blob], filename, { type: XLSX_MIME })

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        files: [file],
        title: filename
      })
      return 'shared'
    } catch (err) {
      // 用户取消分享
      if (err?.name === 'AbortError') {
        throw err
      }
      // 浏览器不支持分享文件等错误 → 回退下载
    }
  }

  downloadBlob(blob, filename)
  return 'downloaded'
}

/**
 * @returns {Promise<'shared' | 'downloaded'>}
 */
export async function exportInvoicesToExcel (rows, filename = '发票登记.xlsx') {
  const workbook = buildWorkbook(rows)
  const blob = toExcelBlob(workbook)
  return shareOrDownload(blob, filename)
}
