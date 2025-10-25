-- Drop tables in correct dependency order
DROP TABLE IF EXISTS journal_to_image CASCADE;
DROP TABLE IF EXISTS images CASCADE;
DROP TABLE IF EXISTS events_to_journals CASCADE;
DROP TABLE IF EXISTS journals CASCADE;
DROP TABLE IF EXISTS trips_to_events CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users_to_trips CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS destinations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  username VARCHAR(50) PRIMARY KEY,
  password VARCHAR(100) NOT NULL
);

-- Create destinations table
CREATE TABLE IF NOT EXISTS destinations (
  id SERIAL PRIMARY KEY,
  city VARCHAR(50) NOT NULL,
  country VARCHAR(50) NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC
);

-- Create trips table
CREATE TABLE IF NOT EXISTS trips (
  trip_id SERIAL PRIMARY KEY,
  trip_name VARCHAR(100),
  date_start DATE,
  date_end DATE,
  city VARCHAR(50),
  country VARCHAR(50)
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  event_id SERIAL PRIMARY KEY,
  start_time TIME,
  end_time TIME,
  activity VARCHAR(100),
  hotel_booking VARCHAR(100),
  plane_tickets VARCHAR(100),
  city VARCHAR(100),
  country VARCHAR(100),
  description VARCHAR(500)
);

-- Create users to trips relationship table
CREATE TABLE IF NOT EXISTS users_to_trips (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) REFERENCES users(username),
  trip_id INTEGER REFERENCES trips(trip_id)
);

-- Create trips to events relationship table
CREATE TABLE IF NOT EXISTS trips_to_events (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(trip_id),
  event_id INTEGER REFERENCES events(event_id)
);

-- Create journals table
CREATE TABLE IF NOT EXISTS journals (
  journal_id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(trip_id),
  username VARCHAR(50) REFERENCES users(username),
  comments VARCHAR(5000)
);

-- Create events to journals relationship table
CREATE TABLE IF NOT EXISTS events_to_journals (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(event_id),
  journal_id INTEGER REFERENCES journals(journal_id)
);

-- Create images table
CREATE TABLE IF NOT EXISTS images (
  image_id SERIAL PRIMARY KEY,
  image_url VARCHAR(255),
  image_caption VARCHAR(200)
);

-- Create journal to image relationship table
CREATE TABLE IF NOT EXISTS journal_to_image (
  id SERIAL PRIMARY KEY,
  journal_id INTEGER REFERENCES journals(journal_id),
  image_id INTEGER REFERENCES images(image_id)
);
