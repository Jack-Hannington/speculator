const express = require('express');
const router = express.Router();
require('dotenv').config();
const supabase = require('../config/supabaseClient');
let methodOverride = require('method-override')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');
router.use(express.json()); // Use for regular routes that need JSON 
router.use(bodyParser.urlencoded({ extended: true }));
const dayjs = require('dayjs')
let weekday = require('dayjs/plugin/weekday')
let isBetween = require('dayjs/plugin/isBetween')
let customParseFormat = require('dayjs/plugin/customParseFormat')
dayjs.extend(customParseFormat)
dayjs.extend(isBetween)
dayjs.extend(weekday)

const responseTimeLogger = require('../utils/responseLogger');
const { get } = require('./stripeWebhookRouter');
const base_url = process.env.NODE_ENV === 'DEV' ? process.env.DEV_URL : process.env.PROD_URL;

  router.post('/add-booking', async (req, res) => {
    const { userId, serviceId, start_time, end_time, booking_date, addOns, tenantId } = req.body;
     
    console.log('create booking', req.body)
  
    let totalPrice;
    try {
        totalPrice = await calculateTotalPrice(serviceId, Array.isArray(addOns) ? addOns : []);
      
  
      // Create the booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          user_id: userId,
          service_id: serviceId,
          start_time,
          end_time,
          booking_date,
          status: 'pending', // Assuming a default status of "pending"
          total_price: totalPrice,
          tenant_id: tenantId
        }])
        .select();
  
        if (bookingError) throw bookingError;

        // Check addOns is actually an array and has elements before attempting to insert
        if (Array.isArray(addOns) && addOns.length > 0) {
            const addOnsToInsert = addOns.map(addOn => ({
                booking_id: booking.id, // Adjusted based on `.single()` assumption
                add_on_id: addOn.add_on_id,
                quantity: addOn.quantity,
                price: addOn.price // Ideally fetch from DB
            }));
    
        const { error: addOnsError } = await supabase
          .from('booking_add_ons')
          .insert(addOnsToInsert);
    
        if (addOnsError) throw addOnsError;
      }
  
      res.redirect('/');
    } catch (error) {
      console.error('Failed to create booking:', error.message);
      res.status(500).json({ error: 'Failed to create booking', details: error.message });
    }
  });
  

  router.get('/create-booking', async (req, res) => {
    try {
        // Fetch users
        const {data: users, error: usersError} = await supabase
            .from('users')
            .select('*');
        if (usersError) throw usersError;

        // Fetch services and their corresponding service_hours
        const {data: services, error: servicesError} = await supabase
            .from('services')
            .select(`
                *,
                service_hours (
                    day_of_week,
                    opening_time,
                    closing_time,
                    is_closed
                )
            `);
        if (servicesError) throw servicesError;

        // Fetch add-ons
        const {data: addOns, error: addOnsError} = await supabase
            .from('service_add_ons')
            .select('*');
        if (addOnsError) throw addOnsError;

        console.log(services)

        // Render the page with fetched data
        res.render('bookings/create-booking', { users, services, addOns });
    } catch (error) {
        console.error('Failed to get booking data:', error.message);
        res.status(500).send('Server error');
    }
});


