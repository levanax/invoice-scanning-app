<template>
  <q-page class="q-pa-md">
    <q-banner dense rounded class="bg-warning text-dark q-mb-md export-hint">
      <template #avatar>
        <q-icon name="warning" color="dark" />
      </template>
      请及时导出 Excel 存储数据。由于数据保存在本设备浏览器中，清理缓存或更换设备可能导致丢失，请避免数据丢失。
    </q-banner>

    <div class="row items-center q-gutter-sm q-mb-md">
      <q-badge :color="scanReady ? 'positive' : 'warning'" class="q-pa-sm">
        {{
          scanReady
            ? '扫码就绪'
            : '编辑中（扫码暂停抢焦点）'
        }}
      </q-badge>
      <div class="text-caption text-grey-7">
        {{
          autoEnter
            ? '已开启自动录入：扫码输入停顿后将自动写入表格；也可按回车、点「录入」或使用「手机扫码」'
            : '可用扫码枪输入，或点「手机扫码」打开摄像头；扫码后按回车或点击「录入」写入表格'
        }}
      </div>
    </div>

    <div class="row items-center q-gutter-sm q-mb-md scan-toolbar">
      <q-input
        ref="scanInputRef"
        v-model="scanBuffer"
        outlined
        dense
        class="scan-input"
        label="扫码输入"
        placeholder="等待扫码枪输入…"
        autocomplete="off"
        @keydown.enter.prevent="onScanSubmit"
        @blur="onScanBlur"
      />
      <div class="row items-center q-gutter-sm no-wrap scan-actions">
        <q-btn
          color="primary"
          icon="playlist_add"
          label="录入"
          unelevated
          :disable="!scanBuffer.trim()"
          @click="onScanSubmit"
        />
        <q-btn
          color="primary"
          outline
          icon="qr_code_scanner"
          label="手机扫码"
          @click="openCameraScan"
        />
        <q-toggle
          v-model="autoEnter"
          label="自动录入"
          color="primary"
          dense
          class="self-center"
        />
      </div>
    </div>

    <div class="row q-gutter-sm q-mb-md">
      <q-btn color="primary" icon="add" label="新增行" unelevated @click="onAddBlank" />
      <q-btn color="negative" outline icon="delete_sweep" label="清空" @click="onClearAll" />
      <q-btn color="secondary" icon="download" label="导出 Excel" unelevated @click="onExport" />
      <q-space />
      <div class="text-body2 self-center">共 {{ store.rows.length }} 条</div>
    </div>

    <div class="row items-center q-gutter-md q-mb-md last-scan">
      <div class="text-subtitle2 text-weight-medium">最近扫描</div>
      <div class="text-body2">
        发票号码：<span class="text-weight-bold">{{ lastScanned?.invoiceNo || '—' }}</span>
      </div>
      <div class="text-body2">
        发票日期：<span class="text-weight-bold">{{ lastScanned?.invoiceDate || '—' }}</span>
      </div>
      <div class="text-body2">
        金额：<span class="text-weight-bold">{{ lastScanned?.amount || '—' }}</span>
      </div>
      <q-btn
        flat
        dense
        round
        color="negative"
        icon="delete"
        :disable="!lastScanned"
        @click="onRemoveLastScanned"
      >
        <q-tooltip>移除</q-tooltip>
      </q-btn>
    </div>

    <q-table
      flat
      bordered
      row-key="id"
      :rows="store.rows"
      :columns="columns"
      :pagination="{ rowsPerPage: 0 }"
      hide-pagination
      no-data-label="暂无登记记录，请扫码或新增行"
    >
      <template #body-cell-index="props">
        <q-td :props="props">
          {{ props.pageIndex + 1 }}
        </q-td>
      </template>

      <template #body-cell-invoiceNo="props">
        <q-td :props="props">
          <q-input
            dense
            borderless
            :model-value="invoiceDrafts[props.row.id] ?? props.row.invoiceNo"
            @update:model-value="(v) => { invoiceDrafts[props.row.id] = v }"
            @focus="beginInvoiceEdit(props.row)"
            @blur="onInvoiceNoBlur(props.row)"
          />
        </q-td>
      </template>

      <template #body-cell-amount="props">
        <q-td :props="props">
          <q-input
            dense
            borderless
            :model-value="props.row.amount"
            @update:model-value="(v) => store.updateRow(props.row.id, { amount: v })"
            @focus="beginEdit"
            @blur="endEdit"
          />
        </q-td>
      </template>

      <template #body-cell-invoiceDate="props">
        <q-td :props="props">
          <q-input
            dense
            borderless
            :model-value="props.row.invoiceDate"
            @update:model-value="(v) => store.updateRow(props.row.id, { invoiceDate: v })"
            @focus="beginEdit"
            @blur="endEdit"
          />
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn
            flat
            dense
            round
            color="negative"
            icon="delete"
            @click="store.removeRow(props.row.id)"
          >
            <q-tooltip>删除</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useInvoiceStore } from '@/stores/invoices'
import { exportInvoicesToExcel } from '@/utils/exportExcel'

const AUTO_ENTER_KEY = 'invoice-scanning.autoEnter'
const AUTO_ENTER_IDLE_MS = 280

const router = useRouter()
const $q = useQuasar()
const store = useInvoiceStore()

