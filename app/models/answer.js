var mongoose = require('mongoose');

var Answer = mongoose.Schema({
    owners          : [String],
    groupName       : String,
    drawings        : [{
        scanID  : String,
        sliceID : String,
        data    : [{
            x       : Number,
            y       : Number,
            isEnd   : Number
        }]
    }],
    submissionDate  : Date,
    caseID: String,
    lectureID: String
});

module.exports = mongoose.model('answer', Answer);
