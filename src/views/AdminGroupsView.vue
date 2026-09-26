<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi, type AdminGroup } from '@/api/admin'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'

const router = useRouter()
const filters = reactive({ groupIdFuzzy: '', groupNameFuzzy: '', groupOwnIdFuzzy: '' })
const groups = ref<AdminGroup[]>([])
const pageNo = ref(1)
const pageSize = 20
const pageTotal = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const pendingGroup = ref<AdminGroup | null>(null)
const dissolving = ref(false)
let requestId = 0

onMounted(() => void loadGroups())

async function loadGroups() {
  const currentRequestId = ++requestId
  loading.value = true
  loadError.value = ''
  try {
    const page = await adminApi.loadGroups({
      pageNo: pageNo.value,
      pageSize,
      groupIdFuzzy: filters.groupIdFuzzy.trim(),
      groupNameFuzzy: filters.groupNameFuzzy.trim(),
      groupOwnIdFuzzy: filters.groupOwnIdFuzzy.trim(),
    })
    if (currentRequestId !== requestId) return
    groups.value = page.list || []
    totalCount.value = Number(page.totalCount) || 0
    pageTotal.value = Number(page.pageTotal) || 0
  } catch (error: unknown) {
    if (currentRequestId === requestId) {
      loadError.value = error instanceof Error ? error.message : '群聊列表暂时无法读取'
    }
  } finally {
    if (currentRequestId === requestId) loading.value = false
  }
}

function searchGroups() {
  pageNo.value = 1
  void loadGroups()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pageTotal.value || loading.value) return
  pageNo.value = nextPage
  void loadGroups()
}

function requestDissolve(group: AdminGroup) {
  if (group.status !== 1) return
  pendingGroup.value = group
  actionError.value = ''
  notice.value = ''
}

async function confirmDissolve() {
  const group = pendingGroup.value
  if (!group || dissolving.value) return
  dissolving.value = true
  actionError.value = ''
  try {
    await adminApi.dissolveGroup(group.groupOwnId, group.groupId)
    notice.value = `已解散群聊 ${group.groupName || group.groupId}`
    pendingGroup.value = null
    await loadGroups()
  } catch (error: unknown) {
    actionError.value = error instanceof Error ? error.message : '解散群聊失败，请稍后重试'
  } finally {
    dissolving.value = false
  }
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
        <h1>群聊管理</h1>
        <p>{{ totalCount }} 个群聊</p>
      </div>
      <div class="admin-page-links">
        <button class="about-back-button" data-testid="admin-users-link" type="button" @click="router.push({ name: 'admin-users' })">用户管理</button>
        <button class="about-back-button" data-testid="admin-groups-back" type="button" @click="router.push({ name: 'chat' })">返回聊天</button>
      </div>
    </header>

    <form class="admin-user-search" data-testid="admin-group-search" @submit.prevent="searchGroups">
      <label>
        <span>群编号</span>
        <input v-model.trim="filters.groupIdFuzzy" data-testid="admin-group-id-filter" placeholder="输入群编号" />
      </label>
      <label>
        <span>群名称</span>
        <input v-model.trim="filters.groupNameFuzzy" data-testid="admin-group-name-filter" placeholder="输入群名称" />
      </label>
      <label>
        <span>群主编号</span>
        <input v-model.trim="filters.groupOwnIdFuzzy" data-testid="admin-group-owner-filter" placeholder="输入群主编号" />
      </label>
      <button type="submit" data-testid="search-admin-groups" :disabled="loading">{{ loading ? '搜索中…' : '搜索' }}</button>
    </form>

    <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
    <p v-if="loadError || actionError" class="contact-error" role="alert">{{ loadError || actionError }}</p>
    <p v-if="loading && groups.length === 0" class="contact-status" role="status">正在读取群聊…</p>
    <p v-else-if="!loading && !loadError && groups.length === 0" class="contact-empty" data-testid="admin-groups-empty">
      没有找到匹配群聊。
    </p>

    <div v-else class="admin-user-list" data-testid="admin-group-list">
      <article v-for="group in groups" :key="group.groupId" class="admin-user-card" :data-testid="`admin-group-${group.groupId}`">
        <div class="admin-user-main">
          <AvatarThumbnail class="group-directory-avatar" :file-id="group.groupId" :fallback="(group.groupName || group.groupId).slice(0, 1)" />
          <div class="admin-user-copy">
            <strong>{{ group.groupName || group.groupId }}</strong>
            <span>{{ group.groupId }} · 群主 {{ group.groupOwnerNickName || group.groupOwnId }}</span>
            <small>{{ group.memberCount ?? 0 }} 位成员 · 创建 {{ formatDate(group.createTime) }}</small>
          </div>
          <div class="admin-user-state">
            <span :class="['admin-status-pill', group.status === 1 ? 'is-enabled' : 'is-disabled']">
              {{ group.status === 1 ? '正常' : '已解散' }}
            </span>
            <span>{{ group.joinType === 0 ? '直接加入' : '需要审批' }}</span>
          </div>
          <div class="admin-user-actions">
            <button
              v-if="group.status === 1"
              type="button"
              :disabled="dissolving"
              :data-testid="`dissolve-admin-group-${group.groupId}`"
              @click="requestDissolve(group)"
            >解散群聊</button>
          </div>
        </div>
        <div v-if="pendingGroup?.groupId === group.groupId" class="admin-action-confirm">
          <span>确认解散“{{ group.groupName || group.groupId }}”？群成员将无法继续使用该群。</span>
          <button type="button" data-testid="confirm-dissolve-group" :disabled="dissolving" @click="confirmDissolve">
            {{ dissolving ? '正在解散…' : '确认解散' }}
          </button>
          <button type="button" :disabled="dissolving" @click="pendingGroup = null">取消</button>
        </div>
      </article>
    </div>

    <nav v-if="pageTotal > 1" class="admin-pagination" aria-label="群聊列表分页">
      <button type="button" data-testid="admin-groups-previous" :disabled="pageNo <= 1 || loading" @click="changePage(pageNo - 1)">上一页</button>
      <span>第 {{ pageNo }} / {{ pageTotal }} 页</span>
      <button type="button" data-testid="admin-groups-next" :disabled="pageNo >= pageTotal || loading" @click="changePage(pageNo + 1)">下一页</button>
    </nav>
  </main>
</template>
