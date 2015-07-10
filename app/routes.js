var async = require('async');

var bodyParser = require('body-parser');
var bodyParserURLEncoded = bodyParser.urlencoded({extended: true});

var fs = require('fs');

var validator = require('validator');
var bcrypt = require('bcrypt');
var crypto = require('crypto');

var colorGen = require('color-assignment-generator');

fs.readFile(__dirname + "/colorFile/color.txt", function(err, data) {
    colorGen.setSavedValues(JSON.parse(data));
});

var nodemailer = require('nodemailer');
var markdown = require('nodemailer-markdown').markdown;

var User = require('../app/models/user');
var Lectures = require('../app/models/caseSets');
var Cases = require('../app/models/case');
var Scan = require('../app/models/scan');
var Slice = require('../app/models/slice');
var Answer = require('../app/models/answer');

var prefix = "/api/v1/"

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var expressSession = require('express-session');

passport.use(new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
    },
    function(email, password, done) {
        User.findOne({'email': email}, function(err, user) {
            if (err) {
                return done(err);
            }

            if (!user) {
                return done(null, false, {message: 'Incorrect username.'});
            }

            if (!user.validPassword(password)) {
                return done(null, false, {message: 'Incorrect password.'});
            }

            if (!user.verified) {
                return done(null, false, {message: 'Account unverified'});
            }

            return done(null, user);
        });
    }
));

// temporary gmail account
var mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.CR_EMAIL_ADDRESS,
        pass: process.env.CR_EMAIL_PASSWORD
    }
});

mailTransporter.use('compile', markdown());

function reportError(status, error, response) {
    console.log(error)
    response.status(status).end()
    response.send()
}

var wsClientMap = {};

//nothing is validated right now. that should be fixed

