<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import type { WebAuthSession } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { validateAuthForm, validateEmail } from '@/utils/authValidation'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isRegister = computed(() => route.name === 'register')
const registeredNotice = computed(() => route.query.registered === '1')
const passwordUpdatedNotice = computed(() => route.query.passwordUpdated === '1')
const expiredNotice = computed(() => route.query.expired === '1')
const form = reactive({ email: '', nickName: '', password: '', confirmPassword: '', checkCode: '', emailCode: '' })
const fieldErrors = ref<Record<string, string>>({})
const pageError = ref('')
const emailCodeNotice = ref('')
const captchaImage = ref('')
const captchaKey = ref('')
const captchaLoading = ref(false)
const submitting = ref(false)
const emailCodeSending = ref(false)
const emailCodeCountdown = ref(0)
let emailCodeTimer: number | null = null

const title = computed(() => (isRegister.value ? '创建你的账号' : '欢迎回来'))
const captchaSource = computed(() => {
  if (!captchaImage.value) return ''
  return captchaImage.value.startsWith('data:')
    ? captchaImage.value
    : 'data:image/png;base64,' + captchaImage.value
})

async function refreshCaptcha() {
  captchaLoading.value = true
  try {
    const result = await authApi.getCaptcha()
    captchaImage.value = result.check_code
    captchaKey.value = result.check_code_key
  } catch (error: unknown) {
    captchaImage.value = ''
    captchaKey.value = ''
    if (!pageError.value) {
      pageError.value = error instanceof Error ? error.message : '验证码暂时无法加载'
    }
  } finally {
    captchaLoading.value = false
  }
}

watch(isRegister, () => {
  fieldErrors.value = {}
  pageError.value = ''
  emailCodeNotice.value = ''
  form.checkCode = ''
  form.emailCode = ''
  stopEmailCodeCountdown()
  void refreshCaptcha()
})

watch(() => form.email, () => {
  form.emailCode = ''
  emailCodeNotice.value = ''
})

onMounted(() => {
  void refreshCaptcha()
})

onBeforeUnmount(() => {
  stopEmailCodeCountdown()
})

function stopEmailCodeCountdown() {
  if (emailCodeTimer !== null) window.clearInterval(emailCodeTimer)
  emailCodeTimer = null
  emailCodeCountdown.value = 0
}

function startEmailCodeCountdown() {
  stopEmailCodeCountdown()
  emailCodeCountdown.value = 60
  emailCodeTimer = window.setInterval(() => {
    if (emailCodeCountdown.value <= 1) {
      stopEmailCodeCountdown()
      return
    }
    emailCodeCountdown.value -= 1
  }, 1000)
}

async function sendRegistrationEmailCode() {
  pageError.value = ''
  emailCodeNotice.value = ''
  fieldErrors.value = {}

  const emailError = validateEmail(form.email)
  if (emailError) {
    fieldErrors.value.email = emailError
    return
  }
  if (!form.checkCode.trim()) {
    fieldErrors.value.checkCode = '请输入图片验证码'
    return
  }
  if (!captchaKey.value) {
    pageError.value = '图片验证码已失效，请刷新后重试'
    await refreshCaptcha()
    return
  }

  emailCodeSending.value = true
  try {
    await authApi.sendRegistrationEmailCode({
      email: form.email.trim(),
      checkCodeKey: captchaKey.value,
      checkCode: form.checkCode.trim(),
    })
    emailCodeNotice.value = '如果邮箱可以注册，验证码已发送，请查收。'
    startEmailCodeCountdown()
  } catch (error: unknown) {
    pageError.value = error instanceof Error ? error.message : '验证码发送失败，请稍后重试'
  } finally {
    form.checkCode = ''
    await refreshCaptcha()
    emailCodeSending.value = false
  }
}

async function submit() {
  pageError.value = ''
  emailCodeNotice.value = ''
  fieldErrors.value = validateAuthForm(isRegister.value ? 'register' : 'login', form)
  if (Object.keys(fieldErrors.value).length > 0) return

  if (!isRegister.value && !captchaKey.value) {
    pageError.value = '请先刷新并填写图片验证码'
    await refreshCaptcha()
    return
  }

  submitting.value = true
  try {
    if (isRegister.value) {
      await authApi.register({
        email: form.email.trim(),
        nickName: form.nickName.trim(),
        password: form.password,
        emailCode: form.emailCode.trim(),
      })
      form.password = ''
      form.confirmPassword = ''
      form.checkCode = ''
      await router.replace({ name: 'login', query: { registered: '1' } })
      return
    }

    const user = await authApi.login({
      email: form.email.trim(),
      password: form.password,
      checkCodeKey: captchaKey.value,
      checkCode: form.checkCode.trim(),
    })
    authStore.setSession(toSession(user, form.email))
    await router.replace({ name: 'chat' })
  } catch (error: unknown) {
    pageError.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
    if (!isRegister.value) {
      form.checkCode = ''
      await refreshCaptcha()
    }
  } finally {
    submitting.value = false
  }
}

function toSession(user: WebAuthSession, emailFallback: string) {
  if (!user.userId) throw new Error('登录响应缺少账号信息，请联系管理员')
  return {
    token: '',
    userId: user.userId,
    email: user.email || emailFallback,
    nickName: user.nickName || emailFallback.split('@')[0] || 'WeTalk 用户',
    admin: Boolean(user.admin),
  }
}
</script>

