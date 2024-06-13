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
const { resetPasswordEmail, sendPinReminderEmail } = require('./config/sendgrid');
const responseTimeLogger = require('./utils/responseLogger');
const generatePin = require('./utils/pinGenerator');


// Initialize Express app
const app = express();
require('dotenv').config();
const stripeWebhookRouter = require('./routes/stripeWebhookRouter');
const { accessControl, ensureAuthenticated } = require('./middleware/middleware');

app.use('/stripe', stripeWebhookRouter);
app.use(methodOverride('_method'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  req.flash('error', 'An unexpected error occurred. Please log in again.');
  res.redirect('/login');
});


// Set view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

if (process.env.NODE_ENV === 'PROD') {
  app.set('trust proxy', 1);
}
// Serve static files
app.use(express.static('public'));

// Parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
// Parse application/json
app.use(express.json());

// Session middleware setup
app.use(session({
  secret: process.env.SESSION_SECRET, // Use an environment variable
  resave: false,
  saveUninitialized: false, // Only save the session if something is stored
  cookie: {
    secure: process.env.NODE_ENV === 'PROD', // Only secure cookies in production
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
    maxAge: 1000 * 60 * 60 * 24, // Example: 24 hours
    sameSite: 'lax' // Or 'strict' depending on your needs
  }
}));


// console.log('Session Config:', {
//   secret: process.env.SESSION_SECRET,
//   secure: process.env.NODE_ENV === 'PROD',
//   nodeEnv: process.env.NODE_ENV
// });


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
passport.serializeUser(function (user, done) {
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

app.use(async (req, res, next) => {
  if (req.user) {
    res.locals.user = req.user;  // For view templates
    req.session.user_id = req.user.id;  // Set user ID in session
    req.session.role = req.user.role;

    // Fetch business details if business ID is present
    if (req.user.business != null) {
      const { data: business, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', req.user.business)
        .single();

      // console.log(business)

      if (error) {
        console.error('Error fetching business details:', error);
      } else {
        res.locals.user.businessName = business.name;
        res.locals.user.businessImage = business.image;
      }
    }
  }
  next();
});



// Authentication and Authorization Routes

app.get('/login', responseTimeLogger, (req, res) => {
  const messages = req.flash('success'); // Retrieve the flash message
  res.render('auth/login', { message: messages[0] });
});

app.post('/login', async (req, res, next) => {
  const { email, password } = req.body;

  try {
    // Fetch the user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      req.flash('error', 'Invalid email or credentials.');
      return res.redirect('/login');
    }

    // Determine user role and handle authentication
    if (user.role === 'admin') {
      // Admin authentication using Passport
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

        req.logIn(user, (err) => {
          if (err) {
            console.log('Error during session creation:', err);
            req.flash('error', 'Failed to create a session. Please try again.');
            return res.redirect('/login');
          }

          req.session.role = user.role;
          req.flash('success', 'Login successful');
          return res.redirect('/');
        });
      })(req, res, next);
    } else {
      // Corporate user authentication using access pin
      console.log('Non-admin user detected:', user); // Debugging line


      req.logIn(user, (err) => {
        if (err) {
          console.log('Error during session creation:', err);
          req.flash('error', 'Failed to create a session. Please try again.');
          return res.redirect('/login');
        }

        req.session.role = user.role;
        req.flash('success', 'Login successful');
        console.log('Login successful for non-admin user'); // Debugging line
        return res.redirect('/');
      });
    }
  } catch (error) {
    console.error('Error during authentication:', error);
    req.flash('error', 'An unexpected error occurred. Please try again.');
    res.redirect('/login');
  }
});






app.post('/register', async (req, res) => {
  const { first_name, last_name, email, password } = req.body;
  console.log(req.body)
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const { data, error } = await supabase
      .from('users')
      .insert([
        { first_name, last_name, email: email, password: hashedPassword }
      ]);

    if (error) {
      throw error;
    }

    res.redirect('/login');
  } catch (error) {
    res.status(400).send(error.message);
  }
});



