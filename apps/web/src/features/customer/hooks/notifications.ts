import { inboxKeys, useInbox, useInboxUnread, useMarkInboxRead } from '@/lib/notifications'

export const notificationKeys = inboxKeys('customer')
export const useUnreadCount = () => useInboxUnread('customer')
export const useNotifications = () => useInbox('customer')
export const useMarkRead = () => useMarkInboxRead('customer')
