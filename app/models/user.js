var mongoose = require('mongoose');
var bcrypt = require('bcrypt');

var userSchema = mongoose.Schema({
    name    : String,
    type    : String,
    title   : String,
    year    : String,
    picture : String,
    email   : String,
    password: String,
    caseSets: [String],
    color: {
        r: Number,
        g: Number,
        b: Number
    },
    verified: Boolean,
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

userSchema.methods.validPassword = function(pass) {
    return bcrypt.compareSync(pass, this.password);
};

module.exports = mongoose.model('User', userSchema);
