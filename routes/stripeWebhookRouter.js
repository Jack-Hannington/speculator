const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const sendgrid = require('../config/sendgrid');
const generatePin = require('../utils/pinGenerator');
const base_url = process.env.NODE_ENV === 'DEV' ? process.env.DEV_URL : process.env.PROD_URL;

console.log(`this is ${base_url}`)

const { bookingConfirmation, corporateRegistrationEmail } = require('../config/sendgrid');

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Apply bodyParser.raw only to the webhook endpoint
router.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    console.log('Headers:', req.headers);
    console.log('Raw body:', req.body.toString()); // Ensure raw body is logged

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        // Extract metadata
        const metadata = session.metadata;
        console.log('Metadata:', metadata);

        // Log each metadata item
        for (const key in metadata) {
            if (metadata.hasOwnProperty(key)) {
                console.log(`${key}: ${metadata[key]}`);
            }
        }

        // Pass the business metadata to the function
        const business = metadata.business;

        try {
            await handlePaymentSuccess(session, business);
        } catch (error) {
            console.error('Error in handlePaymentSuccess:', error.message);
            return res.status(500).send(`Error in handlePaymentSuccess: ${error.message}`);
        }
    } else {
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).send({ received: true });
});

async function handlePaymentSuccess(session, business) {
    const customerDetails = session.customer_details;

    if (!customerDetails) {
        console.error('Customer details are missing from the session object');
        throw new Error('Customer details are missing from the session object');
    }

    const customerEmail = customerDetails.email;
    const customerName = customerDetails.name;

    // Log the customer details
    console.log('Customer details:', customerName, customerEmail);

    try {
        await createCorporateWellnessUser(customerName, customerEmail, business);
    } catch (error) {
        console.error('Error in createCorporateWellnessUser:', error.message);
        throw new Error(`Error in createCorporateWellnessUser: ${error.message}`);
    }
}

async function createCorporateWellnessUser(name, email, business) {
    const accessPin = generatePin();

    // Create new user in Supabase
    const { data, error } = await supabase
        .from('users')
        .insert([{ name, email, business, access_pin: accessPin, role: 'customer' }])
        .select();

    console.log('supabase:', data)

    if (error) {
        console.error(`Failed to create user: ${error.message}`);
        throw new Error(`Failed to create user: ${error.message}`);
    }

    const user = data[0];

    // Send registration email using the new email function
    try {
        await corporateRegistrationEmail(
            email,
            'Welcome to Altius Wellness',
            user.name,
            `Your access pin is: <strong>${accessPin}</strong>, <br /><a href="${base_url}/complete-registration?access_pin=${accessPin}">Complete registration</a>`
        );
        console.log(`Registration email sent to ${email}`);
    } catch (error) {
        console.error(`Failed to send registration email: ${error.message}`);
        throw new Error(`Failed to send registration email: ${error.message}`);
    }
}

module.exports = router;