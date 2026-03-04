-- Add self-referencing foreign key for company_clone_assignments hierarchy
-- This is done via SQL migration because Drizzle doesn't support inline self-referencing FKs
-- in the current pattern without circular type issues.

-- Add the foreign key constraint for manager_agent_id
ALTER TABLE company_clone_assignments
ADD CONSTRAINT company_clone_assignments_manager_fkey
FOREIGN KEY (manager_agent_id)
REFERENCES company_clone_assignments(id)
ON DELETE SET NULL;

-- Add index for efficient hierarchy queries (if not already created by Drizzle)
CREATE INDEX IF NOT EXISTS assignment_manager_idx 
ON company_clone_assignments(manager_agent_id);
