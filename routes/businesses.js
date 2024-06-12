const express = require('express');
const router = express.Router();
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');
const { accessControl, ensureAuthenticated } = require('../middleware/middleware');

router.use(express.json()); // Use for regular routes that need JSON 
router.use(bodyParser.urlencoded({ extended: true }));
router.use(methodOverride('_method'));

// Show businesses
router.get('/', accessControl('admin'), async (req, res) => {
    const { data: businesses, error } = await supabase
        .from('businesses')
        .select('*')
        .order('name', { ascending: true });

    const messages = req.flash('success');
    if (error) {
        req.flash('error', 'Failed to fetch businesses');
        return res.status(500).send({ message: "Failed to fetch businesses", error });
    }

    res.render('businesses/index', { businesses, message: messages[0] });
});

// Show create business form
router.get('/create', accessControl('admin'), async (req, res) => {
    const messages = req.flash('success');
    res.render('businesses/create', { message: messages[0] });
});

// Post create business
router.post('/create', accessControl('admin'), async (req, res) => {
    const { name, contact_email, contact_phone, address, website, image } = req.body;

    const { data: business, error: businessError } = await supabase
        .from('businesses')
        .insert([{ name, contact_email, contact_phone, address, website, image }])
        .select();

    if (businessError) {
        req.flash('error', 'Failed to create business');
        return res.status(500).send({ message: "Failed to create business", error: businessError });
    }

    req.flash('success', 'Business created successfully');
    res.redirect('/businesses');
});

// View business
router.get('/view/:id', async (req, res) => {
    const { id } = req.params;

    const { data: business, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        req.flash('error', 'Failed to fetch business');
        return res.status(500).send({ message: "Failed to fetch business", error });
    }

    res.render('businesses/view', { business });
});

// Show edit business form
router.get('/edit/:id', accessControl('admin'), async (req, res) => {
    const { id } = req.params;

    try {
        const { data: business, error: businessError } = await supabase
            .from('businesses')
            .select('*')
            .eq('id', id)
            .single();

        if (businessError) throw businessError;

        const messages = req.flash('success');
        res.render('businesses/edit', { business, message: messages[0] });
    } catch (error) {
        console.error('Error fetching data:', error);
        req.flash('error', 'Failed to fetch data');
        res.status(500).send({ message: "Failed to fetch data", details: error });
    }
});

// Post edit business
router.post('/edit/:id', accessControl('admin'), async (req, res) => {
    const { id } = req.params;
    const { name, contact_email, contact_phone, address, website, image } = req.body;

    const { data, error: businessError } = await supabase
        .from('businesses')
        .update({ name, contact_email, contact_phone, address, website, image })
        .eq('id', id);

    if (businessError) {
        req.flash('error', 'Failed to update business');
        return res.status(500).send({ message: "Failed to update business", error: businessError });
    }

    req.flash('success', 'Business updated successfully');
    res.redirect('/businesses');
});

// Delete business
router.post('/delete/:id', accessControl('admin'), async (req, res) => {
    const { id } = req.params;

    const { data, error: businessError } = await supabase
        .from('businesses')
        .delete()
        .eq('id', id);

    if (businessError) {
        req.flash('error', 'Failed to delete business');
        return res.status(500).send({ message: "Failed to delete business", error: businessError });
    }

    req.flash('success', 'Business deleted successfully');
    res.redirect('/businesses');
});

module.exports = router;
