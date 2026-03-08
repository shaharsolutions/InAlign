import { login } from '../auth.js'

export default function renderLogin(container) {
  container.innerHTML = `
    <div style="max-width: 400px; margin: 4rem auto;" class="card text-center slide-up">
      <div style="font-size: 3rem; color: hsl(var(--color-primary)); margin-bottom: 1rem;">
        <i class='bx bxs-graduation'></i>
      </div>
      <h2 class="mb-2">התחברות למערכת</h2>
      <p class="text-muted mb-4">הזן את פרטי הגישה הארגוניים שלך</p>
      
      <form id="login-form">
        <div class="form-group" style="text-align: right;">
          <label class="form-label" for="email">כתובת דוא"ל</label>
          <input class="form-control" type="email" id="email" required placeholder="user@company.com" dir="ltr" value="learner@test.com">
        </div>
        <div class="form-group" style="text-align: right;">
          <label class="form-label" for="password">סיסמה</label>
          <div class="password-input-wrapper">
            <input class="form-control" type="password" id="password" required placeholder="123456" dir="ltr" value="123456">
            <button type="button" id="toggle-password" class="password-toggle-btn">
              <i class='bx bx-show'></i>
            </button>
          </div>
        </div>
        <div class="flex justify-between items-center mb-4">
          <label class="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox"> <span>זכור אותי</span>
          </label>
          <a href="#" class="text-sm text-primary">שכחתי סיסמה</a>
        </div>
        <button type="submit" class="btn btn-primary w-full justify-center">
          <i class='bx bx-log-in'></i> כניסה
        </button>
        <div id="login-error" style="color: hsl(var(--color-danger)); min-height: 20px; text-align: center; margin-top: 10px;" class="text-sm"></div>
      </form>
      
      <div class="mt-4 text-sm text-muted">
        <p>נסו: <strong>learner@test.com</strong> או <strong>org@test.com</strong> או <strong>admin@test.com</strong></p>
        <p>סיסמה: <strong>123456</strong></p>
      </div>
    </div>
  `

  const passwordInput = document.getElementById('password')
  const toggleBtn = document.getElementById('toggle-password')
  
  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password'
    passwordInput.type = isPassword ? 'text' : 'password'
    toggleBtn.innerHTML = isPassword ? `<i class='bx bx-hide'></i>` : `<i class='bx bx-show'></i>`
  })

  const form = document.getElementById('login-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button')
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מתחבר...`
    btn.disabled = true
    
    try {
      const email = document.getElementById('email').value
      const pass = document.getElementById('password').value
      const user = await login(email, pass)
      
      // Navigate on success based on role
      if (user.role === 'super_admin') window.location.hash = '#/superadmin/orgs'
      else if (user.role === 'org_admin') window.location.hash = '#/admin'
      else window.location.hash = '#/learner'
    } catch (err) {
      document.getElementById('login-error').innerHTML = err.message
      btn.innerHTML = `<i class='bx bx-log-in'></i> כניסה`
      btn.disabled = false
    }
  })
}
