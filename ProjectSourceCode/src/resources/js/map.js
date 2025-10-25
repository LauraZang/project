// Global variables
let map;
let markers = [];
const destinations = [];
const trips = [];

function formatDateOnly(dateString) {
  if (!dateString) return '';
  
  // For ISO strings or date objects containing time information
  const date = new Date(dateString);
  
  // Extract just the YYYY-MM-DD part
  return date.toISOString().split('T')[0];
}
// Initialize the map
function initMap() {
  console.log("Initializing map...");
  
  try {
    // Create a new map centered at a default location (world view)
    map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: 20, lng: 0 },
      zoom: 2,
      mapTypeId: "terrain",
      mapTypeControl: true,
      fullscreenControl: true,
    });
    
    console.log("Map initialized successfully");

    // Set up form submission handlers
    const destinationForm = document.getElementById("addDestinationForm");
    const tripForm = document.getElementById("addTripForm");
    
    if (destinationForm) {
      destinationForm.addEventListener("submit", addDestination);
    }
    
    if (tripForm) {
      tripForm.addEventListener("submit", addTrip);
    }

    // Initialize datepickers
    initializeDatepickers();
    
    // Load data from server
    loadData();
    
  } catch (error) {
    console.error("Error initializing map:", error);
    document.getElementById('map').innerHTML = '<div class="alert alert-danger p-5 text-center"><h4>Map Initialization Error</h4><p>There was an error initializing the map: ' + error.message + '</p></div>';
  }
}

// Initialize datepickers
function initializeDatepickers() {
  const datepickers = document.querySelectorAll('.datepicker');
  datepickers.forEach(picker => {
    flatpickr(picker, {
      dateFormat: "Y-m-d",
      allowInput: true
    });
  });
}

// Add a new destination from the form
// Find the addDestination function in map.js and update it

// Add a new destination from the form
function addDestination(event) {
  event.preventDefault();
  
  const cityName = document.getElementById("cityName").value;
  const countryName = document.getElementById("countryName").value;
  
  if (!cityName || !countryName) {
    alert("Please enter both city and country");
    return;
  }
  
  console.log(`Geocoding ${cityName}, ${countryName}...`);
  
  // Use the Places API to geocode the location
  // Use the Places API to geocode the location with language preference set to English
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ 
    address: `${cityName}, ${countryName}`,
    language: 'en',  // Request English results
    region: 'US'     // Use US as region preference for more consistent English names
  }, (results, status) => {
    if (status === "OK" && results[0]) {
      const location = results[0].geometry.location;
      console.log(`Location found: ${location.lat()}, ${location.lng()}`);
      
      // Get the formatted address (usually in English when language is set to 'en')
      const formattedAddress = results[0].formatted_address;
      console.log(`Formatted address: ${formattedAddress}`);
      
      // Get the corrected address components from the geocoding result
      const addressComponents = results[0].address_components;
      let correctedCity = cityName; // Default to original if not found
      let correctedCountry = countryName; // Default to original if not found
      
      // Extract the correctly spelled city and country from the geocoding result
      for (const component of addressComponents) {
        // Try to get the English name when available
        const englishName = component.long_name || component.short_name;
        
        if (component.types.includes('locality')) {
          correctedCity = englishName;
        } else if (component.types.includes('administrative_area_level_1')) {
          // In some cases, the state/province might be more appropriate than locality
          if (!correctedCity || correctedCity === cityName) {
            correctedCity = englishName;
          }
        } else if (component.types.includes('country')) {
          correctedCountry = englishName;
        }
      }
      function looksLikeEnglish(text) {
        // Basic check if text contains only Latin characters, numbers, and common punctuation
        return /^[A-Za-z0-9\s.,'-]+$/.test(text);
      }
      
      if (!looksLikeEnglish(correctedCity)) {
        correctedCity = cityName;
      }
      
      if (!looksLikeEnglish(correctedCountry)) {
        correctedCountry = countryName;
      }
      
      console.log(`Corrected address: ${correctedCity}, ${correctedCountry}`);
      
      // Create a new destination object with the corrected names
      const destinationData = {
        city: correctedCity,
        country: correctedCountry,
        latitude: location.lat(),
        longitude: location.lng()
      };
      
      // Save destination to the database
      fetch('/api/destinations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(destinationData)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(savedDestination => {
        console.log("Destination saved to database:", savedDestination);
        
        // Format destination for client-side use
        const destination = {
          id: savedDestination.id,
          city: correctedCity,
          country: correctedCountry,
          lat: location.lat(),
          lng: location.lng()
        };
        
        // Add to our array
        destinations.push(destination);
        
        // Add marker to the map
        addMarkerToMap(destination);
        
        // Add to the sidebar list
        addDestinationToList(destination);
        
        // Update destination dropdown in trip form
        updateDestinationDropdown();
        
        // Clear the form
        document.getElementById("cityName").value = "";
        document.getElementById("countryName").value = "";
      })
      .catch(error => {
        console.error('Error saving destination:', error);
        alert('Error saving destination: ' + error.message);
      });
    } else {
      console.error(`Geocoding failed with status: ${status}`);
      alert("Could not find that location. Please try again.");
    }
  });
}

