App Summary
Overview:
A football scores guessing game based on the Euros teams.
Friends can guess result scores and compare their predictions.
Technical Details
Backend:

Framework: Express.js
Database: Supabase (PostgreSQL)
Authentication: Passport.js with Google OAuth
Frontend:

Templating Engine: EJS (Embedded JavaScript)
CSS Framework: Bootstrap
Middleware
Authentication:
ensureAuthenticated middleware to protect routes and ensure only logged-in users can access certain pages.
Submission Time Check:
Middleware to ensure that predictions are submitted before the fixture starts.
Uses UTC to handle time zone differences and ensures submissions are locked 2 minutes before the fixture starts.
Scoring System
Points Allocation:
Correct Result: 1 point (correctly predicting win/loss/draw)
Correct Scoreline: 3 points (correctly predicting the exact score)
Key Features
Leagues:

Users can create leagues and invite friends to join using a unique invite code.
Users can join leagues by entering the invite code.
Only league members can view and participate in the league.
Predictions:

Users can submit their predictions for each fixture.
Predictions are grouped by fixture and displayed alongside other users' predictions for comparison.
Routes
Home:

Displays a list of leagues and allows users to join a league.
Leagues:

Create League: Allows users to create a new league and generates a unique invite code.
Join League: Users can join a league using an invite code.
View League: Displays league details, participants, and their predictions, grouped by fixture.
Predictions:

Users can submit predictions for upcoming fixtures.
EJS Templates
Layout:

Uses EJS templates for dynamic content rendering.
Templates include partials for header, footer, and navigation for consistency.
Fixtures and Predictions:

Fixtures are displayed with formatted kick-off times.
User predictions are grouped by fixture and displayed below each fixture for clarity.