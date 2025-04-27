#!/bin/bash

# Update package lists
sudo apt-get update

# Install Node.js and npm if not already installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js and npm..."
    sudo apt-get install -y nodejs npm
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Start the server
echo "Starting the server..."
npm start
