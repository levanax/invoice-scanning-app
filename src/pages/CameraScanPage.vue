<template>
  <q-page class="column camera-scan-page">
    <q-bar class="bg-primary text-white">
      <q-btn dense flat icon="arrow_back" aria-label="返回" @click="goBack" />
      <div class="text-subtitle1 q-ml-sm">手机扫码</div>
      <q-space />
    </q-bar>

    <div class="last-scan-banner row items-center no-wrap q-px-md q-py-sm">
      <div class="col overflow-hidden">
        <div class="text-caption text-grey-7">最近扫描</div>
        <template v-if="lastScan">
          <div class="text-subtitle2 text-weight-medium ellipsis">
            发票号码：{{ lastScan.invoiceNo || '（空）' }}
          </div>
          <div class="text-body2">
            发票日期：{{ lastScan.invoiceDate || '—' }}
          </div>
          <div class="text-body2">
            金额：{{ lastScan.amount || '—' }}
          </div>
        </template>
        <div v-else class="text-body2 text-grey-6">
          暂无扫描记录
        </div>
      </div>
      <q-btn
        v-if="lastScan"
        flat
        dense
        color="negative"
        icon="delete"
        label="移除"
        class="q-ml-sm"
        @click="removeLastScan"
      />
    </div>

    <div class="col column items-center q-gutter-md q-pa-md">
      <div class="text-body2 text-grey-7 text-center">
        将发票二维码对准取景框，识别成功后会自动登记
      </div>
      <div id="camera-scan-reader" class="camera-scan-reader" />
      <div v-if="errorMessage" class="text-negative text-body2 text-center">
        {{ errorMessage }}
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { parseInvoiceQr } from '@/domain/invoiceQr'
import { useInvoiceStore } from '@/stores/invoices'

const router = useRouter()
const $q = useQuasar()
const store = useInvoiceStore()

const lastScan = ref(null)
const errorMessage = ref('')
const SCANNER_ELEMENT_ID = 'camera-scan-reader'

let scanner = null
let starting = false
let lastRaw = ''
let lastAt = 0

const DEDUPE_MS = 2500

function goBack () {
  if (window.history.state?.back != null) {
    router.back()
  } else {
    router.replace('/')
  }
}

function toLastScanView (row) {
  return {
    id: row.id,
    invoiceNo: row.invoiceNo ?? '',
    invoiceDate: row.invoiceDate ?? '',
    amount: row.amount ?? ''
  }
}

function seedLastScanFromStore () {
  const rows = store.rows
  if (!rows.length) {
    lastScan.value = null
    return
  }
  lastScan.value = toLastScanView(rows[rows.length - 1])
}

function syncLastScanRowId (parsed) {
  const rows = store.rows
  if (!rows.length) {
    return
  }
  const invoiceNo = String(parsed.invoiceNo ?? '').trim()
  const last = rows[rows.length - 1]
  if (invoiceNo && String(last.invoiceNo ?? '').trim() === invoiceNo) {
    lastScan.value = toLastScanView(last)
    return
  }
  const matched = invoiceNo
    ? rows.find((row) => String(row.invoiceNo ?? '').trim() === invoiceNo)
    : null
  if (matched) {
    lastScan.value = toLastScanView(matched)
  }
}

function rememberScan (raw) {
  const parsed = parseInvoiceQr(raw)
  lastScan.value = {
    id: null,
    invoiceNo: parsed.invoiceNo,
    invoiceDate: parsed.invoiceDate,
    amount: parsed.amount
  }
  nextTick(() => syncLastScanRowId(parsed))
}

function applyScanResult (raw) {
  const text = String(raw ?? '').trim()
  if (!text) {
    return
  }

  const result = store.addFromScan(text)
  if (!result.ok && result.reason === 'duplicate') {
    $q.notify({
      type: 'negative',
      message: `发票号码已存在：${result.invoiceNo}`
    })
  } else if (result.ok) {
    $q.notify({
      type: 'positive',
      message: result.invoiceNo
        ? `已登记：${result.invoiceNo}`
        : '已登记（发票号码为空，可手动补全）'
    })
  }
}

function removeLastScan () {
  const current = lastScan.value
  if (!current) {
    return
  }

  if (current.id) {
    store.removeRow(current.id)
  } else {
    const rows = store.rows
    const last = rows[rows.length - 1]
    const invoiceNo = String(current.invoiceNo ?? '').trim()
    if (last && invoiceNo && String(last.invoiceNo ?? '').trim() === invoiceNo) {
      store.removeRow(last.id)
    }
  }

  seedLastScanFromStore()
}

async function stopScanner () {
  if (!scanner) {
    return
  }
  const instance = scanner
  scanner = null
  try {
    const state = instance.getState?.()
    // 2 = SCANNING, 3 = PAUSED (Html5QrcodeScannerState)
    if (state === 2 || state === 3) {
      await instance.stop()
    }
  } catch {
    // ignore stop errors when camera already released
  }
  try {
    instance.clear()
  } catch {
    // ignore
  }
}

async function startScanner () {
  if (starting) {
    return
  }
  await stopScanner()
  starting = true
  errorMessage.value = ''
  lastRaw = ''
  lastAt = 0
  seedLastScanFromStore()

  try {
    await nextTick()
    const instance = new Html5Qrcode(SCANNER_ELEMENT_ID, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false
    })
    scanner = instance

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72)
        return { width: edge, height: edge }
      },
      aspectRatio: 1
    }

    const onSuccess = (decodedText) => {
      const raw = String(decodedText ?? '').trim()
      if (!raw) {
        return
      }
      const now = Date.now()
      if (raw === lastRaw && now - lastAt < DEDUPE_MS) {
        return
      }
      lastRaw = raw
      lastAt = now
      rememberScan(raw)
      applyScanResult(raw)
    }

    try {
      await instance.start({ facingMode: 'environment' }, config, onSuccess, () => {})
    } catch {
      const cameras = await Html5Qrcode.getCameras()
      if (!cameras.length) {
        throw new Error('未检测到可用摄像头')
      }
      const backCamera = cameras.find((cam) => /back|rear|后|环境/i.test(cam.label))
      const cameraId = backCamera?.id ?? cameras[cameras.length - 1].id
      await instance.start(cameraId, config, onSuccess, () => {})
    }
  } catch (err) {
    const message = err?.message || String(err)
    if (/NotAllowedError|Permission|denied/i.test(message)) {
      errorMessage.value = '摄像头权限被拒绝，请在浏览器设置中允许后重试'
    } else if (/NotFoundError|Requested device not found|未检测/i.test(message)) {
      errorMessage.value = '未找到摄像头设备'
    } else if (/secure|https|Only secure origins/i.test(message)) {
      errorMessage.value = '摄像头扫码需要 HTTPS 或 localhost 环境'
    } else {
      errorMessage.value = `无法启动摄像头：${message}`
    }
    await stopScanner()
  } finally {
    starting = false
  }
}

onMounted(() => {
  startScanner()
})

onBeforeUnmount(() => {
  stopScanner()
})
</script>

<style scoped>
.camera-scan-page {
  min-height: 100%;
  background: #f5f5f5;
}

.last-scan-banner {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.camera-scan-reader {
  width: min(100%, 420px);
  overflow: hidden;
  border-radius: 8px;
  background: #111;
}

.camera-scan-reader :deep(video) {
  object-fit: cover;
}
</style>
