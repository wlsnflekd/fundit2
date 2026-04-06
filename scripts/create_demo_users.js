import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = 'c:\\Users\\배추\\fundit2\\.env';
if (fs.existsSync(envFile)) {
  const keys = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of keys) {
    const [k, v] = line.split('=');
    if (k && v && !process.env[k]) {
      process.env[k] = v;
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or ANON key is missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('Create workspace for FUNDIT demo...');
  const workspaceRes = await supabase.from('workspaces').insert({ name: 'FUNDIT Demo', plan: 'pro' }).select('*').single();
  if (workspaceRes.error) {
    console.error('Workspace insert error:', workspaceRes.error);
    process.exit(1);
  }
  const workspace = workspaceRes.data;
  console.log('Workspace created:', workspace.id);

  const users = [
    { email: 'admin@fundit.kr', password: 'admin123', name: '관리자', role: 'admin' },
    { email: 'lee@fundit.kr', password: 'staff123', name: '이상훈', role: 'staff' },
    { email: 'choi@fundit.kr', password: 'staff123', name: '최지훈', role: 'staff' }
  ];

  for (const user of users) {
    const { data, error } = await supabase.auth.signUp({
      email: user.email,
      password: user.password
    }, {
      data: { workspace_id: workspace.id, name: user.name, role: user.role }
    });
    if (error) {
      console.error('SIGNUP error for', user.email, error.message || error);
    } else {
      console.log('Signed up', user.email, 'user id=', data.user?.id);
    }
  }

  console.log('Demo user creation complete.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});