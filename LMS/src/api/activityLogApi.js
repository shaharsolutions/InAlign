import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'
import { isSuperAdminRole } from '../lib/roles.js'

const MOCK_ACTIVITY_LOGS = [
  {
    id: 'log-1',
    created_at: '2026-07-06T08:30:00Z',
    action: 'create',
    entity_type: 'organizations',
    entity_label: 'טק לייט פתרונות',
    actor_name: 'מנהל על מרכזי',
    actor_role: 'super_admin',
    org_name: 'ניהול ראשי',
    details: { table: 'organizations' }
  },
  {
    id: 'log-2',
    created_at: '2026-07-06T09:15:00Z',
    action: 'update',
    entity_type: 'learner_progress',
    entity_label: 'רשומת למידה',
    actor_name: 'דוד המנהל',
    actor_role: 'org_admin',
    org_name: 'טק לייט פתרונות',
    details: { table: 'learner_progress' }
  }
]

export const ACTION_LABELS = {
  create: 'יצירה',
  update: 'עדכון',
  delete: 'מחיקה',
  login: 'התחברות',
  logout: 'התנתקות',
  impersonate: 'כניסה לסביבת ארגון',
  view: 'צפייה',
  system: 'מערכת'
}

export function getActionLabel(action) {
  return ACTION_LABELS[action] || action || 'פעולה'
}

export async function fetchActivityLogs({ limit = 200 } = {}) {
  const user = getCurrentUserSync()
  if (!user || !isSuperAdminRole(user.role)) {
    throw new Error('רק מנהל על רשאי לצפות ביומן הפעולות')
  }

  if (supabase) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select(`
        id,
        created_at,
        action,
        entity_type,
        entity_id,
        entity_label,
        actor_id,
        actor_name,
        actor_role,
        org_id,
        details,
        profiles:profiles!activity_logs_actor_id_fkey (full_name, email, role),
        organizations:organizations!activity_logs_org_id_fkey (name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (error.code === '42P01') {
        throw new Error('טבלת יומן הפעולות עדיין לא קיימת. יש להריץ את מיגרציית Supabase החדשה.')
      }
      throw new Error(error.message)
    }

    return (data || []).map(normalizeActivityLog)
  }

  return MOCK_ACTIVITY_LOGS
}

export async function logActivity(action, metadata = {}) {
  const user = getCurrentUserSync()
  if (!user || !supabase) return null

  const payload = {
    action,
    entity_type: metadata.entityType || metadata.entity_type || null,
    entity_id: metadata.entityId || metadata.entity_id || null,
    entity_label: metadata.entityLabel || metadata.entity_label || null,
    org_id: metadata.orgId || metadata.org_id || user.orgId || null,
    details: metadata.details || {}
  }

  try {
    const { error } = await supabase.rpc('log_activity', payload)
    if (error) console.warn('[Align] Failed to write activity log:', error.message)
  } catch (error) {
    console.warn('[Align] Failed to write activity log:', error)
  }

  return null
}

function normalizeActivityLog(log) {
  const actorProfile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles
  const organization = Array.isArray(log.organizations) ? log.organizations[0] : log.organizations

  return {
    ...log,
    actor_name: log.actor_name || actorProfile?.full_name || 'משתמש לא ידוע',
    actor_role: log.actor_role || actorProfile?.role || '',
    actor_email: actorProfile?.email || '',
    org_name: organization?.name || null
  }
}
