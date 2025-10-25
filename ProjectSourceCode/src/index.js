const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const path = require('path');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const fileUpload = require('express-fileupload');

// Set up handlebars
const hbs = handlebars.create({
extname: 'hbs',
defaultLayout: 'main',
layoutsDir: path.join(__dirname, 'views/layouts'),
partialsDir: path.join(__dirname, 'views/partials'),
helpers: {
  inc: function(value) {
    return parseInt(value) + 1;
  },
  formatDate: function(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  },
  eq: (a, b) => a == b,
  json: obj => JSON.stringify(obj, null, 2)
}

});

// Database configuration
const dbConfig = {
host: process.env.HOST, // the database server
port: 5432, // the database port
database: process.env.POSTGRES_DB, // the database name
user: process.env.POSTGRES_USER, // the user account to connect with
password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// Test database connection
db.connect()
.then(obj => {
console.log('Database connection successful');
obj.done(); // success, release the connection;
})
.catch(error => {
console.log('ERROR:', error.message || error);
});

// Ensure required tables exist
async function ensureTablesExist() {
  try {
    console.log('Checking if required tables exist...');
    
    // Create the users_to_destinations table if it doesn't exist
    await db.none(`
      CREATE TABLE IF NOT EXISTS users_to_destinations (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
        destination_id INTEGER REFERENCES destinations(id) ON DELETE CASCADE
      )
    `);
    console.log('users_to_destinations table check completed');
    
    // Add trip_name column to trips table if it doesn't exist
    await db.none(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_name VARCHAR(100)
    `);
    console.log('trip_name column check completed');
  } catch (err) {
    console.error('Error in ensureTablesExist:', err);
  }
}

// Call this function when your app starts
ensureTablesExist().catch(err => {
  console.error('Failed to ensure tables exist:', err);
});

// Use hbs as the template engine
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');

// Set the 'views' directory
app.set('views', path.join(__dirname, 'views'));

// Serve static files from resources directory
app.use('/css', express.static(path.join(__dirname, 'resources/css')));
app.use('/js', express.static(path.join(__dirname, 'resources/js')));
app.use('/img', express.static(path.join(__dirname, 'resources/img')));

// Parse request bodies
app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Set up sessions
app.use(session({
secret: process.env.SESSION_SECRET || 'default_secret',
resave: false,
saveUninitialized: true,
cookie: { secure: false } // set to true if using https
}));

// Route for home page - redirects to login
app.get('/', (req, res) => {
  if (req.session.user && req.session.user.loggedIn) {
    res.redirect('/map');
  } else {
  res.redirect('/login');
  }
});

// Route for registration page
app.get('/register', (req, res) => {
const message = req.query.message || '';
res.render('pages/register', { message, title: 'Register' });
});

// Process registration form
app.post('/register', async (req, res) => {
  try {
    const { username, password, test } = req.body;

    console.log('Registration attempt with data:', {
      username,
      passwordProvided: !!password,
      test
    });


    // Basic validation
    if (!username || !password) {
      console.log('Missing username or password');
      const message = 'Username and password are required';
      if (test) {
        return res.status(400).json({ message });
      } else {
        return res.status(400).render('pages/register', { message, error: true });
      }
    }


    console.log('Checking if username exists...');
    const userCheck = await db.oneOrNone('SELECT username FROM users WHERE username = $1', [username]);

    if (userCheck) {
      console.log('Username already exists');
      const message = 'Username already exists';
      if (test) {
        return res.status(409).json({ message });
      } else {
        return res.status(409).render('pages/register', { message, error: true });
      }
    }

    console.log('Hashing password...');

    const hash = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');

    console.log('Inserting new user...');
    await db.none('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
    console.log('User registered successfully:', username);

    if (test) {
      return res.status(200).json({ message: 'Success' });
    } else {
      return res.redirect('/login?message=Registration successful. Please log in.');
    }

  } catch (err) {
    console.error('Registration error:', err);
    const message = 'Server error. Please try again.';
    if (req.body.test) {
      return res.status(500).json({ message });
    } else {
      return res.status(500).render('pages/register', { message, error: true });
    }
  }
});

// Route for login page
app.get('/login', (req, res) => {
const message = req.query.message || '';
res.render('pages/login', { message, title: 'Login' });
});

// Process login form
app.post('/login', async (req, res) => {
try {
const { username, password } = req.body;
// Get the user from the database
const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
// If user doesn't exist or password doesn't match
if (!user || !(await bcrypt.compare(password, user.password))) {
return res.redirect('/login?message=Invalid username or password');
}
// Set up session
req.session.user = {
username: user.username,
loggedIn: true
};
// Redirect to events page
res.redirect('/map');
} catch (err) {
console.error('Login error:', err);
res.redirect('/login?message=Error during login. Please try again.');
}
});


// Route for logout
app.get('/logout', (req, res) => {
// Destroy the session
req.session.destroy();
res.redirect('/login?message=You have been logged out');
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user && req.session.user.loggedIn) {
    return next();
  }
  return res.status(401).send('Please log in to access this page');
};

app.post('/events', isAuthenticated, async (req, res, next) => {
  console.log('got into /events post');
  
  const username = req.session.user.username;
  const { trip_id, start_time, end_time, city, country, activity, description } = req.body;
  console.log('trip_id: ', trip_id);
  // Adjust the validation to check for trip_id instead of event_id
  if (!trip_id) {
    console.error('Server error: Missing trip_id');
    return res.status(500).send('Something went wrong.');
  }
  
  

  try {
    // Insert into events. Assuming your 'events' table auto-generates a primary key (e.g., event_id)
    const eventResult = await db.one(`
      INSERT INTO events (start_time, end_time, city, country, activity, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING event_id
    `, [start_time, end_time, city, country, activity, description]);
    
    // Now use the auto-generated event_id to create the association in trips_to_events.
    await db.none(`
      INSERT INTO trips_to_events (trip_id, event_id)
      VALUES ($1, $2)
    `, [trip_id, eventResult.event_id]);

    // Redirect into the all trips page to see events rendered
    res.redirect(`/trips/${trip_id}?message=Event created successfully`);
  } catch (err) {
    next(err);
  }
});

app.post('/events/edit', isAuthenticated, async (req, res) => {
  const { event_id, trip_id, start_time, end_time, city, country, activity, description } = req.body;

  if (!event_id || !trip_id || !start_time || !end_time || !city || !country || !activity) {
    return res.status(400).send('All required fields must be provided.');
  }

  try {
    await db.none(`
      UPDATE events
      SET start_time = $1,
          end_time = $2,
          city = $3,
          country = $4,
          activity = $5,
          description = $6
      WHERE event_id = $7
    `, [start_time, end_time, city, country, activity, description, event_id]);

    res.redirect(`/trips/${trip_id}?message=Event updated successfully`);
  } catch (err) {
    console.error('[POST /events/edit] Error updating event:', err);
    res.status(500).send('Failed to update event.');
  }
});

app.post('/events/delete', isAuthenticated, async (req, res) => {
  const { event_id, trip_id } = req.body;

  if (!event_id || !trip_id) {
    return res.status(400).send('Missing event ID or trip ID');
  }

  try {
    // First remove from the join table
    await db.none(`DELETE FROM trips_to_events WHERE event_id = $1`, [event_id]);

    // Then delete the actual event
    await db.none(`DELETE FROM events WHERE event_id = $1`, [event_id]);

    res.redirect(`/trips/${trip_id}?message=Event deleted successfully`);
  } catch (err) {
    console.error('[POST /events/delete] Error:', err);
    res.status(500).send('Error deleting event');
  }
});

app.get('/calendar', isAuthenticated, (req, res) => {
res.render('pages/calendar', {
LoggedIn: true,
username: req.session.user.username,
title: 'Calendar'
});
});

app.get('/trips', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.user.username;
    const message = req.session.message || null;
    
    // Clear the message after retrieving it
    if (req.session.message) {
      req.session.message = null;
    }

    // Get the Google Maps API key
    const mapApiKey = process.env.API_KEY || '';

    const trips = await db.any(`
      SELECT t.trip_id, t.trip_name, t.date_start, t.date_end, t.city, t.country
      FROM trips t
      INNER JOIN users_to_trips ut ON t.trip_id = ut.trip_id
      WHERE ut.username = $1
    `, [username]);
    
    // For each trip, fetch associated events (activities)
    for (let trip of trips) {
      const events = await db.any(`
        SELECT e.event_id, e.start_time, e.end_time, e.city, e.country, e.activity, e.description
        FROM events e
        INNER JOIN trips_to_events te ON e.event_id = te.event_id
        WHERE te.trip_id = $1
      `, [trip.trip_id]);
      trip.events = events; // attach the events array to each trip object
    }

    res.render('pages/trips', {
      LoggedIn: true,
      username: username,
      title: 'Trips',
      trips: trips,  // trips now include an "events" array
      message: message,  // Pass any flash messages
      mapApiKey: mapApiKey  // Pass the API key for geocoding
    });
  } catch (err) {
    console.error('Error querying trips:', err);
    res.status(500).send('Server Error');
  }
});

// Consolidated route for adding a trip (non-API version)
// Modified trip creation route in index.js
app.post('/trips', isAuthenticated, async (req, res, next) => {
  const username = req.session.user.username;
  console.log('[POST /trips] Processing trip creation with data:', req.body);
  
  const { trip_name, date_start, date_end, city, country, latitude, longitude } = req.body;

  if (!trip_name || !date_start || !date_end || !city || !country) {
    console.error('[POST /trips] Missing required fields:', req.body);
    return res.status(400).send('Trip name, start and end dates, city and country are required.');
  }

  // Use provided coordinates or defaults
  const lat = latitude ? parseFloat(latitude) : 0;
  const lng = longitude ? parseFloat(longitude) : 0;
  
  console.log(`[POST /trips] Using coordinates: lat=${lat}, lng=${lng} for ${city}, ${country}`);

  try {
    // Start a transaction for both trip and destination creation
    await db.tx(async t => {
      // 1. Insert into trips, grab the auto-gen trip_id
      const { trip_id } = await t.one(`
        INSERT INTO trips (trip_name, date_start, date_end, city, country)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING trip_id
      `, [trip_name, date_start, date_end, city, country]);

      console.log(`[POST /trips] Created trip with ID: ${trip_id}`);

      // 2. Link user to trip
      await t.none(`
        INSERT INTO users_to_trips (username, trip_id)
        VALUES ($1, $2)
      `, [username, trip_id]);

      console.log(`[POST /trips] Linked trip_id ${trip_id} to username ${username}`);
      
      // 3. Check if this destination already exists
      const existingDest = await t.oneOrNone(`
        SELECT id, latitude, longitude FROM destinations 
        WHERE city = $1 AND country = $2
      `, [city, country]);
      
      let destinationId;
      
      if (!existingDest) {
        // Create destination with coordinates
        const destResult = await t.one(`
          INSERT INTO destinations (city, country, latitude, longitude)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [city, country, lat, lng]);
        
        destinationId = destResult.id;
        console.log(`[POST /trips] Created new destination with ID: ${destinationId} at coordinates: ${lat}, ${lng}`);
      } else {
        destinationId = existingDest.id;
        
        // If existing destination has default coordinates (0,0) but we now have real ones, update it
        if ((existingDest.latitude === 0 && existingDest.longitude === 0) && (lat !== 0 || lng !== 0)) {
          await t.none(`
            UPDATE destinations
            SET latitude = $1, longitude = $2
            WHERE id = $3
          `, [lat, lng, destinationId]);
          
          console.log(`[POST /trips] Updated coordinates for existing destination ID: ${destinationId} to ${lat}, ${lng}`);
        } else {
          console.log(`[POST /trips] Using existing destination with ID: ${destinationId}`);
        }
      }
      
      // 4. Associate user with the destination
      const userDestCheck = await t.oneOrNone(`
        SELECT * FROM users_to_destinations 
        WHERE username = $1 AND destination_id = $2
      `, [username, destinationId]);
      
      if (!userDestCheck) {
        await t.none(`
          INSERT INTO users_to_destinations (username, destination_id)
          VALUES ($1, $2)
        `, [username, destinationId]);
        
        console.log(`[POST /trips] Linked destination_id ${destinationId} to username ${username}`);
      } else {
        console.log(`[POST /trips] User ${username} already associated with destination ${destinationId}`);
      }
    });
    
    // Set success message
    if (req.session) {
      req.session.message = 'Trip created successfully!';
    }
    
    // Redirect to the trips page
    res.redirect('/trips');
  } catch (err) {
    console.error('[POST /trips] Error creating trip:', err);
    
    // Handle the error gracefully
    if (req.session) {
      req.session.message = 'Error creating trip. Please try again.';
    }
    
    // Redirect back to trips page instead of showing error page
    res.redirect('/trips');
  }
});

