var mongoose = require('mongoose');

var Slice = mongoose.Schema({
    url: String,
    hasDrawing: Boolean
});

var Scan = mongoose.Schema({
    name    : String,
    hasDrawing  : Boolean,
    slices: [Slice]
});

var Case = mongoose.Schema({
    date    : Date,
    name    : String,
    scans: [Scan],
    // answers: [Answer],
    patientInfo: String,
    owners  : [String]
}, {collection: 'cases'});

module.exports = mongoose.model('case', Case);