router.get('/edit-booking/:bookingId', async (req, res) => {
    const { bookingId } = req.params;

    

    try {
        // Fetch the specific booking by ID, including its associated add-ons
        let { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select(`
                *,
                service_id (*),
                booking_add_ons!booking_id (
                    add_on_id,
                    quantity,
                    price,
                    service_add_ons (name, price, description)
                )
            `)
            .eq('id', bookingId)
            .single();
         
        

        if (bookingError) throw bookingError;

        // Fetch all services for the dropdown
        let { data: services, error: servicesError } = await supabase
            .from('services')
            .select('*');
        if (servicesError) throw servicesError;

        // Fetch all users for the dropdown
        let { data: users, error: usersError } = await supabase
            .from('users')
            .select('*');
        if (usersError) throw usersError;

        // Fetch all possible add-ons (globally, not just related to the booking)
        let { data: addOns, error: addOnsError } = await supabase
            .from('service_add_ons')
            .select('*');
        if (addOnsError) throw addOnsError;

        // Render the edit booking page with the fetched data
        res.render('bookings/edit-booking', { booking, services, users, addOns });
    } catch (error) {
        console.error('Failed to fetch booking details:', error.message);
        res.status(500).send('Server error');
    }
});



router.post('/edit-booking/:bookingId', async (req, res) => {
    const { bookingId } = req.params;
    const { userId, serviceId, start_time, end_time, existingAddOns, newAddOns } = req.body;
    console.log(req.body)
    try {
        // Update the booking's main details
        let { error: updateError } = await supabase
            .from('bookings')
            .update({
                user_id: userId,
                service_id: serviceId,
                start_time,
                end_time,
            })
            .eq('id', bookingId);
        
        if (updateError) throw updateError;

        // Handle existing add-ons (update or remove), ensuring all actions are on valid add_on_id values
        if (existingAddOns) {
            existingAddOns.forEach(async (addOn, index) => {
                if (addOn.keep === "0" || addOn.quantity === "0") { // If not kept or quantity is 0, remove
                    await supabase
                        .from('booking_add_ons')
                        .delete()
                        .match({ booking_id: bookingId, add_on_id: addOn.add_on_id });
                } else { // Else, update the quantity (and price if applicable)
                    await supabase
                        .from('booking_add_ons')
                        .update({ quantity: addOn.quantity, price: addOn.price })
                        .match({ booking_id: bookingId, add_on_id: addOn.add_on_id });
                }
            });
        }
        

        // Insert new add-ons if any, ensuring all have valid add_on_id values
        if (newAddOns && newAddOns.length > 0) {
            const validNewAddOns = newAddOns.filter(addOn => addOn.add_on_id); // Filter out entries without a valid add_on_id
            if (validNewAddOns.length > 0) {
                let { error: addAddOnsError } = await supabase
                    .from('booking_add_ons')
                    .insert(validNewAddOns.map(addOn => ({
                        booking_id: bookingId,
                        add_on_id: addOn.add_on_id,
                        quantity: addOn.quantity,
                        price: addOn.price,
                    })));

                if (addAddOnsError) throw addAddOnsError;
            }
        }


        res.redirect('/bookings');
    } catch (error) {
        console.error('Failed to update booking:', error.message);
        res.status(500).json({ error: 'Failed to update booking', details: error.message });
    }
});


// New booking routes
router.get('/select-service', async (req, res) => {
    const tenantId = req.user.tenant_id; // Get tenant_id from the authenticated user
    try {
        const { data: services, error } = await supabase
            .from('services')
            .select('id, name, description, price, enabled, max_capacity')
            .eq('tenant_id', tenantId)

        if (error) throw error;
        res.render('bookings/select-service', { services });
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).render('error', { message: 'Failed to fetch services' });
    }
});

// router.get('/select-service/:id', async (req, res) => {
//     const { id } = req.params;
//     try {
//         const { data: serviceDetails, error: serviceError } = await supabase
//             .from('services')
//             .select('*')
//             .eq('id', id)
//             .single();

//         if (serviceError) throw serviceError;

//         const { data: timeSlots, error: slotsError } = await supabase
//             .from('service_hours')
//             .select('*')
//             .eq('service_id', serviceDetails.id);

//         const { data: addOns, error: addOnsError } = await supabase
//             .from('service_add_ons')
//             .select('*')
//             .eq('service_id', serviceDetails.id);
            
//         const { data: existingBookings, error: existingBookingsError } = await supabase
//             .from('bookings')
//             .select('booking_date, start_time, end_time')
//             .eq('service_id', serviceDetails.id);
        
//         if (slotsError) throw slotsError;
//         res.render('bookings/booking-time-slots', { serviceDetails, timeSlots, addOns, existingBookings });
//     } catch (error) {
//         console.error('Error:', error);
//         res.status(500).render('error', { message: 'Failed to load booking details' });
//     }
// });

