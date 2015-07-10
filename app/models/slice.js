var mongoose = require('mongoose');

var Slice = mongoose.Schema({
    url: String,
    hasDrawing: Boolean
});

module.exports = mongoose.model('slice', Slice);
