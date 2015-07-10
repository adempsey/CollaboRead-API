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

module.exports = mongoose.model('scan', Scan);