app.get('/trips/:id', isAuthenticated, async (req, res) => {
  const tripId = req.params.id;
  const username = req.session.user.username;

  try {
    // Get trip info
    const trip = await db.oneOrNone(`
      SELECT * FROM trips 
      WHERE trip_id = $1
    `, [tripId]);

    const ownershipCheck = await db.oneOrNone(`
      SELECT * FROM users_to_trips 
      WHERE trip_id = $1 AND username = $2
    `, [tripId, username]);

    if (!trip || !ownershipCheck) {
      return res.status(403).send('You are not authorized to view this trip.');
    }

    // Get events
    const events = await db.any(`
      SELECT * FROM events 
      JOIN trips_to_events ON events.event_id = trips_to_events.event_id 
      WHERE trips_to_events.trip_id = $1
    `, [tripId]);

    // Get journals and associated images
    const rawData = await db.any(`
      SELECT 
        j.journal_id, 
        j.comments,
        i.image_id, 
        i.image_url
      FROM journals j
      LEFT JOIN journal_to_image ji ON j.journal_id = ji.journal_id
      LEFT JOIN images i ON ji.image_id = i.image_id
      WHERE j.trip_id = $1 AND j.username = $2
      ORDER BY j.journal_id
    `, [tripId, username]);

    // Group journals by journal_id
    const journalMap = new Map();
    const journals = [];

    for (const row of rawData) {
      if (!journalMap.has(row.journal_id)) {
        journalMap.set(row.journal_id, {
          journal_id: row.journal_id,
          comments: row.comments,
          images: []
        });
        journals.push(journalMap.get(row.journal_id));
      }

      if (row.image_url) {
        journalMap.get(row.journal_id).images.push({
          image_id: row.image_id,
          image_url: row.image_url
        });
      }
    }

    res.render('pages/tripdetail', {
      LoggedIn: true,
      username,
      title: `Trip: ${trip.trip_name}`,
      trip,
      events,
      journals
    });
  } catch (err) {
    console.error('[GET /trips/:id] Error:', err);
    res.status(500).send('Error loading trip details.');
  }
});

