const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const fs = require('fs');
const flash = require('connect-flash');
const path = require('path');
const supabase = require('./config/supabaseClient');
const methodOverride = require('method-override');
const base_url = process.env.NODE_ENV === 'DEV' ? process.env.DEV_URL : process.env.PROD_URL;
const {bookingConfirmation, resetPasswordEmail} = require('./config/sendgrid');
const responseTimeLogger = require('./utils/responseLogger');
console.log(resetPasswordEmail)

// Initialize Express app
const app = express();
require('dotenv').config();
const stripeWebhookRouter = require('./routes/stripeWebhookRouter');
const accessControl = require('./middleware/middleware');

app.use('/stripe', stripeWebhookRouter);  // Mount the webhook router


app.use(methodOverride('_method'));

// Set view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files
app.use(express.static('public'));

// Parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
// Parse application/json
app.use(express.json());

// Session middleware setup
app.use(session({
  secret: 'replace_with_a_long_random_string',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // Use true only if you are on HTTPS
    maxAge: 1000 * 60 * 60 * 24 // Example: 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

//flash
app.use(flash());

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
  done(null, user.id);
});

// Passport Deserialize User
passport.deserializeUser(async (id, done) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return done(error);
    }

    done(null, data);
  } catch (error) {
    done(error);
  }
});

app.use((req, res, next) => {
  if (req.user) {
    res.locals.user = req.user;  // For view templates
    req.session.user_id = req.user.id;  // Set user ID in session
    req.session.role = req.user.role;
  }
  next();
});



// Authentication and Authorization Routes

app.get('/login', responseTimeLogger, (req, res) => {
  const messages = req.flash('success'); // Retrieve the flash message
  res.render('auth/login', { message: messages[0] });
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.log('Error during authentication:', err);
      let errMsg;
      if (err.message.includes("JSON object requested, multiple (or no) rows returned")) {
        errMsg = "Account not found. Did you use a different email address?";
      } else {
        errMsg = "An unexpected error occurred. Please try again.";
      }
      req.flash('error', `${errMsg} Please try again.`);
      return res.redirect('/login');
    }

    if (!user) {
      req.flash('error', info.message || 'Invalid login credentials.');
      return res.redirect('/login');
    }

    // After authentication is successful, store the user role in the session
    req.logIn(user, (err) => {
      if (err) {
        console.log('Error during session creation:', err);
        req.flash('error', 'Failed to create a session. Please try again.');
        return res.redirect('/login');
      }

      // Store the role in the session explicitly
      req.session.role = user.role; // Ensure 'role' is included in the user object
      console.log(user)
      // Redirect to the dashboard or any appropriate page
      req.flash('success','Login successful')
      return res.redirect('/');
    });
  })(req, res, next);
});

  

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  console.log(req.body)
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const { data, error } = await supabase
      .from('users')
      .insert([
        { name: name, email: email, password: hashedPassword}
      ]);

    if (error) {
      throw error;
    }

    res.redirect('/login');
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/login');
  });
});

app.get('/register', (req, res) => {
  res.render('auth/register');
});

// Reset passwords
app.get('/request-reset', (req, res) => {
  // Render a view that contains the password reset request form
  res.render('auth/request-reset');
});

app.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return res.status(404).send('Email not found');
    }

    console.log(`This user requested a reset: ${user.email}`);

    if (user) {
      const token = crypto.randomBytes(20).toString('hex'); // Generate a secure token
      const expiration = new Date(Date.now() + 3600000).toISOString(); // Token expires in one hour

      // Store the reset token and expiration in the database
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ reset_password_token: token, reset_password_expires: expiration })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating user with reset token:', updateError);
        return res.status(500).send('Failed to store reset token');
      }

      console.log(`Reset token set: ${token}`);

      // Send an email with the reset link
      await resetPasswordEmail(user.email, 'Your password reset', `${base_url}/reset/${token}`);
      req.flash('success', 'Password reset link sent'); 
      res.redirect('/login'); 
    } else {
      res.status(404).send('Email not found');
    }
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).send('Error processing reset request');
  }
});


