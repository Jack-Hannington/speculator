const express = require('express');
const router = express.Router();
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');

router.use(express.json()); // Use for regular routes that need JSON 
router.use(bodyParser.urlencoded({ extended: true }));

router.post('/completed-assessments', async (req, res) => {
  let assessmentData;

  // Extract assessment data from the webhook
  if (req.body.data && req.body.data.fields) {
    const webhookData = req.body.data;
    const fields = webhookData.fields;

    assessmentData = {
      first_name: fields.find(field => field.key === "question_YjVPOz").value,
      last_name: fields.find(field => field.key === "question_Dq0B1X").value,
      gender: fields.find(field => field.key === "question_laVBAV").options.find(option => option.id === fields.find(field => field.key === "question_laVBAV").value[0]).text,
      age: fields.find(field => field.key === "question_RW8x4v").value,
      weight: fields.find(field => field.key === "question_GeY61Q").value,
      waist_circumference: fields.find(field => field.key === "question_OQ8aPk").value,
      obesity_score: fields.find(field => field.key === "question_VpoGlN_d92462c3-050e-4e60-9bbb-87df59cab222").value,
      bmi: fields.find(field => field.key === "question_PR8pEP").value,
      visceral_fat: fields.find(field => field.key === "question_Eq8K1A").value,
      cv_fitness_score: fields.find(field => field.key === "question_X5NXzP_5e7d307e-aa06-495f-8f31-d7b1fa0a78d7").value,
      resting_heart_rate: fields.find(field => field.key === "question_8NEOMl").value,
      heart_index: fields.find(field => field.key === "question_LDoQEj").value,
      blood_pressure: fields.find(field => field.key === "question_0VAXa9").options.find(option => option.id === fields.find(field => field.key === "question_0VAXa9").value[0]).text,
      hours_sitting_per_day: fields.find(field => field.key === "question_zEblLk").value,
      recovery_score: fields.find(field => field.key === "question_5XORMN_2f002fa0-89d8-4db4-abda-13fd2424d664").value,
      sleep_hours: fields.find(field => field.key === "question_dbRrvr").value,
      respiratory_rate: fields.find(field => field.key === "question_Yjq8kN").options.find(option => option.id === fields.find(field => field.key === "question_Yjq8kN").value[0]).text,
      heart_rate_variability: fields.find(field => field.key === "question_DqWQMl").value,
      mental_health_score: fields.find(field => field.key === "question_la4Qvo_cd1c05e3-2b1b-42a5-a829-db058733f23d").value,
      wellbeing_score: fields.find(field => field.key === "question_RWrpjK").value,
      strength_score: fields.find(field => field.key === "question_e5o4OO_6cb4cb41-43e9-46fd-9362-80720aa8f619").value,
      muscle_mass: fields.find(field => field.key === "question_WJZyba").value,
      grip_strength: fields.find(field => field.key === "question_aOlVJq").value,
      neck_strength: fields.find(field => field.key === "question_9Nrz7X").value,
      glute_strength: fields.find(field => field.key === "question_e5odaQ").value,
      mobility_score: fields.find(field => field.key === "question_WJZv8R_b9ea13af-ddda-43ec-9904-b613c0b509de").value,
      sit_and_reach: fields.find(field => field.key === "question_aOl822").value,
      thomas_test: fields.find(field => field.key === "question_peZl0q").options.find(option => option.id === fields.find(field => field.key === "question_peZl0q").value[0]).text,
      chest_test: fields.find(field => field.key === "question_1WB1bQ").options.find(option => option.id === fields.find(field => field.key === "question_1WB1bQ").value[0]).text,
      trap_complex_test: fields.find(field => field.key === "question_M1G9rp").options.find(option => option.id === fields.find(field => field.key === "question_M1G9rp").value[0]).text,
      nutrition_score: fields.find(field => field.key === "question_J1BNV4_b4a6f825-11da-4d6e-8923-a9cef8a9b433").value,
      glucose: fields.find(field => field.key === "question_gbORQl").options.find(option => option.id === fields.find(field => field.key === "question_gbORQl").value[0]).text,
      cholesterol: fields.find(field => field.key === "question_yX7W0B").options.find(option => option.id === fields.find(field => field.key === "question_yX7W0B").value[0]).text,
      calorie_balance: fields.find(field => field.key === "question_X5NKRj").options.find(option => option.id === fields.find(field => field.key === "question_X5NKRj").value[0]).text,
      body_water_percentage: fields.find(field => field.key === "question_8NE0JO").value,
      assessment_date: webhookData.createdAt
    };
  } else {
    assessmentData = req.body;
  }

  const { data, error } = await supabase
    .from('completed_assessments')
    .insert([assessmentData]);

  if (error) {
    console.error(error.message);
    return res.status(500).send('Failed to insert completed assessment');
  }

  res.status(201).send('Assessment added successfully');
});

