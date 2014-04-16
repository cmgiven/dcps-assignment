// Module dependencies.
var application_root = __dirname,
    express = require('express'),
    fs = require('fs'),
    request = require('request'),
    mongoose = require( 'mongoose' ),
    env = require('node-env-file');

// Load environment file if present
if (fs.existsSync('.env')) { env('.env'); }

// Create server
var app = express();

// Configure server
app.configure(function () {
    //parses request body and populates request.body
    app.use(express.json());
    app.use(express.urlencoded());

    //checks request.body for HTTP method overrides
    app.use(express.methodOverride());

    //perform route lookup based on url and HTTP method
    app.use(app.router);

    //Where to serve static content
    app.use(express.static(application_root + '/public'));

    //Show all errors in development
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

// Routes
app.post('/api/dcgis', function (req, res) {
    var url = 'http://dcatlas.dcgis.dc.gov/wsProxy/proxy_LocVerifier.asmx/findLocation_all',
        str = req.body.address;
    request.post(url, {form: {str: str}}).pipe(res);
});

// Start server
var port = process.env.PORT || 5555;
app.listen( port, function() {
    console.log( 'Express server listening on port %d in %s mode', port, app.settings.env );
});