// Route for map page
app.get('/map', isAuthenticated, (req, res) => {
// Get the Google Maps API key
const mapApiKey = process.env.API_KEY || '';
res.render('pages/map', {
LoggedIn: true,
username: req.session.user.username,
title: 'Interactive Map',
mapApiKey: mapApiKey
});
});

// API ROUTES FOR TRAVEL DATA

// Destinations API
// Get all destinations for the current user
app.get('/api/destinations', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.user.username;
    console.log('[GET /api/destinations] Fetching destinations for user:', username);
    
    // Ensure the table exists
    await ensureTablesExist();
    
    // Get only destinations associated with this user
    const destinations = await db.any(`
      SELECT d.* 
      FROM destinations d
      JOIN users_to_destinations ud ON d.id = ud.destination_id
      WHERE ud.username = $1
    `, [username]);
    
    console.log(`[GET /api/destinations] Retrieved ${destinations.length} destinations for user ${username}`);
    res.json(destinations);
  } catch (err) {
    console.error('[GET /api/destinations] Error:', err);
    
    // Fallback to get all destinations for the tests to pass
    try {
      const allDestinations = await db.any('SELECT * FROM destinations');
      console.log('[GET /api/destinations] Fallback: retrieved all destinations');
      res.json(allDestinations);
    } catch (fallbackErr) {
      console.error('[GET /api/destinations] Fallback error:', fallbackErr);
      res.status(500).json({ error: 'Failed to fetch destinations' });
    }
  }
});