// Add a new trip from the form
function addTrip(event) {
  event.preventDefault();
  
  const tripName = document.getElementById("tripName").value;
  const destinationId = document.getElementById("tripDestination").value;
  let startDate = document.getElementById("tripStartDate").value;
  let endDate = document.getElementById("tripEndDate").value;
  
  if (!destinationId || !startDate || !endDate) {
    alert("Please fill in all required fields");
    return;
  }
  
  // Find the destination
  const destination = destinations.find(d => d.id == destinationId);
  
  if (!destination) {
    alert("Please select a valid destination");
    return;
  }
  
  // Compare dates and swap if start date is later than end date
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  
  if (startDateObj > endDateObj) {
    // Swap dates
    const tempDate = startDate;
    startDate = endDate;
    endDate = tempDate;
    
    // Optionally show a notification to the user that dates were reordered
    console.log("Dates were reordered to ensure start date is before end date");
  }
  
  // Create trip data object
  const tripData = {
    tripName: tripName || `Trip to ${destination.city}`,
    destinationId: parseInt(destinationId),
    startDate: startDate,
    endDate: endDate,
    city: destination.city,
    country: destination.country
  };
  
  console.log("Submitting trip data:", tripData);
  
  // Save trip to database
  fetch('/api/trips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tripData)
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(err => { throw err; });
    }
    return response.json();
  })
  .then(savedTrip => {
    console.log("Trip saved successfully:", savedTrip);
    
    // Create trip object for client-side use
    const trip = {
      id: savedTrip.id,
      destinationId: parseInt(destinationId),
      destination: `${destination.city}, ${destination.country}`,
      startDate: startDate,
      endDate: endDate,
      tripName: savedTrip.tripName || tripName || `Trip to ${destination.city}`
    };
    
    // Add to our array
    trips.push(trip);
    
    // Add to the sidebar list
    addTripToList(trip);
    
    // Update marker info windows
    updateAllMarkerInfoWindows();
    
    // Clear the form
    document.getElementById("tripName").value = "";
    document.getElementById("tripDestination").selectedIndex = 0;
    document.getElementById("tripStartDate").value = "";
    document.getElementById("tripEndDate").value = "";
    
    // Show success message
    alert("Trip created successfully!");
  })
  .catch(error => {
    console.error('Error saving trip:', error);
    alert("Error saving trip: " + (error.error || "Unknown error"));
  });
}

// Add a marker to the map
function addMarkerToMap(destination) {
  const marker = new google.maps.Marker({
    position: { lat: destination.lat, lng: destination.lng },
    map: map,
    title: `${destination.city}, ${destination.country}`,
    animation: google.maps.Animation.DROP
  });
  
  // Store the destination ID with the marker for reference
  marker.destinationId = destination.id;
  
  // Create an info window with enhanced content
  const infoWindow = new google.maps.InfoWindow({
    content: getInfoWindowContent(destination)
  });
  
  // Store the info window with the marker
  marker.infoWindow = infoWindow;
  
  // Add click listener to open info window
  marker.addListener("click", () => {
    // Close any other open info windows
    markers.forEach(m => {
      if (m.infoWindow && m !== marker) {
        m.infoWindow.close();
      }
    });
    
    // Update content before opening
    infoWindow.setContent(getInfoWindowContent(destination));
    
    // Open this info window
    infoWindow.open(map, marker);
  });
  
  // Add the marker to our array
  markers.push(marker);
  
  // Fit the map to show all markers
  if (markers.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    markers.forEach((marker) => bounds.extend(marker.getPosition()));
    map.fitBounds(bounds);
    
    // If there's only one marker, zoom in a bit more
    if (markers.length === 1) {
      map.setZoom(6);
    }
  }
}

