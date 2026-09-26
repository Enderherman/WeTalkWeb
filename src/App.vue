<script setup lang="ts">
import { onBeforeMount, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { API_UNAVAILABLE_EVENT } from '@/utils/apiEvents'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()

function handleSessionExpired() {
  if (!authStore.session) return
  chatStore.clear()
  authStore.clearSession()
  void router.replace({ name: 'login', query: { expired: '1' } })
}

function handleApiUnavailable() {
  if (router.currentRoute.value.name === 'service-error') return
  void router.replace({
    name: 'service-error',
    query: { from: router.currentRoute.value.fullPath },
  })
}

onBeforeMount(() => {
  window.addEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired)
  window.addEventListener(API_UNAVAILABLE_EVENT, handleApiUnavailable)
})
onBeforeUnmount(() => {
  window.removeEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired)
  window.removeEventListener(API_UNAVAILABLE_EVENT, handleApiUnavailable)
})
</script>

<template>
  <RouterView />
</template>
