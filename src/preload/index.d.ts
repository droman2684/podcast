import { ElectronAPI } from '@electron-toolkit/preload'
import type { EmpirePodApi } from '@shared/ipcChannels'

declare global {
  interface Window {
    electron: ElectronAPI
    api: EmpirePodApi
  }
}
