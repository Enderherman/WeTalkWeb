import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from '@/api/systemSettings'

let pendingLoad: Promise<SystemSettings> | null = null

export const useSystemSettingsStore = defineStore('system-settings', {
  state: () => ({
    settings: { ...DEFAULT_SYSTEM_SETTINGS } as SystemSettings,
    loaded: false,
    loading: false,
  }),
  actions: {
    load(force = false): Promise<SystemSettings> {
      if (this.loaded && !force) return Promise.resolve(this.settings)
      if (pendingLoad) return pendingLoad

      this.loading = true
      pendingLoad = authApi.getSystemSettings()
        .then((settings) => {
          this.setSettings(settings)
          return this.settings
        })
        .finally(() => {
          this.loading = false
          pendingLoad = null
        })
      return pendingLoad
    },
    setSettings(settings: SystemSettings) {
      this.settings = { ...DEFAULT_SYSTEM_SETTINGS, ...settings }
      this.loaded = true
    },
    reset() {
      this.settings = { ...DEFAULT_SYSTEM_SETTINGS }
      this.loaded = false
      this.loading = false
      pendingLoad = null
    },
  },
})
