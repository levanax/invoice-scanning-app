<template>
  <q-layout view="hHh lpR fFf">
    <q-header v-if="showAppHeader" elevated class="bg-primary text-white">
      <q-toolbar>
        <q-toolbar-title>发票扫码登记</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const showAppHeader = computed(() => route.name !== 'camera-scan')
</script>
