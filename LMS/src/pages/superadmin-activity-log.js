import { fetchActivityLogs, getActionLabel } from '../api/activityLogApi.js'
import { escapeHtml } from '../lib/html.js'
import { roleLabel } from '../lib/roles.js'

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
}

const FIELD_LABELS = {
  action: 'פעולה',
  actor_id: 'משתמש מבצע',
  actor_name: 'שם המשתמש המבצע',
  actor_role: 'תפקיד המשתמש המבצע',
  assigned_at: 'מועד שיוך',
  auto_enroll_course_ids: 'קורסים לשיוך אוטומטי',
  category: 'קטגוריה',
  completed_at: 'מועד השלמה',
  course_id: 'קורס',
  created_at: 'מועד יצירה',
  description: 'תיאור',
  email: 'אימייל',
  entity_id: 'מזהה יעד הפעולה',
  entity_label: 'שם יעד הפעולה',
  entity_type: 'סוג יעד הפעולה',
  entry_point: 'קובץ פתיחה',
  file_path: 'נתיב קובץ',
  full_name: 'שם מלא',
  group_id: 'קבוצה',
  guest_access_enabled: 'גישה לאורחים',
  guest_access_token: 'קישור גישה לאורחים',
  id: 'מזהה',
  is_guest: 'משתמש אורח',
  joined_at: 'מועד הצטרפות',
  last_accessed: 'כניסה אחרונה',
  lesson_location: 'מיקום בשיעור',
  logo_url: 'לוגו',
  name: 'שם',
  org_id: 'ארגון',
  phone: 'טלפון',
  primary_color: 'צבע ראשי',
  progress_percent: 'אחוז התקדמות',
  published: 'פורסם',
  role: 'תפקיד',
  score: 'ציון',
  started_at: 'מועד התחלה',
  status: 'סטטוס',
  suspend_data: 'נתוני המשך',
  time_spent_seconds: 'זמן למידה',
  title: 'כותרת',
  updated_at: 'מועד עדכון',
  user_id: 'משתמש',
  version: 'גרסה',
  welcome_message: 'הודעת פתיחה'
}

function fieldLabel(field) {
  return FIELD_LABELS[field] || field
}

function formatChangedFields(fields) {
  return fields.map(fieldLabel).join(', ')
}

function detailsSummary(details) {
  if (!details || typeof details !== 'object') return ''
  const table = details.table || details.entity || ''
  const fields = Array.isArray(details.changed_fields) ? details.changed_fields : []
  if (fields.length > 0) return `שדות שהשתנו: ${formatChangedFields(fields)}`
  if (table) return `טבלה: ${table}`
  return ''
}

function matchesLog(log, searchTerm, actionFilter) {
  if (actionFilter && log.action !== actionFilter) return false
  if (!searchTerm) return true

  const haystack = [
    log.action,
    getActionLabel(log.action),
    log.entity_type,
    log.entity_id,
    log.entity_label,
    log.actor_name,
    log.actor_email,
    roleLabel(log.actor_role),
    log.org_name,
    detailsSummary(log.details)
  ].join(' ').toLowerCase()

  return haystack.includes(searchTerm)
}

