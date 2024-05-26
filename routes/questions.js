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

  const messages = req.flash('success');
  if (error) {
    req.flash('error', 'Failed to fetch questions');
    return res.status(500).send({ message: "Failed to fetch questions", error });
  }
  res.render('questions', { questions, message: messages[0] });
});

// Load question creation form
router.get('/create', async (req, res) => {
  const { data: categories, error: categoryError } = await supabase
    .from('categories')
    .select('*');

  const messages = req.flash('success');
  if (categoryError) {
    req.flash('error', 'Failed to fetch categories');
    return res.status(500).send({ message: "Failed to fetch categories", error: categoryError });
  }
  res.render('questions/create', { categories, message: messages[0] });
});

// Create a new question
router.post('/create', async (req, res) => {
  const { category_id, question, question_type } = req.body;

  const { data, error } = await supabase
    .from('questions')
    .insert([{ category_id, question, question_type }]);

  if (error) {
    req.flash('error', 'Failed to create question');
    return res.status(500).send({ message: "Failed to create question", error });
  }

  req.flash('success', 'Question created successfully');
  res.redirect('/questions');
});


// Load question editing form
// Load question editing form
// Load question editing form
router.get('/edit/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [questionResult, categoriesResult, scoringRulesResult] = await Promise.all([
      supabase.from('questions').select('*').eq('id', id).single(),
      supabase.from('categories').select('*'),
      supabase.from('scoring_rules').select('*').eq('question_id', id)
    ]);

    const question = questionResult.data;
    const questionError = questionResult.error;
    const categories = categoriesResult.data;
    const categoryError = categoriesResult.error;
    const scoringRules = scoringRulesResult.data;
    const scoringRulesError = scoringRulesResult.error;

    const messages = req.flash('success');
    if (questionError) throw questionError;
    if (categoryError) throw categoryError;
    if (scoringRulesError) throw scoringRulesError;

    res.render('questions/edit', { question, categories, scoringRules, message: messages[0] });
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



//   Scoring rules
// Load scoring rule creation form
router.get('/:id/scoring_rules/create', async (req, res) => {
  const { id } = req.params;

  const { data: question, error: questionError } = await supabase
    .from('questions')
    .select('*')
    .eq('id', id)
    .single();

  const messages = req.flash('success');
  if (questionError) {
    req.flash('error', 'Failed to fetch question');
    return res.status(500).send({ message: "Failed to fetch question", error: questionError });
  }

  res.render('questions/scoring-rules-create', { question, message: messages[0] });
});

// Create a new scoring rule
router.post('/:id/scoring_rules/create', async (req, res) => {
  const { id } = req.params;
  const { gender, age_range, min_value, max_value, score } = req.body;

  const { data, error } = await supabase
    .from('scoring_rules')
    .insert([{ question_id: id, gender, age_range, min_value, max_value, score }]);

  if (error) {
    req.flash('error', 'Failed to create scoring rule');
    return res.status(500).send({ message: "Failed to create scoring rule", error });
  }

  req.flash('success', 'Scoring rule created successfully');
  res.redirect(`/questions/edit/${id}`);
});
// Load scoring rule editing form
router.get('/scoring_rules/edit/:rule_id', async (req, res) => {
  const { rule_id } = req.params;

  const { data: scoringRule, error: scoringRuleError } = await supabase
    .from('scoring_rules')
    .select('*')
    .eq('id', rule_id)
    .single();

  const messages = req.flash('success');
  if (scoringRuleError) {
    req.flash('error', 'Failed to fetch scoring rule');
    return res.status(500).send({ message: "Failed to fetch scoring rule", error: scoringRuleError });
  }

  res.render('questions/scoring-rules-edit', { scoringRule, message: messages[0] });
});

// Update a scoring rule
router.post('/scoring_rules/edit/:rule_id', async (req, res) => {
  const { rule_id } = req.params;
  const { gender, age_range, min_value, max_value, score } = req.body;

  const { data, error } = await supabase
    .from('scoring_rules')
    .update({ gender, age_range, min_value, max_value, score })
    .eq('id', rule_id);

  if (error) {
    req.flash('error', 'Failed to update scoring rule');
    return res.status(500).send({ message: "Failed to update scoring rule", error });
  }

  req.flash('success', 'Scoring rule updated successfully');
  res.redirect('/questions');
});

// Delete a scoring rule
router.post('/scoring_rules/delete/:rule_id', async (req, res) => {
  const { rule_id } = req.params;

  const { error } = await supabase
    .from('scoring_rules')
    .delete()
    .eq('id', rule_id);

  if (error) {
    req.flash('error', 'Failed to delete scoring rule');
    return res.status(500).send({ message: "Failed to delete scoring rule", error });
  }

  req.flash('success', 'Scoring rule deleted successfully');
  res.redirect('/questions');
});



module.exports = router;