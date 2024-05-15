const express = require('express');
const router = express.Router();
const LocalStrategy = require('passport-local').Strategy;
const passport = require('passport');
const bcrypt = require('bcrypt');
const supabase = require('../config/supabaseClient');
const session = require('express-session');

// Passport Local Strategy for Supabase
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      // Query user by email
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        return done(error);
      }

      if (!data) {
        return done(null, false, { message: 'No user found.' });
      }

      // Compare password with hashed password in database
      const match = await bcrypt.compare(password, data.password);

      if (match) {
        return done(null, data);
        
      } else {
        return done(null, false, { message: 'Invalid email or password.' });
      }
    } catch (error) {
      return done(error);
    }
  }
));

// Passport Serialize User
passport.serializeUser(function(user, done) {
  console.log("Serializing user:", user);
  done(null, user.id); // or whatever unique identifier you use for the user
});

passport.deserializeUser(function(id, done) {
  console.log("Deserializing user ID:", id);
  // Replace the following with your user lookup, ensuring you're searching based on the serialized ID
  findUserById(id, function(err, user) {
    if (err) { return done(err); }
    console.log("Deserialized user:", user);
    done(null, user); // This should match the structure of the user object used in serialization
  });
});



// Login Route
router.post('/login', passport.authenticate('local', {
  successRedirect: '/', // redirect to the secure profile section
  failureRedirect: '/login', // redirect back to the login page if there is an error
  failureFlash: false, 
  session: false
}));

router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10); // 10 is the saltRounds

    try {
        const { data, error } = await supabase
            .from('users')
            .insert([
                { email: email, password: hashedPassword }
            ]);

        if (error) {
            throw error;
        }

        res.redirect('/auth/login'); // Adjust the path as needed
    } catch (error) {
        res.status(400).send(error.message);
    }
});

router.get('/logout', (req, res) => {
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/auth/login'); // Or wherever you'd like to redirect after logout
    });
});

// Route to display the registration form
router.get('/register', (req, res) => {
    res.render('auth/register');
});

// Route to display the login form
router.get('/login', (req, res) => {
    res.render('auth/login');
});



module.exports = router;