<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { contactApi, type GroupProfile } from '@/api/contacts'

const emit = defineEmits<{
  close: []
}>()

interface GroupDirectoryEntry {
  groupId: string
  groupName: string
  memberCount: number
}

const groups = ref<GroupDirectoryEntry[]>([])
const selectedGroupId = ref('')
const groupProfile = ref<GroupProfile | null>(null)
const loading = ref(true)
const profileLoading = ref(false)
const loadError = ref('')
const profileError = ref('')
let profileRequestId = 0

onMounted(() => void loadGroups())

async function loadGroups() {
  loading.value = true
  loadError.value = ''
  try {
    const [memberships, ownedGroups] = await Promise.all([
      contactApi.loadContacts('GROUP'),
      contactApi.loadOwnedGroups(),
    ])
    const ownedIds = new Set(ownedGroups.map((group) => group.groupId))
    groups.value = [
      ...ownedGroups.map((group) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        memberCount: group.memberCount,
      })),
      ...memberships
        .filter((group) => !ownedIds.has(group.contactId))
        .map((group) => ({
          groupId: group.contactId,
          groupName: group.contactName || group.contactId,
          memberCount: group.memberCount || 0,
        })),
    ].sort((left, right) => left.groupName.localeCompare(right.groupName, 'zh-CN'))
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : '群聊列表暂时无法读取'
  } finally {
    loading.value = false
  }
}

async function viewGroup(group: GroupDirectoryEntry) {
  selectedGroupId.value = group.groupId
  groupProfile.value = null
  profileError.value = ''
  profileLoading.value = true
  const requestId = ++profileRequestId
  try {
    const result = await contactApi.getGroupInfo(group.groupId)
    if (requestId === profileRequestId && selectedGroupId.value === group.groupId) groupProfile.value = result
  } catch (error: unknown) {
    if (requestId === profileRequestId) profileError.value = error instanceof Error ? error.message : '群资料暂时无法读取'
  } finally {
    if (requestId === profileRequestId) profileLoading.value = false
  }
}

function formatGroupTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}
</script>

<template>
  <div class="profile-overlay" data-testid="group-directory-overlay" @click.self="emit('close')">
    <section
      class="profile-dialog group-directory-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-directory-title"
      @keydown.esc.stop.prevent="emit('close')"
    >
      <header class="profile-dialog-header">
        <div>
          <p class="eyebrow">会话</p>
          <h2 id="group-directory-title">群聊列表</h2>
        </div>
        <button class="icon-button profile-close" type="button" aria-label="关闭群聊列表" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="loadError" class="contact-error" role="alert">{{ loadError }}</p>
      <p v-if="loading" class="contact-status" role="status">正在读取群聊…</p>
      <p v-else-if="!loadError && groups.length === 0" class="contact-empty" data-testid="groups-empty">
        还没有加入群聊。
      </p>

      <div v-else-if="!loadError && groups.length > 0" class="group-directory-layout">
        <div class="group-directory-list" data-testid="group-directory-list">
          <button
            v-for="group in groups"
            :key="group.groupId"
            class="group-directory-entry"
            :class="{ 'is-selected': group.groupId === selectedGroupId }"
            :data-testid="`group-${group.groupId}`"
            type="button"
            @click="viewGroup(group)"
          >
            <span class="group-directory-avatar" aria-hidden="true">{{ (group.groupName || group.groupId).slice(0, 1) }}</span>
            <span class="contact-result-copy">
              <strong>{{ group.groupName || group.groupId }}</strong>
              <span>{{ group.memberCount || 0 }} 位成员 · {{ group.groupId }}</span>
            </span>
          </button>
        </div>

        <section v-if="selectedGroupId" class="contact-profile-panel" aria-label="群聊资料">
          <p class="eyebrow">群聊资料</p>
          <p v-if="profileLoading" class="contact-status" role="status">正在读取群资料…</p>
          <p v-else-if="profileError" class="contact-error" role="alert">{{ profileError }}</p>
          <dl v-else-if="groupProfile" class="contact-profile-details">
            <div><dt>群名称</dt><dd>{{ groupProfile.groupName }}</dd></div>
            <div><dt>群编号</dt><dd>{{ groupProfile.groupId }}</dd></div>
            <div><dt>群主编号</dt><dd>{{ groupProfile.groupOwnId }}</dd></div>
            <div><dt>成员</dt><dd>{{ groupProfile.memberCount }} 人</dd></div>
            <div><dt>加入方式</dt><dd>{{ groupProfile.joinType === 0 ? '无需审核' : '需要审核' }}</dd></div>
            <div><dt>创建日期</dt><dd>{{ formatGroupTime(groupProfile.createTime) }}</dd></div>
            <div class="group-notice-row"><dt>群公告</dt><dd>{{ groupProfile.groupNotice || '暂无公告' }}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  </div>
</template>
