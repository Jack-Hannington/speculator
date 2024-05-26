Summary of the Wellness Platform App
Overview
Altius Wellness is a modern online wellness platform offering tailored wellness and physiotherapy plans based on user scores from in-person or online assessments. The platform allows users to track their progress, compare their results, and access resources to improve their wellness scores.

Key Features
User Assessments: Users complete assessments that measure various wellness metrics.
Tailored Plans: Users receive personalized wellness and physiotherapy plans based on their assessment scores.
Score Tracking: Users can view their scores and track improvements over time.
Corporate Accounts: Businesses can enroll their employees, allowing for group comparisons and targeted plans.
Technical Details
Database: Postgres (Supabase)
Storage: Supabase
Backend: Node.js, Express
Rendering: EJS
Emails: SendGrid
Auth: Passport
Payments: Stripe
Hosting: Railway.app (Backup: fly.io)
Database Schema
Users Table

Stores user information such as id, first_name, last_name, email, gender, age, etc.
Completed Assessments Table

Stores assessment results for each user, including various scores.
Schema includes fields like weight, waist_circumference, obesity_score, bmi, etc.
Businesses Table

Stores information about businesses enrolled in the platform.
Questions Table

Stores questions used in assessments.
Each question is linked to a category.
Assessment Questions Table

Links assessments to their respective questions.
User Responses Table

Stores individual user responses to assessment questions.
User Scores Table

Stores calculated scores for users based on their responses.
Categories Table

Stores categories for questions, including background color and text color.
Scoring Rules Table

Stores rules for scoring user responses based on criteria like age, gender, and response values.
Key Routes and Features Implemented
Questions Route

Create, edit, and view questions.
Questions are grouped by category and displayed with appropriate styles.
Categories and questions are displayed in a structured and responsive layout.
Assessments Route

Create and edit assessments.
Add questions to assessments and render assessment forms for users to fill out.
Calculate user scores based on their responses.
User Assessments Submission

Submit user responses for assessments.
Calculate and store scores based on scoring rules.
Handle edge cases and ensure proper calculation logic.
Views and Grouping

Created views to summarize user scores.
Group questions by category for display in the frontend.
Ensure data is displayed in a user-friendly and organized manner.
Error Handling and Flash Messages

Implement error handling and flash messages to provide feedback to users during various operations.