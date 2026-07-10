import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8')
}

test('profile mutations cannot grant browser users role or organization access', async () => {
  const migration = await read('supabase/migrations/20260710120001_harden_tenant_boundaries.sql')

  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.profiles FROM authenticated/)
  assert.match(migration, /GRANT UPDATE \(full_name, phone\) ON TABLE public\.profiles TO authenticated/)
  assert.doesNotMatch(migration, /CREATE POLICY "profiles_insert"/)
})

test('storage reads are tenant-scoped and no longer grant every manager access', async () => {
  const schema = await read('supabase/schema.sql')
  const policy = schema.slice(schema.indexOf('CREATE POLICY "scorm_packages_select"'), schema.indexOf('DROP POLICY IF EXISTS "scorm_packages_insert"'))

  assert.match(policy, /p\.role IN \('admin', 'org_admin'\)\s+AND regexp_replace/)
  assert.doesNotMatch(policy, /OR p\.role IN \('admin', 'org_admin'\)\s+OR/)
})

test('group membership permits every organization role but blocks other organizations', async () => {
  const migration = await read('supabase/migrations/20260710120004_allow_all_org_roles_in_groups.sql')

  assert.match(migration, /p\.org_id = g\.org_id/)
  assert.doesNotMatch(migration, /p\.role =/)
})
