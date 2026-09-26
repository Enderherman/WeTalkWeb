<script setup lang="ts">
import { computed, ref } from 'vue'
import { contactApi, type ContactSearchResult } from '@/api/contacts'

const props = defineProps<{
  currentUserId: string
  displayName: string
}>()

const emit = defineEmits<{
  close: []
  contactAdded: []
}>()

const query = ref('')
const applyInfo = ref('')
const result = ref<ContactSearchResult | null>(null)
const searched = ref(false)
const searching = ref(false)
const applying = ref(false)
const requestSent = ref(false)
const searchError = ref('')
const applyError = ref('')
const notice = ref('')

const canApply = computed(() => {
  const contact = result.value
  if (!contact || contact.contactType !== 'USER' || contact.contactId === props.currentUserId) return false
  return !requestSent.value && ![1, 4, 5, 7].includes(contact.status ?? -1)
})

const relationshipLabel = computed(() => {
  const contact = result.value
  if (!contact) return ''
  if (contact.contactType !== 'USER') return '目前仅支持搜索用户'
  if (contact.contactId === props.currentUserId || contact.status === 1) return '已经是好友'
  if (contact.status === 4) return '你已将该用户加入黑名单'
  if (contact.status === 5 || contact.status === 7) return '该用户暂时无法接收你的申请'
  return contact.statusName || '尚未添加'
})

function resetSearchResult() {
  result.value = null
  searched.value = false
  requestSent.value = false
  searchError.value = ''
  applyError.value = ''
  notice.value = ''
}

async function searchContact() {
  const contactId = query.value.trim()
  result.value = null
  searched.value = false
  requestSent.value = false
  notice.value = ''
  applyError.value = ''
  searchError.value = ''

  if (!contactId) {
    searchError.value = '请输入用户编号'
    return
  }
  if (!contactId.startsWith('U')) {
    searchError.value = '请输入以 U 开头的用户编号'
    return
  }

  searching.value = true
  try {
    result.value = await contactApi.search(contactId)
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
      notice.value = '已直接添加为好友，会话正在同步'
      result.value = { ...contact, status: 1, statusName: '好友' }
      emit('contactAdded')
    } else {
      notice.value = '好友申请已发送，等待对方处理'
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-search-title"
      @keydown.esc.stop.prevent="emit('close')"
    >
      <header class="profile-dialog-header">
        <div>
          <p class="eyebrow">联系人</p>
          <h2 id="contact-search-title">添加好友</h2>
        </div>
        <button class="icon-button profile-close" type="button" aria-label="关闭添加好友" @click="emit('close')">
          ×
        </button>
      </header>

      <form class="contact-search-form" data-testid="contact-search-form" @submit.prevent="searchContact">
        <label for="contact-id-search">用户编号</label>
        <div class="contact-search-row">
          <input
            id="contact-id-search"
            v-model="query"
            data-testid="contact-id-search"
            autocomplete="off"
            placeholder="输入以 U 开头的用户编号"
            :disabled="searching || applying"
            @input="resetSearchResult"
          />
          <button class="contact-search-button" data-testid="search-contact" type="submit" :disabled="searching || applying">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>
        <p v-if="searchError" class="contact-error" role="alert">{{ searchError }}</p>
      </form>

      <p v-if="searching" class="contact-status" role="status">正在搜索用户…</p>
      <p v-else-if="searched && !result" class="contact-empty" data-testid="contact-not-found">
        没有找到这个用户，请检查编号后重试。
      </p>

      <section v-if="result" class="contact-result" data-testid="contact-result" aria-label="搜索结果">
        <div class="contact-result-heading">
          <span class="contact-result-avatar" aria-hidden="true">
            {{ (result.nickName || result.contactId).slice(0, 1) }}
          </span>
          <div class="contact-result-copy">
            <strong>{{ result.nickName || 'WeTalk 用户' }}</strong>
            <span>{{ result.contactId }}</span>
          </div>
          <span class="contact-relationship">{{ relationshipLabel }}</span>
        </div>
        <p v-if="result.areaName" class="contact-area">{{ result.areaName }}</p>

        <form v-if="canApply" class="contact-request-form" data-testid="contact-request-form" @submit.prevent="sendRequest">
          <label for="contact-apply-info">验证消息（可选）</label>
          <textarea
            id="contact-apply-info"
            v-model="applyInfo"
            data-testid="contact-apply-info"
            rows="3"
            maxlength="100"
            :placeholder="`你好，我是${displayName}`"
          ></textarea>
          <p v-if="applyError" class="contact-error" role="alert">{{ applyError }}</p>
          <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
          <button class="contact-submit-button" data-testid="send-contact-request" type="submit" :disabled="applying">
            {{ applying ? '正在发送…' : '发送好友申请' }}
          </button>
        </form>
        <p v-else-if="notice" class="contact-notice" role="status">{{ notice }}</p>
      </section>
    </section>
  </div>
</template>
