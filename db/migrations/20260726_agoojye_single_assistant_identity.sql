-- Keep the legacy technical key/slug for compatibility while exposing one
-- official assistant identity everywhere in the AGOOJIYE tenant.
update agoojye_workos_agents
set
  name = 'AGOOJIYE — Assistant IA',
  description = 'Assistant unique contextualisé pour le travail personnel, les départements, les opérations mobilité et la direction.',
  updated_at = now()
where
  key = 'howji'
  and tenant_id = (select id from tenants where "key" = 'agoojye' limit 1);

update agoojye_os_channels
set
  name = 'AGOOJIYE — Assistant IA',
  description = 'Conversation épinglée de synthèse, échéances, blocages et recommandations contextualisées.',
  updated_at = now()
where
  slug = 'howji-coordination'
  and tenant_id = (select id from tenants where "key" = 'agoojye' limit 1);

update agoojye_os_messages as message
set
  body = 'AGOOJIYE — Assistant IA prépare les synthèses, suit les échéances et propose des relances selon vos autorisations. Les actions externes, financières, juridiques, publiques ou liées aux accès nécessitent une approbation humaine.',
  updated_at = now()
from agoojye_os_channels as channel
where
  message.channel_id = channel.id
  and message.tenant_id = (select id from tenants where "key" = 'agoojye' limit 1)
  and channel.tenant_id = message.tenant_id
  and channel.slug = 'howji-coordination'
  and message.message_type = 'agent_system';

update agoojye_os_notifications
set
  type = 'assistant',
  title = replace(title, 'HOWJI', 'AGOOJIYE'),
  link = '/admin/assistant'
where
  tenant_id = (select id from tenants where "key" = 'agoojye' limit 1)
  and (
    type = 'howji'
    or title ilike '%HOWJI%'
    or link = '/admin/howji'
  );