export default async function renderSuperAdminActivityLog(container) {
  container.innerHTML = `
    <div class="flex flex-wrap justify-between items-center mb-4 gap-4 fade-in">
      <div>
        <h1 class="mb-1">יומן פעולות</h1>
        <p class="text-muted">תיעוד פעולות משתמשים ומנהלים בכל סביבת המערכת.</p>
      </div>
      <button class="btn btn-outline" id="refresh-activity-log">
        <i class='bx bx-refresh'></i> רענון
      </button>
    </div>

    <div class="stats grid grid-cols-4 mb-4 slide-up" style="gap: var(--gap-standard);">
      <div class="card">
        <h4 class="mb-1 text-muted">פעולות מוצגות</h4>
        <div id="activity-stat-total" style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
        <h4 class="mb-1 text-muted">משתמשים</h4>
        <div id="activity-stat-users" style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
        <h4 class="mb-1 text-muted">ארגונים</h4>
        <div id="activity-stat-orgs" style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
        <h4 class="mb-1 text-muted">פעולה אחרונה</h4>
        <div id="activity-stat-latest" style="font-size: 1rem; font-weight: 700;">--</div>
      </div>
    </div>

    <div class="card slide-up mb-4 table-wrapper">
      <div class="flex flex-wrap justify-between items-center mb-4 gap-3">
        <h3 class="mb-0">רשומות אחרונות</h3>
        <div class="flex flex-wrap gap-2 items-center">
          <div style="position: relative; min-width: min(320px, 100%);">
            <i class='bx bx-search' style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: hsl(var(--text-muted)); font-size: 1.15rem; pointer-events: none;"></i>
            <input id="activity-search" class="form-control" type="search" placeholder="חיפוש לפי משתמש, פעולה, ארגון או יעד..." style="padding-right: 42px; margin: 0;">
          </div>
          <select id="activity-action-filter" class="form-control" style="width: 180px; margin: 0;">
            <option value="">כל הפעולות</option>
            <option value="create">יצירה</option>
            <option value="update">עדכון</option>
            <option value="delete">מחיקה</option>
            <option value="login">התחברות</option>
            <option value="logout">התנתקות</option>
            <option value="impersonate">כניסה לסביבת ארגון</option>
          </select>
        </div>
      </div>

      <table class="table" id="activity-log-table">
        <thead>
          <tr>
            <th style="min-width: 130px;">מועד</th>
            <th>פעולה</th>
            <th>משתמש</th>
            <th>ארגון</th>
            <th>יעד הפעולה</th>
            <th>פרטים</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="6" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען יומן...</td></tr>
        </tbody>
      </table>
    </div>
  `

  const tbody = container.querySelector('#activity-log-table tbody')
  const searchInput = container.querySelector('#activity-search')
  const actionFilter = container.querySelector('#activity-action-filter')
  let logs = []

  async function loadLogs() {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען יומן...</td></tr>`
    try {
      logs = await fetchActivityLogs({ limit: 300 })
      renderLogs()
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: hsl(var(--color-danger));">שגיאה: ${escapeHtml(error.message)}</td></tr>`
      updateStats([])
    }
  }

  function renderLogs() {
    const searchTerm = (searchInput.value || '').trim().toLowerCase()
    const selectedAction = actionFilter.value
    const filtered = logs.filter(log => matchesLog(log, searchTerm, selectedAction))

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;" class="text-muted">לא נמצאו פעולות תואמות.</td></tr>`
      updateStats(filtered)
      return
    }

    tbody.innerHTML = filtered.map(log => {
      const target = log.entity_label || log.entity_id || log.entity_type || '-'
      const detailText = detailsSummary(log.details)

      return `
        <tr>
          <td dir="ltr" style="white-space: nowrap;">${formatDateTime(log.created_at)}</td>
          <td><span class="badge badge-primary">${escapeHtml(getActionLabel(log.action))}</span></td>
          <td>
            <div style="font-weight: 600;">${escapeHtml(log.actor_name)}</div>
            <div class="text-xs text-muted">${escapeHtml(roleLabel(log.actor_role))}</div>
          </td>
          <td>${escapeHtml(log.org_name || 'ניהול ראשי')}</td>
          <td>
            <div style="font-weight: 500;">${escapeHtml(target)}</div>
            <div class="text-xs text-muted">${escapeHtml(log.entity_type || '')}</div>
          </td>
          <td class="text-sm">${escapeHtml(detailText || '-')}</td>
        </tr>
      `
    }).join('')

    updateStats(filtered)
  }

  function updateStats(currentLogs) {
    const actorCount = new Set(currentLogs.map(log => log.actor_id || log.actor_name).filter(Boolean)).size
    const orgCount = new Set(currentLogs.map(log => log.org_id || log.org_name).filter(Boolean)).size
    container.querySelector('#activity-stat-total').innerText = currentLogs.length
    container.querySelector('#activity-stat-users').innerText = actorCount
    container.querySelector('#activity-stat-orgs').innerText = orgCount
    container.querySelector('#activity-stat-latest').innerText = currentLogs[0]?.created_at ? formatDateTime(currentLogs[0].created_at) : '--'
  }

  searchInput.addEventListener('input', renderLogs)
  actionFilter.addEventListener('change', renderLogs)
  container.querySelector('#refresh-activity-log').addEventListener('click', loadLogs)

  await loadLogs()
}
