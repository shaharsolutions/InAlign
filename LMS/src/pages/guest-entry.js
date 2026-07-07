import { fetchGuestCourse, enterCourseAsGuest } from '../api/guestApi.js'
import { getCurrentUserSync, logout } from '../api/authApi.js'
import { applyOrganizationStyles } from '../lib/ui.js'

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default async function renderGuestEntry(container) {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const accessToken = params.get('code')

  container.innerHTML = `
    <div class="guest-entry-page">
      <main class="login-main">
        <div class="login-card-modern fade-in" id="guest-entry-card">
          <div class="login-header-modern">
            <div class="login-logo-mobile" style="display:block"><i class='bx bxs-graduation'></i></div>
            <h2>כניסה ללומדה</h2>
            <p class="text-muted">בודק את קישור הגישה...</p>
          </div>
        </div>
        <div class="login-footer-modern">&copy; ${new Date().getFullYear()} Align</div>
      </main>
    </div>
  `

  const card = container.querySelector('#guest-entry-card')

  try {
    if (!accessToken) throw new Error('קישור הגישה חסר')
    const course = await fetchGuestCourse(accessToken)
    if (!course) throw new Error('קישור הגישה אינו תקין או שאינו פעיל עוד')

    const currentUser = getCurrentUserSync()
    if (currentUser && !currentUser.isGuest) {
      card.innerHTML = `
        <div class="login-header-modern">
          <div class="login-logo-mobile" style="display:block"><i class='bx bx-user-check'></i></div>
          <h2>${escapeHtml(course.title)}</h2>
          <p class="text-muted">כעת מחובר למערכת חשבון רגיל. כניסה בקישור זה דורשת יציאה ופתיחת זהות אורח.</p>
        </div>
        <button type="button" class="btn btn-primary w-full py-3" id="guest-logout-btn">התנתק והמשך כאורח</button>
      `
      card.querySelector('#guest-logout-btn').addEventListener('click', async () => {
        await logout()
        window.location.hash = `#/guest?code=${encodeURIComponent(accessToken)}`
        window.location.reload()
      })
      return
    }

    card.innerHTML = `
      <div class="login-header-modern">
        <div class="login-logo-mobile" style="display:block"><i class='bx bxs-graduation'></i></div>
        <p class="text-sm text-muted" style="margin-bottom:.5rem">${escapeHtml(course.org_name)}</p>
        <h2>${escapeHtml(course.title)}</h2>
        <p class="text-muted">${escapeHtml(course.description || 'יש להזין פרטים לצורך זיהוי ושמירת הביצוע במערכת.')}</p>
      </div>
      <form id="guest-entry-form">
        <div class="form-group" style="text-align:right">
          <label class="form-label" for="guest-full-name">שם מלא</label>
          <input class="form-control" id="guest-full-name" type="text" minlength="2" maxlength="120" autocomplete="name" value="${escapeHtml(currentUser?.isGuest ? currentUser.fullName : '')}" required>
        </div>
        <div class="form-group" style="text-align:right">
          <label class="form-label" for="guest-phone">מספר טלפון</label>
          <input class="form-control" id="guest-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="05X-XXXXXXX" dir="ltr" value="${escapeHtml(currentUser?.isGuest ? currentUser.phone : '')}" required>
        </div>
        <p class="text-sm text-muted mb-4">הפרטים ישמשו לזיהוי ולרישום ההתקדמות וההשלמה של הלומדה.</p>
        <button type="submit" class="btn btn-primary w-full py-3">
          <i class='bx bx-play-circle'></i> ${currentUser?.isGuest ? 'המשך ללומדה' : 'כניסה והתחלת הלומדה'}
        </button>
        <div id="guest-entry-error" class="text-sm" style="color:hsl(var(--color-danger));min-height:24px;text-align:center;margin-top:1rem"></div>
      </form>
    `

    const form = card.querySelector('#guest-entry-form')
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const button = form.querySelector('button[type="submit"]')
      const errorBox = form.querySelector('#guest-entry-error')
      button.disabled = true
      button.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> פותח את הלומדה...`
      errorBox.textContent = ''

      try {
        const user = await enterCourseAsGuest({
          courseId: course.id,
          accessToken,
          fullName: form.querySelector('#guest-full-name').value.trim(),
          phone: form.querySelector('#guest-phone').value.trim()
        })
        applyOrganizationStyles(user)
        window.location.hash = `#/player?id=${course.id}&guest=1`
      } catch (error) {
        errorBox.textContent = error.message
        button.disabled = false
        button.innerHTML = `<i class='bx bx-play-circle'></i> ${currentUser?.isGuest ? 'המשך ללומדה' : 'כניסה והתחלת הלומדה'}`
      }
    })
  } catch (error) {
    card.innerHTML = `
      <div class="login-header-modern">
        <div class="login-logo-mobile" style="display:block;color:hsl(var(--color-danger))"><i class='bx bx-link-alt'></i></div>
        <h2>לא ניתן לפתוח את הלומדה</h2>
        <p class="text-muted">${escapeHtml(error.message)}</p>
      </div>
    `
  }
}
