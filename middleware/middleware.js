// Authentication middleware
// Authentication middleware
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated() && req.session.user_id) {
        return next();
    } else {
        res.redirect('/login');
    }
};


const accessControl = (requiredRole) => {
    return (req, res, next) => {
        ensureAuthenticated(req, res, () => {
            const userRole = req.user.role;
            if (userRole === requiredRole) {
                return next();
            } else {
                res.status(403).send('Access Denied');
            }
        });
    };
};


module.exports = { accessControl, ensureAuthenticated };