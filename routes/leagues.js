const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { accessControl, ensureAuthenticated } = require('../middleware/middleware');
const { format, parseISO } = require('date-fns');
// View leagues 
// Get leagues the user is involved in
router.get('/', ensureAuthenticated, async (req, res) => {
  const userId = req.session.user_id;

  try {
    // Fetch leagues where the user is the owner
    const { data: ownedLeagues, error: ownedLeaguesError } = await supabase
      .from('user_leagues')
      .select('id, name')
      .eq('user_id', userId);

    if (ownedLeaguesError) {
      throw ownedLeaguesError;
    }

    // Fetch leagues where the user is a member
    const { data: memberLeagues, error: memberLeaguesError } = await supabase
      .from('user_league_members')
      .select('league_id, user_leagues (id, name)')
      .eq('user_id', userId);

    if (memberLeaguesError) {
      throw memberLeaguesError;
    }

    // Combine owned and member leagues
    const leagues = [
      ...ownedLeagues,
      ...memberLeagues.map(member => member.user_leagues)
    ];

    // Remove duplicates if any
    const uniqueLeagues = Array.from(new Set(leagues.map(league => league.id)))
      .map(id => {
        return leagues.find(league => league.id === id);
      });
    res.render('leagues', { leagues: uniqueLeagues });
  } catch (error) {
    console.error('Error fetching leagues:', error);
    res.status(500).send('Internal Server Error');
  }
});



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

async function generateUniqueInviteCode() {
  let inviteCode;
  let isUnique = false;

  while (!isUnique) {
    inviteCode = Math.floor(100000 + Math.random() * 9000).toString();

    // Check if the generated invite code already exists in the user_leagues table
    const { data, error } = await supabase
      .from('user_leagues')
      .select('invite_code')
      .eq('invite_code', inviteCode);

    if (error) {
      throw error;
    }

    // If no existing record with the same invite code is found, it's unique
    if (data.length === 0) {
      isUnique = true;
    }
  }

  return inviteCode;
}


router.post('/create', ensureAuthenticated, async (req, res) => {
  const userId = req.session.user_id;
  const { tournament_id, name } = req.body;
  const inviteCode = await generateUniqueInviteCode();

  try {
    console.log('User ID:', userId); // Log to ensure userId is available
    console.log('Request body:', req.body); // Log the request body

    // Create the league
    const { data: league, error: leagueError } = await supabase
      .from('user_leagues')
      .insert([
        { tournament_id, name, user_id: userId, invite_code: inviteCode }
      ])
      .select();

    console.log(league)

    if (leagueError) {
      throw leagueError;
    }

    console.log('Inserted league:', league); // Log inserted league

    // Add user to user_league_members
    const { error: memberError } = await supabase
      .from('user_league_members')
      .insert([
        { user_id: userId, league_id: league[0].id }
      ]);

    if (memberError) {
      throw memberError;
    }

    req.flash('success', 'League created successfully!');
    res.redirect(`/leagues`);
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



// Join a league with an invite code
router.post('/join', ensureAuthenticated, async (req, res) => {
  const userId = req.session.user_id;
  const { inviteCode } = req.body;

  try {
    console.log(inviteCode);
    const { data: league, error: leagueError } = await supabase
      .from('user_leagues')
      .select('id')
      .eq('invite_code', inviteCode);

    if (leagueError) {
      throw leagueError;
    }

    if (league.length === 0) {
      throw new Error('Invalid invite code.');
    }

    const leagueId = league[0].id;

    // Check if the user is already a member of the league
    const { data: member, error: memberCheckError } = await supabase
      .from('user_league_members')
      .select('id')
      .eq('user_id', userId)
      .eq('league_id', leagueId);

    if (memberCheckError) {
      throw memberCheckError;
    }

    if (member.length > 0) {
      // User is already a member, redirect to the league page
      res.redirect(`/leagues/${leagueId}`);
    } else {
      // User is not a member, insert the membership
      const { error: memberInsertError } = await supabase
        .from('user_league_members')
        .insert([
          { user_id: userId, league_id: leagueId }
        ]);

      if (memberInsertError) {
        throw memberInsertError;
      }

      res.redirect(`/leagues/${leagueId}`);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/:id', ensureAuthenticated, async (req, res) => {
  const leagueId = req.params.id;
  const selectedRound = req.query.round || '1';

  try {
    // Fetch league details
    const { data: league, error: leagueError } = await supabase
      .from('user_leagues')
      .select('id, name, tournament_id, invite_code')
      .eq('id', leagueId)
      .single();

    if (leagueError) {
      throw leagueError;
    }

    // Fetch league participants with their total points and rankings
    const { data: participants, error: participantsError } = await supabase
      .from('league_user_points')
      .select('user_id, first_name, total_points, ranking, total_correct_results, total_incorrect_results')
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
        points,
        fixtures (
          id,
          round,
          kick_off_time,
          home_team_id,
          away_team_id,
          home_team:home_team_id (name, flag),
          away_team:away_team_id (name, flag),
          home_team_score,
          away_team_score,
          status
        )
      `)
      .in('user_id', participantIds);

    if (predictionsError) {
      throw predictionsError;
    }

    // Format the kick_off_time and group predictions by fixture_id and round
    const groupedPredictions = predictions.reduce((acc, prediction) => {
      const fixtureId = prediction.fixture_id;
      const round = prediction.fixtures.round;

      if (!acc[round]) {
        acc[round] = {};
      }

      if (!acc[round][fixtureId]) {
        const fixture = prediction.fixtures;
        if (fixture.status === 'in-progress' || fixture.status === 'finished') {
          fixture.formatted_kick_off_time = `${fixture.home_team.name} ${fixture.home_team_score} - ${fixture.away_team_score} ${fixture.away_team.name}`;
        } else {
          fixture.formatted_kick_off_time = format(parseISO(fixture.kick_off_time), 'EEE do MMMM, HH:mm');
        }
        acc[round][fixtureId] = {
          fixture,
          predictions: []
        };
      }
      acc[round][fixtureId].predictions.push(prediction);
      return acc;
    }, {});

    // Extract unique rounds
    const rounds = [...new Set(predictions.map(prediction => prediction.fixtures.round))];

    console.log('league participants', participants);

    res.render('leagues/view', { league, participants, selectedRound, groupedPredictions, rounds });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});





// Invite to a league
router.get('/:id/invite', ensureAuthenticated, async (req, res) => {
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

module.exports = router;
