<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()
const homeTarget = computed(() => (authStore.isAuthenticated ? { name: 'chat' } : { name: 'login' }))
const homeLabel = computed(() => (authStore.isAuthenticated ? '返回聊天' : '前往登录'))
const safeRetryPath = computed(() => {
  const from = route.query.from
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : null
})
const retryTarget = computed(() => safeRetryPath.value || homeTarget.value)
const retryLabel = computed(() => (safeRetryPath.value ? '重新连接' : homeLabel.value))
</script>

<template>
  <main class="not-found-page service-error-page" data-testid="api-unavailable-page">
    <RouterLink class="not-found-brand" :to="homeTarget" aria-label="返回 WeTalk">
      <span class="brand-mark">W</span>
      <span>WeTalk</span>
    </RouterLink>

    <section class="not-found-content" aria-labelledby="service-error-title">
      <p class="not-found-code">服务暂不可用</p>
      <h1 id="service-error-title">WeTalk 暂时无法连接</h1>
      <p>网络或服务暂时没有响应。请检查连接状态后重试。</p>
      <div class="service-error-actions">
        <RouterLink class="not-found-action" :to="retryTarget" data-testid="service-error-retry">
          {{ retryLabel }}
        </RouterLink>
        <RouterLink class="service-error-home" :to="homeTarget">{{ homeLabel }}</RouterLink>
      </div>
    </section>

    <footer class="not-found-footer">WeTalk · 让交流更简单</footer>
  </main>
</template>
