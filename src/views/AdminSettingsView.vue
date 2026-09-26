<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi, type SystemSettings } from '@/api/admin'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'
import { useSystemSettingsStore } from '@/stores/systemSettings'
import { validateProfileImageUpload } from '@/utils/imageValidation'

const router = useRouter()
const systemSettingsStore = useSystemSettingsStore()
const defaults: SystemSettings = {
  maxGroupCount: 5,
  maxGroupMemberCount: 500,
  maxImageSize: 200,
  maxVideoSize: 500,
  maxFileSize: 5000,
  robotUid: 'Urobot',
  robotNickName: 'WeTalk Robot',
  robotWelcome: '欢迎使用WeTalk Robot!',
}
const settings = reactive<SystemSettings>({ ...defaults })
const robotAvatarFile = ref<File | null>(null)
const robotAvatarCoverFile = ref<File | null>(null)
const robotAvatarInput = ref<HTMLInputElement | null>(null)
const robotAvatarCoverInput = ref<HTMLInputElement | null>(null)
const robotAvatarRevision = ref(0)
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const validationError = ref('')
const robotImageError = ref('')
const saveError = ref('')
const notice = ref('')

onMounted(() => void loadSettings())

async function loadSettings() {
  loading.value = true
  loadError.value = ''
  try {
    const loaded = await adminApi.loadSystemSettings()
    Object.assign(settings, {
      ...defaults,
      ...loaded,
      maxGroupCount: Number(loaded.maxGroupCount),
      maxGroupMemberCount: Number(loaded.maxGroupMemberCount),
      maxImageSize: Number(loaded.maxImageSize),
      maxVideoSize: Number(loaded.maxVideoSize),
      maxFileSize: Number(loaded.maxFileSize),
    })
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : '系统设置暂时无法读取'
  } finally {
    loading.value = false
  }
}

function selectRobotImage(event: Event, kind: 'avatar' | 'cover') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  validationError.value = ''
  robotImageError.value = ''
  saveError.value = ''
  if (kind === 'avatar') robotAvatarFile.value = file
  else robotAvatarCoverFile.value = file
  if (!file) return

  const error = validateProfileImageUpload(file)
  if (error) {
    robotImageError.value = error
    if (kind === 'avatar') robotAvatarFile.value = null
    else robotAvatarCoverFile.value = null
    input.value = ''
  }
}

function validateSettings() {
  const numericFields: Array<[keyof SystemSettings, string]> = [
    ['maxGroupCount', '每人最多创建群组数'],
    ['maxGroupMemberCount', '群组最大成员数'],
    ['maxImageSize', '图片大小上限'],
    ['maxVideoSize', '视频大小上限'],
    ['maxFileSize', '其他文件大小上限'],
  ]
  for (const [field, label] of numericFields) {
    const value = settings[field]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      return `${label}必须是大于 0 的整数`
    }
  }
  if (!settings.robotNickName.trim() || settings.robotNickName.trim().length > 20) {
    return '机器人昵称不能为空，且不能超过 20 个字符'
  }
  if (!settings.robotWelcome.trim() || settings.robotWelcome.length > 300) {
    return '机器人欢迎语不能为空，且不能超过 300 个字符'
  }
  return ''
}

