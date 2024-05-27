const express = require('express');
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const router = express.Router();
const accessControl = require('../middleware/middleware');
const { v4: uuidv4 } = require('uuid');

router.use(accessControl('admin'));


// Get all customers
router.get('/', async (req, res) => {
  const { data: customers, error } = await supabase
    .from('users')
    .select(`*`);

  if (error) return res.status(500).send({ message: "Failed to fetch users", error });
  res.render('customers', { customers });
});

// Load assessments
router.get('/assessments', async (req, res) => {
  res.render('customers/old_assessments');
});


// GET route to fetch a specific member's data for editing along with all memberships
router.get('/edit/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch user details
    const { data: customer, error: userError } = await supabase
      .from('users')
      .select('*, memberships(name)')
      .eq('id', id)
      .single();

    if (userError) throw userError;


    // Fetch all assessmnetns
    const { data: assessments, error: assessmentsError } = await supabase
      .from('completed_assessments')
      .select('*')
      .eq('id', id)

    if (assessmentsError) throw assessmentsError;

    res.render('customers/edit', { customer, assessments });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send({ message: "Failed to fetch data", details: error });
  }
});

router.get('/create', async (req, res) => {

  // Fetch all memberships
  const { data: memberships } = await supabase
    .from('memberships')
    .select('id, name');

  res.render('customers/create', { memberships });
});

//Create new customer
router.post('/create', async (req, res) => {
  const tenantId = req.user.tenant_id;  // Accessed from the logged-in user's session
  let { name, email, role, membership_id, password } = req.body;

  // Check for empty membership_id and convert it to null
  membership_id = membership_id === '' ? null : membership_id;

  // Validate required fields
  if (!name || !email || !role || !password) { // Added password since it's necessary for new users
    return res.status(400).send({ message: "Missing required fields" });
  }

  // Create user information
  try {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        role,
        membership_id,
        tenant_id: tenantId, // Use tenant_id from the logged-in user
        password, // Assuming password is being handled securely
        active_account: true // Optionally set the account as active on creation
      });

    if (error) {
      console.error('Failed to create user:', error);
      return res.status(500).send({ message: "Failed to create user", details: error.message });
    }

    // Redirect or respond after successful creation
    res.redirect('/customers'); // Redirect to the customer list or a success page
  } catch (error) {
    console.error('Error creating new user:', error);
    res.status(500).send({ message: "Server error while creating user", details: error.message });
  }
});



router.post('/edit/:id', async (req, res) => {
  const { id } = req.params;
  let { first_name, last_name, email, role, day, month, year, gender, membership_id } = req.body; // Updated to include gender
  console.log(req.body);

  if (membership_id === '') {
    membership_id = null;
  }

  // Check for required fields
  if (!first_name || !email || !role) {
    return res.status(400).send({ message: "Missing required fields" });
  }

  // Combine day, month, year into a single date field
  const date_of_birth = new Date(Date.UTC(year, month - 1, day));

  // Update user information
  const { data: updatedUser, error } = await supabase
    .from('users')
    .update({ first_name, last_name, email, role, date_of_birth, gender, membership_id })
    .eq('id', id);

  if (error) return res.status(500).send({ message: "Failed to update user", error });
  res.redirect('/customers');
});



// Route to render assessment form for a customer
// Route to render specific assessment form for a customer
router.get('/:customerId/assessments/:assessmentId/new', async (req, res) => {
  const { customerId, assessmentId } = req.params;
  console.log(`Received request for customerId: ${customerId}, assessmentId: ${assessmentId}`);

  try {
    // Fetch the customer's details
    const { data: customer, error: customerError } = await supabase
      .from('users')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError) throw customerError;

    // Fetch assessment questions and related question details
    const { data: assessmentQuestions, error: assessmentQuestionsError } = await supabase
      .from('assessment_questions')
      .select(`
        *,
        questions(question, question_type, detail)
      `)
      .eq('assessment_id', assessmentId);

    console.log(assessmentQuestions)

    if (assessmentQuestionsError) throw assessmentQuestionsError;

    res.render('customers/new_assessment', { customer, assessmentId, assessmentQuestions });
  } catch (error) {
    console.error('Error fetching data:', error);
    req.flash('error', 'Failed to fetch data');
    res.status(500).send({ message: "Failed to fetch data", details: error });
  }
});

// Route to handle assessment form submission
router.post('/:customerId/assessments/:assessmentId', async (req, res) => {
  const { customerId, assessmentId } = req.params;
  const assessmentData = req.body;

  console.log(assessmentData)

  try {
    // Prepare the data for insertion
    const assessmentEntries = Object.keys(assessmentData).map(key => {
      const questionId = key.split('-')[1];
      return {
        user_id: customerId,
        assessment_id: assessmentId,
        question_id: questionId,
        response_value: assessmentData[key]
      };
    });

    // Insert assessment data into the database
    const { data: assessment, error } = await supabase
      .from('user_responses')
      .insert(assessmentEntries);

    if (error) throw error;

    req.flash('success', 'Assessment submitted successfully');
    res.redirect(`/customers/${customerId}`);
  } catch (error) {
    console.error('Error submitting assessment:', error);
    req.flash('error', 'Failed to submit assessment');
    res.status(500).send({ message: "Failed to submit assessment", details: error });
  }
});