// corporate registration
app.get('/complete-registration', async (req, res) => {
  const { access_pin } = req.query;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .eq('access_pin', access_pin)
      .single();

    if (error || !data) {
      req.flash('error', 'Invalid access pin.');
      return res.redirect('/error-page'); // Adjust the redirect to your actual error page
    }

    const email = data.email;
    const messages = req.flash('success'); // Retrieve the flash message
    res.render('auth/register-corporate', { accessPin: access_pin, email, message: messages[0] });
  } catch (error) {
    console.error('Error fetching user email:', error.message);
    req.flash('error', 'An error occurred while fetching user data.');
    return res.redirect('/error-page'); // Adjust the redirect to your actual error page
  }
});


// Complete registration route
app.post('/complete-registration', async (req, res) => {
  const { access_pin, first_name, last_name, day, month, year, gender } = req.body;

  // Combine day, month, year into a single date field
  const date_of_birth = new Date(Date.UTC(year, month - 1, day));

  try {
    console.log(req.body);
    const { data, error } = await supabase
      .from('users')
      .update({ first_name, last_name, date_of_birth, gender, is_registered: true })
      .eq('access_pin', access_pin)
      .select();

    if (error) {
      throw error;
    }

    console.log(data)

    if (!data || data[0].length === 0) {
      req.flash('error', 'Invalid access pin.');
      return res.redirect('/complete-registration?access_pin=' + access_pin);
    }

    req.flash('success', 'Registration completed successfully.');
    res.redirect('/corporate-login');
  } catch (error) {
    req.flash('error', error.message);
    res.redirect('/complete-registration?access_pin=' + access_pin);
  }
});


// Corporate login
// GET route for corporate login page
app.get('/corporate-login', responseTimeLogger, (req, res) => {
  const messages = req.flash('success');
  res.render('auth/corporate-login', { message: messages[0] });
});

// POST route for corporate login
app.post('/corporate-login', async (req, res) => {
  const { email, access_pin } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('access_pin', access_pin)
      .single();

    if (error || !data) {
      req.flash('error', 'Invalid email or access pin.');
      return res.redirect('/corporate-login');
    }

    // Assuming the user object is returned correctly
    const user = data;

    req.logIn(user, (err) => {
      if (err) {
        console.log('Error during session creation:', err);
        req.flash('error', 'Failed to create a session. Please try again.');
        return res.redirect('/corporate-login');
      }

      req.session.role = user.role; // Ensure 'role' is included in the user object

      req.flash('success', 'Login successful');
      return res.redirect('/');
    });
  } catch (error) {
    console.error('Error during authentication:', error);
    req.flash('error', 'An unexpected error occurred. Please try again.');
    res.redirect('/corporate-login');
  }
});