async function saveSettings() {
  if (saving.value || loading.value || loadError.value) return
  if (robotImageError.value) {
    validationError.value = robotImageError.value
    return
  }
  validationError.value = validateSettings()
  if (validationError.value) return

  saving.value = true
  saveError.value = ''
  notice.value = ''
  settings.robotNickName = settings.robotNickName.trim()
  try {
    const uploadedImage = robotAvatarFile.value || robotAvatarCoverFile.value
    await adminApi.saveSystemSettings(
      { ...settings, robotWelcome: settings.robotWelcome.trim() },
      robotAvatarFile.value,
      robotAvatarCoverFile.value,
    )
    systemSettingsStore.setSettings({ ...settings, robotWelcome: settings.robotWelcome.trim() })
    if (uploadedImage) robotAvatarRevision.value += 1
    robotAvatarFile.value = null
    robotAvatarCoverFile.value = null
    if (robotAvatarInput.value) robotAvatarInput.value.value = ''
    if (robotAvatarCoverInput.value) robotAvatarCoverInput.value.value = ''
    notice.value = '系统设置已保存'
  } catch (error: unknown) {
    saveError.value = error instanceof Error ? error.message : '系统设置保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="admin-users-page admin-settings-page">
    <header class="admin-users-header">
      <div>
        <p class="eyebrow">WeTalk 管理</p>
        <h1>系统设置</h1>
        <p>设置群组配额、上传大小和机器人资料</p>
      </div>
      <div class="admin-page-links">
        <button class="about-back-button" data-testid="admin-settings-users" type="button" @click="router.push({ name: 'admin-users' })">用户管理</button>
        <button class="about-back-button" data-testid="admin-settings-groups" type="button" @click="router.push({ name: 'admin-groups' })">群聊管理</button>
        <button class="about-back-button" data-testid="admin-settings-back" type="button" @click="router.push({ name: 'chat' })">返回聊天</button>
      </div>
    </header>

    <p v-if="loading" class="contact-status" role="status">正在读取系统设置…</p>
    <p v-if="loadError" class="contact-error" role="alert">
      {{ loadError }}
      <button type="button" data-testid="retry-load-system-settings" @click="loadSettings">重试</button>
    </p>

    <form v-if="!loadError" class="admin-settings-form" data-testid="admin-settings-form" @submit.prevent="saveSettings">
      <section class="admin-settings-section" aria-labelledby="admin-group-settings-title">
        <div class="admin-settings-section-heading">
          <h2 id="admin-group-settings-title">群组限制</h2>
          <p>设置普通账号可创建的群组数量和单群成员上限。</p>
        </div>
        <div class="admin-settings-grid">
          <label class="admin-settings-field">
            <span>每人最多创建群组数</span>
            <input v-model.number="settings.maxGroupCount" data-testid="setting-max-group-count" type="number" min="1" step="1" required />
          </label>
          <label class="admin-settings-field">
            <span>群组最大成员数</span>
            <input v-model.number="settings.maxGroupMemberCount" data-testid="setting-max-group-members" type="number" min="1" step="1" required />
          </label>
        </div>
      </section>

      <section class="admin-settings-section" aria-labelledby="admin-file-settings-title">
        <div class="admin-settings-section-heading">
          <h2 id="admin-file-settings-title">上传大小限制</h2>
          <p>单位为 MB。服务器的 multipart 限制仍由部署配置决定。</p>
        </div>
        <div class="admin-settings-grid">
          <label class="admin-settings-field">
            <span>图片上限（MB）</span>
            <input v-model.number="settings.maxImageSize" data-testid="setting-max-image-size" type="number" min="1" step="1" required />
          </label>
          <label class="admin-settings-field">
            <span>视频上限（MB）</span>
            <input v-model.number="settings.maxVideoSize" data-testid="setting-max-video-size" type="number" min="1" step="1" required />
          </label>
          <label class="admin-settings-field">
            <span>其他文件上限（MB）</span>
            <input v-model.number="settings.maxFileSize" data-testid="setting-max-file-size" type="number" min="1" step="1" required />
          </label>
        </div>
      </section>

      <section class="admin-settings-section" aria-labelledby="admin-robot-settings-title">
        <div class="admin-settings-section-heading">
          <h2 id="admin-robot-settings-title">机器人资料</h2>
          <p>机器人账号编号固定；头像和封面支持常见图片格式，单张不超过 10 MiB。</p>
        </div>
        <div class="admin-settings-grid">
          <label class="admin-settings-field">
            <span>机器人账号编号</span>
            <input :value="settings.robotUid" data-testid="setting-robot-id" readonly />
          </label>
          <label class="admin-settings-field">
            <span>机器人昵称</span>
            <input v-model="settings.robotNickName" data-testid="setting-robot-name" maxlength="20" required />
          </label>
          <div class="admin-settings-field admin-settings-field-wide">
            <span>机器人头像与封面</span>
            <div class="admin-robot-image-controls">
              <AvatarThumbnail
                class="contact-profile-avatar"
                :file-id="settings.robotUid"
                :fallback="settings.robotNickName.slice(0, 1)"
                :refresh-key="robotAvatarRevision"
                test-id="robot-avatar-preview"
              />
              <AvatarThumbnail
                class="profile-cover-thumbnail"
                :file-id="settings.robotUid"
                :show-cover="true"
                :refresh-key="robotAvatarRevision"
                test-id="robot-cover-preview"
              />
              <div class="admin-robot-image-picker">
                <label for="robot-avatar-file">更新头像</label>
                <input
                  id="robot-avatar-file"
                  ref="robotAvatarInput"
                  data-testid="robot-avatar-file"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
                  :disabled="loading || saving"
                  @change="selectRobotImage($event, 'avatar')"
                />
                <small v-if="robotAvatarFile">已选择：{{ robotAvatarFile.name }}</small>
              </div>
              <div class="admin-robot-image-picker">
                <label for="robot-avatar-cover-file">更新封面</label>
                <input
                  id="robot-avatar-cover-file"
                  ref="robotAvatarCoverInput"
                  data-testid="robot-avatar-cover-file"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
                  :disabled="loading || saving"
                  @change="selectRobotImage($event, 'cover')"
                />
                <small v-if="robotAvatarCoverFile">已选择：{{ robotAvatarCoverFile.name }}</small>
              </div>
            </div>
          </div>
          <label class="admin-settings-field admin-settings-field-wide">
            <span>新账号欢迎语</span>
            <textarea v-model="settings.robotWelcome" data-testid="setting-robot-welcome" maxlength="300" rows="4" required />
            <small>{{ settings.robotWelcome.length }} / 300</small>
          </label>
        </div>
      </section>

      <p v-if="validationError || robotImageError" class="contact-error" role="alert">{{ validationError || robotImageError }}</p>
      <p v-if="saveError" class="contact-error" role="alert">{{ saveError }}</p>
      <p v-if="notice" class="contact-notice" role="status">{{ notice }}</p>
      <div class="admin-settings-actions">
        <button type="submit" data-testid="save-admin-settings" :disabled="loading || saving || Boolean(loadError)">
          {{ saving ? '正在保存…' : '保存设置' }}
        </button>
      </div>
    </form>
  </main>
</template>
