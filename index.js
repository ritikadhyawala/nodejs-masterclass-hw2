/*
 * Primary file for API
 *
 */

// Dependencies
var server = require('./server');


// Declare the app
var app = {};

// Init function
app.init = function () {
    // Start the server
    server.init();
};

// Self executing
app.init();


// Export the app
module.exports = app;
