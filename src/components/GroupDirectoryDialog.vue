<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { contactApi, type UserContactEntry } from '@/api/contacts'
import { groupApi, type GroupInfoWithMembers } from '@/api/groups'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'
import { useSystemSettingsStore } from '@/stores/systemSettings'

const props = defineProps<{ currentUserId?: string; refreshKey?: number }>()
const systemSettingsStore = useSystemSettingsStore()

const emit = defineEmits<{
  close: []
  groupChanged: []
}>()

interface GroupDirectoryEntry {
  groupId: string
  groupName: string
  memberCount: number
}

const groups = ref<GroupDirectoryEntry[]>([])
const ownedGroupCount = ref(0)
const maxGroupCount = computed(() => {
  const value = Number(systemSettingsStore.settings.maxGroupCount)
  return Number.isSafeInteger(value) && value > 0 ? value : 5
})
const canCreateGroup = computed(() => ownedGroupCount.value < maxGroupCount.value)
const selectedGroupId = ref('')
const groupInfo = ref<GroupInfoWithMembers | null>(null)
const groupProfile = computed(() => groupInfo.value?.groupInfo || null)
const groupMembers = computed(() => groupInfo.value?.userContactList || [])
const maxGroupMemberCount = computed(() => {
  const value = Number(systemSettingsStore.settings.maxGroupMemberCount)
  return Number.isSafeInteger(value) && value > 0 ? value : 500
})
const currentGroupMemberCount = computed(() => {
  const reportedCount = Number(groupProfile.value?.memberCount)
  return Math.max(Number.isSafeInteger(reportedCount) && reportedCount >= 0 ? reportedCount : 0, groupMembers.value.length)
})
const memberSlotsRemaining = computed(() => Math.max(0, maxGroupMemberCount.value - currentGroupMemberCount.value))
const avatarRevision = ref(0)
const isGroupOwner = computed(() => Boolean(props.currentUserId && groupProfile.value?.groupOwnId === props.currentUserId))
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
const editGroupOpen = ref(false)
const editForm = reactive({ groupName: '', groupNotice: '', joinType: 1 as 0 | 1 })
const editAvatarFile = ref<File | null>(null)
const editAvatarInput = ref<HTMLInputElement | null>(null)
const editingGroup = ref(false)
const editError = ref('')
const editNotice = ref('')
const friends = ref<UserContactEntry[]>([])
const selectedMemberIds = ref<string[]>([])
const addMemberOpen = ref(false)
const friendsLoading = ref(false)
const groupActionLoading = ref(false)
const groupActionError = ref('')
const groupActionNotice = ref('')
const pendingGroupAction = ref<{ kind: 'remove' | 'leave' | 'dissolve'; userId?: string } | null>(null)
const availableFriends = computed(() => {
  const memberIds = new Set(groupMembers.value.map((member) => member.userId))
  return friends.value.filter((friend) => friend.status === 1 && !memberIds.has(friend.contactId))
})
let profileRequestId = 0

onMounted(() => {
  void systemSettingsStore.load().catch(() => undefined)
  void loadGroups()
})

watch(
  () => props.refreshKey,
  (value, previousValue) => {
    if (value !== undefined && value !== previousValue) void refreshSelectedGroup()
  },
)

