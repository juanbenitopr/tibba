import { create } from 'zustand'
import type { BiomarkerRecord } from './types'

type State = {
  records: BiomarkerRecord[]
  setRecords: (r: BiomarkerRecord[]) => void
}

export const useBioStore = create<State>()((set) => ({
  records: [],
  setRecords: (r) => set({ records: r }),
}))
