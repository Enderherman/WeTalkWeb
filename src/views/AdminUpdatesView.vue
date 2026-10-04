<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { appUpdateApi, type AppRelease } from '@/api/appUpdates'
import { trapDialogTab } from '@/composables/useDialogFocus'

const router = useRouter()
const releases = ref<AppRelease[]>([])
const pageNo = ref(1)
const pageTotal = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const mode = ref<'edit' | 'publish' | 'delete' | null>(null)
const selected = ref<AppRelease | null>(null)
const dialog = ref<HTMLElement | null>(null)
const formError = ref('')
const form = reactive({ version: '', description: '', fileType: 0 as 0 | 1, outerLink: '', file: null as File | null })
const publication = reactive({ status: 2 as 0 | 1 | 2, users: '' })
const statusNames = ['草稿', '灰度发布', '全网发布']
let opener: HTMLElement | null = null
let requestId = 0

onMounted(() => void loadReleases())
onUnmounted(() => { requestId += 1 })

async function loadReleases() {
  const request = ++requestId
  loading.value = true
  error.value = ''
  try {
    const page = await appUpdateApi.loadReleases(pageNo.value)
    if (request !== requestId) return
    releases.value = page.list || []
    totalCount.value = page.totalCount
    pageTotal.value = page.pageTotal
  } catch (reason) {
    if (request === requestId) error.value = reason instanceof Error ? reason.message : '版本列表读取失败，请重试'
  } finally {
    if (request === requestId) loading.value = false
  }
}

function changePage(next: number) {
  if (loading.value || next < 1 || next > pageTotal.value) return
  pageNo.value = next
  void loadReleases()
}

function openDialog(nextMode: NonNullable<typeof mode.value>, release: AppRelease | null, event: MouseEvent) {
  if (busy.value || (nextMode !== 'publish' && release && release.status !== 0)) return
  opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  selected.value = release
  mode.value = nextMode
  formError.value = ''
  Object.assign(form, {
    version: release?.version || '', description: (release?.updateDesc || '').split('|').join('\n'),
    fileType: release?.fileType ?? 0, outerLink: release?.outerLink || '', file: null,
  })
  publication.status = release?.status === 1 ? 1 : 2
  publication.users = release?.grayscaleUid || ''
  void nextTick(() => dialog.value?.querySelector<HTMLElement>('input, select, button')?.focus())
}

function closeDialog() {
  if (busy.value) return
  mode.value = null
  void nextTick(() => { if (opener?.isConnected) opener.focus(); opener = null })
}

function selectFile(event: Event) {
  form.file = (event.target as HTMLInputElement).files?.[0] || null
}

function validateRelease() {
  if (!/^\d+(\.\d+){2}$/.test(form.version.trim()) || form.version.trim().length > 10) return '请输入三段数字版本号，如 1.10.0，最多 10 个字符'
  const description = form.description.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('|')
  if (!description || description.length > 500) return '更新说明不能为空，最多 500 个字符'
  if (form.fileType === 1) {
    try {
      const url = new URL(form.outerLink.trim())
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || form.outerLink.trim().length > 200) throw new Error()
    } catch { return '请输入有效的 HTTP 或 HTTPS 外链，最多 200 个字符' }
  } else {
    if (!form.file && (!selected.value || selected.value.fileType !== 0)) return '请选择 Windows 安装包（.exe）'
    if (form.file && (!/\.exe$/i.test(form.file.name) || form.file.size === 0 || form.file.size > 500 * 1024 * 1024)) return '安装包须为非空 .exe 文件，最大 500 MiB'
  }
  return ''
}

