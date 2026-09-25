<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import type { UserProfile } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { validatePassword } from '@/utils/authValidation'

const router = useRouter()
const authStore = useAuthStore()
const sidebarOpen = ref(false)
const signingOut = ref(false)
const profileOpen = ref(false)
const profileLoading = ref(false)
const profileError = ref('')
const profile = ref<UserProfile | null>(null)
const passwordForm = reactive({ password: '', confirmPassword: '' })
const passwordError = ref('')
const changingPassword = ref(false)

const displayName = computed(() => profile.value?.nickName || authStore.session?.nickName || 'WeTalk 用户')
const avatarInitial = computed(() => displayName.value.slice(0, 1).toUpperCase())

onMounted(() => {
  void loadProfile()
})

async function loadProfile() {
  profileLoading.value = true
  profileError.value = ''
  try {
    profile.value = await authApi.getUserInfo()
    const session = authStore.session
    if (session) {
      authStore.setSession({
        ...session,
        email: profile.value.email || session.email,
        nickName: profile.value.nickName || session.nickName,
        admin: profile.value.admin,
      })
    }
  } catch (error: unknown) {
    profileError.value = error instanceof Error ? error.message : '个人资料暂时无法读取'
  } finally {
    profileLoading.value = false
  }
}

function openProfile() {
  profileOpen.value = true
  sidebarOpen.value = false
  passwordForm.password = ''
  passwordForm.confirmPassword = ''
  passwordError.value = ''
}

function closeProfile() {
  if (changingPassword.value) return
  profileOpen.value = false
}

async function changePassword() {
  passwordError.value = validatePassword(passwordForm.password) || ''
  if (passwordError.value) return
  if (passwordForm.confirmPassword !== passwordForm.password) {
    passwordError.value = '两次输入的密码不一致'
    return
  }

  changingPassword.value = true
  try {
    await authApi.updatePassword(passwordForm.password)
    authStore.clearSession()
    await router.replace({ name: 'login', query: { passwordUpdated: '1' } })
  } catch (error: unknown) {
    passwordError.value = error instanceof Error ? error.message : '密码修改失败，请稍后重试'
  } finally {
    changingPassword.value = false
  }
}

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
        <button
          class="profile-trigger"
          data-testid="open-profile"
          type="button"
          aria-haspopup="dialog"
          @click="openProfile"
        >
          <span class="profile-avatar" aria-hidden="true">{{ avatarInitial }}</span>
          <span class="profile-copy">
            <strong>{{ displayName }}</strong>
            <span>{{ profile?.email || authStore.session?.email }}</span>
          </span>
        </button>
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

    <div v-if="profileOpen" class="profile-overlay" data-testid="profile-overlay" @click.self="closeProfile">
      <section
        class="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeProfile"
      >
        <header class="profile-dialog-header">
          <div>
            <p class="eyebrow">账号</p>
            <h2 id="profile-title">个人资料与安全</h2>
          </div>
          <button class="icon-button profile-close" type="button" aria-label="关闭个人资料" @click="closeProfile">
            ×
          </button>
        </header>

        <p v-if="profileLoading" class="profile-status" role="status">正在读取个人资料…</p>
        <p v-else-if="profileError" class="profile-load-error" role="alert">{{ profileError }}</p>

        <dl class="profile-details">
          <div>
            <dt>昵称</dt>
            <dd>{{ profile?.nickName || authStore.session?.nickName || '—' }}</dd>
          </div>
          <div>
            <dt>邮箱</dt>
            <dd>{{ profile?.email || authStore.session?.email || '—' }}</dd>
          </div>
          <div>
            <dt>账号编号</dt>
            <dd>{{ profile?.userId || authStore.session?.userId || '—' }}</dd>
          </div>
        </dl>

        <form class="password-form" data-testid="password-form" @submit.prevent="changePassword">
          <div>
            <h3>修改密码</h3>
            <p class="password-note">修改成功后会退出当前账号，请使用新密码重新登录。</p>
          </div>
          <label for="new-password">新密码</label>
          <input
            id="new-password"
            v-model="passwordForm.password"
            data-testid="new-password"
            type="password"
            autocomplete="new-password"
            placeholder="8–18 位，包含英文字母和数字"
          />
          <label for="confirm-new-password">确认新密码</label>
          <input
            id="confirm-new-password"
            v-model="passwordForm.confirmPassword"
            data-testid="confirm-new-password"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入新密码"
          />
          <p v-if="passwordError" class="profile-form-error" data-testid="password-error" role="alert">
            {{ passwordError }}
          </p>
          <button class="password-submit" data-testid="update-password" type="submit" :disabled="changingPassword">
            {{ changingPassword ? '正在修改…' : '更新密码' }}
          </button>
        </form>
      </section>
    </div>
  </main>
</template>
