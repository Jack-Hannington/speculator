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
const { bookingConfirmation, resetPasswordEmail } = require('./config/sendgrid');
const responseTimeLogger = require('./utils/responseLogger');

const generatePin = require('./utils/pinGenerator');
const emailService = require('./utils/emailService');


// Initialize Express app
const app = express();
require('dotenv').config();
const stripeWebhookRouter = require('./routes/stripeWebhookRouter');
const accessControl = require('./middleware/middleware');

app.use('/stripe', stripeWebhookRouter);


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
  secret: process.env.SESSION_SECRET, // Use an environment variable
  resave: false,
  saveUninitialized: false, // Only save the session if something is stored
  cookie: {
    secure: process.env.NODE_ENV === 'PROD', // true if on HTTPS
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
    maxAge: 1000 * 60 * 60 * 24, // Example: 24 hours
    sameSite: 'lax' // Or 'strict' depending on your needs
  }
}));


console.log('Session Config:', {
  secret: process.env.SESSION_SECRET,
  secure: process.env.NODE_ENV === 'PROD',
  nodeEnv: process.env.NODE_ENV
});


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

      // Redirect to the dashboard or any appropriate page
      req.flash('success', 'Login successful')
      return res.redirect('/');
    });
  })(req, res, next);
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



// app.get('/', async (req, res) => {
//   if (req.isAuthenticated()) {
//     try {
//       // Retrieve the authenticated user's tenant ID and ID
//       const tenantId = req.user.tenant_id;
//       const userId = req.user.id;

//         // Fetch all assessmnetns
//         const { data: assessments, error: assessmentsError } = await supabase
//         .from('completed_assessments')
//         .select('*')
//         .eq('id', userId)

//         console.log(assessments)

//       res.render('home', {assessments});

//     } catch (err) {
//       console.error('Error during data fetching:', err);
//       return res.status(500).send('Error fetching user data.');
//     }
//   } else {
//     // Handle unauthenticated access (redirect to login)
//     res.redirect('/login');
//   }
// });

// async function getLowestScores(userId) {
//   const { data: scores, error } = await supabase
//     .from('user_assessment_scores')
//     .select('*')
//     .eq('user_id', userId)
//     .order('submission_date', { ascending: false })
//     .limit(1);

//   if (error) throw error;

//   const latestScores = scores[0];
//   const categories = [
//     { name: 'strength', score: latestScores.strength_score, max_score: latestScores.strength_max_score },
//     { name: 'mobility', score: latestScores.mobility_score, max_score: latestScores.mobility_max_score },
//     { name: 'obesity', score: latestScores.obesity_score, max_score: latestScores.obesity_max_score },
//     { name: 'cardiovascular_fitness', score: latestScores.cardiovascular_fitness_score, max_score: latestScores.cardiovascular_fitness_max_score },
//     { name: 'recovery', score: latestScores.recovery_score, max_score: latestScores.recovery_max_score },
//     { name: 'mental_health', score: latestScores.mental_health_score, max_score: latestScores.mental_health_max_score },
//     { name: 'nutrition', score: latestScores.nutrition_score, max_score: latestScores.nutrition_max_score },
//   ];

//   // Sort categories by score (lowest first)
//   categories.sort((a, b) => (a.score / a.max_score) - (b.score / b.max_score));

//   // Return the lowest 4 categories
//   return categories.slice(0, 4).map(category => category.name);
// }

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
  if (req.isAuthenticated()) {
    try {
      const userId = req.user.id;

      // Fetch the latest response set ID for the user
      const { data: latestResponse, error: latestResponseError } = await supabase
        .from('user_scores')
        .select('response_set_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestResponseError) {
        throw latestResponseError;
      }

      if (!latestResponse.length) {
        // No assessment scores found, render home without additional data
        const messages = req.flash('success');
        return res.render('home', { focusCategories: [], groupedContent: [], message: messages[0] });
      }

      const latestResponseSetId = latestResponse[0].response_set_id;
      console.log('Latest Response Set ID:', latestResponseSetId);

      // Fetch the scores for the latest response set ID
      const { data: latestScores, error: latestScoresError } = await supabase
        .from('user_scores')
        .select('*')
        .eq('response_set_id', latestResponseSetId);

      if (latestScoresError) {
        throw latestScoresError;
      }

      // console.log('Latest Scores:', latestScores);

      // Fetch categories to include names in the lowestScores
      const categoryIds = latestScores.map(score => score.category_id);
      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .in('id', categoryIds);

      if (categoriesError) {
        throw categoriesError;
      }

      const categoriesMap = categories.reduce((acc, category) => {
        acc[category.id] = category;
        return acc;
      }, {});

      // Sort scores by the relative score (score/total_possible_score)
      latestScores.sort((a, b) => (a.score / a.total_possible_score) - (b.score / b.total_possible_score));

      // Get the lowest 4 scores
      const lowestScores = latestScores.slice(0, 4).map(score => ({
        ...score,
        name: categoriesMap[score.category_id].name,
        percentage: (score.score / score.total_possible_score) * 100
      }));
      // console.log('Lowest Scores:', lowestScores);

      // Fetch content for the lowest 4 categories
      const lowestCategoryIds = lowestScores.map(score => score.category_id);
      const { data: content, error: contentError } = await supabase
        .from('content')
        .select('*, categories(id, name, color, background_color)')
        .in('category_id', lowestCategoryIds);

      if (contentError) {
        throw contentError;
      }

      // Group content by category
      const groupedContent = content.reduce((acc, item) => {
        const category = item.categories;
        if (!acc[category.id]) {
          acc[category.id] = {
            categoryName: category.name,
            categoryColor: category.color,
            categoryBackgroundColor: category.background_color,
            contentItems: []
          };
        }
        acc[category.id].contentItems.push(item);
        return acc;
      }, {});

      // console.log('Grouped Content:', groupedContent);

      const messages = req.flash('success');
      res.render('home', { focusCategories: lowestScores, groupedContent: Object.values(groupedContent), message: messages[0] });
    } catch (err) {
      console.error('Error during data fetching:', err);
      return res.status(500).send('Error fetching user data.');
    }
  } else {
    res.redirect('/login');
  }
});





// More routes and middleware as needed
const customersRoute = require('./routes/customers');
const assessmentsRoute = require('./routes/assessments');
const questionsRoute = require('./routes/questions');
const contentRoute = require('./routes/content');



// Use routes
app.use('/customers', customersRoute)
app.use('/assessments', assessmentsRoute)
app.use('/questions', questionsRoute);
app.use('/content', contentRoute);


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
