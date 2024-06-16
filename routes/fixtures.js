const express = require('express');
const router = express.Router();
const { accessControl, ensureAuthenticated } = require('../middleware/middleware');
const supabase = require('../config/supabaseClient');

// Fetch all fixtures
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const { data: fixtures, error } = await supabase
            .from('fixtures')
            .select(`
          id,
          home_team_id,
          away_team_id,
          kick_off_time,
          round,
          home_team_score,
          away_team_score,
          home_team:home_team_id (name),
          away_team:away_team_id (name)
        `)
            .order('kick_off_time', { ascending: true });

        if (error) {
            throw error;
        }

        res.render('fixtures/index', { fixtures });
    } catch (error) {
        console.error('Error fetching fixtures:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Fetch teams for dropdown
router.get('/add', ensureAuthenticated, async (req, res) => {
    try {
        const { data: teams, error } = await supabase
            .from('teams')
            .select('id, name');

        if (error) {
            throw error;
        }

        res.render('fixtures/add', { teams });
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Add a fixture
router.post('/add', ensureAuthenticated, async (req, res) => {
    const { home_team_id, away_team_id, kick_off_time, round } = req.body;

    try {
        const { data, error } = await supabase
            .from('fixtures')
            .insert([
                { home_team_id, away_team_id, kick_off_time, round }
            ]);

        if (error) {
            throw error;
        }

        res.redirect('/fixtures');
    } catch (error) {
        console.error('Error adding fixture:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Fetch a fixture for editing
router.get('/edit/:id', ensureAuthenticated, async (req, res) => {
    const fixtureId = req.params.id;

    try {
        const { data: fixture, error: fixtureError } = await supabase
            .from('fixtures')
            .select('*')
            .eq('id', fixtureId)
            .single();

        if (fixtureError) {
            throw fixtureError;
        }

        const { data: teams, error: teamsError } = await supabase
            .from('teams')
            .select('id, name');

        if (teamsError) {
            throw teamsError;
        }

        res.render('fixtures/edit', { fixture, teams });
    } catch (error) {
        console.error('Error fetching fixture:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Edit a fixture
router.post('/edit/:id', ensureAuthenticated, async (req, res) => {
    const fixtureId = req.params.id;
    const { home_team_score, away_team_score, round, kick_off_time } = req.body;

    try {
        const { data, error } = await supabase
            .from('fixtures')
            .update({ home_team_score, away_team_score, round, kick_off_time })
            .eq('id', fixtureId);

        if (error) {
            throw error;
        }

        res.redirect('/fixtures');
    } catch (error) {
        console.error('Error updating fixture:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Delete a fixture
router.post('/delete/:id', ensureAuthenticated, async (req, res) => {
    const fixtureId = req.params.id;

    try {
        const { error } = await supabase
            .from('fixtures')
            .delete()
            .eq('id', fixtureId);

        if (error) {
            throw error;
        }

        res.redirect('/fixtures');
    } catch (error) {
        console.error('Error deleting fixture:', error);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router;
