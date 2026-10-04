<script setup lang="ts">
import { computed, ref } from 'vue'
import { contactApi, type ContactSearchResult } from '@/api/contacts'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'
import { useDialogFocus } from '@/composables/useDialogFocus'

const props = defineProps<{
  currentUserId: string
  displayName: string
  returnFocusTarget?: HTMLElement | null
  remarks?: Record<string, string>
}>()

const emit = defineEmits<{
  close: []
  contactAdded: []
}>()

const query = ref('')
const applyInfo = ref('')
const results = ref<ContactSearchResult[]>([])
const selectedContactId = ref('')
const result = computed(() => results.value.find((contact) => contact.contactId === selectedContactId.value) || null)
const searched = ref(false)
const searching = ref(false)
const applying = ref(false)
const requestSent = ref(false)
const searchError = ref('')
const applyError = ref('')
const notice = ref('')
const { dialog, trapFocus } = useDialogFocus('#contact-id-search', props.returnFocusTarget)

function contactName(contact: ContactSearchResult) {
  return (contact.contactType === 'USER' ? props.remarks?.[contact.contactId] ?? contact.remark : '') || contact.nickName || 'WeTalk 用户'
}

const canApply = computed(() => {
  const contact = result.value
  if (!contact || (contact.contactType === 'USER' && contact.contactId === props.currentUserId)) return false
  return !requestSent.value && ![1, 4, 5, 7].includes(contact.status ?? -1)
})

const relationshipLabel = computed(() => {
  const contact = result.value
  if (!contact) return ''
  if (contact.status === 1) return contact.contactType === 'GROUP' ? '已经加入群聊' : '已经是好友'
  if (contact.contactType === 'USER' && contact.contactId === props.currentUserId) return '不能添加自己'
  if (contact.status === 4) return '你已将该用户加入黑名单'
  if (contact.status === 5 || contact.status === 7) return '该用户暂时无法接收你的申请'
  return contact.statusName || (contact.contactType === 'GROUP' ? '尚未加入' : '尚未添加')
})

function resetSearchResult() {
  results.value = []
  selectedContactId.value = ''
  searched.value = false
  requestSent.value = false
  searchError.value = ''
  applyError.value = ''
  notice.value = ''
}

async function searchContact() {
  const keyword = query.value.trim()
  results.value = []
  selectedContactId.value = ''
  searched.value = false
  requestSent.value = false
  notice.value = ''
  applyError.value = ''
  searchError.value = ''

  if (!keyword) {
    searchError.value = '请输入邮箱、用户或群昵称、用户或群编号'
    return
  }

  searching.value = true
  try {
    results.value = await contactApi.searchByKeyword(keyword)
    if (results.value.length === 1) selectedContactId.value = results.value[0]!.contactId
    searched.value = true
  } catch (error: unknown) {
    searchError.value = error instanceof Error ? error.message : '搜索失败，请稍后重试'
  } finally {
    searching.value = false
  }
}

