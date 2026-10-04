import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { validateProfileImageUpload } from '@/utils/imageValidation'

export function useLocalImagePreview(file: Ref<File | null>) {
  const url = ref('')
  const clear = () => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = ''
  }
  watch(file, (selected) => {
    clear()
    if (!selected || validateProfileImageUpload(selected)) return
    try { url.value = URL.createObjectURL(selected) } catch { /* File validation and upload remain usable without preview support. */ }
  }, { flush: 'sync' })
  onBeforeUnmount(clear)
  return url
}