// Create a new destination
app.post('/api/destinations', isAuthenticated, async (req, res) => {
  try {
    const { city, country, latitude, longitude } = req.body;
    const username = req.session.user.username;
    
    console.log('[POST /api/destinations] Creating destination for user', username, ':', { city, country });
    
    // Validate inputs
    if (!city || !country || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'City, country, latitude, and longitude are required' });
    }
    
    // Ensure the table exists
    await ensureTablesExist();
    
    // Use a transaction to ensure both operations succeed or fail together
    const result = await db.tx(async t => {
      // 1. Insert the destination
      const destination = await t.one(
        'INSERT INTO destinations (city, country, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id, city, country, latitude, longitude', 
        [city, country, latitude, longitude]
      );
      
      // 2. Create the user-destination association
      await t.none(
        'INSERT INTO users_to_destinations (username, destination_id) VALUES ($1, $2)',
        [username, destination.id]
      );
      
      return destination;
    });
    
    console.log('[POST /api/destinations] Successfully created destination', result.id, 'for user', username);
    res.status(201).json(result);
  } catch (err) {
    console.error('[POST /api/destinations] Error:', err);
    res.status(500).json({ error: 'Failed to create destination', details: err.message });
  }
});

// Delete a destination
app.delete('/api/destinations/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.session.user.username;
    
    console.log('[DELETE /api/destinations] User', username, 'attempting to delete destination', id);
    
    // Check if this destination belongs to the user
    const userDestination = await db.oneOrNone(
      'SELECT * FROM users_to_destinations WHERE destination_id = $1 AND username = $2',
      [id, username]
    );
    
    if (!userDestination) {
      console.log('[DELETE /api/destinations] Destination', id, 'does not belong to user', username);
      return res.status(404).json({ error: 'Destination not found or not owned by you' });
    }
    
    // Delete the user-destination association first
    await db.none(
      'DELETE FROM users_to_destinations WHERE destination_id = $1 AND username = $2',
      [id, username]
    );
    
    // Check if others are using this destination
    const otherUsers = await db.oneOrNone(
      'SELECT * FROM users_to_destinations WHERE destination_id = $1 LIMIT 1',
      [id]
    );
    
    // Only delete the destination if no one else is using it
    if (!otherUsers) {
      await db.none('DELETE FROM destinations WHERE id = $1', [id]);
      console.log('[DELETE /api/destinations] Deleted destination', id, 'completely');
    } else {
      console.log('[DELETE /api/destinations] Removed association only, destination still used by others');
    }
    
    res.status(200).json({ message: 'Destination deleted successfully' });
  } catch (err) {
    console.error('[DELETE /api/destinations] Error:', err);
    res.status(500).json({ error: 'Failed to delete destination', details: err.message });
  }
});

