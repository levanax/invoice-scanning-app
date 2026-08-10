/**
 * Parse an invoice QR 扫码串 (comma-separated).
 * invoiceNo = index 3, amount = index 4, invoiceDate = index 5.
 * Incomplete payloads still return a result with empty fields.
 */
export function parseInvoiceQr (raw) {
  const text = String(raw ?? '').trim()
  const parts = text.split(',')

  return {
    invoiceNo: (parts[3] ?? '').trim(),
    amount: (parts[4] ?? '').trim(),
    invoiceDate: (parts[5] ?? '').trim(),
    raw: text
  }
}

/**
 * Empty 发票号码 do not participate in 查重.
 */
export function isDuplicateInvoiceNo (rows, invoiceNo, excludeId = null) {
  const key = String(invoiceNo ?? '').trim()
  if (!key) {
    return false
  }

  return rows.some((row) => {
    if (excludeId != null && row.id === excludeId) {
      return false
    }
    return String(row.invoiceNo ?? '').trim() === key
  })
}
