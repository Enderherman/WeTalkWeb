<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi, type BeautyAccount } from '@/api/admin'

const router = useRouter()
const filters = reactive({ emailFuzzy: '', userIdFuzzy: '', status: '' as '' | '0' | '1' })
const accounts = ref<BeautyAccount[]>([])
const pageNo = ref(1)
const pageSize = 20
const pageTotal = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const loadError = ref('')
const notice = ref('')
const actionError = ref('')
const dialogOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ id: null as number | null, email: '', userId: '' })
const pendingDelete = ref<BeautyAccount | null>(null)
const deletingId = ref<number | null>(null)
let requestId = 0

onMounted(() => void loadAccounts())

async function loadAccounts() {
  const currentRequest = ++requestId
  loading.value = true
  loadError.value = ''
  try {
    const page = await adminApi.loadBeautyAccounts({
      pageNo: pageNo.value,
      pageSize,
      emailFuzzy: filters.emailFuzzy.trim(),
      userIdFuzzy: filters.userIdFuzzy.trim(),
      ...(filters.status === '' ? {} : { status: Number(filters.status) as 0 | 1 }),
    })
    if (currentRequest !== requestId) return
    accounts.value = page.list || []
    totalCount.value = Number(page.totalCount) || 0
    pageTotal.value = Number(page.pageTotal) || 0
  } catch (error: unknown) {
    if (currentRequest === requestId) loadError.value = error instanceof Error ? error.message : '靓号列表暂时无法读取'
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

function searchAccounts() {
  pageNo.value = 1
  notice.value = ''
  actionError.value = ''
  void loadAccounts()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pageTotal.value || loading.value) return
  pageNo.value = nextPage
  void loadAccounts()
}

function openCreate() {
  form.id = null
  form.email = ''
  form.userId = ''
  formError.value = ''
  dialogOpen.value = true
}

function openEdit(account: BeautyAccount) {
  if (account.status !== 0) return
  form.id = account.id
  form.email = account.email
  form.userId = account.userId
  formError.value = ''
  dialogOpen.value = true
}

function validateForm() {
  const email = form.email.trim()
  const userId = form.userId.trim()
  if (!email || email.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '请输入有效邮箱，且不能超过 50 个字符'
  }
  if (!/^\d{11}$/.test(userId)) return '靓号必须是 11 位数字'
  return ''
}

async function saveAccount() {
  if (saving.value) return
  formError.value = validateForm()
  if (formError.value) return
  saving.value = true
  notice.value = ''
  try {
    await adminApi.saveBeautyAccount({
      ...(form.id === null ? {} : { id: form.id }),
      email: form.email.trim(),
      userId: form.userId.trim(),
      status: 0,
    })
    notice.value = form.id === null ? '靓号已添加' : '靓号已更新'
    dialogOpen.value = false
    pageNo.value = form.id === null ? 1 : pageNo.value
    await loadAccounts()
  } catch (error: unknown) {
    formError.value = error instanceof Error ? error.message : '保存靓号失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

function requestDelete(account: BeautyAccount) {
  pendingDelete.value = account
  actionError.value = ''
  notice.value = ''
}

async function confirmDelete() {
  const account = pendingDelete.value
  if (!account || deletingId.value !== null) return
  deletingId.value = account.id
  actionError.value = ''
  try {
    await adminApi.deleteBeautyAccount(account.id)
    pendingDelete.value = null
    notice.value = `已删除 ${account.email} 对应的靓号`
    if (accounts.value.length === 1 && pageNo.value > 1) pageNo.value -= 1
    await loadAccounts()
  } catch (error: unknown) {
    actionError.value = error instanceof Error ? error.message : '删除靓号失败，请稍后重试'
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <main class="admin-users-page admin-beauty-page">
    <header class="admin-users-header">
      <div>
        <p class="eyebrow">WeTalk 管理</p>
        <h1>靓号管理</h1>
        <p>{{ totalCount }} 个靓号 · 注册后自动绑定到邮箱</p>
      </div>
      <div class="admin-page-links">
        <button class="about-back-button" data-testid="beauty-users-link" type="button" @click="router.push({ name: 'admin-users' })">用户管理</button>
        <button class="about-back-button" data-testid="beauty-groups-link" type="button" @click="router.push({ name: 'admin-groups' })">群聊管理</button>
        <button class="about-back-button" data-testid="beauty-settings-link" type="button" @click="router.push({ name: 'admin-settings' })">系统设置</button>
        <button class="about-back-button" data-testid="beauty-back" type="button" @click="router.push({ name: 'chat' })">返回聊天</button>
      </div>
    </header>

    <form class="admin-user-search beauty-search" data-testid="beauty-search" @submit.prevent="searchAccounts">
      <label>
        <span>邮箱</span>
        <input v-model.trim="filters.emailFuzzy" data-testid="beauty-email-filter" placeholder="按邮箱筛选" />
      </label>
      <label>
        <span>靓号</span>
        <input v-model.trim="filters.userIdFuzzy" data-testid="beauty-id-filter" placeholder="按靓号筛选" />
      </label>
      <label>
        <span>状态</span>
        <select v-model="filters.status" data-testid="beauty-status-filter">
          <option value="">全部状态</option>
          <option value="0">未使用</option>
          <option value="1">已使用</option>
        </select>
      </label>
      <button type="submit" data-testid="search-beauty-accounts" :disabled="loading">{{ loading ? '查询中…' : '查询' }}</button>
      <button class="beauty-add-button" data-testid="add-beauty-account" type="button" @click="openCreate">新增靓号</button>
    </form>

    <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
    <p v-if="loadError || actionError" class="contact-error" role="alert">{{ loadError || actionError }}</p>
    <p v-if="loading && accounts.length === 0" class="contact-status" role="status">正在读取靓号…</p>
    <p v-else-if="!loading && !loadError && accounts.length === 0" class="contact-empty" data-testid="beauty-empty">
      没有找到靓号账号。
    </p>

    <div v-else class="beauty-table-wrap" data-testid="beauty-account-list">
      <table class="beauty-table">
        <thead>
          <tr><th>邮箱</th><th>靓号</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="account in accounts" :key="account.id" :data-testid="`beauty-account-${account.id}`">
            <td>{{ account.email }}</td>
            <td class="beauty-id-cell">{{ account.userId }}</td>
            <td><span :class="['admin-status-pill', account.status === 0 ? 'is-enabled' : 'is-disabled']">{{ account.status === 0 ? '未使用' : '已使用' }}</span></td>
            <td>
              <div class="beauty-row-actions">
                <button v-if="account.status === 0" type="button" :data-testid="`edit-beauty-${account.id}`" @click="openEdit(account)">修改</button>
                <button type="button" :data-testid="`delete-beauty-${account.id}`" @click="requestDelete(account)">删除</button>
              </div>
              <div v-if="pendingDelete?.id === account.id" class="admin-action-confirm beauty-delete-confirm">
                <span>确认删除 {{ account.email }} 的靓号 {{ account.userId }}？</span>
                <button type="button" :disabled="deletingId !== null" :data-testid="`confirm-delete-beauty-${account.id}`" @click="confirmDelete">
                  {{ deletingId === account.id ? '正在删除…' : '确认删除' }}
                </button>
                <button type="button" :disabled="deletingId !== null" @click="pendingDelete = null">取消</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="pageTotal > 1" class="admin-pagination" aria-label="靓号列表分页">
      <button type="button" data-testid="beauty-previous" :disabled="pageNo <= 1 || loading" @click="changePage(pageNo - 1)">上一页</button>
      <span>第 {{ pageNo }} / {{ pageTotal }} 页</span>
      <button type="button" data-testid="beauty-next" :disabled="pageNo >= pageTotal || loading" @click="changePage(pageNo + 1)">下一页</button>
    </nav>

    <div v-if="dialogOpen" class="profile-overlay" data-testid="beauty-dialog-overlay" @click.self="dialogOpen = false">
      <section class="beauty-dialog" role="dialog" aria-modal="true" aria-labelledby="beauty-dialog-title">
        <header class="profile-dialog-header">
          <div>
            <p class="eyebrow">靓号</p>
            <h2 id="beauty-dialog-title">{{ form.id === null ? '新增靓号' : '修改未使用靓号' }}</h2>
          </div>
          <button class="icon-button profile-close" type="button" aria-label="关闭靓号表单" :disabled="saving" @click="dialogOpen = false">×</button>
        </header>
        <p class="beauty-dialog-hint">注册时邮箱需完全匹配，靓号会自动分配；每个靓号为 11 位数字。</p>
        <form class="beauty-edit-form" data-testid="beauty-edit-form" @submit.prevent="saveAccount">
          <label for="beauty-edit-email">邮箱</label>
          <input id="beauty-edit-email" v-model.trim="form.email" data-testid="beauty-edit-email" maxlength="50" autocomplete="off" :disabled="saving" />
          <label for="beauty-edit-user-id">靓号</label>
          <input id="beauty-edit-user-id" v-model.trim="form.userId" data-testid="beauty-edit-user-id" inputmode="numeric" maxlength="11" autocomplete="off" :disabled="saving" />
          <p v-if="formError" class="contact-error" role="alert">{{ formError }}</p>
          <div class="beauty-edit-actions">
            <button type="button" class="message-search-clear" :disabled="saving" @click="dialogOpen = false">取消</button>
            <button type="submit" class="password-submit" data-testid="save-beauty-account" :disabled="saving">{{ saving ? '正在保存…' : '保存靓号' }}</button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>
