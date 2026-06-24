-- Make AGOOJYE seed data idempotent and French-first.

with ranked_partners as (
  select id, row_number() over (partition by tenant_id, name order by id) as rn
  from agoojye_partners
)
delete from agoojye_partners
where id in (select id from ranked_partners where rn > 1);

with ranked_milestones as (
  select id, row_number() over (partition by tenant_id, title order by id) as rn
  from agoojye_milestones
)
delete from agoojye_milestones
where id in (select id from ranked_milestones where rn > 1);

with ranked_documents as (
  select id, row_number() over (partition by tenant_id, title order by id) as rn
  from agoojye_documents
)
delete from agoojye_documents
where id in (select id from ranked_documents where rn > 1);

update agoojye_teams set
  name = case slug
    when 'leadership-coordination' then 'Direction & coordination'
    when 'engineering' then 'Ingénierie'
    when 'design' then 'Design'
    when 'software-ai' then 'Logiciel & IA'
    when 'communication-media' then 'Communication & médias'
    when 'legal-governance' then 'Juridique & gouvernance'
    when 'sponsorship-partnerships' then 'Sponsoring & partenariats'
    when 'industrial-supply-chain' then 'Industrie & chaîne d''approvisionnement'
    when 'schools-talent' then 'Écoles & talents'
    else name
  end,
  mission = case slug
    when 'leadership-coordination' then 'Coordonner les décisions, la cadence, les arbitrages et les relations institutionnelles.'
    when 'engineering' then 'Concevoir, valider et assembler les systèmes mécaniques, électriques et de sécurité du prototype.'
    when 'design' then 'Définir l''identité produit, les interfaces, l''expérience passager et les supports visuels.'
    when 'software-ai' then 'Construire les outils numériques, la documentation technique et les workflows d''intelligence opérationnelle.'
    when 'communication-media' then 'Produire la narration, la presse, le documentaire et la visibilité publique du mouvement.'
    when 'legal-governance' then 'Structurer les accords, la gouvernance, les risques, les NDA et la conformité.'
    when 'sponsorship-partnerships' then 'Organiser les sponsors, partenaires, prospects, packages et suivis commerciaux.'
    when 'industrial-supply-chain' then 'Piloter les fournisseurs, pièces, BOM, logistique, atelier et trajectoire d''industrialisation.'
    when 'schools-talent' then 'Mobiliser les écoles, les profils techniques et le pipeline de talents.'
    else mission
  end,
  description = case slug
    when 'leadership-coordination' then 'Coordonner les décisions, la cadence, les arbitrages et les relations institutionnelles.'
    when 'engineering' then 'Concevoir, valider et assembler les systèmes mécaniques, électriques et de sécurité du prototype.'
    when 'design' then 'Définir l''identité produit, les interfaces, l''expérience passager et les supports visuels.'
    when 'software-ai' then 'Construire les outils numériques, la documentation technique et les workflows d''intelligence opérationnelle.'
    when 'communication-media' then 'Produire la narration, la presse, le documentaire et la visibilité publique du mouvement.'
    when 'legal-governance' then 'Structurer les accords, la gouvernance, les risques, les NDA et la conformité.'
    when 'sponsorship-partnerships' then 'Organiser les sponsors, partenaires, prospects, packages et suivis commerciaux.'
    when 'industrial-supply-chain' then 'Piloter les fournisseurs, pièces, BOM, logistique, atelier et trajectoire d''industrialisation.'
    when 'schools-talent' then 'Mobiliser les écoles, les profils techniques et le pipeline de talents.'
    else description
  end,
  updated_at = now()
where slug in (
  'leadership-coordination',
  'engineering',
  'design',
  'software-ai',
  'communication-media',
  'legal-governance',
  'sponsorship-partnerships',
  'industrial-supply-chain',
  'schools-talent'
);

update agoojye_partners set
  name = case name
    when 'Technical schools' then 'Écoles techniques'
    when 'Institutional partners' then 'Partenaires institutionnels'
    else name
  end,
  description = case name
    when 'Exportunity Machinery' then 'Initiateur et porteur de la vision industrielle de mobilité électrique.'
    when 'Future Studio' then 'Partenaire co-lead pour l''accélération, le digital, le design et la coordination innovation.'
    when 'GDIZ' then 'Écosystème industriel et ambition de production locale à structurer.'
    when 'Technical schools' then 'Viviers de talents techniques, étudiants, encadreurs et contributeurs.'
    when 'Écoles techniques' then 'Viviers de talents techniques, étudiants, encadreurs et contributeurs.'
    when 'Sponsors' then 'Entreprises et institutions appelées à soutenir le Challenge Véhicule Électrique.'
    when 'Institutional partners' then 'Acteurs publics et institutionnels à mobiliser autour du mouvement industriel.'
    when 'Partenaires institutionnels' then 'Acteurs publics et institutionnels à mobiliser autour du mouvement industriel.'
    else description
  end,
  updated_at = now()
