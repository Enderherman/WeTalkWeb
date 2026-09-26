<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { contactApi, type ContactApplication } from '@/api/contacts'

const emit = defineEmits<{
  close: []
  applicationHandled: []
}>()

const applications = ref<ContactApplication[]>([])
const pageNo = ref(1)
const pageTotal = ref(0)
const totalCount = ref(0)
const loading = ref(true)
const pageError = ref('')
const actionError = ref('')
const notice = ref('')
const handlingId = ref<number | null>(null)

onMounted(() => void loadPage(1))

async function loadPage(targetPage: number) {
  loading.value = true
  pageError.value = ''
  actionError.value = ''
  try {
    const result = await contactApi.loadApplications(targetPage)
    applications.value = result.list || []
    pageNo.value = result.pageNo || targetPage
    pageTotal.value = result.pageTotal || 0
    totalCount.value = result.totalCount || 0
  } catch (error: unknown) {
    pageError.value = error instanceof Error ? error.message : '好友申请暂时无法读取'
  } finally {
    loading.value = false
  }
}

async function handleApplication(application: ContactApplication, status: 1 | 2 | 3) {
  if (handlingId.value !== null) return
  handlingId.value = application.applyId
  actionError.value = ''
  notice.value = ''
  try {
    await contactApi.handleApplication(application.applyId, status)
    const isGroupApplication = application.contactType === 1
    notice.value = status === 1
      ? (isGroupApplication ? '已同意入群申请' : '已同意好友申请')
      : status === 2
        ? (isGroupApplication ? '已拒绝入群申请' : '已拒绝好友申请')
        : '已将申请人加入黑名单'
    emit('applicationHandled')
    const nextPage = applications.value.length === 1 && pageNo.value > 1 ? pageNo.value - 1 : pageNo.value
    await loadPage(nextPage)
  } catch (error: unknown) {
    actionError.value = error instanceof Error ? error.message : '处理申请失败，请稍后重试'
  } finally {
    handlingId.value = null
  }
}

function formatApplyTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
}
</script>

<template>
  <div class="profile-overlay" data-testid="contact-applications-overlay" @click.self="emit('close')">
    <section
      class="profile-dialog applications-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-applications-title"
      @keydown.esc.stop.prevent="emit('close')"
    >
      <header class="profile-dialog-header">
        <div>
          <p class="eyebrow">联系人</p>
          <h2 id="contact-applications-title">好友申请</h2>
        </div>
        <button class="icon-button profile-close" type="button" aria-label="关闭好友申请" @click="emit('close')">
          ×
        </button>
      </header>

      <div class="applications-summary">
        <span>申请记录</span>
        <strong>{{ totalCount }}</strong>
      </div>

      <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
      <p v-if="pageError" class="contact-error" role="alert">{{ pageError }}</p>
      <p v-if="actionError" class="contact-error" role="alert">{{ actionError }}</p>
      <p v-if="loading" class="contact-status" role="status">正在读取好友申请…</p>
      <p v-else-if="!pageError && applications.length === 0" class="contact-empty" data-testid="applications-empty">
        暂无申请记录。
      </p>

      <div v-else-if="!pageError && applications.length > 0" class="contact-applications-list" data-testid="contact-applications-list">
        <article
          v-for="application in applications"
          :key="application.applyId"
          class="contact-application-card"
          :data-testid="`application-${application.applyId}`"
        >
          <div class="contact-application-heading">
            <span class="contact-result-avatar" aria-hidden="true">
              {{ (application.contactName || application.applyUserId).slice(0, 1) }}
            </span>
            <div class="contact-result-copy">
              <strong>{{ application.contactName || application.applyUserId }}</strong>
              <span>{{ application.applyUserId }} · {{ application.contactType === 1 ? '群聊申请' : '好友申请' }}</span>
            </div>
          </div>
          <p class="contact-application-message">{{ application.applyInfo || '未填写验证消息' }}</p>
          <time class="contact-application-time" :datetime="new Date(application.lastApplyTime).toISOString()">
            {{ formatApplyTime(application.lastApplyTime) }}
          </time>
          <div v-if="application.status === 0" class="contact-application-actions">
            <button
              class="contact-application-button is-primary"
              data-testid="accept-application"
              type="button"
              :disabled="handlingId !== null"
              @click="handleApplication(application, 1)"
            >
              {{ handlingId === application.applyId ? '处理中…' : '同意' }}
            </button>
            <button
              class="contact-application-button"
              data-testid="reject-application"
              type="button"
              :disabled="handlingId !== null"
              @click="handleApplication(application, 2)"
            >拒绝</button>
            <button
              class="contact-application-button is-danger"
              data-testid="block-application"
              type="button"
              :disabled="handlingId !== null"
              @click="handleApplication(application, 3)"
            >拉黑</button>
          </div>
          <span v-else class="contact-application-status" data-testid="application-status">
            {{ application.statusName || '已处理' }}
          </span>
        </article>
      </div>

      <footer v-if="pageTotal > 1" class="applications-pagination">
        <button type="button" :disabled="loading || pageNo <= 1" @click="loadPage(pageNo - 1)">上一页</button>
        <span>第 {{ pageNo }} / {{ pageTotal }} 页</span>
        <button type="button" :disabled="loading || pageNo >= pageTotal" @click="loadPage(pageNo + 1)">下一页</button>
      </footer>
    </section>
  </div>
</template>
