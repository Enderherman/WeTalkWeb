<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi, type AdminUser } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'

const router = useRouter()
const authStore = useAuthStore()
const filters = reactive({ userIdFuzzy: '', emailFuzzy: '', nickNameFuzzy: '' })
const users = ref<AdminUser[]>([])
const pageNo = ref(1)
const pageSize = 20
const pageTotal = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const pendingAction = ref<{ userId: string; action: 'enable' | 'disable' | 'offline' } | null>(null)
const actionLoading = ref(false)
let requestId = 0

onMounted(() => void loadUsers())

async function loadUsers() {
  const currentRequestId = ++requestId
  loading.value = true
  loadError.value = ''
  try {
    const page = await adminApi.loadUsers({
      pageNo: pageNo.value,
      pageSize,
      userIdFuzzy: filters.userIdFuzzy.trim(),
      emailFuzzy: filters.emailFuzzy.trim(),
      nickNameFuzzy: filters.nickNameFuzzy.trim(),
    })
    if (currentRequestId !== requestId) return
    users.value = page.list || []
    pageTotal.value = Number(page.pageTotal) || 0
    totalCount.value = Number(page.totalCount) || 0
  } catch (error: unknown) {
    if (currentRequestId === requestId) {
      loadError.value = error instanceof Error ? error.message : '用户列表暂时无法读取'
    }
  } finally {
    if (currentRequestId === requestId) loading.value = false
  }
}

function searchUsers() {
  pageNo.value = 1
  void loadUsers()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pageTotal.value || loading.value) return
  pageNo.value = nextPage
  void loadUsers()
}

function confirmStatus(user: AdminUser) {
  if (user.userId === authStore.session?.userId) return
  pendingAction.value = { userId: user.userId, action: user.status === 1 ? 'disable' : 'enable' }
  actionError.value = ''
  notice.value = ''
}

function confirmOffline(user: AdminUser) {
  if (user.userId === authStore.session?.userId || user.onlineType !== 1) return
  pendingAction.value = { userId: user.userId, action: 'offline' }
  actionError.value = ''
  notice.value = ''
}

async function executeAction() {
  const action = pendingAction.value
  if (!action || actionLoading.value) return
  actionLoading.value = true
  actionError.value = ''
  try {
    if (action.action === 'offline') {
      await adminApi.forceOffline(action.userId)
      notice.value = `已强制下线 ${action.userId}`
    } else {
      await adminApi.updateUserStatus(action.userId, action.action === 'enable' ? 1 : 0)
      notice.value = action.action === 'enable' ? `已启用 ${action.userId}` : `已禁用 ${action.userId}`
    }
    pendingAction.value = null
    await loadUsers()
  } catch (error: unknown) {
    actionError.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
  } finally {
    actionLoading.value = false
  }
}

function cancelAction() {
  if (actionLoading.value) return
  pendingAction.value = null
  actionError.value = ''
}

function formatDate(value?: string | null) {
  return value || '—'
}
</script>

