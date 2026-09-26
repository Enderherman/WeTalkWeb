<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { contactApi, type ContactProfile, type UserContactEntry } from '@/api/contacts'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'

const emit = defineEmits<{
  close: []
  contactsChanged: []
}>()

type ContactAction = 'delete' | 'block'

const contacts = ref<UserContactEntry[]>([])
const selectedId = ref('')
const selectedProfile = ref<ContactProfile | null>(null)
const loading = ref(true)
const profileLoading = ref(false)
const actionLoading = ref(false)
const loadError = ref('')
const profileError = ref('')
const actionError = ref('')
const notice = ref('')
const pendingAction = ref<{ contactId: string; action: ContactAction } | null>(null)
let profileRequestId = 0

const selectedContact = computed(() => contacts.value.find((item) => item.contactId === selectedId.value) || null)

onMounted(() => void loadContacts())

async function loadContacts() {
  loading.value = true
  loadError.value = ''
  try {
    contacts.value = await contactApi.loadContacts('USER')
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : '联系人列表暂时无法读取'
  } finally {
    loading.value = false
  }
}

async function viewContact(contact: UserContactEntry) {
  selectedId.value = contact.contactId
  selectedProfile.value = null
  profileError.value = ''
  profileLoading.value = true
  const requestId = ++profileRequestId
  try {
    const profile = await contactApi.getContactUserInfo(contact.contactId)
    if (requestId === profileRequestId && selectedId.value === contact.contactId) selectedProfile.value = profile
  } catch (error: unknown) {
    if (requestId === profileRequestId) profileError.value = error instanceof Error ? error.message : '好友资料暂时无法读取'
  } finally {
    if (requestId === profileRequestId) profileLoading.value = false
  }
}

function requestAction(contactId: string, action: ContactAction) {
  pendingAction.value = { contactId, action }
  actionError.value = ''
  notice.value = ''
}

async function confirmAction() {
  const action = pendingAction.value
  if (!action || actionLoading.value) return
  actionLoading.value = true
  actionError.value = ''
  try {
    if (action.action === 'delete') await contactApi.deleteContact(action.contactId)
    else await contactApi.blockContact(action.contactId)
    notice.value = action.action === 'delete' ? '已删除好友' : '已将好友加入黑名单'
    pendingAction.value = null
    selectedId.value = ''
    selectedProfile.value = null
    emit('contactsChanged')
    await loadContacts()
  } catch (error: unknown) {
    actionError.value = error instanceof Error ? error.message : '联系人操作失败，请稍后重试'
  } finally {
    actionLoading.value = false
  }
}

function cancelAction() {
  if (actionLoading.value) return
  pendingAction.value = null
  actionError.value = ''
}

function statusLabel(status: number) {
  if (status === 1) return '好友'
  if (status === 3) return '对方已删除你'
  if (status === 5) return '对方已拉黑你'
  return '联系人'
}

function sexLabel(sex?: number | null) {
  if (sex === 0) return '男'
  if (sex === 1) return '女'
  return '未设置'
}
</script>

<template>
  <div class="profile-overlay" data-testid="contact-directory-overlay" @click.self="emit('close')">
    <section
      class="profile-dialog contacts-directory-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-directory-title"
      @keydown.esc.stop.prevent="emit('close')"
    >
      <header class="profile-dialog-header">
        <div>
          <p class="eyebrow">联系人</p>
          <h2 id="contact-directory-title">好友列表</h2>
        </div>
        <button class="icon-button profile-close" type="button" aria-label="关闭联系人" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
      <p v-if="loadError" class="contact-error" role="alert">{{ loadError }}</p>
      <p v-if="actionError" class="contact-error" role="alert">{{ actionError }}</p>
      <p v-if="loading" class="contact-status" role="status">正在读取联系人…</p>
      <p v-else-if="!loadError && contacts.length === 0" class="contact-empty" data-testid="contacts-empty">
        还没有联系人，可以先搜索并添加好友。
      </p>

      <div v-else-if="!loadError && contacts.length > 0" class="contact-directory-layout">
        <div class="contact-directory-list" data-testid="contact-directory-list">
          <article
            v-for="contact in contacts"
            :key="contact.contactId"
            class="contact-directory-card"
            :class="{ 'is-selected': contact.contactId === selectedId }"
            :data-testid="`contact-${contact.contactId}`"
          >
            <button class="contact-directory-select" type="button" @click="viewContact(contact)">
              <AvatarThumbnail
                class="contact-result-avatar"
                :file-id="contact.contactId"
                :fallback="(contact.contactName || contact.contactId).slice(0, 1)"
              />
              <span class="contact-result-copy">
                <strong>{{ contact.contactName || contact.contactId }}</strong>
                <span>{{ contact.contactId }}</span>
              </span>
              <span class="contact-relationship">{{ statusLabel(contact.status) }}</span>
            </button>
            <div v-if="contact.status === 1" class="contact-directory-actions">
              <button type="button" data-testid="delete-contact" @click="requestAction(contact.contactId, 'delete')">删除</button>
              <button type="button" data-testid="block-contact" @click="requestAction(contact.contactId, 'block')">拉黑</button>
            </div>
            <div v-if="pendingAction?.contactId === contact.contactId" class="contact-action-confirm">
              <p>确认{{ pendingAction.action === 'delete' ? '删除' : '拉黑' }}{{ contact.contactName || contact.contactId }}？</p>
              <button
                class="contact-confirm-button"
                data-testid="confirm-contact-action"
                type="button"
                :disabled="actionLoading"
                @click="confirmAction"
              >{{ actionLoading ? '处理中…' : '确认' }}</button>
              <button type="button" :disabled="actionLoading" @click="cancelAction">取消</button>
            </div>
          </article>
        </div>

        <section v-if="selectedId" class="contact-profile-panel" aria-label="联系人资料">
          <p class="eyebrow">联系人资料</p>
          <p v-if="profileLoading" class="contact-status" role="status">正在读取资料…</p>
          <p v-else-if="profileError" class="contact-error" role="alert">{{ profileError }}</p>
          <AvatarThumbnail
            v-if="selectedProfile"
            class="profile-cover-thumbnail"
            :file-id="selectedProfile.userId"
            :show-cover="true"
            :refresh-key="selectedProfile.userId"
            test-id="contact-profile-cover"
          />
          <AvatarThumbnail
            v-if="selectedProfile"
            class="contact-profile-avatar"
            :file-id="selectedProfile.userId"
            :fallback="(selectedProfile.nickName || selectedContact?.contactName || selectedProfile.userId).slice(0, 1)"
          />
          <dl v-if="selectedProfile" class="contact-profile-details">
            <div><dt>昵称</dt><dd>{{ selectedProfile.nickName || selectedContact?.contactName || '—' }}</dd></div>
            <div><dt>账号编号</dt><dd>{{ selectedProfile.userId }}</dd></div>
            <div><dt>性别</dt><dd>{{ sexLabel(selectedProfile.sex) }}</dd></div>
            <div><dt>地区</dt><dd>{{ selectedProfile.areaName || '未设置' }}</dd></div>
            <div><dt>个性签名</dt><dd>{{ selectedProfile.personalSignature || '未填写' }}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  </div>
</template>