// Helper function to generate info window content
function getInfoWindowContent(destination) {
  console.log("Generating content for:", destination);
  
  // Find related trips
  const destinationTrips = trips.filter(trip => {
    return Number(trip.destinationId) === Number(destination.id);
  });
  
  console.log("Related trips found:", destinationTrips);
  
  // Prepare trips HTML - add a default message even if no trips exist
  let content = `
    <div style="max-width: 300px; padding: 10px; color: black;">
      <h5 style="color: black;">${destination.city}, ${destination.country}</h5>
      <hr class="my-2">
      <div>
        <h6 style="color: black;">Trips:</h6>
  `;
  
  if (destinationTrips.length === 0) {
    content += '<p style="color: black;">No trips planned for this destination yet. Add a trip from the Trips tab.</p>';
  } else {
    content += '<ul class="mb-0" style="color: black;">';
    destinationTrips.forEach(trip => {
      // Format dates to exclude time
      const displayStartDate = formatDateOnly(trip.startDate);
      const displayEndDate = formatDateOnly(trip.endDate);
      
      content += `
        <li style="color: black;">
          <strong>${trip.tripName || 'Unnamed Trip'}</strong>: ${displayStartDate} to ${displayEndDate}
        </li>`;
    });
    content += '</ul>';
  }
  
  content += '</div></div>';
  
  return content;
}


// Update all marker info windows
function updateAllMarkerInfoWindows() {
  markers.forEach(marker => {
    const destination = destinations.find(d => Number(d.id) === Number(marker.destinationId));
    if (destination) {
      // Update the content of the info window
      marker.infoWindow.setContent(getInfoWindowContent(destination));
    }
  });
}

// Add a destination to the sidebar list
function addDestinationToList(destination) {
  const destinationsList = document.getElementById("destinationsList");
  
  const item = document.createElement("a");
  item.href = "#";
  item.className = "list-group-item list-group-item-action destination-item";
  item.setAttribute("data-id", destination.id);
  item.innerHTML = `
    <div class="d-flex w-100 justify-content-between">
      <h5 class="mb-1">${destination.city}</h5>
      <button class="btn btn-sm btn-danger remove-btn">✕</button>
    </div>
    <p class="mb-1">${destination.country}</p>
  `;
  
  // Add click handler to focus on this marker
  item.addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove-btn")) {
      // Find the marker for this destination
      const marker = markers.find(m => Number(m.destinationId) === Number(destination.id));
      
      if (marker) {
        // Center and zoom the map
        map.setCenter(marker.getPosition());
        map.setZoom(10);
        
        // Open the info window
        marker.infoWindow.open(map, marker);
      }
    }
  });
  
  // Add remove button click handler
  item.querySelector(".remove-btn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    removeDestination(destination.id);
  });
  
  destinationsList.appendChild(item);
}

// Add a trip to the sidebar list
function addTripToList(trip) {
  const tripsList = document.getElementById("tripsList");
  
  // Format dates to exclude time
  const displayStartDate = formatDateOnly(trip.startDate);
  const displayEndDate = formatDateOnly(trip.endDate);
  
  const item = document.createElement("a");
  item.href = "#";
  item.className = "list-group-item list-group-item-action";
  item.setAttribute("data-id", trip.id);
  item.innerHTML = `
    <div class="d-flex w-100 justify-content-between">
      <h5 class="mb-1">${trip.tripName || trip.destination}</h5>
      <button class="btn btn-sm btn-danger remove-btn">✕</button>
    </div>
    <p class="mb-1">${trip.destination}</p>
    <p class="mb-1">${displayStartDate} to ${displayEndDate}</p>
  `;
  
  // Add click handler to focus on this destination
  item.addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove-btn")) {
      // Find the destination
      const destination = destinations.find(d => Number(d.id) === Number(trip.destinationId));
      
      if (destination) {
        // Find the marker
        const marker = markers.find(m => Number(m.destinationId) === Number(destination.id));
        
        if (marker) {
          // Center and zoom the map
          map.setCenter(marker.getPosition());
          map.setZoom(10);
          
          // Open the info window
          marker.infoWindow.open(map, marker);
        }
      }
    }
  });
  
  // Add remove button click handler
  item.querySelector(".remove-btn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    removeTrip(trip.id);
  });
  
  tripsList.appendChild(item);
}

// Update destination dropdown in trip form
function updateDestinationDropdown() {
  const dropdown = document.getElementById("tripDestination");
  if (!dropdown) return;
  
  // Clear existing options (except the first one)
  while (dropdown.options.length > 1) {
    dropdown.remove(1);
  }
  
  // Add destinations to dropdown
  destinations.forEach(destination => {
    const option = document.createElement("option");
    option.value = destination.id;
    option.text = `${destination.city}, ${destination.country}`;
    dropdown.add(option);
  });
}

// Remove a destination by ID
function removeDestination(id) {
  // First, try to remove from server
  fetch(`/api/destinations/${id}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to delete destination from server');
    }
    
    // Find the index of this destination
    const index = destinations.findIndex(d => Number(d.id) === Number(id));
    
    if (index !== -1) {
      // Remove the marker from the map
      const markerIndex = markers.findIndex(m => Number(m.destinationId) === Number(id));
      if (markerIndex !== -1) {
        markers[markerIndex].setMap(null);
        markers.splice(markerIndex, 1);
      }
      
      // Remove related trips
      const relatedTrips = trips.filter(trip => Number(trip.destinationId) === Number(id)).map(trip => trip.id);
      relatedTrips.forEach(tripId => removeTrip(tripId));
      
      // Remove from destinations array
      destinations.splice(index, 1);
      
      // Remove from the list
      const listItem = document.querySelector(`#destinationsList a[data-id="${id}"]`);
      if (listItem) {
        listItem.remove();
      }
      
      // Update destination dropdown
      updateDestinationDropdown();
    }
  })
  .catch(error => {
    console.error('Error deleting destination:', error);
    alert('Error deleting destination: ' + error.message);
  });
}

