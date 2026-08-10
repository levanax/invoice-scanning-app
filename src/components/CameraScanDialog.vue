<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
    @update:model-value="(open) => emit('update:modelValue', open)"
    @show="startScanner"
    @hide="stopScanner"
  >
    <q-card class="column full-height camera-scan-card">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle1">手机扫码</div>
        <q-space />
        <q-btn dense flat icon="close" aria-label="关闭" @click="close" />
      </q-bar>

      <q-card-section class="col column items-center q-gutter-md">
        <div class="text-body2 text-grey-7 text-center">
          将发票二维码对准取景框，识别成功后会自动登记
        </div>
        <div id="camera-scan-reader" class="camera-scan-reader" />
        <div v-if="errorMessage" class="text-negative text-body2 text-center">
          {{ errorMessage }}
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'scanned'])

const errorMessage = ref('')
const SCANNER_ELEMENT_ID = 'camera-scan-reader'

let scanner = null
let starting = false
let lastRaw = ''
let lastAt = 0

const DEDUPE_MS = 2500

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
      emit('scanned', raw)
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

function close () {
  emit('update:modelValue', false)
}

onBeforeUnmount(() => {
  stopScanner()
})
</script>

<style scoped>
.camera-scan-card {
  background: #f5f5f5;
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
