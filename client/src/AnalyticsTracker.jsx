import React from 'react';
import { useLocation } from 'react-router-dom';

// Your Google Analytics Measurement ID
const GA_MEASUREMENT_ID = 'G-DBQ6C8X7VX';

/**
 * Sends a pageview event to Google Analytics.
 * @param {string} path - The path of the page to track (e.g., /about)
 */
const sendAnalyticsPageview = (path) => {
  // Check if the gtag function is available
  if (typeof window.gtag === 'function') {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: path,
    });
  }
};

/**
 * A component that tracks pageviews on route changes.
 * This component does not render any visible UI.
 */
const AnalyticsTracker = () => {
  const location = useLocation();

  React.useEffect(() => {
    // Send a pageview event every time the location changes
    sendAnalyticsPageview(location.pathname + location.search);
  }, [location]); // This effect runs on initial load and whenever 'location' changes

  return null; // This component doesn't render anything
};

export default AnalyticsTracker;