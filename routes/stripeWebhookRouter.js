const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const sendgrid = require('../config/sendgrid');

const { bookingConfirmation } = require('../config/sendgrid');

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/webhook', bodyParser.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        console.log(event)
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        // Handle payment success
        try {
            await handlePaymentSuccess(session);
            console.log('Payment success handled');
        } catch (error) {
            console.error('Error in handlePaymentSuccess:', error.message);
            return res.status(500).send(`Error in handlePaymentSuccess: ${error.message}`);
        }
    }

    // Handle payment_intent.succeeded event
    else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        // Handle payment success
        try {
            await handlePaymentSuccess(paymentIntent);
            console.log('Payment intent success handled');
        } catch (error) {
            console.error('Error in handlePaymentSuccess:', error.message);
            return res.status(500).send(`Error in handlePaymentSuccess: ${error.message}`);
        }
    }

    // Handle payment_intent.payment_failed event
    else if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        // Handle payment failure
        try {
            await handlePaymentFailed(paymentIntent);
            console.log('Payment intent failure handled');
        } catch (error) {
            console.error('Error in handlePaymentFailed:', error.message);
            return res.status(500).send(`Error in handlePaymentFailed: ${error.message}`);
        }
    }

    // Handle other unprocessed events
    else {
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).send({received: true});
});


async function handlePaymentSuccess(session) {
    const bookingId = session.metadata.booking_id;

    // Fetch the booking along with the user information
    const { data: updatedBookings, error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .match({ id: bookingId })
        .select(`
            *,
            users (
                email
            )
        `); // Assuming there's a foreign key relation set as 'user_id' in 'bookings'
 

        console.log('Booking data:', updatedBookings);

    if (updateError) {
        console.error(`Failed to update booking status: ${updateError.message}`);
        throw new Error(`Failed to update booking status: ${updateError.message}`);
    }

    if (updatedBookings && updatedBookings.length > 0) {
        const booking = updatedBookings[0];
        console.log('Booking completed successfully', bookingId);

        // Extract user email from the booking object
        const userEmail = booking.users.email; // Adjust the path based on your actual data structure

        console.log(userEmail)

        // Prepare the booking details
        const bookingDetails = {
            date: booking.booking_date,
            time: `${booking.start_time} - ${booking.end_time}`,
            serviceName: booking.booked_service,
            totalPrice: booking.total_price
        };

        // Send the booking confirmation email
        await bookingConfirmation(
            userEmail, // Use the dynamically fetched email address
            'Booking Confirmation', // Subject
            bookingDetails // Booking details
        );
    } else {
        console.log('No booking information found after update.');
    }
}


async function handlePaymentFailed(session) {
    const bookingId = session.metadata.booking_id;

    const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'payment failed' })
        .match({ id: bookingId });

    if (updateError) {
        console.error(`Failed to update booking status on payment failure: ${updateError.message}`);
        throw new Error(`Failed to update booking status on payment failure: ${updateError.message}`);
    }

    console.log('Booking failed', bookingId);
}


module.exports = router;
