<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const destination = computed(() => (authStore.isAuthenticated ? { name: 'chat' } : { name: 'login' }))
const destinationLabel = computed(() => (authStore.isAuthenticated ? '返回聊天' : '前往登录'))
</script>

<template>
  <main class="not-found-page">
    <RouterLink class="not-found-brand" :to="destination" aria-label="返回 WeTalk">
      <span class="brand-mark">W</span>
      <span>WeTalk</span>
    </RouterLink>

    <section class="not-found-content" aria-labelledby="not-found-title">
      <p class="not-found-code">404 · 页面不存在</p>
      <h1 id="not-found-title">这个链接暂时没有对应页面</h1>
      <p>地址可能输入有误，或页面已经移动。你可以返回 WeTalk 继续使用。</p>
      <RouterLink class="not-found-action" :to="destination">{{ destinationLabel }}</RouterLink>
    </section>

    <footer class="not-found-footer">WeTalk · 让交流更简单</footer>
  </main>
</template>