// Show assessments
router.get('/', async (req, res) => {
  const { data: assessments, error } = await supabase
    .from('assessments')
    .select('*, assessment_questions(question_id, questions(question))');

  const messages = req.flash('success');
  if (error) {
    req.flash('error', 'Failed to fetch assessments');
    return res.status(500).send({ message: "Failed to fetch assessments", error });
  }
  res.render('assessments', { assessments, message: messages[0] });
});

// Show create assessmnet form
router.get('/create', async (req, res) => {
  const { data: questions, error } = await supabase
    .from('questions')
    .select('*');

  const messages = req.flash('success');
  if (error) {
    req.flash('error', 'Failed to fetch questions');
    return res.status(500).send({ message: "Failed to fetch questions", error });
  }
  res.render('assessments/create', { questions, message: messages[0] });
});

// Post create assessment
router.post('/create', async (req, res) => {
  const { name, description, question_ids } = req.body;

  console.log(req.body);

  const { data: assessments, error: assessmentError } = await supabase
    .from('assessments')
    .insert([{ name, description }])
    .select();

  if (assessmentError) {
    req.flash('error', 'Failed to create assessment');
    return res.status(500).send({ message: "Failed to create assessment", error: assessmentError });
  }

  const assessment_id = assessments[0].id; // Accessing the first element to get the assessment ID

  const questions = question_ids.map(question_id => ({
    assessment_id,
    question_id
  }));

  const { error: assessmentQuestionsError } = await supabase
    .from('assessment_questions')
    .insert(questions);

  if (assessmentQuestionsError) {
    req.flash('error', 'Failed to add questions to assessment');
    return res.status(500).send({ message: "Failed to add questions to assessment", error: assessmentQuestionsError });
  }

  req.flash('success', 'Assessment created successfully');
  res.redirect('/assessments');
});


// Edit assessment 
router.get('/edit/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('*, assessment_questions(question_id)')
      .eq('id', id)
      .single();

    if (assessmentError) throw assessmentError;

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*');

    if (questionsError) throw questionsError;

    const messages = req.flash('success');
    res.render('assessments/edit', { assessment, questions, message: messages[0] });
  } catch (error) {
    console.error('Error fetching data:', error);
    req.flash('error', 'Failed to fetch data');
    res.status(500).send({ message: "Failed to fetch data", details: error });
  }
});

router.post('/edit/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, question_ids } = req.body;

  console.log(req.body)

  const { data, error: assessmentError } = await supabase
    .from('assessments')
    .update({ name, description })
    .eq('id', id);

  if (assessmentError) {
    req.flash('error', 'Failed to update assessment');
    return res.status(500).send({ message: "Failed to update assessment", error: assessmentError });
  }

  // Delete existing questions for the assessment
  const { error: deleteError } = await supabase
    .from('assessment_questions')
    .delete()
    .eq('assessment_id', id);

  if (deleteError) {
    req.flash('error', 'Failed to update questions for assessment');
    return res.status(500).send({ message: "Failed to update questions for assessment", error: deleteError });
  }

  const questions = question_ids.map(question_id => ({
    assessment_id: id,
    question_id
  }));

  const { error: assessmentQuestionsError } = await supabase
    .from('assessment_questions')
    .insert(questions);

  if (assessmentQuestionsError) {
    req.flash('error', 'Failed to add questions to assessment');
    return res.status(500).send({ message: "Failed to add questions to assessment", error: assessmentQuestionsError });
  }

  req.flash('success', 'Assessment updated successfully');
  res.redirect('/assessments');
});

// View user assessment

async function getUniqueResponseSets(userId) {
  const { data: responseSets, error } = await supabase
    .from('distinct_response_sets')
    .select('response_set_id, response_date, assessment_name')
    .eq('user_id', userId);

  if (error) {
    console.error('Error:', error);
    return { error };
  } else {
    console.log('Unique Response Sets:', responseSets);
    return { data: responseSets };
  }
}



router.get('/view', async (req, res) => {
  const { data: responseSets, error } = await getUniqueResponseSets(req.user.id);

  if (error) {
    req.flash('error', 'Failed to fetch response sets');
    return res.status(500).send({ message: "Failed to fetch response sets", error });
  }

  const messages = req.flash('success');
  res.render('assessments/view', { responseSets, message: messages[0] });
});
// Replace 32 with the actual user_id you want to query


router.get('/getResponseDetails/:responseSetId', async (req, res) => {
  const { responseSetId } = req.params;

  try {
    const { data: details, error } = await supabase
      .from('user_responses')
      .select(`
        response_value,
        questions(question, detail)
      `)
      .eq('response_set_id', responseSetId);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch response details' });
    }

    console.log(details)

    res.json({ data: details });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;

