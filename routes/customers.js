const express = require('express');
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const router = express.Router();
const accessControl = require('../middleware/middleware');
router.use(accessControl('admin'));


// Get all customers
router.get('/', async (req, res) => {
  const { data: customers, error } = await supabase
    .from('users')
    .select(`*`);

  if (error) return res.status(500).send({ message: "Failed to fetch users", error });
  res.render('customers', { customers });
});

// Load assessments
router.get('/assessments', async (req, res) => {
  res.render('customers/assessments');
});





// GET route to fetch a specific member's data for editing along with all memberships
router.get('/edit/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch user details
    const { data: customer, error: userError } = await supabase
      .from('users')
      .select('*, memberships(name)')
      .eq('id', id)
      .single();

    if (userError) throw userError;

    // Fetch all memberships
    const { data: memberships, error: membershipsError } = await supabase
      .from('memberships')
      .select('id, name');

    if (membershipsError) throw membershipsError;

    res.render('customers/edit', { customer, memberships });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send({ message: "Failed to fetch data", details: error });
  }
});

router.get('/create', async (req, res) => {

  // Fetch all memberships
  const { data: memberships } = await supabase
    .from('memberships')
    .select('id, name');
 
  res.render('customers/create', { memberships});
});

//Create new customer
router.post('/create', async (req, res) => {
  const tenantId = req.user.tenant_id;  // Accessed from the logged-in user's session
  let { name, email, role, membership_id, password } = req.body;

  // Check for empty membership_id and convert it to null
  membership_id = membership_id === '' ? null : membership_id;

  // Validate required fields
  if (!name || !email || !role || !password) { // Added password since it's necessary for new users
    return res.status(400).send({ message: "Missing required fields" });
  }

  // Create user information
  try {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        role,
        membership_id,
        tenant_id: tenantId, // Use tenant_id from the logged-in user
        password, // Assuming password is being handled securely
        active_account: true // Optionally set the account as active on creation
      });

    if (error) {
      console.error('Failed to create user:', error);
      return res.status(500).send({ message: "Failed to create user", details: error.message });
    }

    // Redirect or respond after successful creation
    res.redirect('/customers'); // Redirect to the customer list or a success page
  } catch (error) {
    console.error('Error creating new user:', error);
    res.status(500).send({ message: "Server error while creating user", details: error.message });
  }
});



router.post('/edit/:id', async (req, res) => {
  const { id } = req.params;
  let { name, email, role, membership_id } = req.body; // Assuming these are the fields you want to update
  console.log(req.body)
  if(membership_id === ''){
    membership_id = null;
  }
  // Check for required fields
  if (!name || !email || !role) {
    return res.status(400).send({ message: "Missing required fields" });
  }

  // Update user information
  const { data: updatedUser, error } = await supabase
    .from('users')
    .update({ name, email, role, membership_id })
    .eq('id', id);

  if (error) return res.status(500).send({ message: "Failed to update user", error });
  res.redirect('/customers')
});

// GET route to fetch and display bookings for a specific user
router.get('/bookings/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch bookings by user ID
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_add_ons (
          add_on_id,
          quantity,
          price
        )
      `)
      .eq('user_id', userId);

    if (bookingsError) throw bookingsError;

    // Render the view with bookings data
    res.render('customers/bookings', { bookings });
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch bookings", details: error.message });
  }
});



module.exports = router;
