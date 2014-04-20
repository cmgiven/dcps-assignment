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

// MongoDB
var mongoURL = process.env.MONGOHQ_URL || 'mongodb://localhost/dcps-assignment';

mongoose.connect(mongoURL, function (err, res) {
    if (!err) {
        console.log('Database connection established.');
    } else {
        console.log('ERROR: Problem connecting to database at ' + mongoURL + '. ' + err);
    }
});

// Sessions
var SessionSchema = new mongoose.Schema({
    address: String,
    latitude: Number,
    longitude: Number,
    ward: String,
    cluster: String,
    oldBoundary: String,
    newBoundary: String,
    responses: [{ key: String, value: Number, comment: String }],
    name: String,
    gaVisitorID: String
});

var Session = mongoose.model('Session', SessionSchema);

// Routes
app.post('/api/dcgis', function (req, res) {
    var url = 'http://dcatlas.dcgis.dc.gov/wsProxy/proxy_LocVerifier.asmx/findLocation_all',
        str = req.body.address;
    request.post(url, {form: {str: str}}).pipe(res);
});

app.post('/api/sessions', function (req, res) {
    var session = new Session({
        address: req.body.address,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        ward: req.body.ward,
        cluster: req.body.cluster,
        oldBoundary: req.body.oldBoundary,
        newBoundary: req.body.newBoundary,
        responses: req.body.responses,
        name: req.body.name,
        gaVisitorID: req.body.gaVisitorID
    });

    return session.save(function (err) {
        if (err) { console.log(err); }
        return res.send(session);
    });
});

app.put('/api/sessions/:id', function (req, res) {
    return Session.findById(req.params.id, function (err, session) {
        if (err) { console.log(err); }

        session.address = req.body.address;
        session.latitude = req.body.latitude;
        session.longitude = req.body.longitude;
        session.ward = req.body.ward;
        session.cluster = req.body.cluster;
        session.oldBoundary = req.body.oldBoundary;
        session.newBoundary = req.body.newBoundary;
        session.responses = req.body.responses;
        session.name = req.body.name;
        session.gaVisitorID = req.body.gaVisitorID;
        
        return session.save(function (err) {
            if (err) { console.log(err); }
            return res.send(session);
        });
    });
});

// Start server
var port = process.env.PORT || 5555;
app.listen( port, function() {
    console.log( 'Express server listening on port %d in %s mode', port, app.settings.env );
});