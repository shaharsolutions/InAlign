import { supabase } from '../lib/supabase.js'

export async function fetchCategories(orgId) {
  let query = supabase.from('course_categories').select('*');
  if (orgId) {
    query = query.eq('org_id', orgId);
  }
  const { data, error } = await query.order('name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function addCategory(name, orgId) {
  const { data, error } = await supabase
    .from('course_categories')
    .insert([{ name, org_id: orgId }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('הקטגוריה כבר קיימת');
    throw error;
  }
  return data;
}

export async function updateCategory(id, name) {
  const { data, error } = await supabase
    .from('course_categories')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('הקטגוריה כבר קיימת');
    throw error;
  }
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase
    .from('course_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