async function sendRequest() {
  const contact = result.value
  if (!contact || !canApply.value || applying.value) return

  applying.value = true
  applyError.value = ''
  notice.value = ''
  try {
    const joinType = await contactApi.applyAdd(contact.contactId, applyInfo.value.trim())
    requestSent.value = true
    if (joinType === 0) {
      notice.value = contact.contactType === 'GROUP' ? '已加入群聊，会话正在同步' : '已直接添加为好友，会话正在同步'
      results.value = results.value.map((item) => item.contactId === contact.contactId
        ? { ...item, status: 1, statusName: contact.contactType === 'GROUP' ? '已加入群聊' : '好友' }
        : item)
      emit('contactAdded')
    } else {
      notice.value = contact.contactType === 'GROUP' ? '入群申请已发送，等待群主处理' : '好友申请已发送，等待对方处理'
    }
  } catch (error: unknown) {
    applyError.value = error instanceof Error ? error.message : '申请发送失败，请稍后重试'
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="profile-overlay" data-testid="contact-search-overlay" @click.self="emit('close')">
    <section
      class="profile-dialog contact-dialog"
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-search-title"
      tabindex="-1"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown.tab="trapFocus"
    >
      <header class="profile-dialog-header">
        <div>
          <p class="eyebrow">联系人</p>
          <h2 id="contact-search-title">添加好友或加入群聊</h2>
        </div>
        <button class="icon-button profile-close" type="button" aria-label="关闭联系人搜索" @click="emit('close')">
          ×
        </button>
      </header>

      <form class="contact-search-form" data-testid="contact-search-form" @submit.prevent="searchContact">
        <label for="contact-id-search">邮箱、昵称或编号</label>
        <div class="contact-search-row">
          <input
            id="contact-id-search"
            v-model="query"
            data-testid="contact-id-search"
            autocomplete="off"
            placeholder="邮箱、用户昵称、群昵称或 U/G 编号"
            :disabled="searching || applying"
            @input="resetSearchResult"
          />
          <button class="contact-search-button" data-testid="search-contact" type="submit" :disabled="searching || applying">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>
        <p v-if="searchError" class="contact-error" role="alert">{{ searchError }}</p>
      </form>

      <p v-if="searching" class="contact-status" role="status">正在搜索…</p>
      <p v-else-if="searched && !results.length" class="contact-empty" data-testid="contact-not-found">
        没有找到匹配的联系人，请检查编号后重试。
      </p>

      <section v-if="results.length > 1" class="contact-search-results" data-testid="contact-search-results" aria-label="匹配的联系人">
        <p class="contact-search-results-label">找到 {{ results.length }} 个匹配项，请选择要添加的联系人：</p>
        <button
          v-for="contact in results"
          :key="contact.contactId"
          class="contact-search-result-option"
          :class="{ 'is-selected': selectedContactId === contact.contactId }"
          :data-testid="`contact-search-option-${contact.contactId}`"
          type="button"
          :aria-pressed="selectedContactId === contact.contactId"
          @click="selectedContactId = contact.contactId"
        >
          <AvatarThumbnail
            class="contact-search-result-avatar"
            :file-id="contact.contactId"
            :fallback="(contact.nickName || contact.contactId).slice(0, 1)"
          />
          <span class="contact-search-result-option-copy">
            <strong>{{ contactName(contact) }}</strong>
            <small v-if="contactName(contact) !== contact.nickName && contact.nickName">昵称：{{ contact.nickName }}</small>
            <small>{{ contact.contactType === 'USER' ? '用户' : '群聊' }} · {{ contact.contactId }}</small>
          </span>
          <span v-if="selectedContactId === contact.contactId" class="contact-search-result-selected" aria-hidden="true">✓</span>
        </button>
      </section>

      <section v-if="result" class="contact-result" data-testid="contact-result" aria-label="搜索结果">
        <div class="contact-result-heading">
          <AvatarThumbnail
            class="contact-result-avatar"
            :file-id="result.contactId"
            :fallback="(result.nickName || result.contactId).slice(0, 1)"
          />
          <div class="contact-result-copy">
            <strong>{{ contactName(result) }}</strong>
            <span v-if="contactName(result) !== result.nickName && result.nickName">昵称：{{ result.nickName }}</span>
            <span>{{ result.contactId }}</span>
          </div>
          <span class="contact-relationship">{{ relationshipLabel }}</span>
        </div>
        <p v-if="result.areaName" class="contact-area">{{ result.areaName }}</p>

        <form v-if="canApply" class="contact-request-form" data-testid="contact-request-form" @submit.prevent="sendRequest">
          <label for="contact-apply-info">
            {{ result.contactType === 'GROUP' ? '入群申请说明（可选）' : '验证消息（可选）' }}
          </label>
          <textarea
            id="contact-apply-info"
            v-model="applyInfo"
            data-testid="contact-apply-info"
            rows="3"
            maxlength="100"
            :placeholder="result.contactType === 'GROUP' ? '我想加入这个群聊' : `你好，我是${displayName}`"
          ></textarea>
          <p v-if="applyError" class="contact-error" role="alert">{{ applyError }}</p>
          <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
          <button class="contact-submit-button" data-testid="send-contact-request" type="submit" :disabled="applying">
            {{ applying ? '正在发送…' : result.contactType === 'GROUP' ? '申请加入群聊' : '发送好友申请' }}
          </button>
        </form>
        <p v-else-if="notice" class="contact-notice" role="status">{{ notice }}</p>
      </section>
    </section>
  </div>
</template>
