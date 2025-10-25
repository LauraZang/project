// Updated calendar.js with overlay elements to hide icons
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("Initializing calendar...");
   
    // Define an array of colors for different trips
    const tripColors = [
      '#03bd9e', // teal
      '#ff5583', // pink
      '#3498db', // blue
      '#f39c12', // orange
      '#9b59b6', // purple
      '#2ecc71', // green
      '#e74c3c', // red
      '#34495e', // dark blue
      '#1abc9c', // light teal
      '#d35400'  // dark orange
    ];
   
    // Get username from the page
    let username = "Loading username...";
    const calendarData = document.getElementById('calendar-data');
    if (calendarData && calendarData.dataset.username) {
      username = calendarData.dataset.username;
      console.log("Got username from page:", username);
    }
   
    // Configure calendar
    const calendar = new tui.Calendar('#calendar', {
      defaultView: 'month',
      useDetailPopup: true,
      isReadOnly: true, // Make calendar read-only to prevent cell selection
      template: {
        popupDetailSchedule: function(schedule) {
          const formatDate = (d) =>
            d
              ? d.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })
              : 'Unknown';
      
          const start = schedule.start?.toDate?.();
          const end = schedule.end?.toDate?.();
      
          const dateRange =
            start && end
              ? formatDate(start) === formatDate(end)
                ? formatDate(start)
                : `${formatDate(start)} – ${formatDate(end)}`
              : 'Trip date';
      
          const location =
            schedule.location ||
            schedule.raw?.destination ||
            (schedule.raw?.city && schedule.raw?.country
              ? `${schedule.raw.city}, ${schedule.raw.country}`
              : 'No location');
      
          const attendees = schedule.attendees?.join(', ') || 'N/A';
          const description = schedule.raw?.description || '';
      
          return `
            <strong>${schedule.title}</strong><br>
            📅 ${dateRange}<br>
            📍 ${location}<br>
            👥 ${attendees}<br>
            📝 ${description}
          `;
        },
        // Override button texts
        popupEdit: function() {
          return ''; // Empty string to make the button text blank
        },
        popupDelete: function() {
          return 'Continue'; // Change "Delete" to "Continue"
        }
      }
    });
   
    // Disable default click behavior that selects/highlights cells
    calendar.off('clickDayName');
    calendar.off('clickMoreEventsBtn');
    calendar.off('clickTimezonesCollapseBtn');
   
    // Set up calendar navigation
    document.getElementById('prev').addEventListener('click', () => {
      calendar.prev();
      updateRange();
    });
   
    document.getElementById('next').addEventListener('click', () => {
      calendar.next();
      updateRange();
    });
   
    document.getElementById('today').addEventListener('click', () => {
      calendar.today();
      updateRange();
    });
   
    function updateRange() {
      const range = document.getElementById('range');
      if (range) {
        const date = calendar.getDate();
        range.textContent = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      }
    }
   
    // Initial range update
    updateRange();
   
    // Fetch trips from API
    try {
      console.log("Fetching trips data...");
      const response = await fetch('/api/trips');
      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}`);
      }
      const tripsData = await response.json();
      console.log("Received trips data:", tripsData);
     
      if (tripsData.length === 0) {
        console.log("No trips found");
        document.getElementById('clicked-event').textContent = "No trips found";
        return;
      }
     
      // Create a new calendar category for each trip with a different color
      const calendarCategories = [];
     
      // Use a Set to track unique trip IDs
      const uniqueTripIds = new Set();
      tripsData.forEach(trip => {
        const tripId = trip.id || trip.trip_id;
        uniqueTripIds.add(tripId);
      });
     
      // Create a category for each unique trip
      let index = 0;
      uniqueTripIds.forEach(tripId => {
        calendarCategories.push({
          id: `trip-${tripId}`,
          name: `Trip ${index + 1}`,
          backgroundColor: tripColors[index % tripColors.length]
        });
        index++;
      });
     
      // Make sure we have at least one category
      if (calendarCategories.length === 0) {
        calendarCategories.push({
          id: 'default-trip',
          name: 'Trips',
          backgroundColor: tripColors[0]
        });
      }
     
      console.log("Calendar categories:", calendarCategories);
     
      // Set the categories on the calendar
      calendar.setCalendars(calendarCategories);
     
      // Process trips into calendar events
      const calendarEvents = tripsData.map((trip, index) => {
        const tripId = trip.id || trip.trip_id || `trip-${index}`;
        const tripName = trip.trip_name || trip.tripName || trip.title || 'Unnamed Trip';
      
        const startDateStr = trip.date_start || trip.startDate || trip.start;
        const endDateStr = trip.date_end || trip.endDate || trip.end || startDateStr;
      
        // Convert to ISO strings
        const startISO = startDateStr
          ? new Date(startDateStr).toISOString()
          : new Date().toISOString();
      
        const endISO = endDateStr
          ? new Date(new Date(endDateStr).getTime()).toISOString()
          : new Date(new Date(startDateStr || new Date()).getTime()).toISOString();
      
        return {
          id: `trip-${tripId}-event`,
          calendarId: `trip-${tripId}`,
          title: tripName,
          isAllday: true,
          category: 'allday',
          start: startISO,
          end: endISO,
          location: (trip.city && trip.country)
            ? `${trip.city}, ${trip.country}`
            : (trip.destination || ''),
          state: 'Trip',
          attendees: [username],
          raw: {
            type: 'trip',
            username: username,
            city: trip.city || '',
            country: trip.country || '',
            destination: trip.destination || '',
            date_start: startDateStr,
            date_end: endDateStr
          }
        };
      });
      
      // Add events to calendar
      console.log("Final calendarEvents being created:", calendarEvents);
      calendar.createEvents(calendarEvents);
      console.log(`Added ${calendarEvents.length} events to calendar`);
    } catch (error) {
      console.error("Error fetching or processing trips:", error);
      document.getElementById('clicked-event').textContent = `Error: ${error.message}`;
    }
  } catch (error) {
    console.error("Calendar initialization error:", error);
    document.getElementById('calendar').innerHTML =
      `<div class="alert alert-danger">Calendar Error: ${error.message}</div>`;
  }
});

// Add global CSS to hide edit button and prepare for overlay approach
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide the edit button */
    .tui-full-calendar-popup-edit {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
      visibility: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }
    
    /* Hide the separator line */
    .tui-full-calendar-popup-detail .tui-full-calendar-popup-section + .tui-full-calendar-popup-section:before {
      display: none !important;
    }
    
    /* Center the buttons container */
    .tui-full-calendar-popup-buttons {
      display: flex !important;
      justify-content: center !important;
      width: 100% !important;
      position: relative !important;
    }
    
    /* Style the continue button */
    .tui-full-calendar-popup-delete {
      background-color: #63c8b0 !important;
      color: white !important;
      border-radius: 4px !important;
      border: none !important;
      padding: 8px 20px !important;
      font-weight: 500 !important;
      min-width: 120px !important;
      margin: 0 auto !important;
      position: relative !important;
      z-index: 1 !important;
      text-align: center !important;
    }
    
    .tui-full-calendar-popup-delete:hover {
      background-color: #47b39c !important;
    }
    
    /* Style for the icon overlay */
    .icon-overlay {
      position: absolute !important;
      background-color: white !important;
      z-index: 2 !important;
      width: 24px !important;
      height: 24px !important;
      display: block !important;
    }
  `;
  document.head.appendChild(style);
  
  // Function to overlay white boxes on top of icons
  function addOverlaysToIcons() {
    // Find all popup containers
    const popups = document.querySelectorAll('.tui-full-calendar-popup-container');
    
    popups.forEach(popup => {
      // Check if we've already modified this popup
      if (popup.dataset.overlaysAdded) return;
      
      // Mark as modified
      popup.dataset.overlaysAdded = "true";
      
      // Hide edit button
      const editBtn = popup.querySelector('.tui-full-calendar-popup-edit');
      if (editBtn) {
        editBtn.style.display = 'none';
        editBtn.style.width = '0';
        editBtn.style.height = '0';
        editBtn.style.padding = '0';
        editBtn.style.margin = '0';
        editBtn.style.overflow = 'hidden';
        editBtn.style.visibility = 'hidden';
      }
      
      // Find continue button and its icon
      const continueBtn = popup.querySelector('.tui-full-calendar-popup-delete');
      if (continueBtn) {
        // First, ensure the button has position relative for proper overlay positioning
        continueBtn.style.position = 'relative';
        
        // Find the icon within the button
        const icon = continueBtn.querySelector('i');
        if (icon) {
          // Get the icon's position and size
          const iconRect = icon.getBoundingClientRect();
          const btnRect = continueBtn.getBoundingClientRect();
          
          // Create an overlay to cover the icon
          const overlay = document.createElement('div');
          overlay.className = 'icon-overlay';
          overlay.style.backgroundColor = '#63c8b0'; // Match button background
          overlay.style.position = 'absolute';
          overlay.style.left = `${icon.offsetLeft}px`;
          overlay.style.top = `${icon.offsetTop}px`;
          overlay.style.width = `${iconRect.width + 10}px`; // Add some padding
          overlay.style.height = `${iconRect.height + 5}px`; // Add some padding
          overlay.style.zIndex = '10';
          
          // Try to make the overlay as large as possible to cover the icon
          overlay.style.left = '0';
          overlay.style.top = '0';
          overlay.style.right = '0';
          overlay.style.bottom = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          
          // Another approach: modify the button's inner HTML directly
          continueBtn.innerHTML = '<span style="position: relative; z-index: 20;">Continue</span>';
          
          // Append the overlay to the button
          continueBtn.appendChild(overlay);
        }
        
        // Apply styling to the continue button to make it look better
        continueBtn.style.backgroundColor = '#63c8b0';
        continueBtn.style.color = 'white';
        continueBtn.style.borderRadius = '4px';
        continueBtn.style.border = 'none';
        continueBtn.style.padding = '8px 20px';
        continueBtn.style.fontWeight = '500';
        continueBtn.style.minWidth = '120px';
        continueBtn.style.margin = '0 auto';
        continueBtn.style.display = 'block';
        continueBtn.style.textAlign = 'center';
        
        // Center the text in the button
        continueBtn.style.display = 'flex';
        continueBtn.style.alignItems = 'center';
        continueBtn.style.justifyContent = 'center';
        
        // Make sure the button is centered in its container
        const buttonsContainer = popup.querySelector('.tui-full-calendar-popup-buttons');
        if (buttonsContainer) {
          buttonsContainer.style.display = 'flex';
          buttonsContainer.style.justifyContent = 'center';
          buttonsContainer.style.alignItems = 'center';
          buttonsContainer.style.width = '100%';
        }
        
        // Override click behavior
        continueBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          // Close all popups
          document.querySelectorAll('.tui-full-calendar-popup-container').forEach(p => {
            p.style.display = 'none';
          });
          
          return false;
        }, true);
      }
    });
  }
  
  // Create a more aggressive function to completely replace the button
  function replaceButtons() {
    const popups = document.querySelectorAll('.tui-full-calendar-popup-container');
    
    popups.forEach(popup => {
      // Check if we've already replaced this popup's buttons
      if (popup.dataset.buttonsReplaced) return;
      
      // Mark as replaced
      popup.dataset.buttonsReplaced = "true";
      
      // Find the buttons container
      const buttonsContainer = popup.querySelector('.tui-full-calendar-popup-buttons');
      if (!buttonsContainer) return;
      
      // Create a completely new button
      const newContinueBtn = document.createElement('button');
      newContinueBtn.textContent = 'Continue';
      newContinueBtn.className = 'custom-continue-btn';
      newContinueBtn.style.cssText = `
        background-color: #63c8b0;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 20px;
        font-weight: 500;
        min-width: 120px;
        margin: 0 auto;
        display: block;
        text-align: center;
        cursor: pointer;
      `;
      
      // Add click handler
      newContinueBtn.addEventListener('click', function() {
        // Close all popups
        document.querySelectorAll('.tui-full-calendar-popup-container').forEach(p => {
          p.style.display = 'none';
        });
      });
      
      // Clear the buttons container and add our new button
      buttonsContainer.innerHTML = '';
      buttonsContainer.appendChild(newContinueBtn);
      
      // Style the buttons container
      buttonsContainer.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        padding: 10px 0;
      `;
    });
  }
  
  // Use a MutationObserver to detect when popups are added to the DOM
  const observer = new MutationObserver((mutations) => {
    let shouldProcessPopups = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        // Check for newly added popup elements
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList && node.classList.contains('tui-full-calendar-popup-container')) {
              shouldProcessPopups = true;
              break;
            }
            
            const popups = node.querySelectorAll('.tui-full-calendar-popup-container');
            if (popups.length > 0) {
              shouldProcessPopups = true;
              break;
            }
          }
        }
      }
      
      if (shouldProcessPopups) break;
    }
    
    if (shouldProcessPopups) {
      // Wait a moment for the DOM to stabilize
      setTimeout(() => {
        addOverlaysToIcons();
        replaceButtons();
      }, 10);
    }
  });
  
  // Start observing the entire document
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Process any existing popups
  setTimeout(() => {
    addOverlaysToIcons();
    replaceButtons();
  }, 100);
  
  // Also set up a periodic check just to be sure
  setInterval(() => {
    addOverlaysToIcons();
    replaceButtons();
  }, 200);
});