router.post('/:customerId/assessments/:assessmentId/submit', async (req, res) => {
  const { customerId, assessmentId } = req.params;
  const assessmentData = req.body;
  const responseSetId = uuidv4(); // Generate a unique response set ID
  console.log(`This is assessment data for customer ${customerId}: response ${responseSetId}: assessment ${JSON.stringify(assessmentData)}`);

  try {
    // Fetch the user's details to get gender and age
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('gender, date_of_birth')
      .eq('id', customerId)
      .single();

    if (userError) throw userError;

    const userGender = user.gender;
    const userAge = new Date().getFullYear() - new Date(user.date_of_birth).getFullYear();

    console.log(`User ID: ${customerId}, Gender: ${userGender}, Age: ${userAge}`);

    // Insert user responses
    const assessmentEntries = Object.keys(assessmentData).map(key => {
      const questionId = key.split('-')[1];
      return {
        user_id: customerId,
        assessment_id: assessmentId,
        question_id: questionId,
        response_value: assessmentData[key],
        response_set_id: responseSetId
      };
    });

    const { data: insertedResponses, error: insertError } = await supabase
      .from('user_responses')
      .insert(assessmentEntries);

    if (insertError) throw insertError;

    // Fetch the most recent response set for the user and assessment
    const { data: latestResponses, error: latestResponsesError } = await supabase
      .from('user_responses')
      .select('question_id, response_value')
      .eq('user_id', customerId)
      .eq('assessment_id', assessmentId)
      .eq('response_set_id', responseSetId);

    if (latestResponsesError) throw latestResponsesError;

    // Fetch scoring rules for the questions answered
    const questionIds = latestResponses.map(response => response.question_id);
    const { data: scoringRules, error: scoringRulesError } = await supabase
      .from('scoring_rules')
      .select('*')
      .in('question_id', questionIds);

    if (scoringRulesError) throw scoringRulesError;

    console.log(`Scoring Rules: ${JSON.stringify(scoringRules)}`);

    // Fetch question details to get categories
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, category_id')
      .in('id', questionIds);

    if (questionsError) throw questionsError;

    console.log(`Questions: ${JSON.stringify(questions)}`);

    // Calculate scores
    const categoryScores = {};
    const totalPossibleScores = {};

    latestResponses.forEach(response => {
      const rules = scoringRules.filter(rule => rule.question_id === response.question_id);
      const rule = rules.find(r => {
        const ageMatch = (r.min_age === null || userAge >= r.min_age) && (r.max_age === null || userAge <= r.max_age);
        const genderMatch = r.gender === 'All' || r.gender === userGender;
        const minValueMatch = r.min_value === null || response.response_value >= r.min_value;
        const maxValueMatch = r.max_value === null || response.response_value <= r.max_value;
        return ageMatch && genderMatch && minValueMatch && maxValueMatch;
      });
      const question = questions.find(q => q.id === response.question_id);

      if (rule) {
        console.log(`Matched rule: ${JSON.stringify(rule)}`);
        if (!categoryScores[question.category_id]) {
          categoryScores[question.category_id] = 0;
          totalPossibleScores[question.category_id] = 0;
        }

        categoryScores[question.category_id] += rule.score;
        totalPossibleScores[question.category_id] += Math.max(...rules.map(r => r.score)); // Dynamic possible score
      } else {
        console.warn(`No matching scoring rule found for response: ${response.response_value} for question ID: ${response.question_id}`);
      }
    });

    console.log(`Category Scores: ${JSON.stringify(categoryScores)}`);
    console.log(`Total Possible Scores: ${JSON.stringify(totalPossibleScores)}`);

    // Insert the calculated scores into user_scores table
    const scoreEntries = Object.keys(categoryScores).map(categoryId => ({
      user_id: customerId,
      assessment_id: assessmentId,
      category_id: categoryId,
      score: categoryScores[categoryId],
      total_possible_score: totalPossibleScores[categoryId],
      response_set_id: responseSetId
    }));

    const { error: scoreInsertError } = await supabase
      .from('user_scores')
      .insert(scoreEntries);

    if (scoreInsertError) throw scoreInsertError;

    req.flash('success', 'Assessment submitted and scores calculated successfully');
    res.redirect(`/customers/${customerId}`);
  } catch (error) {
    console.error('Error submitting assessment and calculating scores:', error);
    req.flash('error', 'Failed to submit assessment and calculate scores');
    res.status(500).send({ message: "Failed to submit assessment and calculate scores", details: error });
  }
});




