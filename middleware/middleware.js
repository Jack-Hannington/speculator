const accessControl = (requiredRole) => {
    return (req, res, next) => {
        const userRole = req.user.role;
        if (userRole === requiredRole) {
            next();
        } else {
            res.status(403).send('Access Denied');
        }
    };
};

module.exports = accessControl;