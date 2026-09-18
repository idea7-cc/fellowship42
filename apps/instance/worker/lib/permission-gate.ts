// Column names and permission literals are internal constants, never request input.
export function membershipPermissionGate(
  churchColumn: string,
  permission: 'church.write' | 'events.write',
) {
  return `EXISTS (SELECT 1 FROM church_memberships cm JOIN users u ON u.id=cm.user_id
 JOIN membership_roles mr ON mr.church_id=cm.church_id AND mr.membership_id=cm.id
 JOIN role_permissions rp ON rp.role_id=mr.role_id WHERE cm.church_id=${churchColumn} AND cm.user_id=?
 AND cm.status='active' AND u.status='active' AND rp.permission IN ('*','${permission}'))`
}
