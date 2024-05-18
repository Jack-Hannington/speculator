const express = require('express');
const router = express.Router();
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');


async function getLatestAssessmentRank(userId) {
    const { data, error } = await supabase.rpc('get_latest_assessment_rank', { p_user_id: userId });
    if (error) {
      console.error('Error fetching rank:', error);
      return null;
    } else {
      return data;
    }
  }
  
  // Example usage:
  getLatestAssessmentRank(2).then(rank => {
    console.log('Rank:', rank);
  });

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

module.exports = router;
