import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import { parseInvoiceQr, isDuplicateInvoiceNo } from '@/domain/invoiceQr'

const STORAGE_KEY = 'invoice-scanning.records'

function createId () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadFromStorage () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatScannedAt (date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const useInvoiceStore = defineStore('invoices', () => {
  const rows = ref(loadFromStorage())

  function persist () {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.value))
  }

  function addFromScan (raw) {
    const parsed = parseInvoiceQr(raw)
    if (isDuplicateInvoiceNo(rows.value, parsed.invoiceNo)) {
      return { ok: false, reason: 'duplicate', invoiceNo: parsed.invoiceNo }
    }

    rows.value.push({
      id: createId(),
      invoiceNo: parsed.invoiceNo,
      amount: parsed.amount,
      invoiceDate: parsed.invoiceDate,
      scannedAt: formatScannedAt(),
      raw: parsed.raw
    })
    persist()
    return { ok: true, invoiceNo: parsed.invoiceNo }
  }

  function addBlank () {
    rows.value.push({
      id: createId(),
      invoiceNo: '',
      amount: '',
      invoiceDate: '',
      scannedAt: formatScannedAt(),
      raw: ''
    })
    persist()
  }

  function updateRow (id, patch) {
    const index = rows.value.findIndex((row) => row.id === id)
    if (index < 0) {
      return { ok: false, reason: 'not_found' }
    }

    const next = { ...rows.value[index], ...patch }

    if (
      Object.prototype.hasOwnProperty.call(patch, 'invoiceNo') &&
      isDuplicateInvoiceNo(rows.value, next.invoiceNo, id)
    ) {
      return { ok: false, reason: 'duplicate', invoiceNo: next.invoiceNo }
    }

    rows.value[index] = next
    persist()
    return { ok: true }
  }

  function removeRow (id) {
    rows.value = rows.value.filter((row) => row.id !== id)
    persist()
  }

  function clearAll () {
    rows.value = []
    persist()
  }

  return {
    rows,
    addFromScan,
    addBlank,
    updateRow,
    removeRow,
    clearAll
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useInvoiceStore, import.meta.hot))
}
