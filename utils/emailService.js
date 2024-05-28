// services/emailService.js

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async (to, subject, text, html) => {
    const msg = {
        to,
        from: 'no-reply@altiuswellness.com', // Use your verified sender
        subject,
        text,
        html,
    };

    try {
        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        if (error.response) {
            console.error(error.response.body);
        }
    }
};

const sendWelcomeEmailWithPin = async (email, pin) => {
    const subject = 'Welcome to Altius Wellness';
    const text = `Hello,\n\nWelcome to Altius Wellness! Please use the following access pin to complete your registration: ${pin}`;
    const html = `<p>Hello,</p><p>Welcome to Altius Wellness! Please use the following access pin to complete your registration: <strong>${pin}</strong></p>`;

    await sendEmail(email, subject, text, html);
};

module.exports = {
    sendEmail,
    sendWelcomeEmailWithPin,
};

