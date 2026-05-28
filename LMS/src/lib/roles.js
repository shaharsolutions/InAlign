export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_ADMIN = 'admin';
export const ROLE_ORG_ADMIN = 'org_admin';
export const ROLE_LEARNER = 'learner';

export const ADMIN_ROLES = [ROLE_ADMIN, ROLE_ORG_ADMIN];
export const MANAGEMENT_ROLES = [ROLE_SUPER_ADMIN, ...ADMIN_ROLES];

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
