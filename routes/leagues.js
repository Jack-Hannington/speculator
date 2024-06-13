const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { accessControl, ensureAuthenticated } = require('../middleware/middleware');

// Create a new league

router.get('/create', ensureAuthenticated, async (req, res) => {
  try {
    const { data: tournaments, error } = await supabase
      .from('tournaments')
      .select('id, name');

    if (error) {
      throw error;
    }
    const messages = req.flash('success');

    res.render('leagues/create', { tournaments, message: messages[0] });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/create', ensureAuthenticated, async (req, res) => {
  const userId = req.session.user_id;
  const { tournament_id, name } = req.body;
  const inviteCode = uuidv4();

  try {
    console.log('User ID:', userId); // Log to ensure userId is available
    console.log('Request body:', req.body); // Log the request body

    // Validate inputs
    if (!userId || !tournament_id || !name) {
      throw new Error('Missing required fields');
    }

    const { data, error } = await supabase
      .from('user_leagues')
      .insert([
        { tournament_id, name, user_id: userId, invite_code: inviteCode }
      ])
      .select(); // Use select() to return the inserted row

    if (error) {
      throw error;
    }

    console.log('Inserted data:', data); // Log inserted data

    res.redirect(`/leagues/${data[0].id}`);
  } catch (error) {
    console.error('Error creating league:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Edit a league
router.post('/leagues/:id/edit', ensureAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const leagueId = req.params.id;
  const { name } = req.body;

  try {
    // Ensure the user is the owner of the league
    const { data: league, error: leagueError } = await supabase
      .from('user_leagues')
      .select('user_id')
      .eq('id', leagueId)
      .single();

    if (leagueError) {
      throw leagueError;
    }

    if (league.user_id !== userId) {
      return res.status(403).send('Forbidden');
    }

    const { error } = await supabase
      .from('user_leagues')
      .update({ name })
      .eq('id', leagueId);

    if (error) {
      throw error;
    }

    res.redirect(`/leagues/${leagueId}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Invite to a league
router.get('/leagues/:id/invite', ensureAuthenticated, async (req, res) => {
  const leagueId = req.params.id;

  try {
    const { data: league, error: leagueError } = await supabase
      .from('user_leagues')
      .select('invite_code')
      .eq('id', leagueId)
      .single();

    if (leagueError) {
      throw leagueError;
    }

    res.send(`Invite code: ${league.invite_code}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Join a league with an invite code
router.post('/leagues/join', ensureAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const { inviteCode } = req.body;

  try {
    const { data: league, error: leagueError } = await supabase
      .from('user_leagues')
      .select('id')
      .eq('invite_code', inviteCode)
      .single();

    if (leagueError) {
      throw leagueError;
    }

    // Add user to the league (assuming you have a user_league_members table)
    const { error: memberError } = await supabase
      .from('user_league_members')
      .insert([
        { user_id: userId, league_id: league.id }
      ]);

    if (memberError) {
      throw memberError;
    }

    res.redirect(`/leagues/${league.id}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// View a league
router.get('/leagues/:id', ensureAuthenticated, async (req, res) => {
  const leagueId = req.params.id;

  try {
    // Fetch league details
    const { data: league, error: leagueError } = await supabase
      .from('user_leagues')
      .select('id, name, tournament_id')
      .eq('id', leagueId)
      .single();

    if (leagueError) {
      throw leagueError;
    }

    // Fetch league participants
    const { data: participants, error: participantsError } = await supabase
      .from('user_league_members')
      .select('user_id, users (name)')
      .eq('league_id', leagueId);

    if (participantsError) {
      throw participantsError;
    }

    // Fetch predictions and scores
    const participantIds = participants.map(p => p.user_id);
    const { data: predictions, error: predictionsError } = await supabase
      .from('user_predictions')
      .select(`
        user_id,
        fixture_id,
        predicted_home_score,
        predicted_away_score,
        fixtures (home_team_id, away_team_id, home_team (name), away_team (name))
      `)
      .in('user_id', participantIds)
      .eq('tournament_id', league.tournament_id);

    if (predictionsError) {
      throw predictionsError;
    }

    res.render('league', { league, participants, predictions });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