async function submit() {
  if (busy.value) return
  formError.value = ''
  if (mode.value === 'edit') formError.value = validateRelease()
  const users = [...new Set(publication.users.split(/[\s,，]+/).filter(Boolean))]
  if (mode.value === 'publish' && publication.status === 1 &&
      (!users.length || users.some(user => !/^U\d{11}$/.test(user)) || users.join(',').length > 1000)) {
    formError.value = '灰度账号须为 U 开头的 11 位数字用户编号，用逗号或换行分隔，总长度不超过 1000'
  }
  if (formError.value) return
  busy.value = true
  notice.value = ''
  try {
    if (mode.value === 'edit') {
      await appUpdateApi.saveRelease({
        ...(selected.value ? { id: selected.value.id } : {}), version: form.version.trim(),
        updateDesc: form.description.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('|'),
        fileType: form.fileType, outerLink: form.fileType === 1 ? form.outerLink.trim() : '',
        ...(form.fileType === 0 && form.file ? { file: form.file } : {}),
      })
      notice.value = '版本草稿已保存'
      if (!selected.value) pageNo.value = 1
    } else if (mode.value === 'publish' && selected.value) {
      await appUpdateApi.publishRelease(selected.value.id, publication.status, users.join(','))
      notice.value = `版本 ${selected.value.version} 已${publication.status === 0 ? '撤回为草稿' : statusNames[publication.status]}`
    } else if (mode.value === 'delete' && selected.value) {
      await appUpdateApi.deleteRelease(selected.value.id)
      notice.value = '版本草稿已删除'
      if (releases.value.length === 1 && pageNo.value > 1) pageNo.value -= 1
    }
    busy.value = false
    closeDialog()
    await loadReleases()
  } catch (reason) {
    formError.value = reason instanceof Error ? reason.message : '操作失败，请重试'
  } finally { busy.value = false }
}
</script>

