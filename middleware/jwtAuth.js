import JWT from "jsonwebtoken";

export const jwtAuth = (req, res, next) => {
  const token = (req.cookies && req.cookies.token) || null;

  if (!token) {
    return res.status(401).json({ success: false, message: "NOT authorized" });
  }

  try {
    const payload = JWT.verify(token, process.env.SECRET);
    req.user = { 
      id: payload.id, 
      email: payload.email,
      role: payload.role,
      isApproved: payload.isApproved
    };
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message });
  }
  next();
};

// New middleware to check if user is approved
export const isApproved = (req, res, next) => {
  if (!req.user.isApproved) {
    return res.status(403).json({ 
      success: false, 
      message: "Your account is pending approval from admin" 
    });
  }
  next();
};

// Admin middleware
export const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: "Access denied: Admin privileges required" 
    });
  }
  next();
};

export default jwtAuth;