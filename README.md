// Memberships assigment and access  - Mark users as associates of a business that can be added and managed within an admin portal under 'settings'.
// Auth on routes and roles!! 
// Mark bookings as cancelled
// Add subdomains
// Hide elapsed orders / re-order them
// Image uploads in supabase
// Fix the URL when adding a service
// Add in reset auth links and follow-ups
// Add design basis in - fix menu so it's smoother
// Email confirmations
// Add in flash messages - service creation success message / errors etc. 
// Render the service images in EJS
// Change round the open / closed toggle when editing services
// Fix how add ons are displayed in edit services 
// Add in memberships / login roles for tenant specific logins
// experiment with RLS roles on dev schema DB
// if you're editing a service and then update an add-on it will reset your changes. Session storage to fix perhaps or a modal with AJAX. 

Add memberships to edit route
Create customer creation route
Password resets

Styling reset forms
Flash messages
Add membership limitations / benefits
Services has new fields and session duration need amending 
Add membership routes
Add membership EJS
Fix the edit bookings 
Add settings
Style the bookings better with the totals

<!-- Screens needed -->
Login
Logout
Create services, add-ons
Edit services, add-ons 
Service selection page


General Structure
Web Application Purpose: Manages bookings for various services, within different business sectors like fitness, education, or event management.There are 6 tables, users, services, bookings, service_add_ons, booking_add_ons, service_time_slots, memberships. Tenant_id are used to differantiate businesses within the DB. e.g. every user, service and booking has a tenant id. 
User Interface: Includes a calendar view for selecting dates, a list of available time slots based on service hours, and options for users to book specific times.
Technical Details
Database Structure:
Contains tables like users, services, bookings, service_add_ons, booking_add_ons, and service_time_slots.
The users table includes fields for tenant ID, name, email, password, and role.
Frontend:
Calendar Component: Shows all days of the current month and allows users to select a day to view available time slots. Uses EJS for rendering/
Time Slot Display: After a day is selected, time slots that are available for booking are displayed. Time slots are derived from service-specific hours and checked against existing bookings to ensure availability.
Date Handling: Uses JavaScript Date objects to manage and manipulate dates and times, taking care to adjust for time zone discrepancies and ensure accurate representation and comparison of dates.
Dynamic Updates: The selection of days and time slots dynamically updates the display without needing to reload the page, utilizing client-side JavaScript for UI interactions.
Backend:
Supabase: Utilizes Supabase for backend data storage, which includes handling SQL databases for storing user data, bookings, service details, etc.
Server-Side Processing: Node.js is used to handle server-side logic, including API endpoints that interact with the frontend to provide data (e.g., available time slots, booking confirmations) and perform operations (e.g., adding a booking).
Express JS is used along with router, bcrypt.js, passport and express session.
Stripe checkout is used 
Features
Service and Time Slot Management:
Services: Each service has defined hours (start and end times) and can have additional properties like maximum capacity and price.
Bookings: Can be made based on selected time slots, with the system checking against existing bookings to avoid overlaps.
Date Selection: Users can select dates from a calendar interface; past dates are greyed out or otherwise indicated as non-selectable.
Time Slot Selection: For a given day, time slots are displayed based on service availability and existing bookings. Past time slots within the day are not selectable.
User Interaction:
Selectable Dates: Days on the calendar are selectable unless they are in the past or there are no available time slots due to closure or full bookings.
Dynamic Time Slot Filtering: Time slots that are already booked or are in the past at the time of viewing are not shown, ensuring users see only viable options.
Logic for Handling Time and Date Issues
Time Zone Handling: Adjusts date and time calculations to account for the user's local time zone, ensuring that selections reflect the correct local date and time.
Greying Out Past Days: Days that are past (relative to the current date at viewing) are visually distinguished (greyed out) and are non-interactive.
Enhanced Usability Features
Immediate Feedback: The application provides immediate visual feedback on date and time slot availability, enhancing user experience by preventing the selection of invalid or unavailable dates/times.
Conclusion
Backend Functionality:

Includes a handlePaymentSuccess function that updates booking status and sends email confirmations upon successful payment.
Uses async functions for handling database interactions and email sending.
Security and Authentication:

Manages user sessions and authentication.
Differentiates user roles, customizing access and functionalities based on whether the user is an admin or not.
Your web application is designed to provide a seamless and efficient booking experience with a focus on ease of use, accuracy of information (particularly concerning dates and times), and real-time updates. The use of modern web technologies like Supabase and Node.js ensures that the application is robust, responsive, and capable of scaling according to user demand or business needs.

If there's anything more specific or additional features and details you'd like to confirm or expand upon, please let me know!



Get the service_hours
Get the booking dates
Get the member available dates

Return available dates based on the user_id.
