Altius Wellness Platform Overview
Objective: Altius Wellness is an online platform offering personalized wellness and physiotherapy plans based on user assessments.

Assessment Categories: Users are assessed across seven categories, each containing multiple elements. Scores are given on a scale of 1 (Red), 3 (Amber), or 5 (Green) for each element. The categories and their elements are:

Obesity

Weight (KG)
Waist Circumference (inches)
BMI
Visceral Fat
Cardiovascular Fitness

Resting Heart Rate
Heart Index
Blood Pressure
Time Spent Sitting
Recovery

Sleep Quality Score
Respiratory Rate
Heart Rate Variability
Mental Health

Wellbeing Score
Strength

Muscle Mass (KG)
Grip Strength
Neck Strength
Glute Strength
Mobility

Sit and Reach Test
Thomas Test
Chest Test
Trap Complex Test
Nutrition

Glucose
Cholesterol
Calorie Balance
Body Water Percentage
Scoring: Each element is scored as 1 (Red), 3 (Amber), or 5 (Green) based on predefined criteria. Each category score is a sum of its element scores.

Technical Details
Database: Postgres (Supabase)
Storage: Supabase
Backend: Node.js, Express
Rendering: EJS
Emails: SendGrid
Auth: Passport
Payments: Stripe
Hosting: Railway.app (Backup: fly.io)
Database Schema:

Users Table: Stores user information.
Completed Assessments Table: Stores assessment results.
Businesses Table: Stores business customer details.
Functions and Triggers
Calculate Overall Scores:

Function: calculate_scores()
Trigger: Runs before insert or update on completed_assessments.
Get Latest Assessment Rank:

Function: get_latest_assessment_rank(p_user_id INTEGER)
Purpose: Returns the rank of the latest assessment based on overall score and gender.
Frontend Interactions
Routes for rendering user assessments, calculating and updating percentiles, and making RPC calls for ranks and statistics.
User Experience
Assessment Process:

Users complete pre-assessment information (online or in-person).
Scores are updated on the user dashboard.
Users can compare scores within their corporate group (anonymized).
Personalized plans are provided to improve scores.
Users track their progress, mark completed tasks, and receive email nudges.
Content Delivery:

Content is triggered based on scores (Red, Amber, Green) and delivered via email or platform resources.
Confirmation
This summary encapsulates the key features and technical details of the Altius Wellness platform. If this aligns with your understanding and intentions, we can proceed to address any specific areas you need help with or further details on.

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