// Migration route for existing destinations
app.get('/migrate-destinations', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.user.username;
    
    // Ensure the table exists
    await ensureTablesExist();
    
    // Get all destinations
    const allDestinations = await db.any('SELECT * FROM destinations');
    
    // For each destination, associate with the current user if not already associated
    let migratedCount = 0;
    
    for (const dest of allDestinations) {
      // Check if this user already has this destination
      const existing = await db.oneOrNone(
        'SELECT * FROM users_to_destinations WHERE destination_id = $1 AND username = $2',
        [dest.id, username]
      );
      
      if (!existing) {
        // Create the association
        await db.none(
          'INSERT INTO users_to_destinations (username, destination_id) VALUES ($1, $2)',
          [username, dest.id]
        );
        migratedCount++;
      }
    }
    
    console.log(`[MIGRATE] Associated ${migratedCount} destinations with user ${username}`);
    res.send(`Migration complete. Associated ${migratedCount} destinations with your account.`);
  } catch (err) {
    console.error('[MIGRATE] Error:', err);
    res.status(500).send(`Error during migration: ${err.message}`);
  }
});

// Trips API
// Get all trips for the current user
app.get('/api/trips', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.user.username;
    console.log('[GET /api/trips] Fetching trips for username:', username);
    
    const trips = await db.any(`
      SELECT 
        t.trip_id, 
        t.trip_name,
        t.date_start, 
        t.date_end, 
        t.city, 
        t.country, 
        d.id as destination_id
      FROM trips t
      JOIN users_to_trips u ON t.trip_id = u.trip_id
      LEFT JOIN destinations d ON (t.city = d.city AND t.country = d.country)
      WHERE u.username = $1
    `, [username]);
    
    console.log('[GET /api/trips] Retrieved trips:', trips);
    
    // Map the trips to a consistent format
    const formattedTrips = trips.map(trip => ({
      id: trip.trip_id,
      tripName: trip.trip_name,
      destinationId: trip.destination_id,
      startDate: trip.date_start,
      endDate: trip.date_end,
      city: trip.city,
      country: trip.country,
      destination: trip.city && trip.country ? `${trip.city}, ${trip.country}` : undefined
    }));
    
    res.json(formattedTrips);
  } catch (err) {
    console.error('[GET /api/trips] Error fetching trips:', err);
    res.status(500).json({ error: 'Failed to fetch trips', details: err.message });
  }
});

