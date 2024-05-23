const express = require('express');
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const router = express.Router();
const accessControl = require('../middleware/middleware');
router.use(accessControl('admin'));


// Get all questions
router.get('/', async (req, res) => {
    const { data: questions, error } = await supabase
      .from('questions')
      .select(`*,
       categories(name)
      `);

      console.log(questions)
  
    const messages = req.flash('success');
    if (error) {
      req.flash('error', 'Failed to fetch questions');
      return res.status(500).send({ message: "Failed to fetch questions", error });
    }
    res.render('questions', { questions, message: messages[0] });
  });
  
  // Load question editing form
  router.get('/edit/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const { data: question, error: questionError } = await supabase
        .from('questions')
        .select('*')
        .eq('id', id)
        .single();
  
      const { data: categories, error: categoryError } = await supabase
        .from('categories')
        .select('*');
  
      const messages = req.flash('success');
      if (questionError) throw questionError;
      if (categoryError) throw categoryError;
  
      res.render('questions/edit', { question, categories, message: messages[0] });
    } catch (error) {
      console.error('Error fetching data:', error);
      req.flash('error', 'Failed to fetch data');
      res.status(500).send({ message: "Failed to fetch data", details: error });
    }
  });
  
  // Update a question
  router.post('/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { category_id, question, question_type } = req.body;

    console.log('edit question', req.body);
  
    const { data, error } = await supabase
      .from('questions')
      .update({ category_id, question, question_type })
      .eq('id', id);
  
    if (error) {
      req.flash('error', 'Failed to update question');
      return res.status(500).send({ message: "Failed to update question", error });
    }
  
    req.flash('success', 'Question updated successfully');
    res.redirect('/questions');
  });

  
  module.exports = router;