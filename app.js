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
const { format, parseISO } = require('date-fns');
const { CronJob } = require('cron');

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

          return res.redirect('/');
        });
      })(req, res, next);
    } else {

      req.logIn(user, (err) => {
        if (err) {
          console.log('Error during session creation:', err);
          req.flash('error', 'Failed to create a session. Please try again.');
          return res.redirect('/login');
        }

        req.session.role = user.role;
        return res.redirect('/');
      });
    }
  } catch (error) {
    console.error('Error during authentication:', error);
    req.flash('error', 'An unexpected error occurred. Please try again.');
    res.redirect('/login');
  }
});

// Log the user to ensure it's being set correctly
app.use((req, res, next) => {
  next();
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



const checkFixtureStatus = (kickOffTime) => {
  const now = new Date();
  const kickOffDate = new Date(kickOffTime);
  const lockTime = new Date(kickOffDate.getTime() - 2 * 60 * 1000); // 2 minutes before kick-off

  if (now > kickOffDate) {
    return 'finished';
  } else if (now > lockTime) {
    return 'in-progress';
  } else {
    return 'not-started';
  }
};
app.get('/', ensureAuthenticated, async (req, res) => {
  const round = req.query.round || '1';
  const userId = req.user.id;

  try {
    // Fetch fixtures for the specified round with home and away team details
    const { data: fixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select(`
        id,
        round,
        kick_off_time,
        home_team: home_team_id (id, name, flag),
        away_team: away_team_id (id, name, flag),
        home_team_score,
        away_team_score,
        status
      `)
      .eq('round', round)
      .order('kick_off_time', { ascending: true });

    if (fixturesError) {
      throw fixturesError;
    }

    fixtures.forEach(async fixture => {
      const status = checkFixtureStatus(fixture.kick_off_time);
      if (fixture.status !== status) {
        fixture.status = status;
        await supabase
          .from('fixtures')
          .update({ status })
          .eq('id', fixture.id);
      }

      if (fixture.status === 'in-progress' || fixture.status === 'finished') {
        fixture.formatted_kick_off_time = `${fixture.home_team.name} ${fixture.home_team_score} - ${fixture.away_team_score} ${fixture.away_team.name}`;
      } else {
        fixture.formatted_kick_off_time = format(parseISO(fixture.kick_off_time), 'EEE do MMMM, HH:mm');
      }
    });

    // Fetch user's predictions for the specified round including points
    const { data: userPredictions, error: predictionsError } = await supabase
      .from('user_predictions')
      .select(`
        fixture_id,
        predicted_home_score,
        predicted_away_score,
        points
      `)
      .eq('user_id', userId)
      .in('fixture_id', fixtures.map(fixture => fixture.id));

    if (predictionsError) {
      throw predictionsError;
    }

    const predictionsMap = userPredictions.reduce((acc, prediction) => {
      acc[prediction.fixture_id] = prediction;
      return acc;
    }, {});

    const { data: allFixtures, error: allFixturesError } = await supabase
      .from('fixtures')
      .select('round');

    if (allFixturesError) {
      throw allFixturesError;
    }

    const rounds = [...new Set(allFixtures.map(fixture => fixture.round))];

    const messages = req.flash('success');

    res.render('home', { fixtures, rounds, selectedRound: round, predictionsMap, message: messages[0] });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});



app.post('/predictions/user-predictions', async (req, res) => {
  const userId = req.user.id;
  const predictions = req.body;

  try {
    console.log('Request body:', predictions);

    // Fetch all fixtures to determine the active round
    const { data: allFixtures, error: allFixturesError } = await supabase
      .from('fixtures')
      .select('*')
      .order('kick_off_time', { ascending: true });

    if (allFixturesError) {
      throw allFixturesError;
    }

    const updates = [];

    for (const key in predictions) {
      if (predictions.hasOwnProperty(key) && key.startsWith('fixture_id_')) {
        const fixtureId = key.split('_')[2];
        const homeScore = predictions[`home_score_${fixtureId}`];
        const awayScore = predictions[`away_score_${fixtureId}`];

        const fixture = allFixtures.find(f => f.id === parseInt(fixtureId));

        // Only process fixtures that have not started
        if (fixture && fixture.status === 'not-started') {
          // Check if both scores are not null or empty
          if (homeScore !== '' && homeScore !== null && awayScore !== '' && awayScore !== null) {
            const predictionData = {
              user_id: userId,
              fixture_id: fixtureId,
              predicted_home_score: parseInt(homeScore, 10),
              predicted_away_score: parseInt(awayScore, 10),
              prediction_time: new Date().toISOString()
            };

            updates.push(predictionData);
          }
        }
      }
    }

    if (updates.length > 0) {
      const { data, error } = await supabase
        .from('user_predictions')
        .upsert(updates, { onConflict: ['user_id', 'fixture_id'] });

      if (error) {
        throw error;
      }
    }

    req.flash('success', 'Scores saved');
    return res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});


// More routes and middleware as needed
const leagueRoutes = require('./routes/leagues');

// Use routes
app.use('/leagues', ensureAuthenticated, leagueRoutes);

const executeCronJobs = async () => {
  console.log('Running cron job to calculate prediction points');
  const { error } = await supabase.rpc('calculate_prediction_points');
  if (error) {
    console.error('Error running calculate_prediction_points RPC:', error);
  } else {
    console.log('Successfully calculated prediction points');
  }
};

const job = new CronJob('0 * * * *', executeCronJobs, null, true, 'UTC');  // Runs every hour
job.start();


module.exports = app;