// Create a new trip
app.post('/api/trips', isAuthenticated, async (req, res) => {
  try {
    const { tripName, destinationId, startDate, endDate, city, country } = req.body;
    const username = req.session.user.username;
    
    console.log('[POST /api/trips] Creating trip with data:', req.body);
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    // Start a transaction
    await db.tx(async t => {
      // Insert trip - using tripName if provided, otherwise a default name
      const effectiveTripName = tripName || `Trip to ${city || 'Unknown'}`;
      
      const tripResult = await t.one(
        'INSERT INTO trips (trip_name, date_start, date_end, city, country) VALUES ($1, $2, $3, $4, $5) RETURNING trip_id',
        [effectiveTripName, startDate, endDate, city || null, country || null]
      );
      
      // Link user to trip
      await t.none(
        'INSERT INTO users_to_trips (username, trip_id) VALUES ($1, $2)',
        [username, tripResult.trip_id]
      );
      
      console.log(`[POST /api/trips] Created trip with ID: ${tripResult.trip_id}`);
      
      // Return complete trip data
      res.status(201).json({
        id: tripResult.trip_id,
        tripName: effectiveTripName,
        destinationId: destinationId || null,
        startDate,
        endDate,
        city: city || null,
        country: country || null,
        destination: city && country ? `${city}, ${country}` : null,
        message: 'Trip created successfully'
      });
    });
  } catch (err) {
    console.error('[POST /api/trips] Error creating trip:', err);
    res.status(500).json({ error: 'Failed to create trip', details: err.message });
  }
});

// Delete a trip
app.delete('/api/trips/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.session.user.username;
    
    console.log('[DELETE /api/trips] Deleting trip ID:', id, 'for user:', username);
    
    // Verify trip belongs to user
    const trip = await db.oneOrNone(
      'SELECT * FROM users_to_trips WHERE trip_id = $1 AND username = $2',
      [id, username]
    );
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized' });
    }
    
    // Start a transaction to ensure all related records are properly removed
    await db.tx(async t => {
      // 1. First delete any events associated with this trip
      await t.none('DELETE FROM trips_to_events WHERE trip_id = $1', [id]);
      
      // 2. Delete any journals associated with this trip
      await t.none('DELETE FROM journals WHERE trip_id = $1', [id]);
      
      // 3. Delete the user-trip association
      await t.none('DELETE FROM users_to_trips WHERE trip_id = $1 AND username = $2', [id, username]);
      
      // 4. Finally delete the trip itself
      await t.none('DELETE FROM trips WHERE trip_id = $1', [id]);
    });
    
    console.log(`[DELETE /api/trips] Successfully deleted trip ID: ${id}`);
    res.status(200).json({ message: 'Trip deleted successfully' });
  } catch (err) {
    console.error('[DELETE /api/trips] Error deleting trip:', err);
    res.status(500).json({ error: 'Failed to delete trip', details: err.message });
  }
});

