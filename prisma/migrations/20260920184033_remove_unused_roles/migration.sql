-- Remove unused roles: staff, broker, invitor

-- First, remove any role permissions for these roles
DELETE FROM "role_permissions" 
WHERE "role_id" IN (
  SELECT id FROM "roles" WHERE "role_name" IN ('staff', 'broker', 'invitor')
);

-- Then, delete the unused roles
DELETE FROM "roles" WHERE "role_name" IN ('staff', 'broker', 'invitor');
