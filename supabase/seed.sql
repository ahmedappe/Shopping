-- Optional starter categories. Run after 0001_init.sql.
insert into public.categories (name, slug, sort_order) values
  ('Clothing',    'clothing',    1),
  ('Electronics', 'electronics', 2),
  ('Home',        'home',        3),
  ('Beauty',      'beauty',      4)
on conflict (slug) do nothing;

-- Make yourself an admin after signing up on the site (replace the email):
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'you@example.com');
