// Pages are loaded only when their route is opened. This keeps login and the
// first dashboard paint responsive instead of downloading every admin screen
// and the SCORM player up front.
const lazyPage = (load) => async (container) => {
  const { default: render } = await load()
  return render(container)
}

const renderLogin = lazyPage(() => import('./pages/login.js'))
const renderAdminDashboard = lazyPage(() => import('./pages/admin.js'))
const renderAdminScorm = lazyPage(() => import('./pages/admin-scorm.js'))
const renderAdminAssignments = lazyPage(() => import('./pages/admin-assignments.js'))
const renderAdminUsers = lazyPage(() => import('./pages/admin-users.js'))
const renderAdminGroups = lazyPage(() => import('./pages/admin-groups.js'))
const renderLearnerDashboard = lazyPage(() => import('./pages/learner.js'))
const renderPlayer = lazyPage(() => import('./pages/player.js'))
const renderSuperAdminOrgs = lazyPage(() => import('./pages/superadmin-orgs.js'))
const renderSuperAdminSettings = lazyPage(() => import('./pages/superadmin-settings.js'))
const renderGuestEntry = lazyPage(() => import('./pages/guest-entry.js'))
const renderSuperAdminActivityLog = lazyPage(() => import('./pages/superadmin-activity-log.js'))

/**
 * Route Configuration
 * 
 * path: hash path (e.g. #/login)
 * component: the render function
 * roles: allowed roles (optional)
 * layout: 'default' | 'none'
 */
export const routes = [
  {
    path: '#/login',
    component: renderLogin,
    roles: null,
    layout: 'none'
  },
  {
    path: '#/guest',
    component: renderGuestEntry,
    roles: null,
    layout: 'none'
  },
  {
    path: '#/admin',
    component: renderAdminDashboard,
    roles: ['admin', 'org_admin', 'super_admin'],
    layout: 'default'
  },
  {
    path: '#/admin/scorm',
    component: renderAdminScorm,
    roles: ['admin', 'org_admin', 'super_admin'],
    layout: 'default'
  },
  {
    path: '#/admin/users',
    component: renderAdminUsers,
    roles: ['admin', 'org_admin', 'super_admin'],
    layout: 'default'
  },
  {
    path: '#/admin/groups',
    component: renderAdminGroups,
    roles: ['admin', 'org_admin', 'super_admin'],
    layout: 'default'
  },
  {
    path: '#/superadmin/orgs',
    component: renderSuperAdminOrgs,
    roles: ['super_admin'],
    layout: 'default'
  },
  {
    path: '#/superadmin/assignments',
    component: renderAdminAssignments,
    roles: ['super_admin'],
    layout: 'default'
  },
  {
    path: '#/superadmin/activity-log',
    component: renderSuperAdminActivityLog,
    roles: ['super_admin'],
    layout: 'default'
  },
  {
    path: '#/admin/settings',
    component: renderSuperAdminSettings,
    roles: ['admin', 'org_admin', 'super_admin', 'learner'],
    layout: 'default'
  },
  {
    path: '#/learner',
    component: renderLearnerDashboard,
    roles: null, // Public or all logged in
    layout: 'default'
  },
  {
    path: '#/',
    component: renderLearnerDashboard,
    roles: null,
    layout: 'default'
  },
  {
    path: '#/player',
    component: renderPlayer,
    roles: ['admin', 'org_admin', 'super_admin', 'learner'],
    layout: 'none'
  }
];

export function getRoute(hash) {
  // Strip query parameters for matching (e.g., #/player?id=123 -> #/player)
  const basePath = hash.split('?')[0];

  // 1. Exact match on base path (highest priority)
  let route = routes.find(r => r.path === basePath);
  if (route) return route;

  // 2. Fallback to prefix match, prioritizing longest (most specific) paths
  // This ensures #/player matches before #/
  const sortedRoutes = [...routes].sort((a, b) => b.path.length - a.path.length);
  return sortedRoutes.find(r => hash.startsWith(r.path));
}
