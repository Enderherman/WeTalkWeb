<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { contactApi, type GroupProfile } from '@/api/contacts'
import { groupApi } from '@/api/groups'

const emit = defineEmits<{
  close: []
  groupCreated: []
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
const createFormOpen = ref(false)
const createForm = reactive({ groupName: '', groupNotice: '', joinType: 1 as 0 | 1 })
const avatarFile = ref<File | null>(null)
const avatarInput = ref<HTMLInputElement | null>(null)
const creatingGroup = ref(false)
const createError = ref('')
const createNotice = ref('')
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

function selectAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  avatarFile.value = input.files?.[0] || null
  createError.value = ''
}

async function createGroup() {
  const groupName = createForm.groupName.trim()
  createError.value = ''
  createNotice.value = ''
  if (!groupName) {
    createError.value = '请输入群名称'
    return
  }
  if (groupName.length > 32) {
    createError.value = '群名称不能超过 32 个字符'
    return
  }
  if (createForm.groupNotice.length > 500) {
    createError.value = '群公告不能超过 500 个字符'
    return
  }
  const avatar = avatarFile.value
  if (!avatar) {
    createError.value = '请选择 PNG 群头像'
    return
  }
  if (avatar.type !== 'image/png' || !avatar.name.toLowerCase().endsWith('.png')) {
    createError.value = '群头像需使用 PNG 格式'
    return
  }
  if (avatar.size > 10 * 1024 * 1024) {
    createError.value = '群头像不能超过 10 MB'
    return
  }

  creatingGroup.value = true
  try {
    await groupApi.create({
      groupName,
      groupNotice: createForm.groupNotice.trim(),
      joinType: createForm.joinType,
      avatarFile: avatar,
    })
    createNotice.value = '群聊创建成功'
    createForm.groupName = ''
    createForm.groupNotice = ''
    createForm.joinType = 1
    avatarFile.value = null
    if (avatarInput.value) avatarInput.value.value = ''
    createFormOpen.value = false
    emit('groupCreated')
    await loadGroups()
  } catch (error: unknown) {
    createError.value = error instanceof Error ? error.message : '群聊创建失败，请稍后重试'
  } finally {
    creatingGroup.value = false
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
        <button
          class="group-create-toggle"
          data-testid="open-group-create"
          type="button"
          :aria-expanded="createFormOpen"
          :disabled="creatingGroup"
          @click="createFormOpen = !createFormOpen"
        >
          {{ createFormOpen ? '收起创建表单' : '创建群聊' }}
        </button>
        <button class="icon-button profile-close" type="button" aria-label="关闭群聊列表" @click="emit('close')">
          ×
        </button>
      </header>

      <form v-if="createFormOpen" class="group-create-form" data-testid="group-create-form" @submit.prevent="createGroup">
        <label for="new-group-name">群名称</label>
        <input
          id="new-group-name"
          v-model="createForm.groupName"
          data-testid="new-group-name"
          maxlength="32"
          autocomplete="off"
          placeholder="给群聊起个名字"
          :disabled="creatingGroup"
        />
        <label for="new-group-notice">群公告（可选）</label>
        <textarea
          id="new-group-notice"
          v-model="createForm.groupNotice"
          data-testid="new-group-notice"
          maxlength="500"
          rows="3"
          placeholder="填写群公告"
          :disabled="creatingGroup"
        ></textarea>
        <label for="new-group-join-type">加入方式</label>
        <select
          id="new-group-join-type"
          v-model.number="createForm.joinType"
          data-testid="new-group-join-type"
          :disabled="creatingGroup"
        >
          <option :value="0">无需审核</option>
          <option :value="1">需要群主同意</option>
        </select>
        <label for="new-group-avatar">群头像（PNG）</label>
        <input
          id="new-group-avatar"
          ref="avatarInput"
          data-testid="new-group-avatar"
          type="file"
          accept="image/png,.png"
          :disabled="creatingGroup"
          @change="selectAvatar"
        />
        <p v-if="avatarFile" class="group-avatar-selected">已选择：{{ avatarFile.name }}</p>
        <p v-if="createError" class="contact-error" role="alert">{{ createError }}</p>
        <button class="contact-submit-button" data-testid="create-group-submit" type="submit" :disabled="creatingGroup">
          {{ creatingGroup ? '正在创建…' : '创建群聊' }}
        </button>
      </form>

      <p v-if="createNotice" class="contact-notice" role="status">{{ createNotice }}</p>
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