<template>
  <main class="admin-users-page admin-updates-page">
    <header class="admin-users-header">
      <div><p class="eyebrow">WeTalk 管理</p><h1>版本发布</h1><p>{{ totalCount }} 个版本 · 管理桌面安装包和版本说明</p></div>
      <div class="admin-page-links">
        <button class="about-back-button" type="button" @click="router.push({ name: 'admin-users' })">用户管理</button>
        <button class="about-back-button" type="button" @click="router.push({ name: 'admin-groups' })">群聊管理</button>
        <button class="about-back-button" type="button" @click="router.push({ name: 'admin-settings' })">系统设置</button>
        <button class="about-back-button" type="button" @click="router.push({ name: 'admin-beauty-accounts' })">靓号管理</button>
        <button class="about-back-button" type="button" @click="router.push({ name: 'chat' })">返回聊天</button>
      </div>
    </header>
    <div class="release-toolbar">
      <button type="button" data-testid="create-release" @click="openDialog('edit', null, $event)">新增版本</button>
      <button type="button" :disabled="loading" data-testid="refresh-releases" @click="loadReleases">{{ loading ? '读取中…' : '刷新列表' }}</button>
    </div>
    <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="contact-error" role="alert">{{ error }}</p>
    <p v-if="!loading && !error && !releases.length" class="contact-empty">暂无版本，新增后可保存草稿，再选择发布范围。</p>
    <div class="release-list" :aria-busy="loading">
      <article v-for="release in releases" :key="release.id" class="release-card" :data-testid="`release-${release.id}`">
        <header><h2>{{ release.version }}</h2><span class="admin-status-pill">{{ statusNames[release.status] }}</span></header>
        <p>{{ release.fileType === 0 ? 'Windows 安装包' : '外链' }} · {{ release.createTime }}</p>
        <ul><li v-for="(line, index) in (release.updateDescArray || release.updateDesc.split('|'))" :key="index">{{ line }}</li></ul>
        <p v-if="release.fileType === 1" class="release-url">{{ release.outerLink }}</p>
        <p v-if="release.status === 1" class="release-url">灰度账号：{{ release.grayscaleUid }}</p>
        <div class="release-toolbar">
          <button v-if="release.status === 0" type="button" :data-testid="`edit-release-${release.id}`" @click="openDialog('edit', release, $event)">编辑草稿</button>
          <button type="button" :data-testid="`publish-release-${release.id}`" @click="openDialog('publish', release, $event)">发布设置</button>
          <button v-if="release.status === 0" type="button" :data-testid="`delete-release-${release.id}`" @click="openDialog('delete', release, $event)">删除草稿</button>
        </div>
      </article>
    </div>
    <nav v-if="pageTotal > 1" class="admin-pagination" aria-label="版本列表分页">
      <button type="button" data-testid="release-previous" :disabled="pageNo <= 1 || loading" @click="changePage(pageNo - 1)">上一页</button>
      <span>第 {{ pageNo }} / {{ pageTotal }} 页</span>
      <button type="button" data-testid="release-next" :disabled="pageNo >= pageTotal || loading" @click="changePage(pageNo + 1)">下一页</button>
    </nav>
    <div v-if="mode" class="profile-overlay" @click.self="closeDialog">
      <section ref="dialog" class="beauty-dialog release-dialog" role="dialog" aria-modal="true" aria-labelledby="release-dialog-title" tabindex="-1"
        @keydown.esc.stop.prevent="closeDialog" @keydown.tab="trapDialogTab($event, dialog)">
        <h2 id="release-dialog-title">{{ mode === 'edit' ? (selected ? '编辑版本草稿' : '新增版本') : mode === 'delete' ? '删除版本草稿' : `发布 ${selected?.version}` }}</h2>
        <form data-testid="release-form" class="release-form" @submit.prevent="submit">
          <fieldset :disabled="busy">
            <template v-if="mode === 'edit'">
              <label>版本号<input v-model="form.version" data-testid="release-version" maxlength="10" placeholder="1.10.0" /></label>
              <label>更新说明<textarea v-model="form.description" data-testid="release-description" rows="5" maxlength="500" placeholder="每行一条更新内容" /></label>
              <label>文件类型<select v-model="form.fileType" data-testid="release-file-type"><option :value="0">Windows 安装包</option><option :value="1">HTTP / HTTPS 外链</option></select></label>
              <label v-if="form.fileType === 1">外链地址<input v-model="form.outerLink" data-testid="release-link" maxlength="200" type="url" /></label>
              <label v-else>安装包<input data-testid="release-file" type="file" accept=".exe" @change="selectFile" /><span v-if="selected?.fileType === 0">不选择文件则保留已有安装包</span></label>
            </template>
            <template v-else-if="mode === 'publish'">
              <label>发布范围<select v-model="publication.status" data-testid="release-status"><option :value="0">撤回为草稿</option><option :value="1">灰度账号可见</option><option :value="2">所有账号可见</option></select></label>
              <label v-if="publication.status === 1">灰度用户编号<textarea v-model="publication.users" data-testid="release-users" rows="4" placeholder="U12345678901，多个编号用逗号或换行分隔" /></label>
              <p>确认后，新版本提示将按此范围提供给登录用户。</p>
            </template>
            <p v-else>确认删除版本 {{ selected?.version }} 的草稿？删除后无法恢复。</p>
          </fieldset>
          <p v-if="formError" class="contact-error" role="alert">{{ formError }}</p>
          <div class="beauty-edit-actions">
            <button type="button" :disabled="busy" data-testid="release-cancel" @click="closeDialog">取消</button>
            <button type="submit" class="password-submit" :disabled="busy" data-testid="release-submit">{{ busy ? '处理中…' : mode === 'edit' ? '保存草稿' : mode === 'delete' ? '确认删除' : '确认发布设置' }}</button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.release-toolbar { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.release-toolbar button { padding: 9px 14px; border: 1px solid var(--wt-border); border-radius: 8px; background: var(--wt-white); cursor: pointer; }
.release-list { display: grid; gap: 16px; }
.release-card { padding: 20px; border: 1px solid var(--wt-border); border-radius: 12px; background: var(--wt-white); min-width: 0; }
.release-card header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.release-card h2 { margin: 0; font-size: 18px; }
.release-card li, .release-url { overflow-wrap: anywhere; }
.release-dialog { max-height: calc(100dvh - 32px); overflow-y: auto; }
.release-form fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 14px; }
.release-form label { display: grid; gap: 7px; }
.release-form input, .release-form textarea, .release-form select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid var(--wt-border); border-radius: 8px; background: var(--wt-white); color: inherit; font: inherit; }
.release-form textarea { resize: vertical; }
</style>
