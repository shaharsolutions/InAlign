import { supabase } from '../lib/supabase.js'
import { checkAuth, getCurrentUserSync } from './authApi.js'

export async function fetchGuestCourse(accessToken) {
  if (!supabase || !accessToken) return null

  const { data, error } = await supabase.rpc('get_guest_course', {
    access_token: accessToken
  })

  if (error) throw new Error('קישור הגישה אינו תקין או שאינו פעיל עוד')
  return data?.[0] || null
}

export async function enterCourseAsGuest({ courseId, accessToken, fullName, phone }) {
  if (!supabase) throw new Error('שירות הכניסה לאורחים אינו זמין')

  let currentUser = getCurrentUserSync()
  if (currentUser && !currentUser.isGuest) {
    throw new Error('יש להתנתק מהחשבון הקיים לפני כניסה כאורח')
  }

  const previousGuestCourseId = window.localStorage.getItem('lms.guest.courseId')
  if (currentUser?.isGuest && previousGuestCourseId !== courseId) {
    if (window.__APP_STATE) window.__APP_STATE.user = null
    await supabase.auth.signOut()
    currentUser = null
  }

  if (!currentUser) {
    const { data: sessionData, error: authError } = await supabase.auth.signInAnonymously()
    if (authError || !sessionData?.user) {
      throw new Error('לא ניתן לפתוח כניסת אורח. יש לוודא ש-Anonymous Sign-Ins מופעל ב-Supabase')
    }
  }

  const { error } = await supabase.rpc('register_course_guest', {
    course_id: courseId,
    access_token: accessToken,
    guest_full_name: fullName,
    guest_phone: phone
  })

  if (error) {
    await supabase.auth.signOut()
    throw new Error(error.message || 'רישום האורח נכשל')
  }

  const user = await checkAuth()
  if (!window.__APP_STATE) window.__APP_STATE = {}
  window.__APP_STATE.user = user
  window.localStorage.setItem('lms.guest.courseId', courseId)
  return user
}
