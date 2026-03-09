import jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

export default function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.debug('JWT Middleware: Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    console.debug('JWT Middleware: Token valid, user:', decoded);
    next();
  } catch (err) {
    console.debug('JWT Middleware: Invalid or expired token', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

