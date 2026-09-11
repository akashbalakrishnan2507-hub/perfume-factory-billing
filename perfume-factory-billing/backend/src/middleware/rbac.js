'use strict';

/**
 * Require a specific role: 'admin' | 'staff'
 * Returns 403 if user doesn't have the role.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Required role: ${roles.join(' or ')}`,
        },
      });
    }
    next();
  };
}

/**
 * Require a specific permission string.
 * Admins always pass. Staff must have the permission in their permissions array.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }
    // Admins have all permissions
    if (req.user.role === 'admin') return next();

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing required permission: ${permission}`,
        },
      });
    }
    next();
  };
}

module.exports = { requireRole, requirePermission };
