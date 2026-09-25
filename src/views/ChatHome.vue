<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const sidebarOpen = ref(false)
const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  try {
    await authApi.logout()
  } catch {
    // Clear the browser session even if the server is unreachable.
  } finally {
    authStore.clearSession()
    signingOut.value = false
    await router.replace({ name: 'login' })
  }
}
</script>

<template>
  <main class="chat-shell">
    <button
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航菜单"
      @click="sidebarOpen = false"
    ></button>

    <aside class="chat-sidebar" :class="{ 'is-open': sidebarOpen }">
      <div class="sidebar-top">
        <RouterLink class="sidebar-brand" :to="{ name: 'chat' }" aria-label="WeTalk">
          <span class="brand-mark">W</span>
          <span>WeTalk</span>
        </RouterLink>
        <button class="icon-button mobile-menu-close" type="button" aria-label="关闭菜单" @click="sidebarOpen = false">
          ×
        </button>
      </div>

      <button class="new-chat-button" type="button" disabled>
        <span aria-hidden="true">＋</span>
        新聊天
      </button>

      <section class="history-section" aria-label="聊天记录">
        <p class="sidebar-label">最近的聊天</p>
        <p class="history-empty">聊天记录接入后会显示在这里</p>
      </section>

      <div class="sidebar-bottom">
        <div class="profile-avatar" aria-hidden="true">
          {{ (authStore.session?.nickName || 'W').slice(0, 1).toUpperCase() }}
        </div>
        <div class="profile-copy">
          <strong>{{ authStore.session?.nickName || 'WeTalk 用户' }}</strong>
          <span>{{ authStore.session?.email }}</span>
        </div>
        <button
          class="icon-button signout-button"
          data-testid="signout"
          type="button"
          :disabled="signingOut"
          aria-label="退出登录"
          title="退出登录"
          @click="signOut"
        >
          ↗
        </button>
      </div>
    </aside>

    <section class="chat-main">
      <header class="chat-topbar">
        <button class="icon-button mobile-menu-open" type="button" aria-label="打开导航菜单" @click="sidebarOpen = true">
          ☰
        </button>
        <span>WeTalk</span>
      </header>

      <div class="chat-welcome">
        <div class="welcome-mark" aria-hidden="true">W</div>
        <p class="eyebrow">账号已登录</p>
        <h1>今天想聊点什么？</h1>
        <p class="welcome-copy">聊天会话和实时消息正在接入。你的账号入口已经准备好。</p>
      </div>

      <div class="composer-preview" aria-label="聊天输入框预览">
        <textarea disabled rows="1" placeholder="聊天发送会在下一阶段接入"></textarea>
        <button class="composer-send" type="button" disabled aria-label="发送消息">↑</button>
      </div>
      <p class="chat-disclaimer">当前切片完成账号认证；聊天功能将在后续阶段启用。</p>
    </section>
  </main>
</template>