where name in ('Exportunity Machinery', 'Future Studio', 'GDIZ', 'Technical schools', 'Écoles techniques', 'Sponsors', 'Institutional partners', 'Partenaires institutionnels');

update agoojye_milestones set
  title = case title
    when 'Project preparation' then 'Préparation du projet'
    when 'Team formation' then 'Formation des équipes'
    when 'Technical validation' then 'Validation technique'
    when 'Prototype assembly' then 'Assemblage du prototype'
    when 'Live assembly' then 'Assemblage public'
    when 'Reveal gala' then 'Reveal gala'
    when 'Documentary production' then 'Production documentaire'
    when 'Public video release' then 'Sortie publique de la vidéo'
    when 'Bus exhibition and order collection' then 'Exposition du bus et collecte d''intérêts'
    when 'Capital mobilization' then 'Mobilisation de capital'
    else title
  end,
  description = case title
    when 'Project preparation' then 'Préparation du projet, cadrage et mobilisation initiale.'
    when 'Team formation' then 'Formation des équipes techniques et opérationnelles.'
    when 'Technical validation' then 'Validation technique, fournisseurs, BOM et faisabilité.'
    when 'Prototype assembly' then 'Assemblage du prototype avant la phase publique.'
    when 'Live assembly' then 'Assemblage public cible du bus électrique.'
    when 'Reveal gala' then 'Gala de révélation cible et présentation institutionnelle.'
    when 'Documentary production' then 'Production documentaire fin juillet.'
    when 'Public video release' then 'Publication publique cible de la vidéo documentaire.'
    when 'Bus exhibition and order collection' then 'Exposition du bus et collecte d''intérêts commerciaux après révélation.'
    when 'Capital mobilization' then 'Mobilisation de capital pour la société de véhicules électriques.'
    else description
  end,
  owner = case owner
    when 'Engineering' then 'Ingénierie'
    when 'Communication & Media' then 'Communication & médias'
    when 'Partnerships' then 'Partenariats'
    else owner
  end,
  updated_at = now()
where title in (
  'Project preparation',
  'Team formation',
  'Technical validation',
  'Prototype assembly',
  'Live assembly',
  'Reveal gala',
  'Documentary production',
  'Public video release',
  'Bus exhibition and order collection',
  'Capital mobilization'
);

update agoojye_documents set
  title = case title
    when 'Strategic plan' then 'Plan stratégique'
    when 'Sponsorship package' then 'Dossier sponsor'
    when 'Participant agreement' then 'Accord participant'
    when 'Team organigram' then 'Organigramme des équipes'
    when 'Technical bill of materials' then 'Nomenclature technique'
    when 'Supplier list' then 'Liste fournisseurs'
    when 'Gala concept note' then 'Note conceptuelle du gala'
    when 'Documentary concept' then 'Concept documentaire'
    when 'Legal structuring note' then 'Note de structuration juridique'
    when 'Homologation plan' then 'Plan d''homologation'
    else title
  end,
  description = case title
    when 'Strategic plan' then 'Plan directeur industriel et narratif.'
    when 'Sponsorship package' then 'Offres de visibilité sponsors.'
    when 'NDA' then 'Accord de confidentialité participants et partenaires.'
    when 'Participant agreement' then 'Engagement des contributeurs du challenge.'
    when 'Team organigram' then 'Structure des équipes et rôles confirmés.'
    when 'Technical bill of materials' then 'BOM et liste technique du prototype.'
    when 'Supplier list' then 'Fournisseurs et statuts de discussion.'
    when 'Gala concept note' then 'Concept note du reveal gala.'
    when 'Documentary concept' then 'Note de production documentaire.'
    when 'Legal structuring note' then 'Structuration juridique de la future société.'
    when 'Homologation plan' then 'Plan d''homologation et sécurité.'
    else description
  end,
  updated_at = now()
where title in (
  'Strategic plan',
  'Sponsorship package',
  'NDA',
  'Participant agreement',
  'Team organigram',
  'Technical bill of materials',
  'Supplier list',
  'Gala concept note',
  'Documentary concept',
  'Legal structuring note',
  'Homologation plan'
);

create unique index if not exists agoojye_partners_tenant_name_uidx on agoojye_partners(tenant_id, name);
create unique index if not exists agoojye_milestones_tenant_title_uidx on agoojye_milestones(tenant_id, title);
create unique index if not exists agoojye_documents_tenant_title_uidx on agoojye_documents(tenant_id, title);
