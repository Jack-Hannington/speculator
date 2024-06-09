// Authentication middleware
// Authentication middleware
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('error', 'Session expired. Please log in again.');
    res.redirect('/login');
}


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