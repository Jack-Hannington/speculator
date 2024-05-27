const express = require('express');
const router = express.Router();
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');

router.use(express.json()); // Use for regular routes that need JSON 
router.use(bodyParser.urlencoded({ extended: true }));

// Show content
router.get('/', async (req, res) => {
    const { data: content, error } = await supabase
        .from('content')
        .select(`
        *,
        categories(id, name, color, background_color)
      `)
        .order('category', { ascending: true });

    const messages = req.flash('success');
    if (error) {
        req.flash('error', 'Failed to fetch content');
        return res.status(500).send({ message: "Failed to fetch content", error });
    }

    // Group content by category
    const groupedContent = content.reduce((acc, item) => {
        const category = item.categories;
        if (!acc[category.id]) {
            acc[category.id] = {
                categoryName: category.name,
                categoryColor: category.color,
                categoryBackgroundColor: category.background_color,
                contentItems: []
            };
        }
        acc[category.id].contentItems.push(item);
        return acc;
    }, {});

    res.render('content', { groupedContent: Object.values(groupedContent), message: messages[0] });
});


// Show create content form
router.get('/create', async (req, res) => {
    const { data: categories, error } = await supabase
        .from('categories')
        .select('*');

    const messages = req.flash('success');
    if (error) {
        req.flash('error', 'Failed to fetch categories');
        return res.status(500).send({ message: "Failed to fetch categories", error });
    }
    res.render('content/create', { categories, message: messages[0] });
});

// Post create content
router.post('/create', async (req, res) => {
    const { title, type, link, category } = req.body;

    console.log(req.body);

    const { data: content, error: contentError } = await supabase
        .from('content')
        .insert([{ title, type, link, category }])
        .select();

    if (contentError) {
        req.flash('error', 'Failed to create content');
        return res.status(500).send({ message: "Failed to create content", error: contentError });
    }

    req.flash('success', 'Content created successfully');
    res.redirect('/content');
});

// Edit content
router.get('/edit/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { data: content, error: contentError } = await supabase
            .from('content')
            .select('*')
            .eq('id', id)
            .single();

        if (contentError) throw contentError;

        const { data: categories, error: categoriesError } = await supabase
            .from('categories')
            .select('*');

        if (categoriesError) throw categoriesError;

        const messages = req.flash('success');
        res.render('content/edit', { content, categories, message: messages[0] });
    } catch (error) {
        console.error('Error fetching data:', error);
        req.flash('error', 'Failed to fetch data');
        res.status(500).send({ message: "Failed to fetch data", details: error });
    }
});

router.post('/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { title, type, link, category } = req.body;

    console.log(req.body);

    const { data, error: contentError } = await supabase
        .from('content')
        .update({ title, type, link, category })
        .eq('id', id);

    if (contentError) {
        req.flash('error', 'Failed to update content');
        return res.status(500).send({ message: "Failed to update content", error: contentError });
    }

    req.flash('success', 'Content updated successfully');
    res.redirect('/content');
});

// Delete content
router.post('/delete/:id', async (req, res) => {
    const { id } = req.params;

    const { data, error: contentError } = await supabase
        .from('content')
        .delete()
        .eq('id', id);

    if (contentError) {
        req.flash('error', 'Failed to delete content');
        return res.status(500).send({ message: "Failed to delete content", error: contentError });
    }

    req.flash('success', 'Content deleted successfully');
    res.redirect('/content');
});

module.exports = router;
