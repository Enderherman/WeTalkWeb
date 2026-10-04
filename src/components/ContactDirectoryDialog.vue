<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { contactApi, type ContactProfile, type UserContactEntry } from '@/api/contacts'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'
import { useDialogFocus } from '@/composables/useDialogFocus'

const props = defineProps<{ returnFocusTarget?: HTMLElement | null; refreshKey?: number; remarks?: Record<string, string> }>()
const emit = defineEmits<{
  close: []
  contactsChanged: []
  remarkSaved: [contactId: string, remark: string]
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
const filter = ref('')
const remarkDraft = ref('')
const remarkDirty = ref(false)
const savingRemark = ref(false)
const { dialog, trapFocus } = useDialogFocus('.profile-close', props.returnFocusTarget)
const pendingAction = ref<{ contactId: string; action: ContactAction } | null>(null)
let profileRequestId = 0

const selectedContact = computed(() => contacts.value.find((item) => item.contactId === selectedId.value) || null)
const filteredContacts = computed(() => {
  const query = filter.value.trim().toLocaleLowerCase()
  return contacts.value.filter((contact) => [contact.contactName, contact.contactId, contactRemark(contact.contactId, contact.remark)]
    .some((value) => (value || '').toLocaleLowerCase().includes(query)))
})

function contactRemark(contactId: string, fallback?: string | null) {
  return props.remarks?.[contactId] ?? fallback ?? ''
}

watch(() => props.remarks, () => {
  if (!remarkDirty.value && selectedId.value) remarkDraft.value = contactRemark(selectedId.value, selectedProfile.value?.remark)
}, { deep: true })

onMounted(() => void loadContacts())
watch(() => props.refreshKey, () => void loadContacts())

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
  if (savingRemark.value) return
  selectedId.value = contact.contactId
  remarkDraft.value = contactRemark(contact.contactId, contact.remark)
  remarkDirty.value = false
  selectedProfile.value = null
  profileError.value = ''
  profileLoading.value = true
  const requestId = ++profileRequestId
  try {
    const profile = await contactApi.getContactUserInfo(contact.contactId)
    if (requestId === profileRequestId && selectedId.value === contact.contactId) {
      selectedProfile.value = profile
      if (!remarkDirty.value) remarkDraft.value = contactRemark(contact.contactId, profile.remark)
    }
  } catch (error: unknown) {
    if (requestId === profileRequestId) profileError.value = error instanceof Error ? error.message : '好友资料暂时无法读取'
  } finally {
    if (requestId === profileRequestId) profileLoading.value = false
  }
}

async function saveRemark() {
  const contactId = selectedId.value
  if (!contactId || selectedContact.value?.status !== 1 || savingRemark.value) return
  const remark = remarkDraft.value.trim()
  if (remark.length > 40) { actionError.value = '备注不能超过 40 个字符'; return }
  savingRemark.value = true
  actionError.value = ''
  notice.value = ''
  try {
    const saved = await contactApi.saveRemark(contactId, remark)
    contacts.value = contacts.value.map((contact) => contact.contactId === saved.contactId ? { ...contact, remark: saved.remark } : contact)
    if (selectedProfile.value?.userId === saved.contactId) selectedProfile.value = { ...selectedProfile.value, remark: saved.remark }
    remarkDraft.value = saved.remark
    remarkDirty.value = false
    emit('remarkSaved', saved.contactId, saved.remark)
    notice.value = saved.remark ? '备注已保存，仅自己可见' : '备注已清除'
  } catch (error: unknown) {
    actionError.value = error instanceof Error ? error.message : '备注保存失败，请重试'
  } finally { savingRemark.value = false }
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
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-directory-title"
      tabindex="-1"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown.tab="trapFocus"
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
      <label for="contact-directory-filter">查找好友</label>
      <input id="contact-directory-filter" v-model="filter" data-testid="contact-directory-filter" placeholder="昵称、备注或编号" type="search" />
      <p v-if="loadError" class="contact-error" role="alert">{{ loadError }}</p>
      <p v-if="actionError" class="contact-error" role="alert">{{ actionError }}</p>
      <p v-if="loading" class="contact-status" role="status">正在读取联系人…</p>
      <p v-else-if="!loadError && contacts.length === 0" class="contact-empty" data-testid="contacts-empty">
        还没有联系人，可以先搜索并添加好友。
      </p>

      <div v-else-if="!loadError && contacts.length > 0" class="contact-directory-layout">
        <div class="contact-directory-list" data-testid="contact-directory-list">
          <p v-if="!filteredContacts.length" class="contact-empty">没有匹配的好友。</p>
          <article
            v-for="contact in filteredContacts"
            :key="contact.contactId"
            class="contact-directory-card"
            :class="{ 'is-selected': contact.contactId === selectedId }"
            :data-testid="`contact-${contact.contactId}`"
          >
            <button class="contact-directory-select" type="button" @click="viewContact(contact)">
              <AvatarThumbnail
                class="contact-result-avatar"
                :file-id="contact.contactId"
                :fallback="(contactRemark(contact.contactId, contact.remark) || contact.contactName || contact.contactId).slice(0, 1)"
              />
              <span class="contact-result-copy">
                <strong>{{ contactRemark(contact.contactId, contact.remark) || contact.contactName || contact.contactId }}</strong>
                <span v-if="contactRemark(contact.contactId, contact.remark)">昵称：{{ contact.contactName || contact.contactId }}</span>
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
          <form v-if="selectedProfile && selectedContact?.status === 1" class="profile-edit-form" data-testid="contact-remark-form" @submit.prevent="saveRemark">
            <label for="contact-remark">好友备注（仅自己可见）</label>
            <input id="contact-remark" v-model="remarkDraft" data-testid="contact-remark" maxlength="40" :disabled="savingRemark" placeholder="留空可清除备注" @input="remarkDirty = true" />
            <button class="password-submit" type="submit" :disabled="savingRemark">{{ savingRemark ? '正在保存…' : '保存备注' }}</button>
          </form>
        </section>
      </div>
    </section>
  </div>
</template>