app.get('/logout', (req, res) => {
  req.logout(function (err) {
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
      .select('id, email, role, access_pin')
      .eq('email', email)
      .single();

    if (userError || !user) {
      console.error('Error fetching user:', userError);
      req.flash('error', 'Email not found');
      return res.redirect('/request-reset');
    }

    console.log(`This user requested a reset: ${user.email}`);

    if (user.role === 'admin') {
      const token = crypto.randomBytes(20).toString('hex'); // Generate a secure token
      const expiration = new Date(Date.now() + 3600000).toISOString(); // Token expires in one hour

      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ reset_password_token: token, reset_password_expires: expiration })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating user with reset token:', updateError);
        req.flash('error', 'Failed to store reset token');
        return res.redirect('/request-reset');
      }

      console.log(`Reset token set: ${token}`);

      await resetPasswordEmail(user.email, 'Your password reset', `${base_url}/reset/${token}`);
      req.flash('success', 'Password reset link sent');
    } else {
      // Non-admin users
      await sendPinReminderEmail(user.email, 'Your access pin reminder', `Your access pin is ${user.access_pin}. <br/>Login: ${base_url}/login`);
      req.flash('success', 'Access pin reminder sent');
    }

    res.redirect('/login');
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error', 'Error processing reset request');
    res.redirect('/request-reset');
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
      res.render('auth/reset-password', { token, message: req.flash('Success') });
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


// get total entries. Get highest score. Calculate 

async function getLatestAssessmentRanks(userId, ageBand, businessId) {
  const { data, error } = await supabase.rpc('get_latest_assessment_ranks', {
    p_user_id: userId,
    p_age_band: ageBand,
    p_business: businessId
  });
  if (error) {
    console.error('Error fetching ranks:', error);
    return null;
  } else {
    return data;
  }
}

// // Example usage:
// getLatestAssessmentRanks(2, '<35', 3).then(ranks => {
//   console.log('Ranks:', ranks);
// });





async function getUserGoals(userId) {
  const { data: goals, error } = await supabase
    .from('user_goals')
    .select('category_id')
    .eq('user_id', userId);

  if (error) throw error;
  console.log(goals)
  return goals.map(goal => goal.category_id);
}

app.get('/', async (req, res) => {
  const round = req.query.round || '1'; // Default to Round 1 if no round is specified

  try {
    // Fetch fixtures for the specified round with home and away team details
    const { data: fixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select(`
        id,
        round,
        kick_off_time,
        is_finished,
        home_team: home_team_id (id, name),
        away_team: away_team_id (id, name)
      `)
      .eq('round', round);

    if (fixturesError) {
      throw fixturesError;
    }

    // Fetch all rounds for the dropdown selection
    const { data: allFixtures, error: allFixturesError } = await supabase
      .from('fixtures')
      .select('round');

    if (allFixturesError) {
      throw allFixturesError;
    }

    // Extract unique rounds from all fixtures
    const rounds = [...new Set(allFixtures.map(fixture => fixture.round))];

    res.render('home', { fixtures, rounds, selectedRound: round });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});


const checkSubmissionTime = async (req, res, next) => {
  const round = req.query.round || '1'; // Default to Round 1 if no round is specified

  try {
    // Fetch the start time of the first fixture for the specified round
    const { data: firstFixture, error } = await supabase
      .from('fixtures')
      .select('kick_off_time')
      .eq('round', round)
      .order('kick_off_time', { ascending: true })
      .limit(1)
      .single();

    if (error) {
      throw error;
    }

    if (firstFixture) {
      const now = new Date();
      const kickOffTime = new Date(firstFixture.kick_off_time);
      const lockTime = new Date(kickOffTime.getTime() - 2 * 60 * 1000); // 2 minutes before kick-off

      if (now > lockTime) {
        return res.status(403).send('Predictions are locked 2 minutes before the start of the first fixture.');
      }
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

app.post('/predictions/user-predictions', checkSubmissionTime, async (req, res) => {
  const userId = req.user.id; // Assume user ID is stored in session
  const predictions = req.body; // All form data

  try {
    for (const key in predictions) {
      if (predictions.hasOwnProperty(key) && key.startsWith('fixture_id_')) {
        const fixtureId = key.split('_')[2];
        const homeScore = predictions[`home_score_${fixtureId}`];
        const awayScore = predictions[`away_score_${fixtureId}`];

        if (homeScore === '' && awayScore === '') {
          continue; // Skip if both scores are empty
        }

        const predictionData = {
          user_id: userId,
          fixture_id: fixtureId,
          prediction_time: new Date().toISOString()
        };

        if (homeScore !== '') predictionData.predicted_home_score = homeScore;
        if (awayScore !== '') predictionData.predicted_away_score = awayScore;

        // Upsert prediction
        const { data, error } = await supabase
          .from('user_predictions')
          .upsert(
            predictionData,
            { onConflict: ['user_id', 'fixture_id'] } // Ensure uniqueness on user_id and fixture_id
          );

        if (error) {
          throw error;
        }
      }
    }

    res.send('Predictions submitted');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});



// More routes and middleware as needed
const customersRoute = require('./routes/customers');
const assessmentsRoutes = require('./routes/assessments');
const questionsRoute = require('./routes/questions');
const contentRoute = require('./routes/content');
const businessesRoute = require('./routes/businesses');


// Use routes
app.use('/customers', customersRoute)
app.use('/assessments', ensureAuthenticated, assessmentsRoutes);
app.use('/questions', ensureAuthenticated, questionsRoute);
app.use('/content', ensureAuthenticated, contentRoute);
app.use('/businesses', ensureAuthenticated, businessesRoute);


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