async function getBookingDates(serviceId, userId, membershipId, months) {
    // Fetch service base hours
    const { data: serviceHours, error: serviceHoursError } = await supabase
        .from('service_hours')
        .select('*')
        .eq('service_id', serviceId);
    if (serviceHoursError) throw new Error('Failed to fetch service hours.');

    const { data: serviceDetails, error: serviceDetailsError } = await supabase
        .from('services')
        .select('max_bookings_per_time_slot')
        .eq('id', serviceId)
        .single();
    if (serviceDetailsError) throw new Error('Failed to fetch service details.');

    const maxBookingsPerSlot = serviceDetails.max_bookings_per_time_slot;

    // Fetch existing bookings for the service
    const { data: existingBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('service_id', serviceId);
    if (bookingsError) throw new Error('Failed to fetch existing bookings.');

    let membershipHours = [];
    if (membershipId) {
        const { data, error: membershipHoursError } = await supabase
            .from('member_service_hours')
            .select('*')
            .eq('membership_id', membershipId)
            .eq('service_id', serviceId);
        if (membershipHoursError) {
            throw new Error('Failed to fetch membership service hours.');
        }
        membershipHours = data;
    }

    // Filter available booking dates and times
    let availableDates = [];
    serviceHours.forEach(hour => {
        let times;
    
        // Check if there are member-specific hours and they are not closed
        let memberDayHours = membershipHours.find(mh => mh.day_of_week === hour.day_of_week);
        if (membershipId && memberDayHours && !memberDayHours.is_closed) {
            times = generateTimeSlots(memberDayHours.opening_time, memberDayHours.closing_time, 60);
        } else {
            // Default to normal service hours if no specific member hours are defined
            times = generateTimeSlots(hour.opening_time, hour.closing_time, 60);
        }
    
        let dates = generateDatesForDay(hour.day_of_week, months).map(date => {
            let available_times = times.filter(time => {
                const bookingsCount = existingBookings.filter(booking => {
                    let bookingDate = dayjs(booking.booking_date).format('YYYY-MM-DD');
                    let bookingStartTime = dayjs(`${bookingDate} ${booking.start_time}`);
                    let bookingEndTime = dayjs(`${bookingDate} ${booking.end_time}`);
                    let slotStartTime = dayjs(`${date} ${time.start}`);
                    let slotEndTime = dayjs(`${date} ${time.end}`);
                    return bookingDate === date && bookingStartTime.isSame(slotStartTime) && bookingEndTime.isSame(slotEndTime);
                }).length;
    
                return bookingsCount < maxBookingsPerSlot;
            });
    
            return {
                date,
                available_times
            };
        });
    
        if (dates.length) {
            availableDates.push({
                day_of_week: hour.day_of_week,
                dates
            });
        }
    });
    
    console.log('available dates', availableDates[6].dates[0]);
    console.log(availableDates)
    return availableDates;
}

// Helper function to generate actual dates for the specified number of months based on day of week
function generateDatesForDay(dayOfWeek, months) {
    let dates = [];
    let start = dayjs();
    let end = start.add(7, 'day');

    while (start.isBefore(end)) {
        if (start.format('dddd') === dayOfWeek) {
            dates.push(start.format('YYYY-MM-DD'));
        }
        start = start.add(1, 'day');
    }
    return dates;
}

// Generate time slots within the given opening and closing times
function generateTimeSlots(openingTime, closingTime, slotDuration) {
    let slots = [];
    let startTime = dayjs(`2024-01-01 ${openingTime}`);
    let endTime = dayjs(`2024-01-01 ${closingTime}`);

    while (startTime < endTime) {
        let endSlotTime = startTime.add(slotDuration, 'minutes');
        slots.push({ start: startTime.format('HH:mm'), end: endSlotTime.format('HH:mm') });
        startTime = endSlotTime;
    }
    return slots;
}

// getBookingDates(57,14,2,3);

router.get('/select-service/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user_id; // Assuming the user ID is stored in session
    const membershipId = req.user.membership_id; // Assuming membership ID is stored in session, can be undefined

    try {
        console.log(id, userId, membershipId)
        const { data: serviceDetails, error: serviceError } = await supabase
            .from('services')
            .select('*')
            .eq('id', id)
            .single();

        if (serviceError) throw serviceError;

        const { data: addOns, error: addOnsError } = await supabase
            .from('service_add_ons')
            .select('*')
            .eq('service_id', serviceDetails.id);
        if (addOnsError) throw addOnsError;

        // Fetch available dates and times
        const availableDates = await getBookingDates(id, userId, membershipId, 2); // Assuming we look 2 months ahead
        
        res.render('bookings/booking-time-slots', { serviceDetails, availableDates, addOns });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', { message: 'Failed to load booking details' });
    }
});




// BOOKING CONFIRMATION //



router.post('/confirm-booking', async (req, res) => {
    const { serviceId, userId, timeSlots, userDetails } = req.body;
    try {
        // Process booking details
        const { data: booking, error } = await supabase
            .from('bookings')
            .insert([{ service_id: serviceId, user_id: userId, ...userDetails }]);

        if (error) throw error;

        // Assuming timeSlots is an array of selected time slot IDs
        const bookingAddOns = timeSlots.map(slot => ({ booking_id: booking[0].id, slot_id: slot }));
        const { error: addOnError } = await supabase
            .from('booking_add_ons')
            .insert(bookingAddOns);

        if (addOnError) throw addOnError;

        res.render('confirm-booking', { booking: booking[0] });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', { message: 'Failed to confirm booking' });
    }
});

