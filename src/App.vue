<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
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

onMounted(() => window.addEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired))
onBeforeUnmount(() => window.removeEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired))
</script>

<template>
  <RouterView />
</template>
