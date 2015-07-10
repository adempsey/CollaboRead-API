var mongoose = require('mongoose');
var Case = require('./case.js');

var caseSetSchema = mongoose.Schema({
    owners  : [String],
    name    : String,
    cases   : [String]
}, {collection: 'lectures'});

module.exports = mongoose.model('caseSet', caseSetSchema);
