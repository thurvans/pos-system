DELETE FROM "role_permissions"
WHERE "role" = 'MANAGER'
  AND "permission" = 'TABLE_MANAGE';
