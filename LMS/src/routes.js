import renderLogin from './pages/login.js'
import renderAdminDashboard from './pages/admin.js'
import renderAdminScorm from './pages/admin-scorm.js'
import renderAdminAssignments from './pages/admin-assignments.js'
import renderAdminUsers from './pages/admin-users.js'
import renderAdminGroups from './pages/admin-groups.js'
import renderLearnerDashboard from './pages/learner.js'
import renderPlayer from './pages/player.js'
import renderSuperAdminOrgs from './pages/superadmin-orgs.js'
import renderSuperAdminSettings from './pages/superadmin-settings.js'

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
    path: '#/admin/settings',
    component: renderSuperAdminSettings,
    roles: ['admin', 'org_admin', 'super_admin'],
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