<template>
  <main class="admin-users-page">
    <header class="admin-users-header">
      <div>
        <p class="eyebrow">WeTalk 管理</p>
        <h1>用户管理</h1>
        <p>仅管理员可用 · {{ totalCount }} 个账号</p>
      </div>
      <div class="admin-page-links">
        <button class="about-back-button" data-testid="admin-groups-link" type="button" @click="router.push({ name: 'admin-groups' })">群聊管理</button>
        <button class="about-back-button" data-testid="admin-settings-link" type="button" @click="router.push({ name: 'admin-settings' })">系统设置</button>
        <button class="about-back-button" data-testid="admin-beauty-link" type="button" @click="router.push({ name: 'admin-beauty-accounts' })">靓号管理</button>
        <button class="about-back-button" data-testid="admin-back-to-chat" type="button" @click="router.push({ name: 'chat' })">返回聊天</button>
      </div>
    </header>

    <form class="admin-user-search" data-testid="admin-user-search" @submit.prevent="searchUsers">
      <label>
        <span>账号编号</span>
        <input v-model.trim="filters.userIdFuzzy" data-testid="admin-user-id-filter" placeholder="输入用户编号" />
      </label>
      <label>
        <span>邮箱</span>
        <input v-model.trim="filters.emailFuzzy" data-testid="admin-user-email-filter" placeholder="输入邮箱" />
      </label>
      <label>
        <span>昵称</span>
        <input v-model.trim="filters.nickNameFuzzy" data-testid="admin-user-name-filter" placeholder="输入昵称" />
      </label>
      <button type="submit" data-testid="search-admin-users" :disabled="loading">{{ loading ? '搜索中…' : '搜索' }}</button>
    </form>

    <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
    <p v-if="loadError || actionError" class="contact-error" role="alert">{{ loadError || actionError }}</p>
    <p v-if="loading && users.length === 0" class="contact-status" role="status">正在读取用户…</p>
    <p v-else-if="!loading && !loadError && users.length === 0" class="contact-empty" data-testid="admin-users-empty">
      没有找到匹配用户。
    </p>

    <div v-else class="admin-user-list" data-testid="admin-user-list">
      <article v-for="user in users" :key="user.userId" class="admin-user-card" :data-testid="`admin-user-${user.userId}`">
        <div class="admin-user-main">
          <AvatarThumbnail class="contact-result-avatar" :file-id="user.userId" :fallback="(user.nickName || user.userId).slice(0, 1)" />
          <div class="admin-user-copy">
            <strong>{{ user.nickName || user.userId }}</strong>
            <span>{{ user.userId }} · {{ user.email || '无邮箱' }}</span>
            <small>创建 {{ formatDate(user.createTime) }} · 最近登录 {{ formatDate(user.lastLoginTime) }}</small>
          </div>
          <div class="admin-user-state">
            <span :class="['admin-status-pill', user.status === 1 ? 'is-enabled' : 'is-disabled']">
              {{ user.status === 1 ? '已启用' : '已禁用' }}
            </span>
            <span>{{ user.onlineType === 1 ? '在线' : '离线' }}</span>
          </div>
          <div class="admin-user-actions">
            <button
              type="button"
              :disabled="actionLoading || user.userId === authStore.session?.userId"
              :data-testid="`toggle-status-${user.userId}`"
              @click="confirmStatus(user)"
            >{{ user.status === 1 ? '禁用账号' : '启用账号' }}</button>
            <button
              v-if="user.onlineType === 1"
              type="button"
              :disabled="actionLoading || user.userId === authStore.session?.userId"
              :data-testid="`force-offline-${user.userId}`"
              @click="confirmOffline(user)"
            >强制下线</button>
          </div>
        </div>
        <div v-if="pendingAction?.userId === user.userId" class="admin-action-confirm">
          <span>确认{{ pendingAction.action === 'disable' ? '禁用' : pendingAction.action === 'enable' ? '启用' : '强制下线' }}该账号？</span>
          <button type="button" data-testid="confirm-admin-action" :disabled="actionLoading" @click="executeAction">
            {{ actionLoading ? '处理中…' : '确认' }}
          </button>
          <button type="button" :disabled="actionLoading" @click="cancelAction">取消</button>
        </div>
      </article>
    </div>

    <nav v-if="pageTotal > 1" class="admin-pagination" aria-label="用户列表分页">
      <button type="button" data-testid="admin-users-previous" :disabled="pageNo <= 1 || loading" @click="changePage(pageNo - 1)">上一页</button>
      <span>第 {{ pageNo }} / {{ pageTotal }} 页</span>
      <button type="button" data-testid="admin-users-next" :disabled="pageNo >= pageTotal || loading" @click="changePage(pageNo + 1)">下一页</button>
    </nav>
  </main>
</template>