module.exports = function(http, ws) {

    http.use(expressSession({secret: 'secretkey'}));
    http.use(passport.initialize());
    http.use(passport.session());

// http routes

    http.post(prefix+'login', bodyParserURLEncoded, passport.authenticate('local', {session: false}), function(req, res) {
        User.findOne({'email': req.body.email}, function(err, user) {
            res.send(user);
        });
    });

    // Need to add validations and check for duplicate registrations
    // Should replace registered users that aren't validated
    http.post(prefix+'register', bodyParserURLEncoded, function(req, res) {

        async.waterfall([

            function(done) {
                crypto.randomBytes(20, function(err, buf) {
                    var token = buf.toString('hex');
                    done(err, token);
                });
            },

            function(token, done) {

                User.findOne({'email': req.body.email}, function(err, existingUser) {

                    // User is already registered
                    if (existingUser && existingUser.verified) {
                        res.status(404).end();
                    } else {

                        // User has tried to register before but never verified account
                        if (existingUser) {
                            existingUser.name = req.body.name;
                            existingUser.type = req.body.type;
                            existingUser.title = req.body.title;
                            existingUser.year = req.body.year;
                            existingUser.picture = req.body.picture;
                            existingUser.email = req.body.email;
                            existingUser.password = bcrypt.hashSync(req.body.password,10);
                            existingUser.caseSets = [];
                            existingUser.verified = false;
                            existingUser.resetPasswordToken= token;
                            existingUser.resetPasswordExpires = Date.now() + 3600000;

                            existingUser.save(function(err) {
                                if (err) {
                                    res.status(404).end();
                                } else {
                                    done(err, token, existingUser);
                                }
                            })

                        // New user
                        } else {
                            var user = new User({
                                "name": req.body.name,
                                "type": req.body.type,
                                "title": req.body.title,
                                "year": req.body.year,
                                "picture": req.body.picture,
                                "email": req.body.email,
                                "password": bcrypt.hashSync(req.body.password,10),
                                "caseSets": [],
                                "color": colorGen.getColor(),
                                "verified": false,
                                "resetPasswordToken": token,
                                "resetPasswordExpires": Date.now() + 3600000 //1 hour
                            });

                            user.save(function(err) {
                                if (err) {
                                    res.status(404).end();
                                } else {

                                    fs.writeFile(__dirname + "/colorFile/color.txt", JSON.stringify(colorGen.getSavedValues()), function(err) {
                                        if (err) {
                                            return console.log(err);
                                        }
                                    });

                                    done(err, token, user);
                                }
                            });
                        }
                    }
                });

            },

            function(token, user, done) {
                var validationLink = "http://collaboread.herokuapp.com/api/v1/validate/"+token;
                var emailBody = "#Thanks for registering with CollaboRead\n---\n\n";
                emailBody += "Please visit the following link to begin using your account:\n\n";
                emailBody += "<a href="+validationLink+">"+validationLink+"</a>\n\nThanks,\n\nCollaboRead";

                var mail = {
                    from: 'CollaboRead <admin@collaboread.org>',
                    to: user.email,
                    subject: 'Verify Your Account',
                    markdown: emailBody
                }

                mailTransporter.sendMail(mail, function(err, info) {
                    if (err) {
                        console.log(err);
                        res.status(404).end();
                    } else {
                        console.log('Message sent: ' + info.response);
                        res.status(200).end();
                    }
                });
            }
        ]);
    });

    http.post(prefix+'forgot', bodyParserURLEncoded, function(req, res) {

        async.waterfall([

            function(done) {
                crypto.randomBytes(20, function(err, buf) {
                    var token = buf.toString('hex');
                    done(err, token);
                });
            },

            function(token, done) {
                var email = req.body.email;

                User.findOne({email: email}, function(err, user) {
                    if (user && !err) {
                        done(err, token, user);
                    } else {
                        res.status(404).end();
                    }
                });
            },

            function(token, user, done) {
                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

                user.save(function(err) {
                    var validationLink = "http://collaboread.herokuapp.com/api/v1/reset/"+token;
                    var emailBody = "#Password Reset\n---\n\n";
                    emailBody += "You are receiving this email because a password reset request was issued for the ";
                    emailBody += "account associated with this email address. If you did not issue this request, you ";
                    emailBody += "do not have to do anything. If you wish to reset your password, please visit the following link:\n\n";
                    emailBody += "<a href="+validationLink+">"+validationLink+"</a>\n\nThanks,\n\nCollaboRead";

                    var mail = {
                        from: 'CollaboRead <admin@collaboread.org>',
                        to: user.email,
                        subject: 'Password Reset',
                        markdown: emailBody
                    }

                    mailTransporter.sendMail(mail, function(err, info) {
                        if (err) {
                            console.log(err);
                            res.status(404).end();
                        } else {
                            console.log('Message sent: ' + info.response);
                            res.status(200).end();
                        }
                    });
                });
            }
        ]);
    });

    http.get(prefix+'reset/:token', function(req, res) {
        User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}}, function(err, user) {
            // Expired or invalid token
            if (!user) {
                res.status(404).end();
            } else {
                // placeholder UI
                var body = "<html><head><title>Reset CollaboRead Password</title></head>";
                body += "<body><p><strong>Reset password</strong><p>";
                body += "<form id='resetPass' action='"+prefix+"reset' method='POST'>";
                body += "<input type='password' placeholder='Password' name='password'/>";
                body += "<input type='password' placeholder='Confirm Password' name='confirmpassword'/>";
                body += "<input type='hidden' name='token' value='"+req.params.token+"'/>";
                body += "<input type='Submit'/></form></body></html>";
                res.send(body);
            }
        });
    });

    http.post(prefix+'reset', bodyParserURLEncoded, function(req, res) {
        User.findOne({ resetPasswordToken: req.body.token, resetPasswordExpires: {$gt: Date.now()}}, function(err, user) {
            user.password = bcrypt.hashSync(req.body.password,10);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            user.save(function(err) {
                if (err) {
                    res.status(404).end();
                } else {
                    res.send("Success");
                }
            });
        });
    });

    http.get(prefix+'validate/:token', function(req, res) {
        User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}}, function(err, user) {
            // Expired or invalid token
            if (!user) {
                res.status(404).end();
            } else {
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;
                user.verified = true;

                user.save(function(err) {
                    res.status(200).end();
                });
            }
        });
    });

    http.get(prefix+'users', /*passport.authenticate('local', {session: false}),*/ function(req, res) {
            // var userQuery = validator.escape(req.query.id);
            var userQuery = req.query.id;

            if (!userQuery) {
                User.find({}, function(err, userResults) {
                    res.send(userResults);
                });

            } else {
                User.findOne({"_id":userQuery}, function(err, userID) {
                    if (err) {
                        reportError(404, err, res);
                    } else {
                        res.send(userID);
                    }
                });
            }
    });

    http.get(prefix+'lecturers', passport.authenticate('local', {session: false}), function(req, res) {
        // var lecturerQuery = validator.escape(req.query.id);
        var lecturerQuery = req.query.id;

        if (!lecturerQuery) {
            User.find({"type":"lecturer"}, function(err, lecturerResults) {
                res.send(lecturerResults);
            });

        } else {
            User.findOne({"type":"lecturer", "_id":lecturerQuery}, function(err, userID) {
                if (err) {
                    reportError(404, error, res);
                } else {
                    res.send(userID);
                }
            });
        }
    });

    http.post(prefix+'usercheck', bodyParserURLEncoded, passport.authenticate('local', {session: false}), function(req, res) {
        var users = req.body.users ? JSON.parse(req.body.users) : null;
        if (users) {
            User.find({"email": {$in: users}}, {"email": 1, "name": 1, "_id": 1}, function(err, userList) {
                if (!err) {
                    res.send(userList);
                } else {
                    res.status(404).end();
                }
            });
        } else {
            res.status(404).end();
        }
    });

    // http.get(prefix+'casesets',/* passport.authenticate('local', {session: false}), */function(req, res) {
    //     // var setID = validator.escape(req.query.id);
    //     // var lecturerID = validator.escape(req.query.lecturerID);
    //     var setID = req.query.id;
    //     var lecturerID = req.query.lecturerID;
    //
    //     if (setID) {
    //         CaseSets.findOne({"setID": setID}, function(err, caseSet) {
    //             if (err) {
    //                 reportError(404, err, res);
    //             } else {
    //                 res.send(caseSet);
    //             }
    //         });
    //     } else if (lecturerID) {
    //         CaseSets.find({"owners": lecturerID}, function(err, caseSets) {
    //             if (err) {
    //                 reportError(404, err, res);
    //             } else {
    //                 res.send(caseSets);
    //             }
    //         });
    //     } else {
    //         reportError(404, "No query specified", res);
    //     }
    // });

    http.get(prefix+'lectures', function(req, res) {
        Lectures.find({}, function(err, lectures) {
            res.send(lectures);
        });
    });

    http.put(prefix+'lectures', bodyParserURLEncoded, function(req, res) {
        var lectureName = req.body.name;
        var lectureOwner = req.body.owner;

        var lecture = new Lectures({
            "name": lectureName,
            "owners": [lectureOwner],
            "cases": []
        });

        lecture.save(function(err) {
            if (err) {
                res.status(404).end();
            } else {
                res.status(200).end();
            }
        });
    });

    http.post(prefix+'lectures', bodyParserURLEncoded, function(req, res) {

        var lectureID = req.body.lectureID;
        var lectureTitle = req.body.lectureTitle;

        Lectures.update({"_id": lectureID}, {"name": lectureTitle}, function(err, numChanged) {
            if (err) {
                res.status(500).end();
            } else {
                res.status(200).end();
            }
        });
    });

    http.get(prefix+'caseSet', function(req, res) {


        var lectureID = req.query.lectureID;
        var lecturerID = req.query.lecturerID;

        var params = {};

        if (lectureID) {

            Lectures.findOne({"_id": lectureID}, function(err, lecture) {

                var caseRetriever = function(caseID, callback) {
                    Cases.findOne({"_id": caseID}, function(err, retrievedCase) {
                        callback(err, retrievedCase);
                    });
                };

                async.map(lecture.cases, caseRetriever, function(err, cases) {
                    var responseData = {
                        "name": lecture["name"],
                        "owners": lecture["owners"],
                        "cases": cases,
                        "lectureID": lectureID
                    };

                    res.send(responseData);
                });
            });

        } else if (lecturerID) {

            Lectures.find({"owners": lecturerID}, function(err, lectures) {

                var caseRetriever = function(caseID, callback) {
                    Cases.findOne({"_id": caseID}, function(err, retrievedCase) {
                        callback(err, retrievedCase);
                    });
                };

                var lectureCaseList = function(lecture, callback) {
                    async.map(lecture.cases, caseRetriever, function(err, cases) {
                        var responseData = {
                            "name": lecture["name"],
                            "owners": lecture["owners"],
                            "cases": cases,
                            "lectureID": lecture["_id"]
                        };
                        callback(err, responseData);
                    });
                }

                async.map(lectures, lectureCaseList, function(err, newLectures) {
                    res.send(newLectures);
                });
            });
        }
    });

    http.get(prefix+'cases', function(req, res) {

        var lectureOwnerID = req.query.lectureOwnerID;
        var lectureID = req.query.lectureID;
        var caseID = req.query.caseID;

        if (lectureOwnerID) {
            Cases.find({"owners": lectureOwnerID}, function(err, cases) {
                res.send(cases);
            });

        } else if (lectureID) {

            async.waterfall([

                function(done) {
                    Lectures.findOne({"_id": lectureID}, function(err, lecture) {
                        done(err, lecture);
                    });
                },

                function(lecture, done) {

                    var caseRetriever = function(caseID, callback) {
                        Cases.findOne({"_id": caseID}, function(err, retrievedCase) {
                            callback(err, retrievedCase);
                        });
                    }

                    async.map(lecture.cases, caseRetriever, function(err, cases) {
                        res.send(cases);
                    });
                }

            ]);

        } else if (caseID) {

            Cases.findOne({"_id": caseID}, function(err, retrievedCase) {
                res.send(retrievedCase);
            });

        } else {
            res.status(404).end();
        }
    });

    http.put(prefix+'cases', bodyParserURLEncoded, function(req, res) {

        var lectureID = req.body.lectureID;
        var data = req.body;
        // var caseName = req.query.name;
        // var scans = req.query.scans;
        // var patientInfo = req.query.patientInfo;
        // var owner = req.query.owner;

        var sliceCreator = function(slice, cb) {
            var newSlice = new Slice({
                "url": slice["url"],
                "hasDrawing": slice["hasDrawing"]
            });

            cb(null, newSlice);
        };

        var scanCreator = function(scan, cb) {
            async.map(scan["slices"], sliceCreator, function(err, slices) {

                var newScan = new Scan({
                    "name": scan["name"],
                    "hasDrawing": scan["hasDrawing"],
                    "slices": slices
                });

                cb(null, newScan);
            });
        };

        async.map(data["scans"], scanCreator, function(err, scans) {

            var newCase = new Cases({
                "date": (new Date()).getTime(),
                "name": data["name"],
                "patientInfo": data["patientInfo"],
                "owners": data["owners"],
                "scans": scans
            });

            newCase.save(function(err) {
                if (err) {
                    console.log(err);
                    res.status(404).end();
                } else {

                    if (lectureID) {
                        Lectures.findOne({"_id": lectureID}, function(err, lecture) {

                            lecture["cases"].push(newCase["_id"]);

                            lecture.save(function(err) {
                                if (err) {
                                    console.log(err);
                                    res.status(404).end();
                                } else {
                                    res.status(200).end();
                                }
                            })

                        });

                    } else {
                        res.status(200).end();
                    }
                }
            });
        });

    });

    http.post(prefix+'cases', bodyParserURLEncoded, function(req, res) {

        var caseID = req.body.caseID;
        var caseTitle = req.body.caseTitle;

        var scanID = req.body.scanID;
        var scanTitle = req.body.scanTitle;

        var patientInfo = req.body.patientInfo;

        if (caseTitle) {
            Cases.update({"_id": caseID}, {"name": caseTitle}, function(err, numChanged) {
                if (err) {
                    res.status(500).end();
                } else {
                    res.status(200).end();
                }
            });

        } else if (scanTitle) {
            Cases.findOne({"_id": caseID}, function(err, retrievedCase) {
                var scan = retrievedCase["scans"].filter(function(s) {
                    return s["_id"] == scanID;
                })[0];

                if (scan) {
                    scan["name"] = scanTitle;

                    retrievedCase.save(function(err) {
                        if (err) {
                            res.status(500).end();
                        } else {
                            res.send(retrievedCase);
                        }
                    });
                }
            });
        } else if (patientInfo) {
            Cases.update({"_id": caseID}, {"patientInfo": patientInfo}, function(err, numChanged) {
                if (err) {
                    res.status(500).end();
                } else {
                    res.status(200).end();
                }
            });
        }
    });

    http.get(prefix+'answer', function(req, res) {
        var lectureID = req.query.lectureID;
        var caseID = req.query.caseID;
        var ownerID = req.query.ownerID;

        if (ownerID && lectureID && caseID) {
            Answer.findOne({"lectureID": lectureID, "caseID": caseID, "owners": ownerID}, function(err, answer) {

                if (err) {
                    res.status(500).end();
                } else if (answer == null) {
                    res.status(404).end();
                } else {
                    res.send(answer);
                }
            });

        } else if (lectureID && caseID) {
            Answer.find({"lectureID": lectureID, "caseID": caseID}, function(err, answers) {
                if (err) {
                    res.status(500).end();
                } else {
                    res.send(answers);
                }
            });

        } else {
            res.status(500).end();
        }
    });

    http.put(prefix+'answer', bodyParserURLEncoded, function(req, res) {
        var lectureID = req.body.lectureID;
        var caseID = req.body.caseID;
        var owners = req.body.owners;
        var groupName = req.body.groupName;
        var drawings = req.body.drawings;
        var colors = req.body.colors;

        Answer.findOne({"lectureID": lectureID, "caseID": caseID, "owners": JSON.parse(owners)}, function(err, answer) {
            if (answer != null) {
                answer["drawings"] = JSON.parse(drawings);
                answer["groupName"] = groupName;
                answer["submissionDate"] = (new Date()).getTime();

                answer.save(function(err) {
                    if (err) {
                        res.status(500).end();
                    } else {
                        if (wsClientMap[lectureID]) {
                            wsClientMap[lectureID].send("UPDATE");
                        }
                        res.status(200).end();
                    }
                });

            } else {

                var newAnswer = new Answer({
                    "lectureID": lectureID,
                    "caseID": caseID,
                    "owners": JSON.parse(owners),
                    "groupName": groupName,
                    "drawings": JSON.parse(drawings),
                    "colors": JSON.parse(colors),
                    "submissionDate": (new Date()).getTime()
                });

                newAnswer.save(function(err) {
                    if (err) {
                        res.status(500).end();
                    } else {
                        if (wsClientMap[lectureID] && wsClientMap[lectureID].readyState === 1) {
                            wsClientMap[lectureID].send("UPDATE");
                        }
                        res.status(200).end();
                    }
                });
            }
        });
    });

    http.post(prefix+'submitanswer', bodyParserURLEncoded, passport.authenticate('local', {session: false}), function(req, res) {
        // var setID = validator.escape(req.body.setID)
        // var caseID = validator.escape(req.body.caseID)
        // var owners = validator.escape(req.body.owners)
        // var answerData = validator.escape(req.body.answerData)
        var setID = req.body.setID;
        var caseID = req.body.caseID;
        var owners = req.body.owners;
        var answerName = req.body.answerName;
        var colors = req.body.colors;

        //rename this shit
        var answerData = req.body.drawings;

        if (!owners || !answerData) {
            reportError(404, "Missing required parameters", res)
        } else {
            CaseSets.findOne({"setID": setID}, function(err, caseSet) {
                if (err) {
                    reportError(404, err, res)
                } else {

                    var answer = {
                        "owners": JSON.parse(owners),
                        "answerName": answerName,
                        "drawings": JSON.parse(answerData),
                        "colors": JSON.parse(colors),
                        "submissionDate": (new Date()).getTime()
                    }

                    for (c in caseSet["cases"]) {
                        if (caseSet["cases"][c]["caseID"] == caseID) {

                            var currentCase = caseSet["cases"][c];

                            // determine if user has already submitted an answer
                            var resubmission = false;
                            var submissionOwners = answer["owners"].toString()

                            for (var a = 0; a < currentCase["answers"].length; a++) {
                                var answerOwners = currentCase["answers"][a]["owners"].toString();

                                if (submissionOwners === answerOwners) {
                                    resubmission = true;
                                    caseSet["cases"][c]["answers"][a].drawings = answer.drawings;
                                    caseSet["cases"][c]["answers"][a].answerName = answer.answerName;
                                    caseSet["cases"][c]["answers"][a].submissionDate = (new Date()).getTime();
                                    break;
                                }
                            }

                            if (!resubmission) {
                                caseSet["cases"][c]["answers"].push(answer);
                            }

                            updateDates[currentCase["caseID"]] = answer.submissionDate;

                        }
                    }

                    caseSet.save(function(err) {
                        if (err) {
                            reportError(404, err, res)
                        } else {
                            res.send(caseSet)
                        }
                    });
                }
            });
        }
    });

// websockets

    ws.on('connection', function(connection) {
        connection.on('message', function(message) {
            if (message) {
                if (message.substr(0, message.indexOf(':')) == "INTRO") {
                    var caseID = message.substr(message.indexOf(':')+1, message.length);
                    wsClientMap[caseID] = connection;
                }
            }
        });
    });
}
