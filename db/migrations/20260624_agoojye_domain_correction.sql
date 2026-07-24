-- Align AGOOJIYE live seed email data with the registered OVH domain spelling.

update agoojye_email_identities
set
  email_address = replace(email_address, '@agoojye.com', '@agoojiye.com'),
  updated_at = now()
where email_address like '%@agoojye.com';

update agoojye_tenant_email_settings
set
  from_email = replace(from_email, '@agoojye.com', '@agoojiye.com'),
  reply_to_email = replace(reply_to_email, '@agoojye.com', '@agoojiye.com'),
  updated_at = now()
where from_email like '%@agoojye.com'
   or reply_to_email like '%@agoojye.com';
