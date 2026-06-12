export type AnnouncementType = 'info' | 'success' | 'warning' | 'error'

export interface Announcement {
  id: string
  message: string
  type: AnnouncementType
  created_at: string
  dismissible: boolean
  active: boolean
}