<template>
  <main class="auth-page">
    <RouterLink class="auth-brand" :to="{ name: 'login' }" aria-label="WeTalk 首页">
      <span class="brand-mark">W</span>
      <span>WeTalk</span>
    </RouterLink>

    <section class="auth-panel" aria-labelledby="auth-title">
      <div class="auth-heading">
        <p class="eyebrow">欢迎使用 WeTalk</p>
        <h1 id="auth-title">{{ title }}</h1>
        <p class="auth-subtitle">
          {{ isRegister ? '注册后即可开始与朋友交流。' : '登录后继续你的聊天。' }}
        </p>
      </div>

      <p v-if="registeredNotice" class="notice notice-success" role="status">注册成功，请登录</p>
      <p v-if="passwordUpdatedNotice" class="notice notice-success" role="status">密码已修改，请使用新密码登录</p>
      <p v-if="expiredNotice" class="notice notice-error" role="status">登录状态已过期，请重新登录</p>
      <p v-if="emailCodeNotice" class="notice notice-success" data-testid="email-code-notice" role="status">{{ emailCodeNotice }}</p>
      <p v-if="pageError" class="notice notice-error" role="alert">{{ pageError }}</p>

      <form class="auth-form" novalidate @submit.prevent="submit">
        <label v-if="isRegister" class="field">
          <span>昵称</span>
          <input
            v-model.trim="form.nickName"
            data-testid="nickname"
            autocomplete="nickname"
            maxlength="40"
            placeholder="你希望别人怎么称呼你"
            :aria-invalid="Boolean(fieldErrors.nickName)"
            :aria-describedby="fieldErrors.nickName ? 'nickname-error' : undefined"
          />
          <small v-if="fieldErrors.nickName" id="nickname-error" class="field-error" role="alert">{{ fieldErrors.nickName }}</small>
        </label>

        <label class="field">
          <span>邮箱</span>
          <input
            v-model.trim="form.email"
            data-testid="email"
            type="email"
            autocomplete="email"
            maxlength="254"
            placeholder="name@example.com"
            :aria-invalid="Boolean(fieldErrors.email)"
            :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
          />
          <small v-if="fieldErrors.email" id="email-error" class="field-error" role="alert">{{ fieldErrors.email }}</small>
        </label>

        <label class="field">
          <span>密码</span>
          <input
            v-model="form.password"
            data-testid="password"
            type="password"
            :autocomplete="isRegister ? 'new-password' : 'current-password'"
            placeholder="请输入密码"
            :aria-invalid="Boolean(fieldErrors.password)"
            :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
          />
          <small v-if="fieldErrors.password" id="password-error" class="field-error" role="alert">{{ fieldErrors.password }}</small>
        </label>

        <label v-if="isRegister" class="field">
          <span>确认密码</span>
          <input
            v-model="form.confirmPassword"
            data-testid="confirm-password"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入密码"
            :aria-invalid="Boolean(fieldErrors.confirmPassword)"
            :aria-describedby="fieldErrors.confirmPassword ? 'confirm-password-error' : undefined"
          />
          <small v-if="fieldErrors.confirmPassword" id="confirm-password-error" class="field-error" role="alert">{{ fieldErrors.confirmPassword }}</small>
        </label>

        <div v-if="isRegister" class="field">
          <label for="email-code">邮箱验证码</label>
          <div class="captcha-row">
            <input
              id="email-code"
              v-model.trim="form.emailCode"
              data-testid="email-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="输入邮件中的 6 位验证码"
              :aria-invalid="Boolean(fieldErrors.emailCode)"
              :aria-describedby="fieldErrors.emailCode ? 'email-code-error' : undefined"
            />
            <button
              class="captcha-refresh"
              data-testid="send-email-code"
              type="button"
              :disabled="emailCodeSending || captchaLoading || emailCodeCountdown > 0"
              @click="sendRegistrationEmailCode"
            >{{ emailCodeSending ? '正在发送…' : emailCodeCountdown > 0 ? `${emailCodeCountdown} 秒后重发` : '发送验证码' }}</button>
          </div>
          <small v-if="fieldErrors.emailCode" id="email-code-error" class="field-error" role="alert">{{ fieldErrors.emailCode }}</small>
        </div>

        <div class="field">
          <label for="captcha-input">图片验证码</label>
          <div class="captcha-row">
            <input
              id="captcha-input"
              v-model.trim="form.checkCode"
              data-testid="captcha"
              autocomplete="off"
              maxlength="12"
              placeholder="输入图片中的结果"
              :aria-invalid="Boolean(fieldErrors.checkCode)"
              :aria-describedby="fieldErrors.checkCode ? 'captcha-error' : undefined"
            />
            <button
              class="captcha-refresh"
              data-testid="captcha-refresh"
              type="button"
              :disabled="captchaLoading"
              aria-label="刷新验证码"
              @click="refreshCaptcha"
            >
              <img v-if="captchaSource" :src="captchaSource" alt="图片验证码，点击刷新" />
              <span v-else>{{ captchaLoading ? '加载中' : '刷新验证码' }}</span>
            </button>
          </div>
          <small v-if="fieldErrors.checkCode" id="captcha-error" class="field-error" role="alert">{{ fieldErrors.checkCode }}</small>
        </div>

        <button class="submit-button" data-testid="submit" type="submit" :disabled="submitting">
          {{ submitting ? '请稍候…' : isRegister ? '创建账号' : '登录' }}
        </button>
      </form>

      <p class="auth-switch">
        {{ isRegister ? '已经有账号？' : '还没有账号？' }}
        <RouterLink :to="{ name: isRegister ? 'login' : 'register' }" data-testid="mode-link">
          {{ isRegister ? '登录' : '注册' }}
        </RouterLink>
      </p>
      <p class="auth-footnote">{{ isRegister ? '图片验证码用于发送邮箱验证码；注册还需输入邮件中的 6 位验证码。' : '登录需要通过图片验证码。' }}</p>
    </section>

    <footer class="auth-footer">简洁、专注的聊天空间</footer>
  </main>
</template>