// Reset with token route
app.get('/reset/:token', async (req, res) => {
  const { token } = req.params;

  try {
    console.log(token)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, reset_password_expires')
      .eq('reset_password_token', token)
      .single();

    if (error || !user) {
      console.log('error', 'Password reset token is invalid or has expired.')
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/login');
    }

    const currentDate = new Date();
    const expirationDate = new Date(user.reset_password_expires);
    
    console.log('Current date:', currentDate.toISOString());
    console.log('Expiration date:', expirationDate.toISOString());
    
    if (currentDate.getTime() < expirationDate.getTime()) {
      // Token is valid
      res.render('auth/reset-password', { token , message: req.flash('Success')});
    } else {
      // Token has expired
      console.log('Token has expired');
      req.flash('error', 'Your reset token has expired.');
      return res.redirect('/login');
    }
  } catch (error) {
    console.error('Failed to validate token:', error);
    res.status(500).send('Failed to validate reset token.');
  }
});

app.post('/reset-password', async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  console.log("Received reset-password request with body:", req.body);

  if (password !== confirmPassword) {
    console.log("Passwords do not match.");
    return res.status(400).send('Passwords do not match');
  }

  try {
    console.log("Attempting to fetch user with token:", token);
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('reset_password_token', token)  // Ensure field names are correctly spelled as in your database
      .single();

    if (error) {
      console.error('Error fetching user with token:', error);
      return res.status(500).send({ message: "Failed to validate reset token", details: error.message });
    }

    if (user) {
      console.log("User found with token, updating password for user ID:", user.id);
      const updateResponse = await supabase
        .from('users')
        .update({ 
          password: await bcrypt.hash(password, 10), // Ensure hashing of the password
          reset_password_token: null, // Clear the reset token
          reset_password_expires: null // Clear the expiration
        })
        .eq('id', user.id);

      if (updateResponse.error) {
        console.error('Error updating user password:', updateResponse.error);
        return res.status(500).send({ message: "Failed to update password", details: updateResponse.error.message });
      }

      console.log("Password updated successfully for user ID:", user.id);

      //send over flash message here
      req.flash('success', 'Password changed successfully'); 
      res.redirect('/login');
    } else {
      console.log("No user found with provided token, or token has expired.");
      res.status(400).send('Password reset token is invalid or has expired');
    }
  } catch (error) {
    console.error('Unexpected error in reset-password route:', error);
    res.status(500).send('Failed to reset password');
  }
});



  
  
app.get('/', async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      // Retrieve the authenticated user's tenant ID and ID
      const tenantId = req.user.tenant_id;
      const userId = req.user.id;

      // Render the home page with the bookings and tenant ID
      // const messages = req.flash('success'); // Retrieve the flash message
      res.render('home');

    } catch (err) {
      console.error('Error during data fetching:', err);
      return res.status(500).send('Error fetching user data.');
    }
  } else {
    // Handle unauthenticated access (redirect to login)
    res.redirect('/login');
  }
});




// More routes and middleware as needed
const customersRoute = require('./routes/customers');
const bookingRoute = require('./routes/bookings');
const servicesRoute = require('./routes/services');
const assessmentsRoute = require('./routes/assessments');



// Use routes
app.use('/bookings', bookingRoute)
app.use('/services', servicesRoute);
app.use('/customers', customersRoute)
app.use('/assessments', assessmentsRoute)


// fs.readFile('public/washer.png', async (err, avatarFile) => {
//   if (err) {
//     console.error("Error reading file:", err);
//     return;
//   }

//   // Upload the file to Supabase storage
//   const { data, error } = await supabase
//     .storage
//     .from('flexiibook')
//     .upload('tenant_profiles/washer.png', avatarFile, {
//       cacheControl: '3600',
//       upsert: false
//     });

//   if (error) {
//     console.error("Upload error:", error);
//   } else {
//     console.log("Upload successful:", data);
//   }
// });

module.exports = app;