// router.post('/:customerId/assessments/:assessmentId/submit', async (req, res) => {
//   const { customerId, assessmentId } = req.params;
//   const assessmentData = req.body;
//   const responseSetId = uuidv4(); // Generate a unique response set ID
//   console.log(`this is assessment data for customer ${customerId}: response ${responseSetId}: assessment${assessmentData}`)

//   try {
//     // Insert user responses
//     const assessmentEntries = Object.keys(assessmentData).map(key => {
//       const questionId = key.split('-')[1];
//       return {
//         user_id: customerId,
//         assessment_id: assessmentId,
//         question_id: questionId,
//         response_value: assessmentData[key],
//         response_set_id: responseSetId
//       };
//     });

//     const { data: insertedResponses, error: insertError } = await supabase
//       .from('user_responses')
//       .insert(assessmentEntries);

//     if (insertError) throw insertError;

//     // Fetch the most recent response set for the user and assessment
//     const { data: latestResponses, error: latestResponsesError } = await supabase
//       .from('user_responses')
//       .select('question_id, response_value')
//       .eq('user_id', customerId)
//       .eq('assessment_id', assessmentId)
//       .eq('response_set_id', responseSetId);

//     if (latestResponsesError) throw latestResponsesError;

//     // Fetch scoring rules for the questions answered
//     const questionIds = latestResponses.map(response => response.question_id);
//     const { data: scoringRules, error: scoringRulesError } = await supabase
//       .from('scoring_rules')
//       .select('*')
//       .in('question_id', questionIds);

//     if (scoringRulesError) throw scoringRulesError;

//     // Fetch question details to get categories
//     const { data: questions, error: questionsError } = await supabase
//       .from('questions')
//       .select('id, category_id')
//       .in('id', questionIds);

//     if (questionsError) throw questionsError;

//     // Calculate scores
//     const categoryScores = {};
//     const totalPossibleScores = {};

//     latestResponses.forEach(response => {
//       const rules = scoringRules.filter(rule => rule.question_id === response.question_id);
//       const rule = rules.find(r => {
//         if (r.min_value !== null && r.max_value !== null) {
//           return response.response_value >= r.min_value && response.response_value <= r.max_value;
//         } else if (r.min_value !== null) {
//           return response.response_value >= r.min_value;
//         } else if (r.max_value !== null) {
//           return response.response_value <= r.max_value;
//         }
//         return false;
//       });

//       const question = questions.find(q => q.id === response.question_id);

//       if (rule) {
//         if (!categoryScores[question.category_id]) {
//           categoryScores[question.category_id] = 0;
//           totalPossibleScores[question.category_id] = 0;
//         }

//         categoryScores[question.category_id] += rule.score;
//         totalPossibleScores[question.category_id] += Math.max(...rules.map(r => r.score)); // Dynamic possible score
//       } else {
//         console.warn(`No matching scoring rule found for response: ${response.response_value} for question ID: ${response.question_id}`);
//       }
//     });

//     // Insert the calculated scores into user_scores table
//     const scoreEntries = Object.keys(categoryScores).map(categoryId => ({
//       user_id: customerId,
//       assessment_id: assessmentId,
//       category_id: categoryId,
//       score: categoryScores[categoryId],
//       total_possible_score: totalPossibleScores[categoryId],
//       response_set_id: responseSetId
//     }));

//     const { error: scoreInsertError } = await supabase
//       .from('user_scores')
//       .insert(scoreEntries);

//     if (scoreInsertError) throw scoreInsertError;

//     // Get the lowest 4 scores
//     const lowestScores = await getLowestScores(customerId);

//     // Fetch user-selected goals
//     const userGoals = await getUserGoals(customerId);

//     // If no user-selected goals, update with the lowest scores
//     if (userGoals.length === 0) {
//       const goalEntries = lowestScores.map(categoryName => ({
//         user_id: customerId,
//         category_id: categoryName
//       }));

//       await supabase
//         .from('user_goals')
//         .insert(goalEntries);
//     }

//     req.flash('success', 'Assessment submitted and scores calculated successfully');
//     res.redirect(`/customers/${customerId}`);
//   } catch (error) {
//     console.error('Error submitting assessment and calculating scores:', error);
//     req.flash('error', 'Failed to submit assessment and calculate scores');
//     res.status(500).send({ message: "Failed to submit assessment and calculate scores", details: error });
//   }
// });

const thomasTestQuestion = {
  question: "Thomas Test (hip flexors)",
  question_type: "dropdown",
  details: JSON.stringify({
    options: [
      { value: "below_parallel", label: "Leg below parallel", score: 5 },
      { value: "parallel", label: "Leg parallel with ground", score: 3 },
      { value: "above_parallel", label: "Leg above parallel", score: 1 }
    ]
  })
};
async function insertData() {
  const { data, error } = await supabase
    .from('questions')
    .upsert(thomasTestQuestion);

  if (error) {
    console.error('Failed to insert Thomas Test question', error);
  }

}

// insertData()










module.exports = router;