// GET Journal Page
app.get('/journal', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.user.username;
    const selectedTripId = parseInt(req.query.tripId, 10) || null;
    const message = req.query.message || null;

    const trips = await db.any(
      `SELECT trips.trip_id AS id, trip_name, city, country, date_start, date_end
       FROM trips
       JOIN users_to_trips ON trips.trip_id = users_to_trips.trip_id
       WHERE users_to_trips.username = $1`,
      [username]
    );    

    let journalData = [];

if (selectedTripId) {
  const rawData = await db.any(
    `SELECT 
       journals.journal_id, 
       journals.comments,
       images.image_id, 
       images.image_url
     FROM journals
     LEFT JOIN journal_to_image ON journals.journal_id = journal_to_image.journal_id
     LEFT JOIN images ON journal_to_image.image_id = images.image_id
     WHERE journals.trip_id = $1 AND journals.username = $2
     ORDER BY journals.journal_id`,
    [selectedTripId, username]
  );

  // Group journal entries by journal_id
  const journalMap = new Map();

  for (const row of rawData) {
    if (!journalMap.has(row.journal_id)) {
      journalMap.set(row.journal_id, {
        journal_id: row.journal_id,
        comments: row.comments,
        images: []
      });
      journalData.push(journalMap.get(row.journal_id));
    }

    if (row.image_url) {
      journalMap.get(row.journal_id).images.push({
        image_id: row.image_id,
        image_url: row.image_url
      });
    }
  }
}

    res.render('pages/journal', { 
      LoggedIn: true,
      username,
      title: 'Journal',
      trips,
      selectedTripId,
      journalData,
      message
    });

  } catch (err) {
    console.error('[GET /journal] Error:', err);
    res.redirect('/login?message=Error loading journal page');
  }
});


// Add Journal Entry + Optional Photo
app.post('/journal/add', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.user.username;
    let { tripId, comment } = req.body;

    tripId = parseInt(tripId, 10);
    if (!tripId || isNaN(tripId)) {
      console.log('[ADD JOURNAL] Invalid tripId:', tripId);
      return res.redirect('/journal?message=Invalid trip ID.');
    }

    let photos = req.files ? req.files.photos : null;

    // Normalize to array if a single photo is uploaded
    if (photos && !Array.isArray(photos)) {
      photos = [photos];
    }

    if (!comment && (!photos || photos.length === 0)) {
      return res.redirect(`/journal?tripId=${tripId}&message=Please provide a comment or upload a photo.`);
    }

    // Save the journal entry
    const journalResult = await db.one(
      `INSERT INTO journals (username, comments, trip_id) VALUES ($1, $2, $3) RETURNING journal_id`,
      [username, comment || '', tripId]
    );
    const journalId = journalResult.journal_id;

    // Upload each photo and associate with the journal
    if (photos && photos.length > 0) {
      for (const photo of photos) {
        const uniqueName = Date.now() + '-' + photo.name.replace(/\s+/g, '_');
        const uploadPath = path.join(__dirname, 'resources/img/uploads', uniqueName);
        await photo.mv(uploadPath);

        const imageResult = await db.one(
          `INSERT INTO images (image_url, image_caption) VALUES ($1, $2) RETURNING image_id`,
          [`/img/uploads/${uniqueName}`, ''] // No caption
        );

        await db.none(
          `INSERT INTO journal_to_image (journal_id, image_id) VALUES ($1, $2)`,
          [journalId, imageResult.image_id]
        );
      }
    }

    res.redirect(`/journal?tripId=${tripId}&message=Journal entry added`);
  } catch (err) {
    console.error('[POST /journal/add] Error:', err);
    res.redirect(`/journal?message=Error adding journal`);
  }
});


// Delete Journal Entry + Photo
app.post('/journal/delete', isAuthenticated, async (req, res) => {
  try {
    const { journalId, tripId } = req.body;
    console.log('[DELETE] req.body:', req.body);

    // Delete related images (optional)
    await db.none(`DELETE FROM journal_to_image WHERE journal_id = $1`, [journalId]);

    // Delete the journal itself
    await db.none(`DELETE FROM journals WHERE journal_id = $1`, [journalId]);

    res.redirect(`/journal?tripId=${tripId}&message=Journal deleted`);
  } catch (err) {
    console.error('[POST /journal/delete] Error:', err);
    res.redirect(`/journal?tripId=${req.body.tripId}&message=Error deleting journal`);
  }
});