async function loadGroups() {
  loading.value = true
  loadError.value = ''
  try {
    const [memberships, ownedGroups] = await Promise.all([
      contactApi.loadContacts('GROUP'),
      contactApi.loadOwnedGroups(),
    ])
    ownedGroupCount.value = ownedGroups.filter((group) => group.status !== 0).length
    const ownedIds = new Set(ownedGroups.map((group) => group.groupId))
    groups.value = [
      ...ownedGroups.map((group) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        memberCount: group.memberCount || 0,
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
  groupInfo.value = null
  profileError.value = ''
  profileLoading.value = true
  const requestId = ++profileRequestId
  try {
    const result = await groupApi.getInfoForChat(group.groupId)
    if (requestId === profileRequestId && selectedGroupId.value === group.groupId) groupInfo.value = result
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

async function toggleCreateForm() {
  await systemSettingsStore.load().catch(() => undefined)
  if (!canCreateGroup.value) {
    createError.value = `每个账号最多创建 ${maxGroupCount.value} 个群聊`
    createFormOpen.value = false
    return
  }
  createError.value = ''
  createFormOpen.value = !createFormOpen.value
}

async function createGroup() {
  const groupName = createForm.groupName.trim()
  createError.value = ''
  createNotice.value = ''
  await systemSettingsStore.load().catch(() => undefined)
  if (!canCreateGroup.value) {
    createError.value = `每个账号最多创建 ${maxGroupCount.value} 个群聊`
    createFormOpen.value = false
    return
  }
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
    emit('groupChanged')
    await loadGroups()
  } catch (error: unknown) {
    createError.value = error instanceof Error ? error.message : '群聊创建失败，请稍后重试'
  } finally {
    creatingGroup.value = false
  }
}

function openEditGroup() {
  if (!isGroupOwner.value || !groupProfile.value) return
  createFormOpen.value = false
  editForm.groupName = groupProfile.value.groupName
  editForm.groupNotice = groupProfile.value.groupNotice || ''
  editForm.joinType = groupProfile.value.joinType
  editAvatarFile.value = null
  if (editAvatarInput.value) editAvatarInput.value.value = ''
  editError.value = ''
  editNotice.value = ''
  editGroupOpen.value = true
}

function selectEditAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  editAvatarFile.value = input.files?.[0] || null
  editError.value = ''
}

async function updateGroup() {
  const groupId = selectedGroupId.value
  const groupName = editForm.groupName.trim()
  const avatar = editAvatarFile.value
  editError.value = ''
  editNotice.value = ''
  if (!groupId || !groupName) {
    editError.value = '请输入群名称'
    return
  }
  if (groupName.length > 32 || editForm.groupNotice.length > 500) {
    editError.value = '群名最多 32 个字符，群公告最多 500 个字符'
    return
  }
  if (avatar && (avatar.type !== 'image/png' || !avatar.name.toLowerCase().endsWith('.png'))) {
    editError.value = '群头像需使用 PNG 格式'
    return
  }
  if (avatar && avatar.size > 10 * 1024 * 1024) {
    editError.value = '群头像不能超过 10 MB'
    return
  }

  editingGroup.value = true
  try {
    await groupApi.update({
      groupId,
      groupName,
      groupNotice: editForm.groupNotice.trim(),
      joinType: editForm.joinType,
      avatarFile: avatar,
    })
    avatarRevision.value += 1
    editNotice.value = '群资料已更新'
    editGroupOpen.value = false
    emit('groupChanged')
    await refreshSelectedGroup()
  } catch (error: unknown) {
    editError.value = error instanceof Error ? error.message : '群资料更新失败，请稍后重试'
  } finally {
    editingGroup.value = false
  }
}

async function openMemberPicker() {
  if (!isGroupOwner.value || !selectedGroupId.value) return
  addMemberOpen.value = true
  friendsLoading.value = true
  selectedMemberIds.value = []
  groupActionError.value = ''
  groupActionNotice.value = ''
  try {
    friends.value = await contactApi.loadContacts('USER')
  } catch (error: unknown) {
    groupActionError.value = error instanceof Error ? error.message : '好友列表暂时无法读取'
  } finally {
    friendsLoading.value = false
  }
}

async function addSelectedMembers() {
  if (!isGroupOwner.value || !selectedGroupId.value || selectedMemberIds.value.length === 0 || groupActionLoading.value) {
    groupActionError.value = selectedMemberIds.value.length === 0 ? '请选择至少一位好友' : ''
    return
  }
  await systemSettingsStore.load().catch(() => undefined)
  if (currentGroupMemberCount.value + selectedMemberIds.value.length > maxGroupMemberCount.value) {
    groupActionError.value = `添加后会超过群成员上限 ${maxGroupMemberCount.value} 人，当前有 ${currentGroupMemberCount.value} 人`
    return
  }
  groupActionLoading.value = true
  groupActionError.value = ''
  groupActionNotice.value = ''
  try {
    const userIds = [...selectedMemberIds.value]
    await groupApi.manageMembers(selectedGroupId.value, userIds, 1)
    groupActionNotice.value = `已添加 ${userIds.length} 位成员`
    addMemberOpen.value = false
    selectedMemberIds.value = []
    emit('groupChanged')
    await refreshSelectedGroup()
  } catch (error: unknown) {
    groupActionError.value = error instanceof Error ? error.message : '添加群成员失败，请稍后重试'
  } finally {
    groupActionLoading.value = false
  }
}

function requestRemoveMember(userId: string) {
  if (!isGroupOwner.value || userId === props.currentUserId) return
  pendingGroupAction.value = { kind: 'remove', userId }
  groupActionError.value = ''
  groupActionNotice.value = ''
}

function requestLeaveGroup() {
  if (isGroupOwner.value || !selectedGroupId.value) return
  pendingGroupAction.value = { kind: 'leave' }
  groupActionError.value = ''
  groupActionNotice.value = ''
}

function requestDissolveGroup() {
  if (!isGroupOwner.value || !selectedGroupId.value) return
  pendingGroupAction.value = { kind: 'dissolve' }
  groupActionError.value = ''
  groupActionNotice.value = ''
}

function cancelGroupAction() {
  if (groupActionLoading.value) return
  pendingGroupAction.value = null
  groupActionError.value = ''
}

async function confirmGroupAction() {
  const action = pendingGroupAction.value
  const groupId = selectedGroupId.value
  if (!action || !groupId || groupActionLoading.value) return
  groupActionLoading.value = true
  groupActionError.value = ''
  groupActionNotice.value = ''
  try {
    if (action.kind === 'remove' && action.userId) {
      await groupApi.manageMembers(groupId, [action.userId], 0)
      groupActionNotice.value = '已将成员移出群聊'
    } else if (action.kind === 'leave') {
      await groupApi.leaveGroup(groupId)
      groupActionNotice.value = '已退出群聊'
    } else if (action.kind === 'dissolve') {
      await groupApi.dissolveGroup(groupId)
      groupActionNotice.value = '群聊已解散'
    }
    pendingGroupAction.value = null
    emit('groupChanged')
    await refreshSelectedGroup()
  } catch (error: unknown) {
    groupActionError.value = error instanceof Error ? error.message : '群聊操作失败，请稍后重试'
  } finally {
    groupActionLoading.value = false
  }
}

async function refreshSelectedGroup() {
  const groupId = selectedGroupId.value
  await loadGroups()
  const group = groups.value.find((item) => item.groupId === groupId)
  if (group) {
    await viewGroup(group)
  } else {
    selectedGroupId.value = ''
    groupInfo.value = null
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
          :disabled="loading || creatingGroup || systemSettingsStore.loading || !canCreateGroup"
          @click="toggleCreateForm"
        >
          {{ createFormOpen ? '收起创建表单' : canCreateGroup ? '创建群聊' : '已达创建上限' }}
        </button>
        <button class="icon-button profile-close" type="button" aria-label="关闭群聊列表" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="!canCreateGroup" class="contact-status" data-testid="group-create-limit" role="status">
        已创建 {{ ownedGroupCount }} / {{ maxGroupCount }} 个群聊
      </p>

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
            <AvatarThumbnail
              class="group-directory-avatar"
              :file-id="group.groupId"
              :fallback="(group.groupName || group.groupId).slice(0, 1)"
              :refresh-key="avatarRevision"
            />
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
          <AvatarThumbnail
            v-if="groupProfile"
            class="profile-cover-thumbnail"
            :file-id="groupProfile.groupId"
            :show-cover="true"
            :refresh-key="avatarRevision"
            test-id="group-profile-cover"
          />
          <AvatarThumbnail
            v-if="groupProfile"
            class="contact-profile-avatar"
            :file-id="groupProfile.groupId"
            :fallback="groupProfile.groupName.slice(0, 1)"
            :refresh-key="avatarRevision"
          />
          <dl v-if="groupProfile" class="contact-profile-details">
            <div><dt>群名称</dt><dd>{{ groupProfile.groupName }}</dd></div>
            <div><dt>群编号</dt><dd>{{ groupProfile.groupId }}</dd></div>
            <div><dt>群主编号</dt><dd>{{ groupProfile.groupOwnId }}</dd></div>
            <div><dt>成员</dt><dd>{{ groupProfile.memberCount ?? groupMembers.length }} 人</dd></div>
            <div><dt>加入方式</dt><dd>{{ groupProfile.joinType === 0 ? '无需审核' : '需要审核' }}</dd></div>
            <div><dt>创建日期</dt><dd>{{ formatGroupTime(groupProfile.createTime) }}</dd></div>
            <div class="group-notice-row"><dt>群公告</dt><dd>{{ groupProfile.groupNotice || '暂无公告' }}</dd></div>
          </dl>
          <p v-if="editNotice" class="contact-notice" role="status">{{ editNotice }}</p>
          <p v-if="editError" class="contact-error" role="alert">{{ editError }}</p>
          <form v-if="editGroupOpen" class="group-create-form" data-testid="edit-group-form" @submit.prevent="updateGroup">
            <label for="edit-group-name">群名称</label>
            <input id="edit-group-name" v-model="editForm.groupName" data-testid="edit-group-name" maxlength="32" :disabled="editingGroup" />
            <label for="edit-group-notice">群公告</label>
            <textarea
              id="edit-group-notice"
              v-model="editForm.groupNotice"
              data-testid="edit-group-notice"
              maxlength="500"
              rows="3"
              :disabled="editingGroup"
            ></textarea>
            <label for="edit-group-join-type">加入方式</label>
            <select id="edit-group-join-type" v-model.number="editForm.joinType" data-testid="edit-group-join-type" :disabled="editingGroup">
              <option :value="0">无需审核</option>
              <option :value="1">需要群主同意</option>
            </select>
            <label for="edit-group-avatar">更换群头像（可选 PNG）</label>
            <input
              id="edit-group-avatar"
              ref="editAvatarInput"
              data-testid="edit-group-avatar"
              type="file"
              accept="image/png,.png"
              :disabled="editingGroup"
              @change="selectEditAvatar"
            />
            <p v-if="editAvatarFile" class="group-avatar-selected">已选择：{{ editAvatarFile.name }}</p>
            <div class="group-member-picker-actions">
              <button type="button" :disabled="editingGroup" @click="editGroupOpen = false">取消</button>
              <button class="contact-confirm-button" data-testid="save-group-changes" type="submit" :disabled="editingGroup">
                {{ editingGroup ? '正在保存…' : '保存群资料' }}
              </button>
            </div>
          </form>
          <section v-if="groupInfo" class="group-members-section" aria-label="群成员">
            <header>
              <strong>群成员</strong>
              <span>{{ groupMembers.length }} / {{ groupProfile?.memberCount || groupMembers.length }}</span>
            </header>
            <div v-for="member in groupMembers" :key="member.userId" class="group-member-row">
              <AvatarThumbnail
                class="group-member-avatar"
                :file-id="member.userId"
                :fallback="(member.contactName || member.userId).slice(0, 1)"
              />
              <span class="group-member-copy">
                <strong>{{ member.contactName || member.userId }}</strong>
                <small>{{ member.userId }}</small>
              </span>
              <span v-if="member.userId === groupProfile?.groupOwnId" class="group-owner-badge">群主</span>
              <button
                v-if="isGroupOwner && member.userId !== props.currentUserId"
                class="group-member-remove"
                :data-testid="`remove-group-member-${member.userId}`"
                type="button"
                @click="requestRemoveMember(member.userId)"
              >移出</button>
            </div>
          </section>

          <p v-if="groupActionNotice" class="contact-notice" role="status">{{ groupActionNotice }}</p>
          <p v-if="groupActionError" class="contact-error" role="alert">{{ groupActionError }}</p>

          <div v-if="isGroupOwner" class="group-management-actions">
            <button type="button" data-testid="open-edit-group" @click="openEditGroup">编辑群资料</button>
            <button type="button" data-testid="open-add-group-members" @click="openMemberPicker">添加成员</button>
            <button type="button" class="is-danger" data-testid="request-dissolve-group" @click="requestDissolveGroup">
              解散群聊
            </button>
          </div>
          <button v-else class="group-leave-button" data-testid="request-leave-group" type="button" @click="requestLeaveGroup">
            退出群聊
          </button>

          <section v-if="addMemberOpen" class="group-member-picker" data-testid="group-member-picker">
            <header>
              <strong>添加好友进群</strong>
              <span>当前 {{ currentGroupMemberCount }} / {{ maxGroupMemberCount }} 人，还可添加 {{ memberSlotsRemaining }} 人</span>
            </header>
            <p v-if="friendsLoading" class="contact-status" role="status">正在读取好友列表…</p>
            <p v-else-if="availableFriends.length === 0" class="contact-empty">没有可添加的好友</p>
            <label v-for="friend in availableFriends" :key="friend.contactId" class="group-friend-option">
              <input
                v-model="selectedMemberIds"
                type="checkbox"
                :value="friend.contactId"
                :disabled="memberSlotsRemaining === 0 || (selectedMemberIds.length >= memberSlotsRemaining && !selectedMemberIds.includes(friend.contactId))"
              />
              <span>{{ friend.contactName || friend.contactId }}</span>
              <small>{{ friend.contactId }}</small>
            </label>
            <div class="group-member-picker-actions">
              <button type="button" :disabled="groupActionLoading" @click="addMemberOpen = false">取消</button>
              <button
                class="contact-confirm-button"
                data-testid="confirm-add-group-members"
                type="button"
                :disabled="friendsLoading || groupActionLoading || selectedMemberIds.length === 0"
                @click="addSelectedMembers"
              >
                {{ groupActionLoading ? '正在添加…' : `添加所选 (${selectedMemberIds.length})` }}
              </button>
            </div>
          </section>

          <section v-if="pendingGroupAction" class="group-action-confirm" data-testid="group-action-confirm">
            <p>
              {{ pendingGroupAction.kind === 'remove'
                ? `确认将成员 ${pendingGroupAction.userId} 移出群聊？`
                : pendingGroupAction.kind === 'leave'
                  ? '确认退出这个群聊？'
                  : '确认解散群聊？群成员将无法继续访问。' }}
            </p>
            <button
              class="contact-confirm-button"
              data-testid="confirm-group-action"
              type="button"
              :disabled="groupActionLoading"
              @click="confirmGroupAction"
            >{{ groupActionLoading ? '处理中…' : '确认' }}</button>
            <button type="button" :disabled="groupActionLoading" @click="cancelGroupAction">取消</button>
          </section>
        </section>
      </div>
    </section>
  </div>
</template>
