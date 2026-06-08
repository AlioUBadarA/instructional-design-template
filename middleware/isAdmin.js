function isAdmin(req, res, next) {
  if (req.userRole !== 'superadmin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

module.exports = isAdmin;
