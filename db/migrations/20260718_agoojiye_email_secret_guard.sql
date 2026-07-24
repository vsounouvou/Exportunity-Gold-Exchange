update agoojye_tenant_email_settings
set smtp_password_encrypted = null,
    updated_at = now()
where smtp_password_encrypted is not null;

alter table agoojye_tenant_email_settings
  drop constraint if exists agoojye_email_settings_no_stored_secret;

alter table agoojye_tenant_email_settings
  add constraint agoojye_email_settings_no_stored_secret
  check (smtp_password_encrypted is null);
