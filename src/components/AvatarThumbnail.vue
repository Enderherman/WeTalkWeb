<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { chatApi } from '@/api/chat'

const props = withDefaults(defineProps<{
  fileId?: string | number | null
  fallback?: string
  showCover?: boolean
  refreshKey?: string | number
  testId?: string
}>(), {
  fileId: '',
  fallback: '',
  showCover: false,
  refreshKey: '',
  testId: undefined,
})

const imageUrl = ref('')
let requestVersion = 0

function revokeImageUrl() {
  if (!imageUrl.value) return
  URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}

watch(
  () => [props.fileId, props.showCover, props.refreshKey] as const,
  async ([fileId, showCover]) => {
    const version = ++requestVersion
    revokeImageUrl()
    if (fileId === undefined || fileId === null || String(fileId).trim() === '') return

    try {
      const blob = await chatApi.downloadFile(fileId, showCover)
      if (version !== requestVersion) return
      imageUrl.value = URL.createObjectURL(new Blob([blob], { type: 'image/png' }))
    } catch {
      if (version === requestVersion) revokeImageUrl()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  requestVersion += 1
  revokeImageUrl()
})
</script>

<template>
  <span class="avatar-thumbnail" :data-testid="testId" aria-hidden="true">
    <img v-if="imageUrl" :src="imageUrl" alt="" />
    <span v-else>{{ fallback }}</span>
  </span>
</template>
