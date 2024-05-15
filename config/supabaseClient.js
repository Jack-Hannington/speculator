const { createClient } = require("@supabase/supabase-js");
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseApiKey = process.env.SUPABASE_API_KEY;

const supabase = createClient(supabaseUrl, supabaseApiKey);

module.exports = supabase;
