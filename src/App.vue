<template>
  <router-view />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useInvoiceStore } from '@/stores/invoices'

const store = useInvoiceStore()

const LEAVE_HINT = '请先导出保存数据后再退出，避免数据被浏览器清理丢失'

function onBeforeUnload (event) {
  if (!store.rows.length) {
    return
  }
  event.preventDefault()
  // 多数浏览器会忽略自定义文案，但仍需设置 returnValue 才会弹出离开确认
  event.returnValue = LEAVE_HINT
  return LEAVE_HINT
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
