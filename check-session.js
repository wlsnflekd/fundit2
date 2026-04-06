import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ddivdcsierbngtuxtdyu.supabase.co';
const supabaseAnonKey = 'sb_publishable_VTfgbfTQGpLsWi6cjgrFvQ_OezMLa1C';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

(async () => {
  const session = await supabase.auth.getSession();
  console.log('session:', session);
  const user = await supabase.auth.getUser();
  console.log('user:', user);
  const policies = await supabase.db.query(`SELECT policyname, cmd, permissive, roles, qual, with_check FROM pg_policies WHERE tablename = 'profiles';`);
  console.log('policies:', policies);
})();