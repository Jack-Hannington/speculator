const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Send a booking confirmation email using SendGrid.
 * 
 * @param {string} recipientEmail - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 * @param {Object} bookingDetails - The details of the booking to include in the email.
 */
async function resetPasswordEmail(recipientEmail, subject, link) {
    console.log('reset Password req received');
    // Construct the HTML body using booking details
    const htmlBody = `
        <h1>Password reset</h1>
        <p>Your password reset link will expire in 1 hour ${link}</p>
    `;

    // Setup the message object
    const msg = {
        to: recipientEmail,
        from: 'noreply@easyleagues.co',
        subject: subject,
        text: `Your password reset link will expire in 1 hour ${link}`,
        html: htmlBody,
    };

    // Send the email
    try {
        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Failed to send email:', error);
        if (error.response) {
            console.error(error.response.body);
        }
    }
}

// Pin reminder to non-admins
async function sendPinReminderEmail(recipientEmail, subject, pin) {
    console.log('Pin reminder req received');
    // Construct the HTML body using the pin
    const htmlBody = `
        <h1>Access Pin Reminder</h1>
        <p>Your access pin is ${pin}</p>
    `;

    // Setup the message object
    const msg = {
        to: recipientEmail,
        from: 'jack@hanningtondigital.com',  // This should be a verified sender email in your SendGrid account
        subject: subject,
        text: `Your access pin is ${pin}`,
        html: htmlBody,
    };

    // Send the email
    try {
        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Failed to send email:', error);
        if (error.response) {
            console.error(error.response.body);
        }
    }
}


/**
 * Send a corporate registration email using SendGrid.
 * 
 * @param {string} recipientEmail - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 * @param {string} name - The name of the recipient.
 * @param {string} registrationLink - The registration link for the user.
 */


module.exports = { resetPasswordEmail, sendPinReminderEmail };