// Remove a trip by ID
function removeTrip(id) {
  // First, try to remove from server
  fetch(`/api/trips/${id}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to delete trip from server');
    }
    
    // Find the index of this trip
    const index = trips.findIndex(t => Number(t.id) === Number(id));
    
    if (index !== -1) {
      // Get the destination ID associated with this trip before removing it
      const destinationId = trips[index].destinationId;
      
      // Remove from trips array
      trips.splice(index, 1);
      
      // Remove from the list
      const listItem = document.querySelector(`#tripsList a[data-id="${id}"]`);
      if (listItem) {
        listItem.remove();
      }
      
      // Check if there are any other trips associated with this destination
      const otherTripsWithDestination = trips.filter(t => Number(t.destinationId) === Number(destinationId));
      
      if (otherTripsWithDestination.length === 0) {
        // No other trips use this destination, we can update the marker's info window
        // to show "No trips planned for this destination"
        const marker = markers.find(m => Number(m.destinationId) === Number(destinationId));
        if (marker) {
          // Find the destination for this marker
          const destination = destinations.find(d => Number(d.id) === Number(destinationId));
          if (destination) {
            // Update the info window content
            marker.infoWindow.setContent(getInfoWindowContent(destination));
          }
        }
      } else {
        // There are still other trips using this destination, just update the info window
        updateAllMarkerInfoWindows();
      }
    }
  })
  .catch(error => {
    console.error('Error deleting trip:', error);
    alert('Error deleting trip: ' + error.message);
  });
}

// Load data from server
function loadData() {
  console.log("Loading data from server...");
  
  // Clear existing data first
  destinations.length = 0;
  trips.length = 0;
  
  // Clear existing markers
  markers.forEach(marker => marker.setMap(null));
  markers.length = 0;
  
  // Clear UI lists
  const destinationsList = document.getElementById("destinationsList");
  const tripsList = document.getElementById("tripsList");
  
  if (destinationsList) {
    destinationsList.innerHTML = '';
  }
  
  if (tripsList) {
    tripsList.innerHTML = '';
  }
  
  // First load destinations, then load trips (ensure proper order)
  fetch('/api/destinations')
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch destinations: ${res.status}`);
      }
      return res.json();
    })
    .then(serverDestinations => {
      console.log("Server destinations:", serverDestinations);
      
      // Process destinations
      if (serverDestinations && serverDestinations.length > 0) {
        serverDestinations.forEach(destination => {
          // Format destination for client-side use
          const dest = {
            id: destination.id,
            city: destination.city,
            country: destination.country,
            lat: parseFloat(destination.latitude),
            lng: parseFloat(destination.longitude)
          };
          
          destinations.push(dest);
          addMarkerToMap(dest);
          addDestinationToList(dest);
        });
      }
      
      // Update dropdowns
      updateDestinationDropdown();
      
      // Load trips after destinations are loaded
      return fetch('/api/trips');
    })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch trips: ${res.status}`);
      }
      return res.json();
    })
    .then(serverTrips => {
      console.log("Server trips:", serverTrips);
      
      // Process trips
      if (serverTrips && serverTrips.length > 0) {
        serverTrips.forEach(trip => {
          // Format dates to exclude time
          const startDate = formatDateOnly(trip.startDate || trip.date_start);
          const endDate = formatDateOnly(trip.endDate || trip.date_end);
          
          const formattedTrip = {
            id: trip.id || trip.trip_id,
            destinationId: trip.destinationId,
            destination: trip.destination || `${trip.city}, ${trip.country}`,
            startDate: startDate,
            endDate: endDate,
            tripName: trip.tripName || trip.trip_name || `Trip to ${trip.city || 'Unknown'}`
          };
          
          trips.push(formattedTrip);
          addTripToList(formattedTrip);
        });
      }
      
      // Update info windows
      updateAllMarkerInfoWindows();
      
      console.log("Data loaded from server successfully");
    })
    .catch(error => {
      console.error("Error loading data from server:", error);
      alert("Error loading data from server: " + error.message);
    });
}

// Add event listener for when DOM is loaded
window.addEventListener('DOMContentLoaded', (event) => {
  console.log('DOM fully loaded, ready for map initialization');
});