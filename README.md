Altius Wellness is a modern online wellness platform offering tailored wellness and physiotherapy plans based on user scores on in-person or online assessements. 

Users are graded across 7 base categories including weight, heart rate, strength, mental wellbing, mobility, blood pressure and recovery. The assessments give the user a score 1, 3 or 5 depending on their results per question. For example a user may average 4 hours of sleep per night which would give them a score of 1. Sleep is part of the recovery section of the assessment so 1 will be added to their recovery whereas if they answered 8+ hours they might receive a 5 on the score. Other questions will be asked to give an overall recovery score. This repeats for 7 categories before all scores are added up.

After an assessment the scores will update on the user's dashboard as top-level score cards where they can review them, compare with similar users - this is locked to their company participants if their on a corporate package and scores an anonymised so it's a "you're in the top 20%" of people in your age group / gender. Below the scorecards will be a series of plans for users to undertake to improve their scores before any follow-up assessment. The user's can choose their own goals and begin the chosen plans. Each plan will have a series of help guides, articles and resources to help improve their wellness. once enrolled users will receive a series of emails to keep them updated and on-track to improve their wellbeing. Once a user has read a resource and completed an exercise they can mark it as complete to see their progress. 

There is a users table, plans table, content table, content makes up what a plan is, completed_assessments, businesses (for business customers who add their employees)

Technical details ---
-- Database: Postgres (Supabase)
-- Storage:  Supabase
-- Backend: NODEJS, Express
-- Rendering: EJS
-- Emails: Sendgrid
-- Auth: Passport
-- Payments: Stripe
-- Hosting: Railway.app 
    -- Backup hosting: fly.io



App Overview
Altius Wellness is a modern online wellness platform offering tailored wellness and physiotherapy plans based on user scores from in-person or online assessments. The platform allows users to track their progress, compare their results, and access resources to improve their wellness scores.

Key Features
User Assessments: Users complete assessments that measure various wellness metrics.
Tailored Plans: Users receive personalized wellness and physiotherapy plans based on their assessment scores.
Score Tracking: Users can view their scores and track improvements over time.
Corporate Accounts: Businesses can enroll their employees, allowing for group comparisons and targeted plans.
Database Tables
Users Table

Stores user information such as id, first_name, last_name, email, gender, age, etc.
Completed Assessments Table

Stores assessment results for each user, including various scores.
Schema:
sql
Copy code
CREATE TABLE public.completed_assessments (
  id SERIAL PRIMARY KEY,
  first_name TEXT NULL,
  last_name TEXT NULL,
  gender TEXT NULL,
  age INTEGER NULL,
  weight TEXT NULL,
  waist_circumference INTEGER NULL,
  obesity_score INTEGER NULL,
  bmi TEXT NULL,
  visceral_fat TEXT NULL,
  cv_fitness_score INTEGER NULL,
  resting_heart_rate INTEGER NULL,
  heart_index INTEGER NULL,
  blood_pressure TEXT NULL,
  hours_sitting_per_day INTEGER NULL,
  recovery_score INTEGER NULL,
  sleep_hours INTEGER NULL,
  respiratory_rate TEXT NULL,
  heart_rate_variability INTEGER NULL,
  mental_health_score INTEGER NULL,
  wellbeing_score INTEGER NULL,
  strength_score INTEGER NULL,
  muscle_mass INTEGER NULL,
  grip_strength INTEGER NULL,
  neck_strength INTEGER NULL,
  glute_strength INTEGER NULL,
  mobility_score INTEGER NULL,
  sit_and_reach INTEGER NULL,
  thomas_test TEXT NULL,
  chest_test TEXT NULL,
  trap_complex_test TEXT NULL,
  nutrition_score INTEGER NULL,
  glucose TEXT NULL,
  cholesterol TEXT NULL,
  calorie_balance TEXT NULL,
  body_water_percentage INTEGER NULL,
  assessment_date TIMESTAMP WITH TIME ZONE NULL,
  overall_score NUMERIC NULL,
  assessor TEXT NULL,
  business INTEGER NULL REFERENCES businesses(id) ON UPDATE CASCADE ON DELETE SET NULL,
  user_id INTEGER NULL REFERENCES users(id)
);
Businesses Table

Stores information about businesses enrolled in the platform.
Functions
Calculate Overall Scores

Function: calculate_scores()
Purpose: Calculate the overall_score by summing individual scores.
Trigger: Runs BEFORE INSERT OR UPDATE on completed_assessments.
sql
Copy code
CREATE OR REPLACE FUNCTION calculate_scores()
RETURNS TRIGGER AS $$
BEGIN
    NEW.overall_score := COALESCE(NEW.obesity_score, 0)
                        + COALESCE(NEW.nutrition_score, 0)
                        + COALESCE(NEW.mobility_score, 0)
                        + COALESCE(NEW.recovery_score, 0)
                        + COALESCE(NEW.cv_fitness_score, 0)
                        + COALESCE(NEW.mental_health_score, 0)
                        + COALESCE(NEW.strength_score, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_scores
BEFORE INSERT OR UPDATE ON completed_assessments
FOR EACH ROW
EXECUTE FUNCTION calculate_scores();
Get Latest Assessment Rank

Function: get_latest_assessment_rank(p_user_id INTEGER)
Purpose: Calculate and return the rank of the latest assessment for a given user based on overall_score and gender.
RPC: Callable from the frontend to dynamically fetch the rank.
sql
Copy code
CREATE OR REPLACE FUNCTION get_latest_assessment_rank(p_user_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  latest_assessment_id INTEGER;
  user_gender TEXT;
  rank INTEGER;
BEGIN
  SELECT id, gender
  INTO latest_assessment_id, user_gender
  FROM completed_assessments
  WHERE user_id = p_user_id
  ORDER BY assessment_date DESC
  LIMIT 1;

  IF latest_assessment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT subquery.rank
  INTO rank
  FROM (
    SELECT id, RANK() OVER (PARTITION BY gender ORDER BY overall_score DESC) AS rank
    FROM completed_assessments
    WHERE gender = user_gender
  ) AS subquery
  WHERE subquery.id = latest_assessment_id;

  RETURN rank;
EXCEPTION WHEN NO_DATA_FOUND THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
Frontend Interactions
Assessments Route: Handles rendering user assessments on their profile for clinicians to review.
Calculate and Update Percentiles: Functions to dynamically calculate and update percentiles for various score fields.
Post Requests: Insert completed assessments and trigger the calculation functions.
RPC Calls: Fetch dynamically calculated ranks and other statistics from the backend.
Summary
This app integrates user assessments, tailored wellness plans, and dynamic score tracking. The database schema and functions support calculating overall scores, ranking users within their gender groups, and providing up-to-date rankings and comparisons. The platform caters to both individual users and corporate accounts, offering personalized insights and wellness plans.







