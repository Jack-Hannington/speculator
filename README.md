Summary of the Wellness Platform App
Overview
Altius Wellness is a modern online wellness platform offering tailored wellness and physiotherapy plans based on user scores from in-person or online assessments. The platform allows users to track their progress, compare their results, and access resources to improve their wellness scores.

Key Features
User Assessments: Users complete assessments that measure various wellness metrics. Each assessment includes questions categorized into seven wellness categories.
Tailored Plans: Users receive content based on their lowest four category scores. This content is dynamically assigned according to assessment results.
Score Tracking: Users can view their scores and track improvements over time through follow-up assessments.
Content Integration: Content is managed via a simple form with category matching and is pulled from a WordPress CMS using wp-json. Admins create the content, which the app assigns based on user scores.
Corporate Accounts: Businesses can enroll their employees, allowing for group comparisons and the creation of targeted wellness plans.
Unified Login Flow: A single login page directs users and admins to the appropriate backend processes, soon to be implemented for streamlined access.
Technical Details
Database: Postgres (Supabase)
Storage: Supabase
Backend: Node.js, Express
Rendering: EJS
Charts: Chart.js is utilized to render category scores on user home pages.
Views: Distinct views for admins (when user.role == admin) and users (when user.role == customer) in EJS templates.
Routes: Uses router to export routes into app.js
Emails: SendGrid for email services.
Auth: Passport for authentication.
Payments: Stripe for handling transactions.
Hosting: Railway.app with a backup on fly.io
Database Schema
Users Table: Stores user information such as id, first_name, last_name, email, gender, age, etc.
Completed Assessments Table: Stores assessment results for each user, including various scores such as weight, waist_circumference, obesity_score, bmi, etc.
Businesses Table: Stores information about businesses enrolled in the platform.
Questions Table: Stores questions used in assessments, each linked to a category.
Assessment Questions Table: Links assessments to their respective questions.
User Responses Table: Stores individual user responses to assessment questions.
User Scores Table: Stores calculated scores for users based on their responses.
Categories Table: Stores categories for questions, including background color and text color.
Scoring Rules Table: Stores rules for scoring user responses based on criteria like age, gender, and response values.
Key Routes and Features Implemented
Questions Route: Allows creation, editing, and viewing of questions, grouped by category and displayed with appropriate styles.
Assessments Route: Enables creation and editing of assessments, adding questions to assessments, and rendering assessment forms for user completion. Scores are calculated based on user responses.
User Assessments Submission: Handles submission of user responses, calculates, and stores scores based on predefined scoring rules.
Views and Grouping: Summarizes user scores and groups questions by category for frontend display, ensuring a user-friendly and organized presentation.
Error Handling and Flash Messages: Implements error handling and flash messages to provide feedback during various operations.
