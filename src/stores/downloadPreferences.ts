import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import {
  chooseDownloadDirectory,
  loadDownloadPreference,
  prepareFileDestination,
  saveDownloadPreference,
  type DirectoryHandleLike,
  type DownloadLocationMode,
} from '@/storage/downloadPreferences'

export const useDownloadPreferencesStore = defineStore('download-preferences', {
  state: () => ({
    accountId: '',
    mode: 'browser' as DownloadLocationMode,
    directoryHandle: null as DirectoryHandleLike | null,
    directoryName: '',
    loading: false,
    loaded: false,
    storageError: '',
  }),
  getters: {
    supportsSavePicker: () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function',
    supportsDirectoryPicker: () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
  },
  actions: {
    async load(accountId: string) {
      if (!accountId) return
      if (this.loaded && this.accountId === accountId) return
      this.loading = true
      this.storageError = ''
      try {
        const preference = await loadDownloadPreference(accountId)
        this.accountId = accountId
        this.mode = preference?.mode || 'browser'
        this.directoryHandle = preference?.directoryHandle ? markRaw(preference.directoryHandle) : null
        this.directoryName = this.directoryHandle?.name || ''
      } catch (error: unknown) {
        this.accountId = accountId
        this.mode = 'browser'
        this.directoryHandle = null
        this.directoryName = ''
        this.storageError = error instanceof Error ? error.message : '本机下载偏好暂时无法读取'
      } finally {
        this.loaded = true
        this.loading = false
      }
    },
    async setMode(mode: DownloadLocationMode) {
      if (!this.accountId) throw new Error('账号状态未就绪')
      if (mode === 'ask' && !this.supportsSavePicker) throw new Error('当前浏览器不支持每次选择保存位置')
      if (mode === 'folder' && (!this.supportsDirectoryPicker || !this.directoryHandle)) {
        throw new Error('请先选择可用的下载文件夹')
      }
      await saveDownloadPreference({
        accountId: this.accountId,
        mode,
        directoryHandle: this.directoryHandle,
      })
      this.mode = mode
      this.storageError = ''
    },
    async chooseDirectory() {
      if (!this.accountId) throw new Error('账号状态未就绪')
      const handle = await chooseDownloadDirectory()
      await saveDownloadPreference({ accountId: this.accountId, mode: 'folder', directoryHandle: handle })
      this.directoryHandle = markRaw(handle)
      this.directoryName = handle.name
      this.mode = 'folder'
      this.storageError = ''
      return handle.name
    },
    async clearDirectory() {
      if (!this.accountId) return
      await saveDownloadPreference({ accountId: this.accountId, mode: 'browser' })
      this.mode = 'browser'
      this.directoryHandle = null
      this.directoryName = ''
      this.storageError = ''
    },
    prepareDestination(fileName: string) {
      return prepareFileDestination(this.mode, fileName, this.directoryHandle)
    },
    reset() {
      this.accountId = ''
      this.mode = 'browser'
      this.directoryHandle = null
      this.directoryName = ''
      this.loading = false
      this.loaded = false
      this.storageError = ''
    },
  },
})