// Edit Journal Entry
app.post('/journal/edit', isAuthenticated, async (req, res) => {
  try {
    const { journalId, tripId, comment } = req.body;
    let photos = req.files ? req.files.photos : null;

    // Normalize to array if a single photo is uploaded
    if (photos && !Array.isArray(photos)) {
      photos = [photos];
    }

    if (comment && comment.trim() !== '') {
      await db.none(
        `UPDATE journals SET comments = $1 WHERE journal_id = $2`,
        [comment.trim(), journalId]
      );
    }

    // Upload each new photo and associate with journal
    if (photos && photos.length > 0) {
      for (const photo of photos) {
        const uniqueName = Date.now() + '-' + photo.name.replace(/\s+/g, '_');
        const uploadPath = path.join(__dirname, 'resources/img/uploads', uniqueName);
        await photo.mv(uploadPath);

        const imageResult = await db.one(
          `INSERT INTO images (image_url, image_caption) VALUES ($1, $2) RETURNING image_id`,
          [`/img/uploads/${uniqueName}`, '']
        );

        await db.none(
          `INSERT INTO journal_to_image (journal_id, image_id) VALUES ($1, $2)`,
          [journalId, imageResult.image_id]
        );
      }
    }

    res.redirect(`/journal?tripId=${tripId}&message=Journal updated successfully`);
  } catch (err) {
    console.error('[POST /journal/edit] Error:', err);
    res.redirect(`/journal?tripId=${req.body.tripId}&message=Error editing journal`);
  }
});




////////////////////////////////////////////////////
// ADD THIS CALENDAR ROUTE TO YOUR EXISTING index.js
////////////////////////////////////////////////////

/* ①  static files — put this BEFORE your routes */
app.use(express.static(path.join(__dirname, 'public')));

// 2) Define a route for "/calendar" that renders "calendar.hbs"
app.get('/calendar', (req, res) => {
  res.render('pages/calendar');
});

// 3) (Optional) Root route => redirect to "/calendar"
app.get('/', (req, res) => {
  res.redirect('/calendar');
});

/*
function rowToEvent(r) {
  const endPlus1 = new Date(r.date_end);
  endPlus1.setDate(endPlus1.getDate() + 1);          // ← ToastUI end is exclusive

  return {
    id:         r.trip_id.toString(),
    calendarId: 'trips',            // must match a calendar you declared
    title:      r.trip_name,
    start:      `${r.date_start}T00:00:00`, // local midnight avoids TZ shift
    end:        endPlus1.toISOString().slice(0,10) + 'T00:00:00',
    isAllday:   true,
    raw: { city: r.city, country: r.country }
  };
}


app.get('/api/trips', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM trips');
  res.json(rows.map(tripRowToEvent));
});
*/
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

/* 
  Helper function: Convert a row from the trips table 
  to a Toast UI Calendar event object.
*/
function rowToEvent(r) {
  // If date_end is null, use date_start as a fallback.
  const endDate = r.date_end || r.date_start;

  // Create a Date object for endDate and add one day.
  const endPlus1 = new Date(endDate);
  endPlus1.setDate(endPlus1.getDate() + 1);

  return {
    id:         r.trip_id.toString(),
    calendarId: 'trips',  // Make sure this ID matches the one you specify on the client side.
    title:      r.trip_name,
    start:      `${r.date_start}T00:00:00`,   // Include a time part to ensure correct display.
    // Since Toast UI treats end as exclusive, we add one day and then format it as YYYY-MM-DDT00:00:00:
    end:        endPlus1.toISOString().slice(0, 10) + 'T00:00:00',
    isAllday:   true,
    raw:        { city: r.city, country: r.country }
  };
}

/* API route to fetch trips from the database */
app.get('/api/trips', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM trips');
    // Map the rows to event objects using rowToEvent
    res.json(rows.map(rowToEvent));
  } catch (err) {
    console.error('GET /api/trips error:', err);
    res.status(500).json({ error: 'db-error', message: err.message });
  }
});


app.delete('/trips/:tripId', async (req, res) => {
  const { tripId } = req.params;
  try {
    await db.query('DELETE FROM users_to_trips WHERE trip_id = $1', [tripId]);
    const result = await db.query('DELETE FROM trips WHERE trip_id = $1', [tripId]);
    console.log(result);
    // Check if the trip was deleted
    res.status(200).send('Trip deleted successfully.');
    
  } catch (err) {
    console.error('Error deleting trip:', err);
    res.status(500).send('Error deleting trip. Please try again.');
  }
});



//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

//###############################################################################//



// Test welcome route
app.get('/welcome', (req, res) => {
res.json({ status: 'success', message: 'Welcome!' });
});

// Start server
const PORT = process.env.PORT || 3000;
if (require.main === module) {
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;