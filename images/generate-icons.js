// Script to generate marker icons
const fs = require('fs');
const { createCanvas } = require('canvas');

// Create the canvas
const size = 24;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// Function to create a marker icon
function createMarkerIcon(color, outlineColor, filename) {
  // Clear canvas
  ctx.clearRect(0, 0, size, size);
  
  // Draw circle
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, 2 * Math.PI, false);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  
  // Convert to PNG buffer
  const buffer = canvas.toBuffer('image/png');
  
  // Write to file
  fs.writeFileSync(filename, buffer);
  console.log(`Created ${filename}`);
}

// Create icons for different device types
createMarkerIcon('#FF9900', '#FFFFFF', 'images/safecast-marker.png');    // Default: Orange
createMarkerIcon('#3366CC', '#FFFFFF', 'images/pointcast-marker.png');   // Pointcast: Blue
createMarkerIcon('#33CC33', '#FFFFFF', 'images/bgeigie-marker.png');     // bGeigie: Green
createMarkerIcon('#CC33CC', '#FFFFFF', 'images/geigiecast-marker.png');  // GeigieCast: Purple

console.log('All icons generated successfully!');
