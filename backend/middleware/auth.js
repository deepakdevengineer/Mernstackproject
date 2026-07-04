const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  // Token format: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Token format is invalid' });
  }

  const token = parts[1];

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach user to request
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid or expired' });
  }
};