router.post('/create-checkout-session', async (req, res) => {
    const { bookingDetails } = req.body;
    console.log('checkout details', req.body)
    try {
        const totalPriceInPence = await calculateTotalPrice(bookingDetails.service.id, bookingDetails.timeSlots, bookingDetails.addOns);

        // Create a booking entry
        const { data: tentativeBooking, error: tentativeBookingError } = await supabase
            .from('bookings')
            .insert([{
                user_id: bookingDetails.user_id,
                service_id: bookingDetails.service.id,
                start_time: bookingDetails.timeSlots[0].split(' - ')[0],
                end_time: bookingDetails.timeSlots[bookingDetails.timeSlots.length - 1].split(' - ')[1],
                booking_date: bookingDetails.date,
                total_price: totalPriceInPence / 100,
                tenant_id: 1,
                status: 'pending',
                booked_service: bookingDetails.service.name
            }])
            .select();

        if (tentativeBookingError || !tentativeBooking.length) {
            throw new Error(`Error creating tentative booking: ${tentativeBookingError.message}`);
        }

        // Insert booking add-ons
        const bookingId = tentativeBooking[0].id;
        const addOnsPromises = bookingDetails.addOns.map(addOn => {
            console.log('Processing add-on:', addOn);
            return supabase.from('booking_add_ons').insert({
                booking_id: bookingId,
                add_on_id: addOn.id,
                quantity: addOn.quantity,
                price: addOn.price
            });
        });

        // Wait for all add-on inserts to finish
        await Promise.all(addOnsPromises);

        function formatDate(dateString) {
            const parts = dateString.split('-'); // Assumes date is in YYYY-MM-DD format
            return `${parts[2]}-${parts[1]}-${parts[0]}`; // Returns DD-MM-YYYY format
        }
        

        // Create Stripe session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: {
                        name: 'Booking for ' + bookingDetails.service.name,
                        description: 'Booking on ' + formatDate(bookingDetails.date)+ 
                                      ' for time slots ' + bookingDetails.timeSlots.join(", ") +
                                      '. Add-ons: ' + bookingDetails.addOns.map(a => `${a.name} (x${a.quantity})`).join(", "),
                        images: ['https://staging.dairyhouselivery.co.uk/wp-content/uploads/2024/03/Horse_jumping.jpg'],
                    },
                    unit_amount: totalPriceInPence,
                },
                quantity: 1,
            }],
            mode: 'payment',
            metadata: {
                booking_id: `${bookingId}`
            },
            success_url: `${base_url}/bookings/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${bookingId}`,
            cancel_url: `${base_url}/bookings/cancel?booking_id=${bookingId}`,
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).send("Failed to create a checkout session");
    }
});




async function calculateTotalPrice(serviceId, timeSlots, addOns) {
    let totalPrice = 0;

    // Fetch the service price by serviceId
    const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('price')
        .eq('id', serviceId)
        .single();

    if (serviceError) throw new Error(`Service fetch error: ${serviceError.message}`);

    // Calculate the total price for the service based on the number of time slots selected
    totalPrice += service.price * timeSlots.length * 100;  // Multiply by number of time slots and convert GBP to pence

    // Calculate the total price for add-ons
    for (let addOn of addOns) {
        const { data: addOnData, error: addOnError } = await supabase
            .from('service_add_ons')
            .select('price')
            .eq('id', addOn.id)
            .single();

        if (addOnError) throw new Error(`Add-on fetch error: ${addOnError.message}`);
        totalPrice += (addOnData.price * addOn.quantity) * timeSlots.length * 100; // Multiply price by quantity and convert to pence
    }

    return totalPrice;
}




router.get('/', async (req, res) => {
    try {
        // Fetch bookings with necessary joins to get service, user, and specific booking add-on details
        let { data: bookings, error } = await supabase
            .from('bookings')
            .select(`
                *,
                service_id (
                    name,
                    price
                ),
                user_id (
                    name,
                    email,
                    role
                ),
                booking_add_ons (
                    quantity,
                    price,
                    service_add_on_id:service_add_ons (name, description, price) 
                )
            `);

        if (error) throw error;

        // Check if the bookings array is empty
        if (bookings.length === 0) {
            // Optionally, you can log this situation or handle it differently
            console.log("No bookings available.");
            res.render('bookings/index', { bookings: null, message: "No bookings yet" });
            return;
        }

        // Render the bookings page with aggregated data
        res.render('bookings', { bookings, message: "" });
    } catch (error) {
        console.error('Error fetching bookings:', error.message);  // Log the error message
        res.status(500).send('Server error: ' + error.message);  // Provide the error message in the response
    }
});

router.get('/success', (req, res) => {
    res.render('bookings/success');
})


module.exports = router; 