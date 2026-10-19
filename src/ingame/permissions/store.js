const db = require('../db');

module.exports = {
  getRoleActions: db.getRoleActions,
  listConfiguredRoles: db.listConfiguredRoles,
  setRoleActions: db.setRoleActions,
  mergeRoleActions: db.mergeRoleActions,
  removeRole: db.removeRole,
  getMemberActionIds: db.getMemberActionIds,
};
