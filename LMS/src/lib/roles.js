export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_ADMIN = 'admin';
export const ROLE_ORG_ADMIN = 'org_admin';
export const ROLE_LEARNER = 'learner';

export const ADMIN_ROLES = [ROLE_ADMIN, ROLE_ORG_ADMIN];
export const MANAGEMENT_ROLES = [ROLE_SUPER_ADMIN, ...ADMIN_ROLES];
export const AUTHENTICATED_ROLES = [...MANAGEMENT_ROLES, ROLE_LEARNER];

export const GUIDE_DOCUMENTS = [
  {
    id: 'management',
    title: 'מדריך שימוש אינטראקטיבי',
    description: 'מדריך מעשי ומלא להפעלת מערכת ה-LMS, הקמת ארגונים וטעינת לומדות. מיועד לתפקידי ניהול בלבד.',
    href: 'user_guide.html',
    icon: 'bx-help-circle',
    tone: 'primary',
    allowedRoles: MANAGEMENT_ROLES
  },
  {
    id: 'training-managers',
    title: 'מדריך למנהלי הדרכה',
    description: 'מדריך ממוקד לניהול סביבת ההדרכה הארגונית: יצירת משתמשים וקבוצות, שיוך לומדות והפקת דוחות למידה.',
    href: 'user_guide_training_managers.html',
    icon: 'bx-user-voice',
    tone: 'warning',
    allowedRoles: MANAGEMENT_ROLES
  },
  {
    id: 'learners',
    title: 'מדריך שימוש ללומדים',
    description: 'מדריך מעשי ופשוט ללומדים במערכת: כניסה ראשונית, צפייה בלומדות שהוקצו, מעקב אחר התקדמות ופתרון תקלות.',
    href: 'user_guide_learners.html',
    icon: 'bx-book-reader',
    tone: 'success',
    allowedRoles: AUTHENTICATED_ROLES
  }
];

export function isSuperAdminRole(role) {
  return role === ROLE_SUPER_ADMIN;
}

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function isSystemAdminRole(role) {
  return role === ROLE_ADMIN;
}

export function isTrainingManagerRole(role) {
  return role === ROLE_ORG_ADMIN;
}

export function isManagementRole(role) {
  return MANAGEMENT_ROLES.includes(role);
}

export function roleLabel(role) {
  if (isSuperAdminRole(role)) return 'מנהל על';
  if (isSystemAdminRole(role)) return 'Admin';
  if (isTrainingManagerRole(role)) return 'מנהל הדרכה';
  return 'עובד / לומד';
}

export function canViewGuideDocument(role, guideId) {
  const guide = GUIDE_DOCUMENTS.find(item => item.id === guideId);
  return !!guide && guide.allowedRoles.includes(role);
}

export function getGuideDocumentsForRole(role) {
  return GUIDE_DOCUMENTS.filter(guide => guide.allowedRoles.includes(role));
}
