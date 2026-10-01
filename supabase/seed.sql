-- Local demo data. Credentials here are for the local Supabase stack only.
-- Demo login: demo@basenine.test / demo-T2wx-bw9JAyx
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'demo@basenine.test',
  extensions.crypt('demo-T2wx-bw9JAyx', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Demo Designer"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
  '{"sub":"d0000000-0000-4000-8000-000000000001","email":"demo@basenine.test","email_verified":true}', 'email', now(), now(), now());

insert into public.projects (id, workspace_id, name, site_url, public_key, allowed_origins, created_by)
select 'a0000000-0000-4000-8000-000000000001'::uuid, m.workspace_id, 'Acme (demo site)', 'http://localhost:4000', 'pk_000000000000000000000001',
  array['http://localhost:4000'], m.user_id
from public.workspace_members m where m.user_id = 'd0000000-0000-4000-8000-000000000001';

insert into public.pages (project_id, url, title) values
  ('a0000000-0000-4000-8000-000000000001', 'http://localhost:4000/', 'Home'),
  ('a0000000-0000-4000-8000-000000000001', 'http://localhost:4000/pricing', 'Pricing');