const scanInputRef = ref(null)
const scanBuffer = ref('')
const editing = ref(false)
const autoEnter = ref(localStorage.getItem(AUTO_ENTER_KEY) === '1')
const invoiceDrafts = reactive({})
const scanReady = computed(() => !editing.value)

/** 最近一次扫码登记的记录（跳过手动新增的空白行） */
const lastScanned = computed(() => {
  for (let i = store.rows.length - 1; i >= 0; i -= 1) {
    if (store.rows[i].raw) {
      return store.rows[i]
    }
  }
  return null
})

let autoEnterTimer = null

function clearAutoEnterTimer () {
  if (autoEnterTimer != null) {
    clearTimeout(autoEnterTimer)
    autoEnterTimer = null
  }
}

watch(autoEnter, (enabled) => {
  localStorage.setItem(AUTO_ENTER_KEY, enabled ? '1' : '0')
  if (!enabled) {
    clearAutoEnterTimer()
  }
})

watch(scanBuffer, (value) => {
  clearAutoEnterTimer()
  if (!autoEnter.value || !String(value ?? '').trim()) {
    return
  }
  autoEnterTimer = setTimeout(() => {
    autoEnterTimer = null
    onScanSubmit()
  }, AUTO_ENTER_IDLE_MS)
})


const columns = [
  { name: 'index', label: '序号', field: 'id', align: 'left', style: 'width: 64px' },
  { name: 'invoiceNo', label: '发票号码', field: 'invoiceNo', align: 'left', style: 'min-width: 180px' },
  { name: 'amount', label: '金额', field: 'amount', align: 'left', style: 'min-width: 100px' },
  { name: 'invoiceDate', label: '发票日期', field: 'invoiceDate', align: 'left', style: 'min-width: 120px' },
  { name: 'scannedAt', label: '扫描时间', field: 'scannedAt', align: 'left', style: 'min-width: 160px' },
  { name: 'raw', label: '原始扫码串', field: 'raw', align: 'left', style: 'min-width: 240px' },
  { name: 'actions', label: '操作', field: 'actions', align: 'center', style: 'width: 72px' }
]

function focusScanInput () {
  if (editing.value) {
    return
  }
  const input = scanInputRef.value
  if (input && typeof input.focus === 'function') {
    input.focus()
  }
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

function openCameraScan () {
  router.push({ name: 'camera-scan' })
}

function beginEdit () {
  editing.value = true
}

function endEdit () {
  editing.value = false
  nextTick(() => {
    setTimeout(focusScanInput, 50)
  })
}

function onScanBlur () {
  if (editing.value) {
    return
  }
  setTimeout(focusScanInput, 80)
}

function onScanSubmit () {
  clearAutoEnterTimer()
  const raw = scanBuffer.value.trim()
  scanBuffer.value = ''
  applyScanResult(raw)
  nextTick(focusScanInput)
}

function beginInvoiceEdit (row) {
  editing.value = true
  invoiceDrafts[row.id] = row.invoiceNo
}

function onInvoiceNoBlur (row) {
  const value = invoiceDrafts[row.id] ?? row.invoiceNo
  const result = store.updateRow(row.id, { invoiceNo: value })
  if (!result.ok && result.reason === 'duplicate') {
    $q.notify({
      type: 'negative',
      message: `发票号码已存在：${result.invoiceNo}`
    })
    invoiceDrafts[row.id] = row.invoiceNo
  } else {
    delete invoiceDrafts[row.id]
  }
  endEdit()
}

function onRemoveLastScanned () {
  if (!lastScanned.value) {
    return
  }
  const { id, invoiceNo } = lastScanned.value
  store.removeRow(id)
  delete invoiceDrafts[id]
  $q.notify({
    type: 'warning',
    message: invoiceNo ? `已移除：${invoiceNo}` : '已移除最近扫描记录'
  })
  nextTick(focusScanInput)
}

function onAddBlank () {
  store.addBlank()
  $q.notify({ type: 'info', message: '已新增空白行' })
}

function onClearAll () {
  if (!store.rows.length) {
    return
  }
  $q.dialog({
    title: '确认清空',
    message: '将删除全部登记记录，此操作不可恢复。',
    cancel: { flat: true, label: '取消' },
    ok: { color: 'negative', label: '清空' },
    persistent: true
  }).onOk(() => {
    store.clearAll()
    $q.notify({ type: 'warning', message: '已清空全部记录' })
    nextTick(focusScanInput)
  })
}

async function onExport () {
  if (!store.rows.length) {
    $q.notify({ type: 'warning', message: '没有可导出的数据' })
    return
  }
  try {
    const mode = await exportInvoicesToExcel(store.rows)
    $q.notify({
      type: 'positive',
      message: mode === 'shared' ? '已打开系统分享' : 'Excel 已下载'
    })
  } catch (err) {
    // 用户取消系统分享不算失败
    if (err?.name === 'AbortError') return
    console.error(err)
    $q.notify({ type: 'negative', message: '导出失败，请重试' })
  }
}

onMounted(() => {
  focusScanInput()
})

onUnmounted(() => {
  clearAutoEnterTimer()
})
</script>

<style scoped>
.scan-toolbar {
  flex-wrap: wrap;
}

.scan-input {
  /* 放不下输入框最小宽度+操作区时换行，避免输入框被横向挤压 */
  flex: 1 0 16rem;
  max-width: min(720px, 100%);
}

.scan-actions {
  flex: 0 0 auto;
}

.last-scan {
  flex-wrap: wrap;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
}
</style>
