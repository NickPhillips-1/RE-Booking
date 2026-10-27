begin;

insert into private.client (name, email, phone, password_hash)
values (
  :'name',
  lower(:'email'),
  :'phone',
  public.crypt(:'password', public.gen_salt('bf', 10))
)
on conflict ((lower(email))) do nothing;

update private.client
set password_hash = public.crypt(:'password', public.gen_salt('bf', 10)),
    token_version = token_version + 1
where lower(email) = lower(:'email')
  and password_hash <> public.crypt(:'password', password_hash);

commit;
