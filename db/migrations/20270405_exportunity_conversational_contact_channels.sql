-- Let an industrial buyer choose either email or WhatsApp during Awa's intake.
-- The application validator still requires at least one contact channel.
alter table industrial_requirements
  alter column requester_email drop not null;
