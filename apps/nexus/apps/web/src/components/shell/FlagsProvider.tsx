'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { FeatureFlags, FlagKey, FlagValue } from '@posteragent/types/nexus'

interface FlagsContextValue {
  flags: FeatureFlags
  loading: boolean
  reload: () => Promise<void>
  setFlag: (key: FlagKey, value: FlagValue) => Promise<void>
  resetFlags: () => Promise<void>
}

const DEFAULT_FLAGS: FeatureFlags = {
  daily_run_enabled: true,
  site_generation_enabled: true,
  video_generation_enabled: true,
  poster_generation_enabled: true,
  voiceover_enabled: true,
  dry_run_mode: false,
  auto_publish_tiktok: true,
  auto_publish_instagram_reels: true,
  auto_publish_instagram_feed: true,
  auto_publish_youtube_shorts: true,
  auto_publish_twitter: true,
  auto_publish_pinterest: false,
  auto_publish_linkedin: false,
  auto_publish_threads: false,
  max_posts_per_day: 20,
  max_videos_per_day: 5,
  max_sites_per_week: 2,
  max_blog_posts_per_day: 10,
}

const FlagsContext = createContext<FlagsContextValue>({
  flags: DEFAULT_FLAGS,
  loading: true,
  reload: async () => {},
  setFlag: async () => {},
  resetFlags: async () => {},
})

export function FlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const data = await api.getFlags().catch(() => ({ flags: DEFAULT_FLAGS }))
    setFlags(data.flags)
    setLoading(false)
  }, [])

  const setFlag = useCallback(async (key: FlagKey, value: FlagValue) => {
    await api.setFlag(key, value)
    setFlags((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetFlags = useCallback(async () => {
    const result = await api.resetFlags()
    setFlags(result.defaults)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo(
    () => ({ flags, loading, reload, setFlag, resetFlags }),
    [flags, loading, reload, resetFlags, setFlag],
  )

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>
}

export function useFlagsContext() {
  return useContext(FlagsContext)
}

export function useFlag<K extends FlagKey>(key: K): FeatureFlags[K] {
  return useFlagsContext().flags[key]
}

export function useFeatureIsOn(key: FlagKey): boolean {
  return useFlag(key) === true
}
