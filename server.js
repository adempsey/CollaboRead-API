var http = require('http');
var express = require('express');
var exphbs = require('express-handlebars');

var app = express();

var WebSocketServer = require('ws').Server;
var bodyParser = require('body-parser');
var mongo = require('mongodb');
var mongoose = require('mongoose');

var port = process.env.PORT || 5000;

var configDB = require('./config/database.js');
mongoose.connect(configDB.url);

app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

app.use('/', express.static(__dirname + '/public/'));

var httpServer = http.createServer(app).listen(port, function() {
        console.log("express server on port " + port);
});

var wss = new WebSocketServer({server: httpServer});

require('./app/routes.js')(app, wss);
